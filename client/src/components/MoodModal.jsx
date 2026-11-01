import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smile, Meh, Frown, Sparkles, X, Heart } from 'lucide-react';
import { speak } from '../utils/voice';

export default function MoodModal({ isOpen, onClose, onSelectMood }) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language.startsWith('hi');

  const [selectedMood, setSelectedMood] = useState(null);
  const [breathingStep, setBreathingStep] = useState(0); // 0 = not breathing, 1 = inhale, 2 = hold, 3 = exhale

  if (!isOpen) return null;

  const moods = [
    {
      id: 'happy',
      label: isHindi ? 'बहुत खुश' : 'Very Happy',
      emoji: '😄',
      color: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'calm',
      label: isHindi ? 'शांत एवं प्रसन्न' : 'Calm & Peaceful',
      emoji: '😌',
      color: 'bg-blue-100 text-blue-800',
    },
    {
      id: 'neutral',
      label: isHindi ? 'सामान्य' : 'Normal / Okay',
      emoji: '🙂',
      color: 'bg-teal-100 text-teal-800',
    },
    {
      id: 'sad',
      label: isHindi ? 'उदास' : 'Low / Sad',
      emoji: '😔',
      color: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'anxious',
      label: isHindi ? 'चिंतित' : 'Worried',
      emoji: '😟',
      color: 'bg-rose-100 text-rose-800',
    },
  ];

  const handleMoodClick = (mood) => {
    setSelectedMood(mood);
    if (onSelectMood) onSelectMood(mood.id);

    if (mood.id === 'sad' || mood.id === 'anxious') {
      const msg = isHindi
        ? 'आइए हम एक साथ तीन धीमी सांसें लें और शांत महसूस करें।'
        : 'Let us take three gentle breaths together to feel calm and relaxed.';
      speak(msg, { lang: isHindi ? 'hi' : 'en', rate: 0.65 });
      setBreathingStep(1);
      setTimeout(() => setBreathingStep(2), 3000);
      setTimeout(() => setBreathingStep(3), 6000);
      setTimeout(() => {
        setBreathingStep(0);
        onClose();
      }, 9500);
    } else {
      const okMsg = isHindi
        ? 'बहुत बढ़िया! अभ्यास के लिए तैयार।'
        : 'Wonderful! Ready for a light and enjoyable practice session.';
      speak(okMsg, { lang: isHindi ? 'hi' : 'en', rate: 0.7 });
      setTimeout(onClose, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        {breathingStep > 0 ? (
          <div className="text-center py-8 space-y-6">
            <Heart className="w-16 h-16 text-rose-400 mx-auto animate-bounce" />
            <h3 className="text-2xl font-black text-slate-800">
              {breathingStep === 1 && (isHindi ? 'धीरे से सांस अंदर लें...' : 'Breathe In Slowly...')}
              {breathingStep === 2 && (isHindi ? 'सांस रोकें...' : 'Hold Gently...')}
              {breathingStep === 3 && (isHindi ? 'धीरे से सांस छोड़ें...' : 'Breathe Out Softly...')}
            </h3>
            <div className="w-32 h-32 mx-auto rounded-full bg-indigo-50 border-4 border-indigo-400 flex items-center justify-center transition-all duration-1000 transform scale-110">
              <span className="text-sm font-bold text-indigo-700">
                {isHindi ? 'शांत मन' : 'Calm Mind'}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">
                {t('games.mood_checkin', 'How are you feeling right now?')}
              </h3>
            </div>

            <div className="space-y-2.5">
              {moods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleMoodClick(m)}
                  className={`w-full p-3.5 rounded-2xl flex items-center gap-4 text-left font-bold transition-transform hover:scale-[1.02] border border-slate-100 ${m.color}`}
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-sm">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
