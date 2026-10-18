import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, ArrowDown, ArrowUp, Trophy, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const DEFAULT_ACTIVITIES = [
  { id: '1', name: 'Morning Warm Tea & Water (सुबह की चाय)', time: '07:00 AM', order: 1 },
  { id: '2', name: 'Morning Blood Pressure Medicine (सुबह की दवा)', time: '08:30 AM', order: 2 },
  { id: '3', name: 'Healthy Lunch (दोपहर का भोजन)', time: '01:00 PM', order: 3 },
  { id: '4', name: 'Gentle Evening Garden Walk (शाम की सैर)', time: '05:30 PM', order: 4 },
];

export default function DailyRoutineGame() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [accuracy, setAccuracy] = useState(0);

  useEffect(() => {
    // Shuffle
    const shuffled = [...DEFAULT_ACTIVITIES].sort(() => Math.random() - 0.5);
    setItems(shuffled);
    speak('Arrange the daily activities from morning to evening.', { lang: 'en', rate: 0.8 });
  }, []);

  const moveItem = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length) return;
    const updated = [...items];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setItems(updated);
  };

  const handleVerify = async () => {
    let correct = 0;
    items.forEach((item, index) => {
      if (item.order === index + 1) correct++;
    });

    const finalAcc = Math.round((correct / items.length) * 100);
    setAccuracy(finalAcc);
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });

    if (finalAcc === 100) {
      speak('Perfect order! Your daily routine is crystal clear.', { lang: 'en', rate: 0.8 });
    } else {
      speak(`Good effort! You got ${correct} out of 4 in the right time order.`, { lang: 'en', rate: 0.8 });
    }

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `routine-${Date.now()}`,
          gameType: 'daily_routine',
          level: 'easy',
          step: 'E1',
          score: finalAcc,
          accuracy: finalAcc,
          durationSeconds: 30,
        }),
      });
    } catch (e) {}
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Routine Ordered!</h2>
        <p className="text-slate-500 text-sm mb-6">Orientation to the natural flow of day strengthens independence.</p>
        <div className="text-3xl font-black text-amber-600 mb-6">{accuracy}% Accuracy</div>
        <button onClick={() => navigate('/games')} className="w-full bg-amber-500 text-white font-bold py-3 rounded-2xl shadow-md">
          Back to Games Hub
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/games')} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-sm font-bold text-slate-500">Arrange from Morning to Night</span>
        <Clock className="w-5 h-5 text-amber-500" />
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center">
                #{index + 1}
              </span>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                <p className="text-xs text-slate-500">{item.time}</p>
              </div>
            </div>

            <div className="flex gap-1">
              <button
                disabled={index === 0}
                onClick={() => moveItem(index, index - 1)}
                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30"
              >
                <ArrowUp className="w-4 h-4 text-slate-600" />
              </button>
              <button
                disabled={index === items.length - 1}
                onClick={() => moveItem(index, index + 1)}
                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30"
              >
                <ArrowDown className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={handleVerify}
          className="w-full mt-6 bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 rounded-2xl shadow-md text-base"
        >
          Verify Order (क्रम जांचें)
        </button>
      </div>
    </div>
  );
}
