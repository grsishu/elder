import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Volume2,
  Trophy,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Play,
  Shuffle,
  Star,
  Award,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

const BINGO_DIFFICULTIES = {
  easy: {
    size: 3,
    maxNumber: 15,
    title: 'Easy (3x3)',
    desc: '3 in a line to win • Simple numbers & icons',
    freeCenter: false,
  },
  medium: {
    size: 4,
    maxNumber: 30,
    title: 'Medium (4x4)',
    desc: '4 in a line or 4 corners to win',
    freeCenter: false,
  },
  hard: {
    size: 5,
    maxNumber: 75,
    title: 'Hard (5x5)',
    desc: 'Classic 5x5 B-I-N-G-O with Free Center',
    freeCenter: true,
  },
};

const ICONS = ['🪷', '🌸', '🛕', '🐘', '☀️', '☕', '🔔', '🕯️', '🏠', '🌿', '💧', '🍃', '🕊️', '🌺', '🍎'];

export default function BingoGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [difficulty, setDifficulty] = useState('easy');
  const [board, setBoard] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [lastCalled, setLastCalled] = useState(null);
  const [markedIndices, setMarkedIndices] = useState(new Set());
  const [wonPatterns, setWonPatterns] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const config = BINGO_DIFFICULTIES[difficulty];

  // Initialize fresh board and pool
  const initGame = (lvl = difficulty) => {
    cancelSpeech();
    const conf = BINGO_DIFFICULTIES[lvl];
    const { size, maxNumber, freeCenter } = conf;
    const totalCells = size * size;

    // Generate unique random numbers for the board
    const numbersPool = Array.from({ length: maxNumber }, (_, i) => i + 1);
    const shuffled = [...numbersPool].sort(() => Math.random() - 0.5).slice(0, totalCells);

    const newBoard = shuffled.map((num, idx) => ({
      id: idx,
      number: num,
      icon: ICONS[num % ICONS.length],
      isFree: freeCenter && idx === Math.floor(totalCells / 2),
    }));

    setBoard(newBoard);

    // Initial marked set (free center is auto-marked)
    const initialMarked = new Set();
    if (freeCenter) {
      initialMarked.add(Math.floor(totalCells / 2));
    }
    setMarkedIndices(initialMarked);

    setCalledNumbers([]);
    setLastCalled(null);
    setWonPatterns([]);
    setGameOver(false);
    setScore(0);

    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const welcomeVoice = isHi
      ? `बिंगो खेल में आपका स्वागत है! 'नंबर निकालें' बटन दबाएं और बोर्ड पर नंबर को छूकर मार्क करें।`
      : isTa
      ? `பிங்கோ விளையாட்டிற்கு வரவேற்கிறோம்! அடுத்த எண்ணை அழைக்க பொத்தானை அழுத்தவும்.`
      : `Welcome to Bingo! Press Call Next Number and tap matching tiles on your card.`;

    speak(welcomeVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
  };

  useEffect(() => {
    initGame(difficulty);
    return () => cancelSpeech();
  }, [difficulty]);

  // Call next random number from uncalled numbers
  const callNextNumber = () => {
    if (gameOver) return;

    const uncalled = Array.from({ length: config.maxNumber }, (_, i) => i + 1).filter(
      (n) => !calledNumbers.includes(n)
    );

    if (uncalled.length === 0) {
      speak('All numbers have been called!', { lang: 'en', rate: 0.8 });
      return;
    }

    const next = uncalled[Math.floor(Math.random() * uncalled.length)];
    const newCalled = [next, ...calledNumbers];
    setCalledNumbers(newCalled);
    setLastCalled(next);

    // Voice announcement
    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const callVoice = isHi
      ? `नंबर ${next}!`
      : isTa
      ? `எண் ${next}!`
      : `Number ${next}!`;

    cancelSpeech();
    speak(callVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
  };

  // Tap a cell on the card
  const handleCellClick = (index) => {
    if (gameOver) return;
    const cell = board[index];
    if (cell.isFree) return; // already marked

    // Check if cell number was actually called
    if (!calledNumbers.includes(cell.number)) {
      const isHi = i18n.language.startsWith('hi');
      const msg = isHi
        ? `नंबर ${cell.number} अभी तक नहीं निकला है। कृपया कॉलर की आवाज़ सुनें!`
        : `Number ${cell.number} has not been called yet. Listen for the caller!`;

      speak(msg, { lang: isHi ? 'hi' : 'en', rate: 0.8 });
      return;
    }

    // Toggle mark
    const updated = new Set(markedIndices);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setMarkedIndices(updated);

    // Check for winning lines / patterns
    checkWinningPatterns(updated);
  };

  // Check rows, columns, diagonals, 4 corners
  const checkWinningPatterns = (markedSet) => {
    const size = config.size;
    const patterns = [];

    // Check Rows
    for (let r = 0; r < size; r++) {
      let rowComplete = true;
      for (let c = 0; c < size; c++) {
        if (!markedSet.has(r * size + c)) {
          rowComplete = false;
          break;
        }
      }
      if (rowComplete) patterns.push(`Row ${r + 1}`);
    }

    // Check Columns
    for (let c = 0; c < size; c++) {
      let colComplete = true;
      for (let r = 0; r < size; r++) {
        if (!markedSet.has(r * size + c)) {
          colComplete = false;
          break;
        }
      }
      if (colComplete) patterns.push(`Column ${c + 1}`);
    }

    // Check Main Diagonal
    let diag1Complete = true;
    for (let i = 0; i < size; i++) {
      if (!markedSet.has(i * size + i)) {
        diag1Complete = false;
        break;
      }
    }
    if (diag1Complete) patterns.push('Main Diagonal');

    // Check Anti-Diagonal
    let diag2Complete = true;
    for (let i = 0; i < size; i++) {
      if (!markedSet.has(i * size + (size - 1 - i))) {
        diag2Complete = false;
        break;
      }
    }
    if (diag2Complete) patterns.push('Anti Diagonal');

    // Check 4 Corners
    if (
      markedSet.has(0) &&
      markedSet.has(size - 1) &&
      markedSet.has(size * (size - 1)) &&
      markedSet.has(size * size - 1)
    ) {
      patterns.push('4 Corners');
    }

    if (patterns.length > wonPatterns.length) {
      setWonPatterns(patterns);
      setGameOver(true);
      setScore(patterns.length * 30);
      confetti({ particleCount: 90, spread: 70 });

      const isHi = i18n.language.startsWith('hi');
      const isTa = i18n.language.startsWith('ta');
      const winVoice = isHi
        ? `बिंगो! बधाई हो, आपने पैटर्न पूरा कर लिया!`
        : isTa
        ? `பிங்கோ! வாழ்த்துகள், வரிசை முடிந்தது!`
        : `Bingo! Congratulations, you completed a line!`;

      speak(winVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });

      // Save game session
      fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `bingo-${Date.now()}`,
          gameType: 'bingo',
          level: difficulty,
          step: difficulty === 'easy' ? 'E1' : difficulty === 'medium' ? 'M1' : 'H1',
          score: patterns.length * 30,
          accuracy: 100,
          durationSeconds: 60,
        }),
      }).catch(() => {});
    }
  };

  const size = config.size;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              {t('games.bingo_title', 'Bingo Game (बिंगो)')}
            </h1>
            <p className="text-xs text-slate-500">{config.desc}</p>
          </div>
        </div>

        {/* Difficulty Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {Object.entries(BINGO_DIFFICULTIES).map(([lvl, conf]) => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${
                difficulty === lvl
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lvl} ({conf.size}x{conf.size})
            </button>
          ))}
        </div>
      </div>

      {/* Caller Section */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl p-5 text-white shadow-md mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shadow-inner">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Current</span>
            <span className="text-3xl font-black text-amber-300">
              {lastCalled !== null ? lastCalled : '--'}
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider block">Caller Announcer</span>
            <h3 className="text-base font-black">
              {lastCalled !== null ? `Number ${lastCalled} Called!` : 'Press button to call first number'}
            </h3>
            <p className="text-xs text-indigo-100 mt-0.5">
              {calledNumbers.length} numbers called so far
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={callNextNumber}
            disabled={gameOver}
            className="flex-1 sm:flex-none bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-5 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-xs transition-transform active:scale-95 disabled:opacity-50"
          >
            <Volume2 className="w-4 h-4" />
            <span>Call Next Number</span>
          </button>
          <button
            onClick={() => initGame(difficulty)}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/20 text-white"
            title="Restart Card"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Recent Called Numbers Strip */}
      {calledNumbers.length > 0 && (
        <div className="mb-5 bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-400 whitespace-nowrap pl-1">History:</span>
          {calledNumbers.slice(0, 12).map((num, i) => (
            <span
              key={i}
              className={`px-2.5 py-1 rounded-xl text-xs font-black flex-shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {num}
            </span>
          ))}
        </div>
      )}

      {/* Bingo Board */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        <div
          className="grid gap-2 sm:gap-3 max-w-md mx-auto aspect-square"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          }}
        >
          {board.map((cell, idx) => {
            const isMarked = markedIndices.has(idx);
            const isCalled = calledNumbers.includes(cell.number);

            let cellClass =
              'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800';
            if (isMarked) {
              cellClass =
                'bg-emerald-500 text-white border-emerald-500 shadow-md ring-4 ring-emerald-100';
            } else if (isCalled) {
              cellClass =
                'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 animate-pulse font-black';
            }

            return (
              <button
                key={cell.id}
                onClick={() => handleCellClick(idx)}
                className={`relative rounded-2xl border-2 flex flex-col items-center justify-center p-2 font-black transition-all select-none active:scale-95 ${cellClass}`}
              >
                {cell.isFree ? (
                  <>
                    <Star className="w-6 h-6 text-amber-300 fill-amber-300" />
                    <span className="text-[10px] uppercase font-bold tracking-wider mt-1">FREE</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl sm:text-2xl leading-none">{cell.number}</span>
                    <span className="text-xs opacity-70 mt-1">{cell.icon}</span>
                  </>
                )}

                {isMarked && !cell.isFree && (
                  <CheckCircle2 className="w-4 h-4 text-white absolute top-1 right-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Win Modal / Completed Pattern */}
      {gameOver && (
        <div className="mt-6 p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center space-y-4 shadow-lg animate-fade-in">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-black text-slate-800">BINGO! You Won!</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            You completed <strong>{wonPatterns.join(' & ')}</strong>! Your score:{' '}
            <strong className="text-emerald-700 text-sm font-black">{score} pts</strong>
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => initGame(difficulty)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-md"
            >
              Play Again
            </button>
            <button
              onClick={() => navigate('/games')}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold py-3 px-6 rounded-2xl text-xs"
            >
              Back to Games Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

