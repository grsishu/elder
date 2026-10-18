import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Music, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const PADS = [
  { id: 0, color: 'bg-rose-500 active:bg-rose-600', activeRing: 'ring-rose-300', freq: 261.63, label: 'Sa (सा)' },
  { id: 1, color: 'bg-blue-500 active:bg-blue-600', activeRing: 'ring-blue-300', freq: 329.63, label: 'Ga (ग)' },
  { id: 2, color: 'bg-emerald-500 active:bg-emerald-600', activeRing: 'ring-emerald-300', freq: 392.0, label: 'Pa (प)' },
  { id: 3, color: 'bg-amber-500 active:bg-amber-600', activeRing: 'ring-amber-300', freq: 523.25, label: 'Dha (ध)' },
];

export default function PatternGame() {
  const navigate = useNavigate();
  const [sequence, setSequence] = useState([]);
  const [playerInput, setPlayerInput] = useState([]);
  const [activePad, setActivePad] = useState(null);
  const [isPlayingSeq, setIsPlayingSeq] = useState(false);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Web Audio Context
  const playTone = (freq) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
  };

  const playSequence = (seq) => {
    setIsPlayingSeq(true);
    seq.forEach((padId, index) => {
      setTimeout(() => {
        setActivePad(padId);
        playTone(PADS[padId].freq);
        setTimeout(() => setActivePad(null), 400);
        if (index === seq.length - 1) {
          setTimeout(() => setIsPlayingSeq(false), 500);
        }
      }, (index + 1) * 700);
    });
  };

  const startNewRound = (currentRound) => {
    const newSeq = Array.from({ length: currentRound + 2 }, () => Math.floor(Math.random() * 4));
    setSequence(newSeq);
    setPlayerInput([]);
    playSequence(newSeq);
  };

  useEffect(() => {
    speak('Listen to the gentle melody and repeat the sequence.', { lang: 'en', rate: 0.8 });
    setTimeout(() => startNewRound(1), 1500);
  }, []);

  const handlePadClick = (id) => {
    if (isPlayingSeq) return;

    playTone(PADS[id].freq);
    setActivePad(id);
    setTimeout(() => setActivePad(null), 250);

    const nextInput = [...playerInput, id];
    setPlayerInput(nextInput);

    // Verify
    const curIdx = nextInput.length - 1;
    if (sequence[curIdx] !== id) {
      // Mistake
      speak('A good try! Let us listen again.', { lang: 'en', rate: 0.8 });
      setTimeout(() => playSequence(sequence), 1000);
      setPlayerInput([]);
      return;
    }

    if (nextInput.length === sequence.length) {
      // Round cleared!
      setScore((s) => s + 25);
      if (round < 3) {
        setRound((r) => r + 1);
        speak('Well done!', { lang: 'en', rate: 0.8 });
        setTimeout(() => startNewRound(round + 1), 1200);
      } else {
        finishGame();
      }
    }
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });
    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `pattern-${Date.now()}`,
          gameType: 'pattern_game',
          level: 'easy',
          step: 'E1',
          score: 100,
          accuracy: 90,
          durationSeconds: 45,
        }),
      });
    } catch (e) {}
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Beautiful Harmony!</h2>
        <p className="text-slate-500 text-sm mb-6">Music stimulates neurological synchronization and calm attention.</p>
        <button onClick={() => navigate('/games')} className="w-full bg-blue-600 text-white font-bold py-3 rounded-2xl shadow-md">
          Back to Games Hub
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/games')} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-sm font-bold text-slate-500">Round {round} of 3</span>
        <span className="text-xs font-black bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
          Score: {score}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center">
        <h3 className="text-xl font-black text-slate-800 mb-1">
          {isPlayingSeq ? 'Listening...' : 'Your Turn (आपकी बारी)'}
        </h3>
        <p className="text-xs text-slate-400 mb-8">
          {isPlayingSeq ? 'Observe the glowing pads' : 'Tap the pads in the same sequence'}
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
          {PADS.map((pad) => (
            <button
              key={pad.id}
              disabled={isPlayingSeq}
              onClick={() => handlePadClick(pad.id)}
              className={`h-32 rounded-3xl transition-all transform duration-150 flex items-center justify-center text-white font-black text-lg shadow-md ${
                pad.color
              } ${activePad === pad.id ? `ring-8 ${pad.activeRing} scale-95 brightness-125` : ''}`}
            >
              {pad.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
