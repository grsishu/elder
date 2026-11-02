import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, XCircle, Volume2, Trophy, Camera, Plus, RefreshCw, Heart } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

export default function NameFaceGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [options, setOptions] = useState([]);

  // Session metrics
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [gameOver, setGameOver] = useState(false);
  const [resultData, setResultData] = useState(null);

  // Load saved family profiles from backend
  useEffect(() => {
    fetch('/api/family/members', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.members && d.members.length > 0) {
          setFamily(d.members);
        } else {
          // Check games family-cards as fallback
          return fetch('/api/games/family-cards', { credentials: 'include' })
            .then((r2) => r2.json())
            .then((d2) => {
              if (d2.members && d2.members.length > 0) {
                setFamily(d2.members);
              } else {
                setFamily([]);
              }
            });
        }
      })
      .catch(() => setFamily([]))
      .finally(() => setLoading(false));

    return () => cancelSpeech();
  }, []);

  const membersWithPhotos = family.filter((m) => m.hasPhoto || m.has_photo || m.photoUrl);
  const currentMember = membersWithPhotos[currentQuestionIndex] || membersWithPhotos[0];

  // Prepare multiple choice options for current question
  useEffect(() => {
    if (!currentMember || membersWithPhotos.length === 0) return;

    const currentRel = t(`relationships.${currentMember.relationship?.toLowerCase()}`, currentMember.relationship);
    const correctLabel = `${currentMember.name} • ${currentRel}`;

    // Pool of other family members
    const pool = family
      .filter((m) => m.name !== currentMember.name)
      .map((m) => {
        const rel = t(`relationships.${m.relationship?.toLowerCase()}`, m.relationship);
        return `${m.name} • ${rel}`;
      });

    // Shuffle pool and take up to 2 distractors
    const shuffledPool = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    const allOptions = [correctLabel, ...shuffledPool].sort(() => Math.random() - 0.5);

    setOptions(allOptions);
    setSelectedOption(null);
    setIsCorrect(null);

    // Speak prompt
    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const promptVoice = isHi
      ? `तस्वीर को ध्यान से देखें। यह कौन हैं?`
      : isTa
      ? `படத்தை கவனமாகப் பாருங்கள். இவர் யார்?`
      : `Look closely at this lovely photo. Who is this?`;

    cancelSpeech();
    speak(promptVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
  }, [currentQuestionIndex, membersWithPhotos.length, currentMember?.name, i18n.language, t]);

  const handleSelect = (option) => {
    if (selectedOption || !currentMember) return;
    setSelectedOption(option);

    const isMatch = option.startsWith(currentMember.name);
    setIsCorrect(isMatch);

    const currentRel = t(`relationships.${currentMember.relationship?.toLowerCase()}`, currentMember.relationship);
    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');

    if (isMatch) {
      setScore((s) => s + 20);
      setCorrectCount((c) => c + 1);
      confetti({ particleCount: 50, spread: 50 });

      const praise = isHi
        ? `शाबाश! यह आपके प्यारे ${currentRel}, ${currentMember.name} हैं।`
        : isTa
        ? `மிகவும் நன்று! இவர் உங்கள் ${currentRel}, ${currentMember.name}.`
        : `Wonderful! This is your loving ${currentRel}, ${currentMember.name}.`;

      speak(praise, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
    } else {
      const hint = isHi
        ? `मुस्कान को ध्यान से देखें। यह ${currentMember.name} हैं।`
        : isTa
        ? `கவனமாகப் பாருங்கள். இவர் ${currentMember.name}.`
        : `Take a gentle look at the smile. This is ${currentMember.name}.`;

      speak(hint, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
    }

    setTimeout(() => {
      if (currentQuestionIndex + 1 < Math.min(5, membersWithPhotos.length)) {
        setCurrentQuestionIndex((prev) => prev + 1);
      } else {
        finishGame(isMatch ? score + 20 : score, isMatch ? correctCount + 1 : correctCount);
      }
    }, 2400);
  };

  const finishGame = async (finalScore, finalCorrect) => {
    setGameOver(true);
    confetti({ particleCount: 80, spread: 70 });

    const totalQuestions = Math.min(5, membersWithPhotos.length);
    const finalAccuracy = Math.round((finalCorrect / Math.max(1, totalQuestions)) * 100);
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
          score: finalScore,
          accuracy: finalAccuracy,
          durationSeconds: duration,
        }),
      });
      const data = await res.json();
      setResultData(data);
    } catch (e) {
      console.warn('Could not save game session:', e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-700">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-3" />
        Loading Family Memories...
      </div>
    );
  }

  // Graceful state: When no photos have been uploaded yet
  if (membersWithPhotos.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl mx-auto flex items-center justify-center">
            <Camera className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black text-slate-800">No Family Photos Added Yet</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            This memory game uses real photographs of your loved ones to stimulate facial and name recall.
            Please add photos of your family members in the setup wizard or family portal.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/wizard"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Photos in Setup
            </Link>
            <Link
              to="/family"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-5 rounded-2xl text-xs flex items-center justify-center"
            >
              Family Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Game over modal
  if (gameOver) {
    const totalQuestions = Math.min(5, membersWithPhotos.length);
    const finalAccuracy = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);

    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-lg space-y-5">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
          <div>
            <h2 className="text-2xl font-black text-slate-800">Session Complete!</h2>
            <p className="text-slate-500 text-xs mt-1">
              Practicing loving family faces strengthens emotional and visual memory recall.
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl grid grid-cols-2 gap-4 border border-slate-100">
            <div>
              <span className="text-xs text-slate-400 block font-bold">Accuracy</span>
              <span className="text-2xl font-black text-indigo-600">{finalAccuracy}%</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-bold">Score</span>
              <span className="text-2xl font-black text-emerald-600">{score}</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => {
                setGameOver(false);
                setCurrentQuestionIndex(0);
                setScore(0);
                setCorrectCount(0);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl shadow-md text-xs transition-colors"
            >
              Play Again
            </button>
            <button
              onClick={() => navigate('/games')}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-colors"
            >
              Back to Games Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentRel = t(`relationships.${currentMember?.relationship?.toLowerCase()}`, currentMember?.relationship);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 md:py-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/games')}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-xs font-bold text-slate-500">
          Question {currentQuestionIndex + 1} of {Math.min(5, membersWithPhotos.length)}
        </span>
        <span className="text-xs font-black bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
          Score: {score}
        </span>
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
        {/* Actual Family Photograph */}
        <div className="w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-3xl overflow-hidden mb-5 border-4 border-indigo-50 shadow-md bg-slate-100 relative group">
          <img
            src={currentMember?.photoUrl || `/api/family/members/${currentMember?.id}/photo`}
            alt={currentMember?.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>

        <h3 className="text-lg md:text-xl font-black text-slate-800 mb-1">
          Who is this beloved person?
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          यह कौन हैं? • யார் இவர்?
        </p>

        {/* Multiple Choice Options */}
        <div className="space-y-3">
          {options.map((opt, i) => {
            const isSelected = selectedOption === opt;
            const isTargetCorrect = opt.startsWith(currentMember?.name);

            let btnStyle = 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200';
            if (selectedOption) {
              if (isSelected) {
                btnStyle = isCorrect
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                  : 'bg-rose-500 text-white border-rose-500 shadow-md';
              } else if (isTargetCorrect) {
                btnStyle = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
              }
            }

            return (
              <button
                key={i}
                disabled={Boolean(selectedOption)}
                onClick={() => handleSelect(opt)}
                className={`w-full p-4 rounded-2xl border-2 font-bold text-left text-sm transition-all flex items-center justify-between ${btnStyle} active:scale-98`}
              >
                <span>{opt}</span>
                {isSelected && (
                  isCorrect ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
