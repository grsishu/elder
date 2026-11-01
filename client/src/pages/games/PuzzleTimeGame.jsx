import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trophy, CheckCircle2, RefreshCw, Volume2, Sparkles, Grid } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

// Beautiful visual puzzle themes
const PUZZLE_THEMES = [
  {
    id: 'flower',
    name: 'Lotus in Pond (कमल का फूल)',
    emojis: ['🪷', '🌿', '💧', '☀️'],
    mediumEmojis: ['🪷', '🌿', '💧', '☀️', '🌸', '🍃'],
  },
  {
    id: 'temple',
    name: 'Peaceful Temple (शांतिपूर्ण मंदिर)',
    emojis: ['🛕', '🔔', '🌺', '🕯️'],
    mediumEmojis: ['🛕', '🔔', '🌺', '🕯️', '🌸', '✨'],
  },
  {
    id: 'tea_garden',
    name: 'Assam Tea Garden (चाय बागान)',
    emojis: ['🌱', '🍃', '🍵', '🏔️'],
    mediumEmojis: ['🌱', '🍃', '🍵', '🏔️', '🌤️', '🦋'],
  },
];

export default function PuzzleTimeGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [selectedTheme, setSelectedTheme] = useState(PUZZLE_THEMES[0]);
  const [pieces, setPieces] = useState([]);
  const [selectedPieceIndex, setSelectedPieceIndex] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [hintsCount, setHintsCount] = useState(0);

  const initPuzzle = (lvl = level, theme = selectedTheme) => {
    cancelSpeech();
    const targetEmojis = lvl === 'easy' ? theme.emojis : theme.mediumEmojis;
    const original = targetEmojis.map((emoji, idx) => ({
      id: idx,
      targetIndex: idx,
      emoji,
    }));

    // Shuffle until not in exact order
    let shuffled = [...original].sort(() => Math.random() - 0.5);
    while (shuffled.every((p, idx) => p.targetIndex === idx)) {
      shuffled = [...original].sort(() => Math.random() - 0.5);
    }

    setPieces(shuffled);
    setSelectedPieceIndex(null);
    setGameOver(false);
    setMoves(0);
    setStartTime(Date.now());

    const isHi = i18n.language?.startsWith('hi');
    speak(
      isHi
        ? `पहेली समय! टुकड़ों को छूकर सही क्रम में लगाएं।`
        : `Puzzle Time! Tap any two pieces to swap and arrange the picture.`,
      { lang: isHi ? 'hi' : 'en', speed: 0.65 }
    );
  };

  useEffect(() => {
    initPuzzle(level, selectedTheme);
    return () => cancelSpeech();
  }, [level, selectedTheme]);

  const handlePieceClick = (index) => {
    if (gameOver) return;

    if (selectedPieceIndex === null) {
      setSelectedPieceIndex(index);
    } else if (selectedPieceIndex === index) {
      // Deselect
      setSelectedPieceIndex(null);
    } else {
      // Swap pieces
      const updated = [...pieces];
      const temp = updated[selectedPieceIndex];
      updated[selectedPieceIndex] = updated[index];
      updated[index] = temp;
      setPieces(updated);
      setSelectedPieceIndex(null);
      setMoves((m) => m + 1);

      // Check win condition
      const isSolved = updated.every((p, idx) => p.targetIndex === idx);
      if (isSolved) {
        setGameOver(true);
        confetti({ particleCount: 80, spread: 70 });
        const isHi = i18n.language?.startsWith('hi');
        speak(isHi ? 'अद्भुत! पहेली पूरी हो गई!' : 'Magnificent! The puzzle is complete!', {
          lang: isHi ? 'hi' : 'en',
          speed: 0.7,
        });

        const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));
        fetch('/api/games/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientSessionId: `puzzle-${Date.now()}`,
            gameType: 'puzzle_time',
            level,
            step: level === 'hard' ? 'H1' : level === 'medium' ? 'M1' : 'E1',
            score: 100,
            accuracy: 100,
            hintsCount,
            errorsCount: Math.max(0, moves - pieces.length),
            durationSeconds: duration,
            totalQuestions: 1,
            correctAnswers: 1,
            incorrectAnswers: 0,
            completionStatus: 'completed',
          }),
        }).catch((e) => console.warn(e));
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/games')}
          className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-bold shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl">
          {['easy', 'medium'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevel(lvl)}
              className={`px-3 py-1 rounded-xl text-xs font-black uppercase transition-all ${
                level === lvl ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6 text-center">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-4">
          <span className="flex items-center gap-1 text-indigo-600">
            <Grid className="w-4 h-4" /> Puzzle Time (तस्वीर पहेली)
          </span>
          <span>Moves: {moves}</span>
        </div>

        <h3 className="text-lg font-black text-slate-800 mb-1">{selectedTheme.name}</h3>
        <p className="text-xs text-slate-500 mb-6">Tap two pieces to swap them until the picture is complete.</p>

        {/* Puzzle Board Grid */}
        <div
          className={`grid gap-3 max-w-sm mx-auto mb-6 ${
            level === 'easy' ? 'grid-cols-2' : 'grid-cols-3'
          }`}
        >
          {pieces.map((p, idx) => {
            const isSelected = selectedPieceIndex === idx;
            const isCorrectSlot = p.targetIndex === idx;
            return (
              <button
                key={p.id}
                onClick={() => handlePieceClick(idx)}
                className={`h-28 rounded-3xl text-5xl flex items-center justify-center transition-all transform shadow-sm ${
                  isSelected
                    ? 'border-4 border-indigo-600 scale-105 bg-indigo-50 shadow-md'
                    : isCorrectSlot
                    ? 'border-2 border-emerald-300 bg-emerald-50/40'
                    : 'border-2 border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {p.emoji}
              </button>
            );
          })}
        </div>

        {gameOver && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl mb-4 text-emerald-800">
            <div className="flex items-center justify-center gap-2 font-black text-lg mb-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              Puzzle Completed!
            </div>
            <p className="text-xs text-emerald-700">Solved in {moves} moves. Beautiful spatial problem solving!</p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => initPuzzle(level, selectedTheme)}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Reset Puzzle
          </button>
          <button
            onClick={() => {
              const nextTheme =
                PUZZLE_THEMES[(PUZZLE_THEMES.indexOf(selectedTheme) + 1) % PUZZLE_THEMES.length];
              setSelectedTheme(nextTheme);
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-500" /> Change Picture
          </button>
        </div>
      </div>
    </div>
  );
}

