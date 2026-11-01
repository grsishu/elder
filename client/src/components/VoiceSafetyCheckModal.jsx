import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckCircle, HelpCircle, Mic, MicOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak, cancelSpeech } from '../utils/voice';
import { getCurrentLocation } from '../utils/location';

export default function VoiceSafetyCheckModal() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { elder } = useAuth();
  const [activeCheck, setActiveCheck] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Poll for active check every 8 seconds
  useEffect(() => {
    if (!elder?.id) return;

    let isMounted = true;
    const fetchActiveCheck = async () => {
      try {
        // Check new safety_checks table first
        const resp = await fetch(`/api/location/safety-check/active?elderId=${elder.id}`);
        if (resp.ok) {
          const data = await resp.json();
          if (isMounted && data.activeCheck) {
            setActiveCheck(data.activeCheck);
            return;
          }
        }

        // Fallback to checkin/active for backwards compatibility
        const legacyResp = await fetch(`/api/location/checkin/active?elderId=${elder.id}`);
        if (legacyResp.ok) {
          const legacyData = await legacyResp.json();
          if (isMounted) {
            setActiveCheck(legacyData.activeCheck || null);
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    fetchActiveCheck();
    const interval = setInterval(fetchActiveCheck, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [elder?.id]);

  // Handle chime, vibration and slow speech when check appears
  useEffect(() => {
    if (!activeCheck) return;

    // Vibration pattern: chime buzz
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([250, 100, 250]);
    }

    // Play subtle soft chime via Web Audio
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.3); // E5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch {
      // AudioContext not allowed before user gesture
    }

    // Speak prompt slowly (rate 0.65)
    const promptText = t('location.voice_check_prompt', 'Hello! You seem to be somewhere unfamiliar. Are you okay? Would you like help?');
    speak(promptText, {
      rate: 0.65,
      lang: i18n.language || 'hi',
      onEnd: () => {
        // Start listening after question finishes
        startSpeechListening();
      },
    });

    return () => {
      cancelSpeech();
      stopSpeechListening();
    };
  }, [activeCheck?.id, activeCheck?.current_attempt, t, i18n.language]);

  // Speech Recognition setup
  const startSpeechListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    stopSpeechListening();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = i18n.language === 'en' ? 'en-IN' : 'hi-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript.toLowerCase();
        setTranscript(text);
        processSpokenAnswer(text);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Stop listening after 15 seconds
      setTimeout(() => {
        stopSpeechListening();
      }, 15000);
    } catch (e) {
      console.warn('[Speech] Recognition start error:', e);
      setIsListening(false);
    }
  };

  const stopSpeechListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const processSpokenAnswer = (spoken) => {
    const text = spoken.toLowerCase();
    const okWords = ['okay', 'ok', 'fine', 'yes', 'theek', 'theek hoon', 'haan theek', 'sahi', 'good', 'bhalo', 'thik'];
    const helpWords = ['lost', 'help', 'need help', 'madad', 'bachao', 'rasta bhool gaya', 'nahi pata', 'problem', 'dikkat', 'bhatak'];

    const isOk = okWords.some((w) => text.includes(w));
    const isHelp = helpWords.some((w) => text.includes(w));

    if (isHelp) {
      handleHelp('voice');
    } else if (isOk) {
      handleOk('voice');
    } else {
      // Unclear: speak simpler prompt once more
      speak(t('location.voice_check_retry', 'Please say: I am okay, or: I need help.'), {
        rate: 0.65,
        lang: i18n.language || 'hi',
        onEnd: () => startSpeechListening(),
      });
    }
  };

  const handleOk = async (method = 'button') => {
    if (!activeCheck) return;
    stopSpeechListening();
    cancelSpeech();

    try {
      await fetch('/api/location/safety-check/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: activeCheck.id,
          answer: 'ok',
          method,
          elderId: elder.id,
        }),
      });

      // Also call legacy endpoint if applicable
      await fetch('/api/location/checkin/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: activeCheck.id,
          response: 'fine',
        }),
      }).catch(() => {});

      speak(t('location.voice_check_confirmed_ok', 'Thank you! Glad to know you are okay. Stay safe.'), {
        rate: 0.65,
        lang: i18n.language || 'hi',
      });
    } catch (e) {
      console.warn('[SafetyCheck] Respond error:', e);
    }
    setActiveCheck(null);
  };

  const handleHelp = async (method = 'button') => {
    if (!activeCheck) return;
    stopSpeechListening();
    cancelSpeech();

    try {
      const resp = await fetch('/api/location/safety-check/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: activeCheck.id,
          answer: 'help',
          method,
          elderId: elder.id,
        }),
      });

      // Also call legacy endpoint
      await fetch('/api/location/checkin/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: activeCheck.id,
          response: 'take_home',
        }),
      }).catch(() => {});

      speak(t('location.voice_check_confirmed_help', 'Do not worry! We have alerted your family. Guiding you home now.'), {
        rate: 0.65,
        lang: i18n.language || 'hi',
      });

      setActiveCheck(null);
      // Navigate to Take Me Home guidance page
      navigate('/take-me-home');
    } catch (e) {
      console.warn('[SafetyCheck] Help error:', e);
      setActiveCheck(null);
    }
  };

  if (!activeCheck) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border-4 border-amber-400 text-center animate-fade-in">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
          <ShieldAlert className="w-12 h-12 animate-pulse" />
        </div>

        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 mb-3">
          {t('location.voice_check_title', 'Are you doing okay?')}
        </h2>

        <p className="text-lg md:text-xl text-slate-600 mb-6 leading-relaxed">
          {t('location.voice_check_prompt', 'Hello! You seem to be somewhere unfamiliar. Are you okay? Would you like help?')}
        </p>

        {/* Listening indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {isListening ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-semibold border border-emerald-200 animate-pulse">
              <Mic className="w-5 h-5 text-emerald-600" />
              <span>{t('location.listening_voice', 'Listening... speak clearly')}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs">
              <MicOff className="w-4 h-4" />
              <span>{t('location.tap_below', 'Tap an answer below')}</span>
            </div>
          )}
        </div>

        {transcript && (
          <div className="mb-4 text-sm text-slate-500 italic bg-slate-50 p-2 rounded-lg">
            "{transcript}"
          </div>
        )}

        {/* Two Huge Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => handleOk('button')}
            className="flex flex-col items-center justify-center p-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg transition active:scale-95"
          >
            <CheckCircle className="w-10 h-10 mb-2" />
            <span className="text-xl font-bold">{t('location.i_am_okay', 'I am okay')}</span>
            <span className="text-xs text-emerald-100 mt-1">
              {i18n.language === 'hi' ? '(मैं ठीक हूँ)' : '(Everything is fine)'}
            </span>
          </button>

          <button
            onClick={() => handleHelp('button')}
            className="flex flex-col items-center justify-center p-5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-lg transition active:scale-95"
          >
            <HelpCircle className="w-10 h-10 mb-2" />
            <span className="text-xl font-bold">{t('location.i_need_help', 'I need help')}</span>
            <span className="text-xs text-amber-100 mt-1">
              {i18n.language === 'hi' ? '(मदद चाहिए / रास्ता भूल गए)' : '(Guide me home)'}
            </span>
          </button>
        </div>

        {/* SOS button remains always accessible */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">Smriti Saathi Silent Guardian</span>
          <button
            onClick={() => {
              setActiveCheck(null);
              navigate('/sos');
            }}
            className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t('emergency.sos_button', 'Emergency SOS')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

