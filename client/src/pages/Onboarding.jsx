import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { User, Users, HeartHandshake, Volume2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak, setVoiceSpeed } from '../utils/voice';

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { updateElder } = useAuth();

  const [step, setStep] = useState(1); // 1: Who are you?, 2: Elder Details
  const [role, setRole] = useState('caregiver');
  const [elderName, setElderName] = useState('');
  const [elderAge, setElderAge] = useState('');
  const [elderLanguage, setElderLanguage] = useState(i18n.language || 'en');
  const [region, setRegion] = useState('Assam');
  const [speed, setSpeed] = useState(0.65);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const neStates = [
    'Assam',
    'Meghalaya',
    'Mizoram',
    'Manipur',
    'Nagaland',
    'Tripura',
    'Arunachal Pradesh',
    'Sikkim',
  ];

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    setStep(2);
    speak(t('onboarding.who_is_for'));
  };

  const handleHearSample = () => {
    setVoiceSpeed(speed);
    speak(t('onboarding.voice_sample_text'), { speed, lang: elderLanguage });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!elderName.trim()) {
      setError(t('errors.NAME_REQUIRED'));
      speak(t('errors.NAME_REQUIRED'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/elder/init-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          elderName: elderName.trim(),
          elderAge: elderAge ? parseInt(elderAge, 10) : null,
          elderLanguage,
          region,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.message || 'Failed to save elder profile');
      }

      setVoiceSpeed(speed);
      updateElder(data.elder);
      speak(t('home.greeting', { name: data.elder.name }));
      navigate('/');
    } catch (err) {
      setError(err.message);
      speak(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8 max-w-lg mx-auto">
      {/* STEP 1: Who are you? */}
      {step === 1 && (
        <div className="w-full space-y-6 text-center animate-fadeIn">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900">
              {t('onboarding.who_are_you')}
            </h1>
            <p className="text-slate-600 text-lg">
              {t('common.step_of', { current: 1, total: 2 })}
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {[
              {
                id: 'caregiver',
                title: t('onboarding.role_caregiver'),
                icon: <Users className="w-8 h-8 text-amber-600" />,
              },
              {
                id: 'health_worker',
                title: t('onboarding.role_health_worker'),
                icon: <HeartHandshake className="w-8 h-8 text-blue-600" />,
              },
              {
                id: 'elder',
                title: t('onboarding.role_elder'),
                icon: <User className="w-8 h-8 text-emerald-600" />,
              },
            ].map((option) => (
              <button
                key={option.id}
                id={`role-btn-${option.id}`}
                onClick={() => handleRoleSelect(option.id)}
                className="w-full btn-elder bg-white hover:bg-amber-50 text-slate-900 border-2 border-slate-300 hover:border-amber-500 p-5 rounded-3xl flex items-center justify-between shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-100 rounded-2xl">
                    {option.icon}
                  </div>
                  <span className="text-xl md:text-2xl font-black text-left">
                    {option.title}
                  </span>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Elder Profile Details */}
      {step === 2 && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <button
              onClick={() => setStep(1)}
              className="text-sm font-bold text-amber-700 hover:underline"
            >
              ← {t('common.back')}
            </button>
            <h1 className="text-3xl font-black text-slate-900">
              {t('onboarding.who_is_for')}
            </h1>
            <p className="text-slate-600 text-base">
              {t('common.step_of', { current: 2, total: 2 })}
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-700 text-sm font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-lg space-y-5">
            {/* Elder Name */}
            <div className="space-y-1">
              <label className="block text-lg font-bold text-slate-800">
                {t('onboarding.elder_name_label')} *
              </label>
              <input
                id="elder-name-input"
                type="text"
                value={elderName}
                onChange={(e) => setElderName(e.target.value)}
                placeholder={t('onboarding.elder_name_placeholder')}
                className="w-full p-4 text-xl font-bold rounded-2xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none"
                required
                autoFocus
              />
            </div>

            {/* Elder Age */}
            <div className="space-y-1">
              <label className="block text-lg font-bold text-slate-800">
                {t('onboarding.elder_age_label')}
              </label>
              <input
                id="elder-age-input"
                type="number"
                min={40}
                max={120}
                value={elderAge}
                onChange={(e) => setElderAge(e.target.value)}
                placeholder="72"
                className="w-full p-4 text-xl font-bold rounded-2xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none"
              />
            </div>

            {/* Elder Primary Language */}
            <div className="space-y-1">
              <label className="block text-lg font-bold text-slate-800">
                {t('onboarding.elder_language_label')}
              </label>
              <select
                id="elder-language-select"
                value={elderLanguage}
                onChange={(e) => {
                  setElderLanguage(e.target.value);
                  i18n.changeLanguage(e.target.value);
                }}
                className="w-full p-4 text-xl font-bold rounded-2xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none"
              >
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="en">English (English)</option>
                <option value="as">অসমীয়া (Assamese)</option>
                <option value="bn">বাংলা (Bengali)</option>
              </select>
            </div>

            {/* Region / State */}
            <div className="space-y-1">
              <label className="block text-lg font-bold text-slate-800">
                {t('onboarding.region_label')}
              </label>
              <select
                id="elder-region-select"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full p-4 text-xl font-bold rounded-2xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none"
              >
                {neStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Speed Setting */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-bold text-amber-900">
                  {t('onboarding.voice_speed_label')}
                </label>
                <button
                  type="button"
                  id="hear-sample-btn"
                  onClick={handleHearSample}
                  className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-xl text-sm font-bold flex items-center gap-1"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t('onboarding.voice_sample_button')}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 0.65, label: t('voice.slow') },
                  { val: 0.85, label: t('voice.normal') },
                  { val: 1.0, label: t('voice.fast') },
                ].map((sp) => (
                  <button
                    key={sp.val}
                    type="button"
                    onClick={() => setSpeed(sp.val)}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border text-center transition-all ${
                      speed === sp.val
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              id="submit-onboarding-btn"
              disabled={loading || !elderName.trim()}
              type="submit"
              className="w-full btn-elder bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-xl shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-7 h-7" />
              <span>{t('onboarding.save_and_begin')}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
