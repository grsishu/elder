import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trophy, CheckCircle2, XCircle, Volume2, Sparkles, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

const CATEGORIES_DATA = {
  fruits: {
    id: 'fruits',
    name: 'Fruits (फल)',
    items: [
      { id: 'apple', name: 'Apple (सेब)', emoji: '🍎', category: 'fruits' },
      { id: 'banana', name: 'Banana (केला)', emoji: '🍌', category: 'fruits' },
      { id: 'mango', name: 'Mango (आम)', emoji: '🥭', category: 'fruits' },
      { id: 'orange', name: 'Orange (संतरा)', emoji: '🍊', category: 'fruits' },
    ],
  },
  vegetables: {
    id: 'vegetables',
    name: 'Vegetables (सब्जियां)',
    items: [
      { id: 'carrot', name: 'Carrot (गाजर)', emoji: '🥕', category: 'vegetables' },
      { id: 'potato', name: 'Potato (आलू)', emoji: '🥔', category: 'vegetables' },
      { id: 'tomato', name: 'Tomato (टमाटर)', emoji: '🍅', category: 'vegetables' },
      { id: 'spinach', name: 'Spinach (पालक)', emoji: '🥬', category: 'vegetables' },
    ],
  },
  animals: {
    id: 'animals',
    name: 'Animals (जानवर)',
    items: [
      { id: 'cow', name: 'Cow (गाय)', emoji: '🐄', category: 'animals' },
      { id: 'cat', name: 'Cat (बिल्ली)', emoji: '🐱', category: 'animals' },
      { id: 'dog', name: 'Dog (कुत्ता)', emoji: '🐶', category: 'animals' },
      { id: 'bird', name: 'Bird (चिड़िया)', emoji: '🐦', category: 'animals' },
    ],
  },
  household: {
    id: 'household',
    name: 'Household (घर का सामान)',
    items: [
      { id: 'cup', name: 'Tea Cup (चाय का कप)', emoji: '🍵', category: 'household' },
      { id: 'clock', name: 'Clock (घड़ी)', emoji: '⏰', category: 'household' },
      { id: 'spoon', name: 'Spoon (चम्मच)', emoji: '🥄', category: 'household' },
      { id: 'key', name: 'Key (चाबी)', emoji: '🔑', category: 'household' },
    ],
  },
};

