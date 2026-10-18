import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Grid } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const NE_ITEMS = [
  { id: 'rhino', name: 'Rhino (एक सींग वाला गेंडा)', emoji: '🦏' },
  { id: 'tea', name: 'Assam Tea (असम की चाय)', emoji: '🍵' },
  { id: 'gamusa', name: 'Gamusa (गमोसा)', emoji: '🧣' },
  { id: 'muga', name: 'Muga Silk (मूंगा रेशम)', emoji: '✨' },
  { id: 'hornbill', name: 'Hornbill (धनेश पक्षी)', emoji: '🦜' },
  { id: 'dhol', name: 'Bihu Dhol (ढोल)', emoji: '🥁' },
  { id: 'jaapi', name: 'Jaapi Hat (जापी)', emoji: '👒' },
  { id: 'bamboo', name: 'Bamboo (बांस शिल्प)', emoji: '🎋' },
];

export default function PictureMatchingGame() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);
  const [startTime] = useState(Date.now());
  const [gameOver, setGameOver] = useState(false);

  // Setup 6 pairs (12 cards)
  useEffect(() => {
    const selected = NE_ITEMS.slice(0, 4); // 4 pairs
    const deck = [...selected, ...selected]
      .map((item, idx) => ({ ...item, uniqueId: idx }))
      .sort(() => Math.random() - 0.5);

    setCards(deck);
    // Show preview for 2 seconds
    setFlipped(deck.map((_, i) => i));
    setTimeout(() => {
      setFlipped([]);
      speak('Match the traditional items of the North East.', { lang: 'en', rate: 0.8 });
    }, 2200);
  }, []);

  const handleCardClick = (idx) => {
    if (flipped.includes(idx) || matched.includes(cards[idx].id) || flipped.length >= 2) return;

    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [first, second] = newFlipped;
      if (cards[first].id === cards[second].id) {
        // Match!
        const newMatched = [...matched, cards[first].id];
        setMatched(newMatched);
        setFlipped([]);
        speak(`Matched ${cards[first].name}!`, { lang: 'en', rate: 0.8 });

        if (newMatched.length === 4) {
          setTimeout(finishGame, 800);
        }
      } else {
        setTimeout(() => setFlipped([]), 1200);
      }
    }
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });
    const duration = Math.round((Date.now() - startTime) / 1000);
    const accuracy = Math.max(30, Math.round((4 / Math.max(4, moves)) * 100));

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `cards-${Date.now()}`,
          gameType: 'picture_matching',
          level: 'easy',
          step: 'E1',
          score: 100,
          accuracy,
          durationSeconds: duration,
        }),
      });
    } catch (e) {}
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Splendid Matching!</h2>
        <p className="text-slate-500 text-sm mb-6">Completed in {moves} gentle moves.</p>
        <button
          onClick={() => navigate('/games')}
          className="w-full bg-emerald-600 text-white font-bold py-3 rounded-2xl shadow-md"
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
        <span className="text-sm font-bold text-slate-500">Pairs Matched: {matched.length} / 4</span>
        <span className="text-xs font-black bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
          Moves: {moves}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        {cards.map((c, i) => {
          const isRevealed = flipped.includes(i) || matched.includes(c.id);
          return (
            <button
              key={i}
              onClick={() => handleCardClick(i)}
              className={`h-24 rounded-2xl flex flex-col items-center justify-center text-3xl font-bold transition-all transform duration-300 ${
                isRevealed
                  ? 'bg-emerald-50 border-2 border-emerald-400 shadow-sm rotate-0'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-700 rotate-1'
              }`}
            >
              {isRevealed ? (
                <>
                  <span>{c.emoji}</span>
                  <span className="text-[9px] font-bold text-emerald-800 mt-1 line-clamp-1">{c.id}</span>
                </>
              ) : (
                <Grid className="w-6 h-6 text-indigo-300" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
