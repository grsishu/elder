import React, { useState, useEffect } from 'react';
import { Pill, CheckCircle2, Clock, X, BellRing, Droplet, Utensils } from 'lucide-react';
import { speak } from '../utils/voice';

export default function TalkingAlarm() {
  const [activeOccurrences, setActiveOccurrences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [wakeLock, setWakeLock] = useState(null);

  // Poll for active due occurrences
  useEffect(() => {
    const fetchActive = () => {
      fetch('/api/reminders/active', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.occurrences) {
            setActiveOccurrences(d.occurrences);
          }
        })
        .catch(() => {});
    };

    fetchActive();
    const interval = setInterval(fetchActive, 15000);
    return () => clearInterval(interval);
  }, []);

  const occ = activeOccurrences[currentIdx];

  // Screen WakeLock API & Spoken Chime
  useEffect(() => {
    if (occ) {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(setWakeLock).catch(() => {});
      }

      const speakPrompt = () => {
        speak(`Namaskar. It is time for ${occ.title}. ${occ.schedule_description || ''}`, {
          lang: 'en',
          rate: 0.8,
        });
      };

      speakPrompt();
      const voiceInterval = setInterval(speakPrompt, 60000);

      return () => {
        clearInterval(voiceInterval);
        if (wakeLock) wakeLock.release().catch(() => {});
      };
    }
  }, [occ]);

  if (!occ) return null;

  const handleAction = async (action) => {
    try {
      const res = await fetch(`/api/reminders/${occ.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.refillWarning) {
        alert(`Refill Notice: ${data.refillWarning.medicine} has only ${data.refillWarning.remaining} tablets remaining!`);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setActiveOccurrences((prev) => prev.filter((_, i) => i !== currentIdx));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 text-center shadow-2xl border-4 border-indigo-500 animate-in fade-in zoom-in duration-200">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-6 shadow-inner animate-bounce">
          {occ.reminder_type === 'medicine' ? (
            <Pill className="w-12 h-12" />
          ) : occ.reminder_type === 'water' ? (
            <Droplet className="w-12 h-12 text-blue-500" />
          ) : (
            <BellRing className="w-12 h-12 text-amber-500" />
          )}
        </div>

        <span className="text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full inline-block mb-3">
          {occ.reminder_type.toUpperCase()} REMINDER
        </span>

        <h2 className="text-3xl font-black text-slate-800 mb-2 leading-tight">
          {occ.title}
        </h2>
        <p className="text-sm font-semibold text-slate-500 mb-8 max-w-sm mx-auto">
          {occ.schedule_description || 'Please take this medication as scheduled by your doctor.'}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handleAction('done')}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-lg active:scale-95 transition-transform"
          >
            <CheckCircle2 className="w-6 h-6" /> ✓ I Took It (दवा ले ली)
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAction('snooze')}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-1.5"
            >
              <Clock className="w-4 h-4" /> Remind in 10m
            </button>
            <button
              onClick={() => handleAction('skip')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl text-sm"
            >
              Skip (छोड़ें)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
