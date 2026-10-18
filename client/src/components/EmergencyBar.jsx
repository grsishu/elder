import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneCall, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { speak } from '../utils/voice';

export default function EmergencyBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [holding, setHolding] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const holdTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const lastTapRef = useRef(0);

  const startHold = () => {
    setHolding(true);
    holdTimerRef.current = setTimeout(() => {
      triggerSosCountdown();
    }, 1500); // 1.5 seconds hold
  };

  const endHold = () => {
    setHolding(false);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  };

  // Double tap detection
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      triggerSosCountdown();
    }
    lastTapRef.current = now;
  };

  const triggerSosCountdown = () => {
    endHold();
    setCountdown(5);
    speak(t('safety.sos_countdown', { seconds: 5 }));

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          navigate('/sos');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSos = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    speak(t('safety.sos_cancel'));
  };

  return (
    <>
      {/* Pinned Bottom Red Emergency Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-2xl p-2.5 border-t-4 border-red-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Main SOS Trigger Button */}
          <button
            id="pinned-sos-button"
            onMouseDown={startHold}
            onMouseUp={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            onClick={handleDoubleTap}
            className={`btn-elder flex-1 bg-white text-red-700 hover:bg-red-50 text-xl md:text-2xl font-black py-3 px-4 rounded-2xl shadow-lg border-2 border-red-200 transition-all ${
              holding ? 'scale-95 bg-red-100 ring-4 ring-yellow-400' : ''
            }`}
          >
            <ShieldAlert className="w-8 h-8 text-red-600 mr-2 animate-bounce" />
            <span>{t('home.sos_btn')}</span>
          </button>

          {/* Permanent Call 112 button */}
          <a
            id="call-112-button"
            href="tel:112"
            className="btn-elder bg-yellow-400 hover:bg-yellow-300 text-slate-950 px-4 py-3 rounded-2xl font-black text-lg md:text-xl border-2 border-yellow-500 flex items-center gap-2 shrink-0 shadow-lg"
          >
            <PhoneCall className="w-6 h-6 text-slate-900" />
            <span>112</span>
          </a>
        </div>
      </div>

      {/* 5-Second Cancel Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-red-700/95 flex flex-col items-center justify-center p-6 text-white text-center backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full space-y-6">
            <div className="w-24 h-24 mx-auto rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-16 h-16 text-yellow-300" />
            </div>

            <h2 className="text-3xl md:text-4xl font-black">
              {t('safety.sos_title')}
            </h2>

            <p className="text-xl md:text-2xl text-red-100 font-bold">
              {t('safety.sos_countdown', { seconds: countdown })}
            </p>

            <div className="text-7xl font-black text-yellow-300 py-4">
              {countdown}
            </div>

            <button
              id="sos-cancel-countdown-btn"
              onClick={cancelSos}
              className="w-full btn-elder bg-white text-slate-900 hover:bg-slate-100 text-2xl font-black py-6 rounded-3xl shadow-2xl border-4 border-yellow-400"
            >
              {t('safety.sos_cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
