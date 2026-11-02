import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Volume2, ShieldCheck, RefreshCw, AlertCircle, PhoneCall } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak } from '../utils/voice';

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, elder, login } = useAuth();

  // Multi-step state: 'language' | 'phone' | 'otp'
  const [step, setStep] = useState('language');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [demoBanner, setDemoBanner] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [triesLeft, setTriesLeft] = useState(5);
  const [unverifiedFallbackAllowed, setUnverifiedFallbackAllowed] = useState(false);

  const otpInputsRef = useRef([]);

  // Auto-redirect: If profile complete -> Home, else automatically open Setup Wizard
  useEffect(() => {
    if (user) {
      const isComplete = elder?.profile_completed || localStorage.getItem('smriti_profile_complete') === 'true';
      if (elder?.name && isComplete) {
        navigate('/');
      } else {
        navigate('/wizard');
      }
    }
  }, [user, elder, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const selectLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('smriti_language', langCode);
    localStorage.setItem('smriti_elder_language', langCode);
    setStep('phone');
    speak(t('auth.enter_mobile'), { lang: langCode });
  };

  const handleRequestOtp = async (channel = 'sms', forceDemo = false) => {
    setLoading(true);
    setError(null);
    setDemoBanner(null);

    // Ensure +91 prefix
    const cleanPhone = phone.trim().replace(/^(\+91|0)/, '');
    const formatted = `+91${cleanPhone}`;

    try {
      const resp = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawPhone: formatted,
          channel,
          fallbackDemo: forceDemo,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data.canFallbackToDemo) {
          setUnverifiedFallbackAllowed(true);
        }
        throw new Error(data.message || t(`errors.${data.error}`) || 'Failed to send verification code');
      }

      if (data.demoMode && data.demoCode) {
        setDemoBanner(t('auth.demo_banner', { code: data.demoCode }));
        speak(`${t('auth.enter_code')}. ${data.demoCode}`);
      } else {
        speak(t('auth.code_sent_to', { phone: formatted }));
      }

      setStep('otp');
      setResendCooldown(30);
      setTimeout(() => otpInputsRef.current[0]?.focus(), 150);
    } catch (err) {
      setError(err.message);
      speak(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;

    const newOtp = [...otp];
    newOtp[idx] = val.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (val && idx < 5) {
      otpInputsRef.current[idx + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    const fullCode = newOtp.join('');
    if (fullCode.length === 6) {
      verifyCode(fullCode);
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpInputsRef.current[idx - 1]?.focus();
    }
  };

  const verifyCode = async (codeToVerify) => {
    const code = codeToVerify || otp.join('');
    if (code.length !== 6) {
      setError(t('errors.INVALID_CODE'));
      return;
    }

    setLoading(true);
    setError(null);
    const cleanPhone = phone.trim().replace(/^(\+91|0)/, '');
    const formatted = `+91${cleanPhone}`;

    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPhone: formatted, code }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data.triesLeft !== undefined) {
          setTriesLeft(data.triesLeft);
        }
        throw new Error(data.message || t(`errors.${data.error}`) || 'Verification failed');
      }

      login(data.user, data.elder, null);

      if (data.elder?.name) {
        speak(t('home.greeting', { name: data.elder.name }));
        navigate('/');
      } else {
        speak(t('onboarding.who_are_you'));
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err.message);
      speak(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8 max-w-lg mx-auto">
      {/* STEP 1: Language Picker */}
      {step === 'language' && (
        <div className="w-full space-y-6 text-center animate-fadeIn">
          <div className="space-y-2">
            <span className="text-5xl">🪷</span>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900">
              {t('auth.choose_language')}
            </h1>
            <p className="text-lg text-slate-600">
              {t('app.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            {[
              { code: 'hi', native: 'हिन्दी', sub: 'Hindi', flag: '🇮🇳' },
              { code: 'en', native: 'English', sub: 'English', flag: '🇬🇧' },
              { code: 'as', native: 'অসমীয়া', sub: 'Assamese', flag: '🌿' },
              { code: 'bn', native: 'বাংলা', sub: 'Bengali', flag: '🌸' },
            ].map((l) => (
              <button
                key={l.code}
                id={`login-lang-select-${l.code}`}
                onClick={() => selectLanguage(l.code)}
                className="btn-elder bg-white hover:bg-amber-50 text-slate-900 border-2 border-slate-300 hover:border-amber-500 p-5 rounded-3xl flex items-center justify-between shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{l.flag}</span>
                  <div className="text-left">
                    <div className="text-2xl font-bold">{l.native}</div>
                    <div className="text-xs text-slate-500 font-semibold">{l.sub}</div>
                  </div>
                </div>
                <Volume2 className="w-6 h-6 text-amber-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Mobile Number Input */}
      {step === 'phone' && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <button
              onClick={() => setStep('language')}
              className="text-sm font-bold text-amber-700 hover:underline inline-flex items-center gap-1 mb-2"
            >
              ← {t('auth.choose_language')}
            </button>
            <h1 className="text-3xl font-black text-slate-900">
              {t('auth.enter_mobile')}
            </h1>
            <p className="text-slate-600 text-base">
              {t('auth.mobile_desc')}
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-700 text-sm font-bold flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {unverifiedFallbackAllowed && (
                  <button
                    onClick={() => handleRequestOtp('sms', true)}
                    className="mt-2 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 font-bold block"
                  >
                    Use Demo Mode OTP Instead
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-lg space-y-4">
            <div className="flex items-center bg-slate-100 rounded-2xl border-2 border-slate-300 p-2 focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-200">
              <span className="px-3 text-2xl font-black text-slate-700 select-none border-r-2 border-slate-300">
                +91
              </span>
              <input
                id="phone-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                maxLength={10}
                className="w-full bg-transparent px-4 py-3 text-2xl md:text-3xl font-bold tracking-wider text-slate-900 outline-none placeholder:text-slate-400"
                autoFocus
              />
            </div>

            <button
              id="send-sms-button"
              disabled={loading || phone.trim().length < 10}
              onClick={() => handleRequestOtp('sms')}
              className="w-full btn-elder bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-xl shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <span>{t('auth.send_sms')}</span>
                  <ArrowRight className="w-6 h-6" />
                </>
              )}
            </button>

            {/* Voice Call option */}
            <button
              id="call-code-button"
              disabled={loading || phone.trim().length < 10}
              onClick={() => handleRequestOtp('call')}
              className="w-full py-3 text-slate-700 hover:bg-slate-100 rounded-2xl font-bold text-base flex items-center justify-center gap-2 border border-slate-300"
            >
              <PhoneCall className="w-5 h-5 text-amber-600" />
              <span>{t('auth.call_me')}</span>
            </button>

            {/* Quick Demo Access for Public Evaluators */}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const r = await fetch('/api/auth/demo-quick-login', { method: 'POST' });
                    const d = await r.json();
                    if (d.success) {
                      login(d.user, d.elder, null);
                      navigate('/');
                    }
                  } catch (e) {
                    setError('Quick login failed: ' + e.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full py-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-emerald-300 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition"
              >
                <span>⚡</span>
                <span>One-Click Demo Access (Explore Application)</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/register')}
                className="w-full py-2.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
              >
                New User? Create Elder Profile & Register →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: 6-Digit OTP Input */}
      {step === 'otp' && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* Demo Mode Yellow Banner */}
          {demoBanner && (
            <div
              id="demo-mode-banner"
              className="p-4 bg-yellow-300 border-2 border-yellow-500 rounded-2xl text-slate-900 font-black text-base shadow-md flex items-center gap-3 animate-pulse"
            >
              <span className="text-2xl">⚠️</span>
              <div>{demoBanner}</div>
            </div>
          )}

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black text-slate-900">
              {t('auth.enter_code')}
            </h1>
            <p className="text-slate-600 text-base">
              {t('auth.code_sent_to', { phone: `+91 ${phone}` })}
            </p>
            <button
              id="change-phone-button"
              onClick={() => {
                setStep('phone');
                setOtp(['', '', '', '', '', '']);
                setError(null);
              }}
              className="text-sm font-bold text-amber-700 hover:underline"
            >
              {t('auth.change_phone')}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-700 text-sm font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-lg space-y-6">
            {/* 6 Big Boxes for digits */}
            <div className="flex justify-between gap-2 sm:gap-3">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  ref={(el) => (otpInputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-12 h-16 sm:w-14 sm:h-20 text-center text-3xl font-black rounded-2xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-600 focus:ring-4 focus:ring-amber-200 outline-none transition-all"
                />
              ))}
            </div>

            <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
              <span>{t('auth.tries_left', { count: triesLeft })}</span>
              {resendCooldown > 0 ? (
                <span>{t('auth.resend_in', { seconds: resendCooldown })}</span>
              ) : (
                <button
                  id="resend-otp-btn"
                  onClick={() => handleRequestOtp('sms')}
                  className="text-amber-700 font-bold hover:underline"
                >
                  {t('auth.resend_now')}
                </button>
              )}
            </div>

            <button
              id="verify-otp-btn"
              disabled={loading || otp.join('').length !== 6}
              onClick={() => verifyCode()}
              className="w-full btn-elder bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-xl shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-7 h-7" />
                  <span>{t('auth.verify_button')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
