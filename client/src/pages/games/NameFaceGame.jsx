import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Volume2, Sparkles, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

export default function NameFaceGame() {
  const navigate = useNavigate();
  const [family, setFamily] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // Session metrics
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [gameOver, setGameOver] = useState(false);
  const [resultData, setResultData] = useState(null);

  useEffect(() => {
    fetch('/api/games/family-cards', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.members && d.members.length > 0) {
          setFamily(d.members);
        } else {
          // Default demo family
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

  const currentMember = family[currentQuestionIndex] || family[0];

  // Options for current question
  const getOptions = () => {
    if (!currentMember) return [];
    const pool = family.map((f) => `${f.name} - ${f.relationship}`);
    return Array.from(new Set([`${currentMember.name} - ${currentMember.relationship}`, ...pool])).slice(0, 3);
  };

  const handleSelect = (option) => {
    if (selectedAnswer) return;
    setSelectedAnswer(option);

    const correct = option.startsWith(currentMember.name);
    setIsCorrect(correct);

    if (correct) {
      setScore((s) => s + 20);
      setCorrectCount((c) => c + 1);
      setConsecutiveErrors(0);
      speak(`Excellent! This is ${currentMember.name}.`, { lang: 'en', rate: 0.8 });
    } else {
      const errCount = consecutiveErrors + 1;
      setConsecutiveErrors(errCount);
      if (errCount >= 2) {
        speak(`Here is a gentle hint: this is your loving ${currentMember.relationship}.`, { lang: 'en', rate: 0.75 });
      } else {
        speak(`Let's look closely at the smile. This is ${currentMember.name}.`, { lang: 'en', rate: 0.8 });
      }
    }

    setTimeout(() => {
      if (currentQuestionIndex + 1 < Math.min(5, family.length)) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
      } else {
        finishGame();
      }
    }, 2200);
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });

    const totalQuestions = Math.min(5, family.length);
    const finalAccuracy = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);
    const duration = Math.round((Date.now() - startTime) / 1000);

    try {
      const res = await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `nameface-${Date.now()}`,
          gameType: 'name_face',
          level: 'easy',
          step: 'E1',
          score,
          accuracy: finalAccuracy,
          durationSeconds: duration,
        }),
      });
      const data = await res.json();
      setResultData(data);
    } catch (e) {
      console.warn(e);
    }
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-1">Session Complete!</h2>
        <p className="text-slate-500 text-sm mb-6">Very well practiced. Memory strength grows with gentle exercise.</p>

        <div className="bg-slate-50 p-4 rounded-2xl mb-6 grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-400 block font-bold">Accuracy</span>
            <span className="text-2xl font-black text-indigo-600">
              {Math.round((correctCount / Math.max(1, Math.min(5, family.length))) * 100)}%
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-bold">Current Step</span>
            <span className="text-2xl font-black text-emerald-600">{resultData?.currentStep || 'E1'}</span>
          </div>
        </div>

        <button
          onClick={() => navigate('/games')}
          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl shadow-md"
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
          Question {currentQuestionIndex + 1} of {Math.min(5, family.length)}
        </span>
        <span className="text-xs font-black bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
          Score: {score}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
        <div className="w-40 h-40 mx-auto rounded-3xl bg-indigo-100 flex items-center justify-center overflow-hidden mb-6 border-4 border-indigo-50 shadow-inner">
          <span className="text-5xl font-black text-indigo-600">
            {currentMember?.name?.charAt(0) || 'F'}
          </span>
        </div>

        <h3 className="text-xl font-black text-slate-800 mb-6">
          Who is this lovely person?
          <span className="block text-xs font-normal text-slate-500 mt-1">यह कौन हैं?</span>
        </h3>

        <div className="space-y-3">
          {getOptions().map((opt, i) => {
            const isSelected = selectedAnswer === opt;
            let btnStyle = 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200';
            if (isSelected) {
              btnStyle = isCorrect
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-rose-500 text-white border-rose-500';
            }

            return (
              <button
                key={i}
                disabled={Boolean(selectedAnswer)}
                onClick={() => handleSelect(opt)}
                className={`w-full p-4 rounded-2xl border-2 font-bold text-left text-sm transition-all flex items-center justify-between ${btnStyle}`}
              >
                <span>{opt}</span>
                {isSelected && (isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
