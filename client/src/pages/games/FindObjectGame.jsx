import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trophy, Search, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const ATTENTION_ITEMS = [
  { id: 'red_apple', nameKey: 'games.item_red_apple', emoji: '🍎' },
  { id: 'golden_bell', nameKey: 'games.item_golden_bell', emoji: '🔔' },
  { id: 'flower', nameKey: 'games.item_flower', emoji: '🌸' },
  { id: 'green_leaf', nameKey: 'games.item_green_leaf', emoji: '🍃' },
  { id: 'tea_cup', nameKey: 'games.item_tea_cup', emoji: '🍵' },
  { id: 'spectacles', nameKey: 'games.item_spectacles', emoji: '👓' },
  { id: 'mango', nameKey: 'games.item_mango', emoji: '🥭' },
  { id: 'lamp', nameKey: 'games.item_lamp', emoji: '🪔' },
  { id: 'umbrella', nameKey: 'games.item_umbrella', emoji: '☂️' },
  { id: 'watch', nameKey: 'games.item_watch', emoji: '⌚' },
  { id: 'book', nameKey: 'games.item_book', emoji: '📖' },
  { id: 'walking_stick', nameKey: 'games.item_walking_stick', emoji: '🦯' },
];

const TOTAL_ROUNDS = 4;

export default function FindObjectGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [round, setRound] = useState(1);
  const [targetItem, setTargetItem] = useState(null);
  const [gridItems, setGridItems] = useState([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  const gridSize = level === 'easy' ? 6 : level === 'medium' ? 9 : 12;

  const setupRound = (roundNum, lvl = level) => {
    const poolSize = lvl === 'easy' ? 6 : lvl === 'medium' ? 9 : 12;
    const shuffled = [...ATTENTION_ITEMS].sort(() => Math.random() - 0.5);
    const chosenTarget = shuffled[0];
    const rest = shuffled.slice(1, poolSize);
    const currentGrid = [chosenTarget, ...rest].sort(() => Math.random() - 0.5);

    setTargetItem(chosenTarget);
    setGridItems(currentGrid);

    speak(`${t('games.find_target_prompt', { target: t(chosenTarget.nameKey) })}`, {
      lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
      rate: 0.65,
    });
  };

  const startNewGame = (lvl = level) => {
    setRound(1);
    setWrongTaps(0);
    setTotalAttempts(0);
    setGameOver(false);
    setStartTime(Date.now());
    setupRound(1, lvl);
  };

  useEffect(() => {
    startNewGame(level);
  }, [level]);

  const handleItemClick = (item) => {
    if (gameOver || !targetItem) return;
    setTotalAttempts((a) => a + 1);

    if (item.id === targetItem.id) {
      // Correct!
      if (round < TOTAL_ROUNDS) {
        speak(t('games.find_success'), {
          lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
          rate: 0.7,
        });
        setRound((r) => r + 1);
        setupRound(round + 1, level);
      } else {
        finishGame();
      }
    } else {
      setWrongTaps((w) => w + 1);
    }
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    const duration = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const accuracy = Math.max(30, Math.round((TOTAL_ROUNDS / Math.max(TOTAL_ROUNDS, totalAttempts + 1)) * 100));

    speak(t('games.game_completed'), {
      lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
      rate: 0.65,
    });

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `find-${Date.now()}`,
          gameType: 'find_object',
          level,
          step: 'E1',
          score: 100,
          accuracy,
          durationSeconds: duration,
        }),
      });
    } catch (e) {
      console.warn('Game session save warning:', e.message);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/games')}
          className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
          {['easy', 'medium', 'hard'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevel(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                level === lvl ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t(`games.${lvl}`)}
            </button>
          ))}
        </div>

        <button
          onClick={() => startNewGame(level)}
          className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition"
          title={t('games.play_again')}
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        {!gameOver ? (
          <div>
            {/* Round info & Target prompt */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-4">
              <span>{t('games.find_round', { current: round, total: TOTAL_ROUNDS })}</span>
              <span className="text-violet-600 bg-violet-50 px-3 py-1 rounded-full font-black">
                {t(`games.${level}`)}
              </span>
            </div>

            {targetItem && (
              <div className="p-4 bg-violet-50/80 border-2 border-violet-200 rounded-2xl text-center mb-6">
                <p className="text-xs font-bold text-violet-700 mb-1">
                  {t('games.find_target_prompt', { target: '' })}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl">{targetItem.emoji}</span>
                  <span className="text-xl font-black text-violet-950">{t(targetItem.nameKey)}</span>
                </div>
              </div>
            )}

            {/* Grid */}
            <div
              className={`grid gap-3 ${
                gridSize <= 6 ? 'grid-cols-3' : gridSize <= 9 ? 'grid-cols-3' : 'grid-cols-4'
              }`}
            >
              {gridItems.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  onClick={() => handleItemClick(item)}
                  className="h-24 bg-slate-50 hover:bg-violet-50 border-2 border-slate-200 hover:border-violet-400 rounded-2xl flex flex-col items-center justify-center transition transform active:scale-95 shadow-sm"
                >
                  <span className="text-4xl">{item.emoji}</span>
                  <span className="text-[10px] font-bold text-slate-600 mt-1 line-clamp-1">{t(item.nameKey)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Trophy className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-2xl font-black text-slate-800 mb-2">{t('games.game_completed')}</h2>
            <p className="text-slate-500 text-sm mb-6">{t('games.encouragement')}</p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => startNewGame(level)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-2xl text-sm shadow-md transition"
              >
                {t('games.play_again')}
              </button>
              <button
                onClick={() => navigate('/games')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-3 rounded-2xl text-sm transition"
              >
                {t('games.back_to_games')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

