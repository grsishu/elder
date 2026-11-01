import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trophy, Eye, CheckCircle2, RefreshCw, Volume2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const ITEMS_POOL = [
  { id: 'spectacles', nameKey: 'games.item_spectacles', emoji: '👓' },
  { id: 'keys', nameKey: 'games.item_keys', emoji: '🔑' },
  { id: 'umbrella', nameKey: 'games.item_umbrella', emoji: '☂️' },
  { id: 'tea_cup', nameKey: 'games.item_tea_cup', emoji: '🍵' },
  { id: 'watch', nameKey: 'games.item_watch', emoji: '⌚' },
  { id: 'water_bottle', nameKey: 'games.item_water_bottle', emoji: '🧴' },
  { id: 'book', nameKey: 'games.item_book', emoji: '📖' },
  { id: 'walking_stick', nameKey: 'games.item_walking_stick', emoji: '🦯' },
];

export default function RememberObjectsGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [phase, setPhase] = useState('memorize'); // 'memorize' | 'recall' | 'completed'
  const [targets, setTargets] = useState([]);
  const [displayPool, setDisplayPool] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [countdown, setCountdown] = useState(6);
  const [startTime, setStartTime] = useState(Date.now());

  const targetCount = level === 'easy' ? 3 : level === 'medium' ? 4 : 5;
  const poolCount = level === 'easy' ? 6 : level === 'medium' ? 8 : 8;

  const startNewGame = (lvl = level) => {
    const shuffled = [...ITEMS_POOL].sort(() => Math.random() - 0.5);
    const chosenTargets = shuffled.slice(0, lvl === 'easy' ? 3 : lvl === 'medium' ? 4 : 5);
    const distractors = shuffled.slice(chosenTargets.length, lvl === 'easy' ? 6 : 8);
    const pool = [...chosenTargets, ...distractors].sort(() => Math.random() - 0.5);

    setTargets(chosenTargets);
    setDisplayPool(pool);
    setSelectedIds([]);
    setWrongTaps(0);
    setPhase('memorize');
    setCountdown(6);
    setStartTime(Date.now());

    speak(t('games.remember_memorize_phase'), {
      lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
      rate: 0.65,
    });
  };

  useEffect(() => {
    startNewGame(level);
  }, [level]);

  useEffect(() => {
    if (phase !== 'memorize') return;
    if (countdown <= 0) {
      setPhase('recall');
      speak(t('games.remember_recall_phase'), {
        lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
        rate: 0.65,
      });
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  const handleSelect = (item) => {
    if (phase !== 'recall') return;
    if (selectedIds.includes(item.id)) return;

    const isTarget = targets.some((tgt) => tgt.id === item.id);

    if (isTarget) {
      const nextSelected = [...selectedIds, item.id];
      setSelectedIds(nextSelected);
      speak(t(item.nameKey), {
        lang: i18n.language.startsWith('hi') ? 'hi' : 'en',
        rate: 0.7,
      });

      if (nextSelected.length === targets.length) {
        // Complete
        finishGame(nextSelected.length, wrongTaps);
      }
    } else {
      setWrongTaps((prev) => prev + 1);
    }
  };

  const finishGame = async (correctCount, wrongs) => {
    setPhase('completed');
    confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });
    const duration = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const accuracy = Math.max(30, Math.round((correctCount / (correctCount + wrongs)) * 100));

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
          clientSessionId: `remember-${Date.now()}`,
          gameType: 'remember_objects',
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
      {/* Navigation & Difficulty Header */}
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
              onClick={() => {
                setLevel(lvl);
              }}
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

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        {phase === 'memorize' && (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-black mb-3">
              <Eye className="w-4 h-4" />
              <span>{t('games.remember_memorize_phase')}</span>
            </div>

            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden my-4">
              <div
                className="bg-amber-500 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(countdown / 6) * 100}%` }}
              />
            </div>
            <p className="text-4xl font-black text-slate-700 mb-6">{countdown}</p>

            <div className="grid grid-cols-3 gap-3">
              {targets.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-amber-50/70 border-2 border-amber-200 rounded-2xl flex flex-col items-center justify-center animate-fade-in"
                >
                  <span className="text-4xl mb-2">{item.emoji}</span>
                  <span className="text-xs font-bold text-slate-800 text-center">{t(item.nameKey)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'recall' && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-xl font-black text-slate-800 mb-1">{t('games.remember_recall_phase')}</h2>
              <p className="text-xs font-bold text-indigo-600">
                {t('games.remember_items_left', { count: targets.length - selectedIds.length })}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {displayPool.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    disabled={isSelected}
                    className={`p-4 rounded-2xl flex flex-col items-center justify-center border-2 transition transform active:scale-95 ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800 opacity-90'
                        : 'bg-slate-50 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-800'
                    }`}
                  >
                    <span className="text-4xl mb-2">{item.emoji}</span>
                    <span className="text-xs font-bold text-center line-clamp-1">{t(item.nameKey)}</span>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-1 inline-block" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'completed' && (
          <div className="text-center py-6">
            <Trophy className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-2xl font-black text-slate-800 mb-2">{t('games.game_completed')}</h2>
            <p className="text-slate-500 text-sm mb-6">{t('games.encouragement')}</p>

            <div className="flex gap-3 justify-center mb-6">
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

