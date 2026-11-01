import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trophy, CheckCircle2, XCircle, Volume2, Sparkles, Heart, Mic, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

export default function MemoryLaneGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [hintsCount, setHintsCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // Fetch photos from family API
    Promise.all([
      fetch('/api/family/photos', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/games/family-cards', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([fRes, cRes]) => {
      let combined = [];
      if (fRes.photos && fRes.photos.length > 0) {
        combined = fRes.photos.map((p) => ({
          id: p.id,
          name: p.member_name || p.person_name,
          relationship: p.relationship,
          photoUrl: `/api/family/photos/${p.id}/file`,
          description: p.description,
        }));
      } else if (cRes.members && cRes.members.length > 0) {
        combined = cRes.members.map((m) => ({
          id: m.id,
          name: m.name,
          relationship: m.relationship,
          photoUrl: null,
          description: m.relationship,
        }));
      }

      if (combined.length === 0) {
        // Warm fallback memories
        combined = [
          {
            id: 'm1',
            name: 'Aarav Barua',
            relationship: 'Elder Son (बड़ा बेटा)',
            emoji: '👨‍💼',
            description: 'He loves drinking evening tea with you in the garden.',
          },
          {
            id: 'm2',
            name: 'Sneha Barua',
            relationship: 'Daughter (बेटी)',
            emoji: '👩‍🏫',
            description: 'She visits every Sunday and brings your favorite sweets.',
          },
          {
            id: 'm3',
            name: 'Rohan',
            relationship: 'Grandson (पोता)',
            emoji: '👦',
            description: 'He always asks you to tell stories of old times.',
          },
        ];
      }

      setPhotos(combined);
      initQuestion(combined, 0, combined);
    });

    return () => cancelSpeech();
  }, []);

  const initQuestion = (list, index, fullPool) => {
    if (!list || list.length === 0 || !list[index]) return;
    const current = list[index];

    // Generate 3 choices
    const correctLabel = `${current.name} (${current.relationship})`;
    const distractors = fullPool
      .filter((p) => p.id !== current.id)
      .map((p) => `${p.name} (${p.relationship})`);

    // Add generic distractors if needed
    const generic = ['Family Friend (पारिवारिक मित्र)', 'Neighbor (पड़ोसी)', 'Cousin (भाई/बहन)'];
    const choices = Array.from(new Set([correctLabel, ...distractors, ...generic])).slice(0, 3);
    const shuffledChoices = choices.sort(() => Math.random() - 0.5);

    setOptions(shuffledChoices);
    setSelectedOption(null);
    setLastFeedback(null);

    const isHi = i18n.language?.startsWith('hi');
    speak(
      isHi
        ? `पहचानिए, यह परिवार के कौन से सदस्य हैं?`
        : `Who is this beloved family member?`,
      { lang: isHi ? 'hi' : 'en', speed: 0.65 }
    );
  };

  const handleSelect = async (choice) => {
    if (selectedOption || lastFeedback) return;
    setSelectedOption(choice);

    const current = photos[currentIndex];
    const isCorrect = choice.includes(current.name);
    const isHi = i18n.language?.startsWith('hi');

    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setLastFeedback({ type: 'correct', message: isHi ? `बहुत बढ़िया! यह ${current.name} हैं!` : `Splendid! This is ${current.name}!` });
      speak(
        isHi ? `बहुत बढ़िया! यह ${current.name} हैं!` : `Splendid! This is ${current.name}!`,
        { lang: isHi ? 'hi' : 'en', speed: 0.7 }
      );
    } else {
      setErrorsCount((e) => e + 1);
      setLastFeedback({
        type: 'incorrect',
        message: isHi ? `यह आपके ${current.relationship} ${current.name} हैं।` : `This is your ${current.relationship}, ${current.name}.`,
      });
      speak(
        isHi ? `यह आपके ${current.relationship} ${current.name} हैं।` : `This is your ${current.relationship}, ${current.name}.`,
        { lang: isHi ? 'hi' : 'en', speed: 0.65 }
      );
    }

    setTimeout(async () => {
      const nextIdx = currentIndex + 1;
      if (nextIdx < photos.length) {
        setCurrentIndex(nextIdx);
        initQuestion(photos, nextIdx, photos);
      } else {
        setGameOver(true);
        confetti({ particleCount: 75, spread: 70 });
        const finalAcc = Math.round(((correctCount + (isCorrect ? 1 : 0)) / photos.length) * 100);
        const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

        try {
          await fetch('/api/games/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              clientSessionId: `memlane-${Date.now()}`,
              gameType: 'memory_lane',
              level,
              step: 'E1',
              score: finalAcc,
              accuracy: finalAcc,
              hintsCount,
              errorsCount: errorsCount + (isCorrect ? 0 : 1),
              durationSeconds: duration,
              totalQuestions: photos.length,
              correctAnswers: correctCount + (isCorrect ? 1 : 0),
              incorrectAnswers: errorsCount + (isCorrect ? 0 : 1),
              completionStatus: 'completed',
            }),
          });
        } catch (e) {
          console.warn(e);
        }
      }
    }, 1800);
  };

  const current = photos[currentIndex];

  if (gameOver) {
    const accuracy = Math.round((correctCount / photos.length) * 100);
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Heart className="w-16 h-16 text-rose-500 fill-rose-500 mx-auto mb-4 animate-pulse" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Memory Lane Completed!</h2>
        <p className="text-slate-500 text-sm mb-6">
          Reminiscing with family faces stimulates deep emotional reassurance and memory networks.
        </p>
        <div className="text-4xl font-black text-rose-600 mb-2">{accuracy}%</div>
        <p className="text-xs text-slate-400 mb-6 font-semibold">
          {correctCount} / {photos.length} beloved members remembered
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setGameOver(false);
              setCurrentIndex(0);
              setCorrectCount(0);
              setErrorsCount(0);
              initQuestion(photos, 0, photos);
            }}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-md"
          >
            <RefreshCw className="w-4 h-4" /> Play Again
          </button>
          <button
            onClick={() => navigate('/games')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl"
          >
            Games Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/games')}
          className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-bold shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-xs font-bold px-3 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-200 flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 fill-rose-500" /> Memory Lane (परिवार की यादें)
        </span>
      </div>

      {/* Photo / Memory Card */}
      {current && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6 text-center">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-4">
            <span>Memory {currentIndex + 1} of {photos.length}</span>
            <span>Family Photo</span>
          </div>

          <div className="w-48 h-48 mx-auto mb-4 rounded-3xl overflow-hidden border-4 border-rose-100 shadow-md bg-rose-50 flex items-center justify-center">
            {current.photoUrl ? (
              <img
                src={current.photoUrl}
                alt={current.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="text-7xl">{current.emoji || '👤'}</span>
            )}
          </div>

          <p className="text-sm text-slate-600 font-medium mb-2 italic">
            "{current.description || 'A cherished family memory.'}"
          </p>

          <p className="text-xs font-bold text-slate-400">
            Who is this family member? (यह कौन हैं?)
          </p>

          {lastFeedback && (
            <div
              className={`mt-4 p-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${
                lastFeedback.type === 'correct' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {lastFeedback.type === 'correct' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600" />
              )}
              {lastFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* Choice Options */}
      <div className="space-y-3 mb-6">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(opt)}
            disabled={Boolean(lastFeedback)}
            className="w-full p-4 bg-white hover:bg-rose-50/50 border-2 border-slate-200 hover:border-rose-300 rounded-2xl text-left font-bold text-slate-800 transition-all flex items-center justify-between text-base active:scale-98 shadow-sm"
          >
            <span>{opt}</span>
            <span className="text-xs text-rose-600 font-semibold">Select ➔</span>
          </button>
        ))}
      </div>

      {/* Voice repeat */}
      <div className="flex justify-center">
        <button
          onClick={() => {
            if (current) {
              const isHi = i18n.language?.startsWith('hi');
              speak(
                isHi
                  ? `पहचानिए, यह परिवार के कौन से सदस्य हैं?`
                  : `Who is this beloved family member?`,
                { lang: isHi ? 'hi' : 'en', speed: 0.65 }
              );
            }
          }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-sm"
        >
          <Volume2 className="w-4 h-4 text-slate-500" /> Hear Question Again
        </button>
      </div>
    </div>
  );
}

