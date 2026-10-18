import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

export default function WhoseVoiceGame() {
  const navigate = useNavigate();
  const [family, setFamily] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    fetch('/api/games/family-cards', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.members && d.members.length > 0) {
          setFamily(d.members);
        } else {
          setFamily([
            { id: '1', name: 'Aarav Barua', relationship: 'Son (बेटा)' },
            { id: '2', name: 'Sneha Barua', relationship: 'Daughter (बेटी)' },
            { id: '3', name: 'Rohan Barua', relationship: 'Grandson (पोता)' },
          ]);
        }
      })
      .catch(() => {
        setFamily([
          { id: '1', name: 'Aarav Barua', relationship: 'Son (बेटा)' },
          { id: '2', name: 'Sneha Barua', relationship: 'Daughter (बेटी)' },
          { id: '3', name: 'Rohan Barua', relationship: 'Grandson (पोता)' },
        ]);
      });
  }, []);

  const currentSpeaker = family[currentQuestionIndex] || family[0];

  const playVoicePrompt = () => {
    if (!currentSpeaker) return;
    speak(`Namaskar! How are you feeling today? This is your loving ${currentSpeaker.relationship}.`, {
      lang: 'en',
      rate: 0.8,
    });
  };

  useEffect(() => {
    if (currentSpeaker && !gameOver) {
      setTimeout(playVoicePrompt, 400);
    }
  }, [currentQuestionIndex, gameOver]);

  const handleSelect = (member) => {
    if (selectedId) return;
    setSelectedId(member.id);

    const correct = member.id === currentSpeaker.id;
    setIsCorrect(correct);

    if (correct) {
      setScore((s) => s + 25);
      setCorrectCount((c) => c + 1);
      speak(`Yes! That was ${currentSpeaker.name}'s voice.`, { lang: 'en', rate: 0.8 });
    } else {
      speak(`That sounded very close, but it was ${currentSpeaker.name}.`, { lang: 'en', rate: 0.8 });
    }

    setTimeout(() => {
      if (currentQuestionIndex + 1 < Math.min(4, family.length)) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedId(null);
        setIsCorrect(null);
      } else {
        finishGame();
      }
    }, 2200);
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });
    const duration = Math.round((Date.now() - startTime) / 1000);
    const finalAccuracy = Math.round((correctCount / Math.max(1, Math.min(4, family.length))) * 100);

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `voice-${Date.now()}`,
          gameType: 'whose_voice',
          level: 'easy',
          step: 'E1',
          score,
          accuracy: finalAccuracy,
          durationSeconds: duration,
        }),
      });
    } catch (e) {}
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-purple-600 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Wonderful Listening!</h2>
        <p className="text-slate-500 text-sm mb-6">Recognizing familiar voices brings comfort and stimulates sound memory.</p>
        <button
          onClick={() => navigate('/games')}
          className="w-full bg-purple-600 text-white font-bold py-3 rounded-2xl shadow-md"
        >
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
        <span className="text-sm font-bold text-slate-500">
          Question {currentQuestionIndex + 1} of {Math.min(4, family.length)}
        </span>
        <span className="text-xs font-black bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
          Score: {score}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
        <button
          onClick={playVoicePrompt}
          className="w-24 h-24 mx-auto rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 flex items-center justify-center mb-4 transition-transform active:scale-95 shadow-md"
        >
          <Volume2 className="w-10 h-10 animate-pulse" />
        </button>
        <h3 className="text-xl font-black text-slate-800 mb-1">Whose voice was that?</h3>
        <p className="text-xs text-slate-500 mb-6">यह आवाज़ किसकी थी? (Tap speaker to hear again)</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {family.map((m) => {
            const isSelected = selectedId === m.id;
            let style = 'bg-slate-50 border-slate-200 text-slate-800';
            if (isSelected) {
              style = isCorrect ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rose-500 text-white border-rose-500';
            }

            return (
              <button
                key={m.id}
                disabled={Boolean(selectedId)}
                onClick={() => handleSelect(m)}
                className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all flex items-center justify-between ${style}`}
              >
                <div className="text-left">
                  <div className="font-bold">{m.name}</div>
                  <div className="text-xs opacity-75">{m.relationship}</div>
                </div>
                {isSelected && (isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
