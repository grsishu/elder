import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Home, CheckCircle2, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak } from '../utils/voice';
import { getCurrentLocation } from '../utils/location';

export default function LostCheckinModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { elder } = useAuth();
  const [activeCheck, setActiveCheck] = useState(null);
  const [countdown, setCountdown] = useState(120);

  // Poll for active check-in every 10 seconds while app is open
  useEffect(() => {
    if (!elder?.id) return;

    let isMounted = true;
    const fetchActiveCheck = async () => {
      try {
        const resp = await fetch(`/api/location/checkin/active?elderId=${elder.id}`);
        if (resp.ok) {
          const data = await resp.json();
          if (isMounted) {
            if (data.activeCheck) {
              setActiveCheck(data.activeCheck);
              setCountdown(data.activeCheck.remainingSec);
            } else {
              setActiveCheck(null);
            }
          }
        }
      } catch {
        // ignore
      }
    };

    fetchActiveCheck();
    const interval = setInterval(fetchActiveCheck, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [elder?.id]);

  // Countdown timer
  useEffect(() => {
    if (!activeCheck) return;

    // Speak prompt aloud slowly
    speak(t('silent_guardian.checkin_prompt'));

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeCheck, t]);

  const handleFine = async () => {
    if (!activeCheck) return;
    try {
      let coords = null;
      try {
        coords = await getCurrentLocation();
      } catch {}

      await fetch('/api/location/checkin/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: activeCheck.id,
          response: 'fine',
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
      });
      speak(t('silent_guardian.i_am_fine'));
    } catch {
      // ignore
    }
    setActiveCheck(null);
  };

  const handleTakeHome = async () => {
    if (!activeCheck) return;
    try {
      await fetch('/api/location/checkin/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId: activeCheck.id, response: 'take_home' }),
      });
      speak(t('silent_guardian.guide_me_home'));
    } catch {
      // ignore
    }
    setActiveCheck(null);
    navigate('/lost');
  };

  if (!activeCheck) return null;

  return (
    <div className="fixed inset-0 z-50 bg-amber-900/90 flex flex-col items-center justify-center p-6 text-white text-center backdrop-blur-md animate-fadeIn">
      <div className="max-w-md w-full bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-amber-500 space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
          <AlertCircle className="w-12 h-12 text-amber-600 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-black text-slate-900">
            {t('silent_guardian.checkin_title')}
          </h2>
          <p className="text-xl font-bold text-slate-700 leading-relaxed">
            {t('silent_guardian.checkin_prompt')}
          </p>
        </div>

        <div className="text-amber-800 font-extrabold text-sm bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-center gap-2">
          <span>{t('silent_guardian.countdown', { seconds: countdown })}</span>
        </div>

        {/* Big Elder Buttons */}
        <div className="space-y-4 pt-2">
          <button
            id="checkin-fine-btn"
            onClick={handleFine}
            className="w-full btn-elder bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-2xl font-black shadow-lg flex items-center justify-center gap-3"
          >
            <CheckCircle2 className="w-8 h-8" />
            <span>{t('silent_guardian.i_am_fine')}</span>
          </button>

          <button
            id="checkin-takehome-btn"
            onClick={handleTakeHome}
            className="w-full btn-elder bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-2xl font-black shadow-lg flex items-center justify-center gap-3"
          >
            <Home className="w-8 h-8" />
            <span>{t('silent_guardian.guide_me_home')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