export default function SortItOutGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [activeCategories, setActiveCategories] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [hintsCount, setHintsCount] = useState(0);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [hintShown, setHintShown] = useState(false);

  const initGame = (lvl = level) => {
    cancelSpeech();
    let catKeys = ['fruits', 'vegetables'];
    if (lvl === 'medium') catKeys = ['fruits', 'vegetables', 'animals'];
    if (lvl === 'hard') catKeys = ['fruits', 'vegetables', 'animals', 'household'];

    const chosenCats = catKeys.map((k) => CATEGORIES_DATA[k]);
    setActiveCategories(chosenCats);

    const items = [];
    chosenCats.forEach((cat) => {
      // Pick 2 items per category
      const shuffledItems = [...cat.items].sort(() => Math.random() - 0.5).slice(0, 2);
      items.push(...shuffledItems);
    });

    const randomizedQueue = items.sort(() => Math.random() - 0.5);
    setQueue(randomizedQueue);
    setCurrentIndex(0);
    setCorrectCount(0);
    setErrorsCount(0);
    setHintsCount(0);
    setLastFeedback(null);
    setGameOver(false);
    setHintShown(false);
    setStartTime(Date.now());

    if (randomizedQueue[0]) {
      const isHi = i18n.language?.startsWith('hi');
      speak(
        isHi
          ? `यह क्या है? ${randomizedQueue[0].name}. इसे सही समूह में रखें।`
          : `Sort this item: ${randomizedQueue[0].name}. Which group does it belong to?`,
        { lang: isHi ? 'hi' : 'en', speed: 0.65 }
      );
    }
  };

  useEffect(() => {
    initGame(level);
    return () => cancelSpeech();
  }, [level]);

  const currentItem = queue[currentIndex];

  const handleSelectCategory = async (catId) => {
    if (!currentItem || lastFeedback) return;

    const isMatch = currentItem.category === catId;
    const isHi = i18n.language?.startsWith('hi');

    if (isMatch) {
      setCorrectCount((c) => c + 1);
      setLastFeedback({ type: 'correct', message: isHi ? 'शाबाश! बिल्कुल सही!' : 'Great job! Correct!' });
      speak(isHi ? 'शाबाश! बिल्कुल सही!' : 'Great job! Correct!', { lang: isHi ? 'hi' : 'en', speed: 0.7 });
    } else {
      setErrorsCount((e) => e + 1);
      const correctCat = CATEGORIES_DATA[currentItem.category]?.name || '';
      setLastFeedback({
        type: 'incorrect',
        message: isHi ? `यह ${correctCat} में आता है। कोई बात नहीं!` : `Belongs to ${correctCat}. Keep going!`,
      });
      speak(
        isHi
          ? `यह ${correctCat} में आता है।`
          : `This belongs to ${correctCat}.`,
        { lang: isHi ? 'hi' : 'en', speed: 0.65 }
      );
    }

    setTimeout(async () => {
      setLastFeedback(null);
      setHintShown(false);
      const nextIdx = currentIndex + 1;
      if (nextIdx < queue.length) {
        setCurrentIndex(nextIdx);
        const nextItem = queue[nextIdx];
        speak(
          isHi
            ? `अगला: ${nextItem.name}`
            : `Next: ${nextItem.name}`,
          { lang: isHi ? 'hi' : 'en', speed: 0.65 }
        );
      } else {
        // Finish game
        setGameOver(true);
        confetti({ particleCount: 70, spread: 60 });
        const finalAcc = Math.round(((correctCount + (isMatch ? 1 : 0)) / queue.length) * 100);
        const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

        try {
          await fetch('/api/games/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              clientSessionId: `sort-${Date.now()}`,
              gameType: 'sort_it_out',
              level,
              step: level === 'hard' ? 'H1' : level === 'medium' ? 'M1' : 'E1',
              score: finalAcc,
              accuracy: finalAcc,
              hintsCount,
              errorsCount: errorsCount + (isMatch ? 0 : 1),
              durationSeconds: duration,
              totalQuestions: queue.length,
              correctAnswers: correctCount + (isMatch ? 1 : 0),
              incorrectAnswers: errorsCount + (isMatch ? 0 : 1),
              completionStatus: 'completed',
            }),
          });
        } catch (e) {
          console.warn('Failed to save session:', e);
        }
      }
    }, 1400);
  };

  const handleShowHint = () => {
    if (!currentItem || hintShown) return;
    setHintShown(true);
    setHintsCount((h) => h + 1);
    const catName = CATEGORIES_DATA[currentItem.category]?.name;
    const isHi = i18n.language?.startsWith('hi');
    speak(
      isHi ? `संकेत: यह ${catName} समूह से संबंधित है।` : `Hint: This belongs to ${catName}.`,
      { lang: isHi ? 'hi' : 'en', speed: 0.65 }
    );
  };

  if (gameOver) {
    const accuracy = Math.round((correctCount / queue.length) * 100);
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Sorting Complete! (वर्गीकरण पूरा!)</h2>
        <p className="text-slate-500 text-sm mb-6">
          Categorizing familiar items keeps everyday semantic cognition sharp and organized.
        </p>
        <div className="text-4xl font-black text-indigo-600 mb-2">{accuracy}%</div>
        <p className="text-xs text-slate-400 mb-6 font-semibold">
          {correctCount} / {queue.length} items correctly categorized
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => initGame(level)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-md"
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
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl">
          {['easy', 'medium', 'hard'].map((lvl) => (
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

      {/* Progress & Item Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6 text-center">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-4">
          <span>Sort It Out (वर्गीकरण)</span>
          <span>
            Item {currentIndex + 1} of {queue.length}
          </span>
        </div>

        {currentItem && (
          <div className="py-4">
            <div className="text-7xl mb-3 animate-bounce">{currentItem.emoji}</div>
            <h3 className="text-2xl font-black text-slate-800 mb-1">{currentItem.name}</h3>
            <p className="text-xs text-slate-500">Tap the category box below where this item belongs:</p>
          </div>
        )}

        {/* Feedback Alert */}
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

      {/* Categories Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {activeCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleSelectCategory(cat.id)}
            disabled={Boolean(lastFeedback)}
            className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-3xl text-center font-black text-indigo-950 transition-transform active:scale-95 shadow-sm flex flex-col items-center justify-center min-h-[100px]"
          >
            <span className="text-base">{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Hint and Voice repeat */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={handleShowHint}
          disabled={hintShown}
          className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-amber-500" /> {hintShown ? 'Hint Shown' : 'Gentle Hint'}
        </button>
        <button
          onClick={() => {
            if (currentItem) {
              const isHi = i18n.language?.startsWith('hi');
              speak(
                isHi
                  ? `यह है ${currentItem.name}. यह किस समूह में आएगा?`
                  : `This is ${currentItem.name}. Which group does it belong to?`,
                { lang: isHi ? 'hi' : 'en', speed: 0.65 }
              );
            }
          }}
          className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-sm"
        >
          <Volume2 className="w-4 h-4 text-slate-500" /> Hear Again
        </button>
      </div>
    </div>
  );
}

