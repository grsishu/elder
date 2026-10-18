import React, { useState } from 'react';
import { Smile, Meh, Frown, Sparkles, X, Heart } from 'lucide-react';
import { speak } from '../utils/voice';

export default function MoodModal({ isOpen, onClose, onSelectMood }) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [breathingStep, setBreathingStep] = useState(0); // 0 = not breathing, 1 = inhale, 2 = hold, 3 = exhale

  if (!isOpen) return null;

  const moods = [
    { id: 'very_happy', label: 'Very Happy (बहुत खुश)', emoji: '😄', color: 'bg-emerald-100 text-emerald-800' },
    { id: 'happy', label: 'Happy (खुश)', emoji: '🙂', color: 'bg-teal-100 text-teal-800' },
    { id: 'calm', label: 'Calm (शांत)', emoji: '😌', color: 'bg-blue-100 text-blue-800' },
    { id: 'sad', label: 'Low / Sad (उदास)', emoji: '😔', color: 'bg-amber-100 text-amber-800' },
    { id: 'anxious', label: 'Worried (चिंतित)', emoji: '😟', color: 'bg-rose-100 text-rose-800' },
  ];

  const handleMoodClick = (mood) => {
    setSelectedMood(mood);
    if (onSelectMood) onSelectMood(mood.id);

    if (mood.id === 'sad' || mood.id === 'anxious') {
      speak('Let us take three gentle breaths together to feel calm and relaxed.', { lang: 'en', rate: 0.7 });
      setBreathingStep(1);
      setTimeout(() => setBreathingStep(2), 3000);
      setTimeout(() => setBreathingStep(3), 6000);
      setTimeout(() => {
        setBreathingStep(0);
        onClose();
      }, 9500);
    } else {
      speak('Wonderful! Ready for a light and enjoyable practice session.', { lang: 'en', rate: 0.8 });
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
              {breathingStep === 1 && 'Breathe In Slowly (धीरे से सांस लें)...'}
              {breathingStep === 2 && 'Hold Gently (सांस रोकें)...'}
              {breathingStep === 3 && 'Breathe Out Softly (धीरे से सांस छोड़ें)...'}
            </h3>
            <div className="w-32 h-32 mx-auto rounded-full bg-indigo-50 border-4 border-indigo-400 flex items-center justify-center transition-all duration-1000 transform scale-110">
              <span className="text-sm font-bold text-indigo-700">Calm Mind</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">How are you feeling right now?</h3>
              <p className="text-xs text-slate-500 mt-1">आप अभी कैसा महसूस कर रहे हैं?</p>
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
