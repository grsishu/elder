import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Trophy, Plus, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak } from '../../utils/voice';

const SAMPLE_FRUITS = ['Apple (सेब)', 'Banana (केला)', 'Mango (आम)', 'Orange (संतरा)', 'Papaya (पपीता)', 'Guava (अमरूद)', 'Pineapple (अनानास)', 'Grapes (अंगूर)'];

export default function VoiceFluencyGame() {
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [typedWord, setTypedWord] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isGameActive, setIsGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  // Speech Recognition setup
  useEffect(() => {
    let recognition = null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && isListening && isGameActive) {
      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'hi-IN';

        recognition.onresult = (event) => {
          const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
          if (transcript && !words.includes(transcript)) {
            setWords((prev) => [...prev, transcript]);
          }
        };

        recognition.onerror = () => setIsListening(false);
        recognition.start();
      } catch (e) {
        setIsListening(false);
      }
    }

    return () => {
      if (recognition) recognition.stop();
    };
  }, [isListening, isGameActive]);

  // Countdown timer
  useEffect(() => {
    let timer = null;
    if (isGameActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (isGameActive && timeLeft === 0) {
      finishGame();
    }
    return () => clearInterval(timer);
  }, [isGameActive, timeLeft]);

  const startGame = () => {
    setIsGameActive(true);
    setIsListening(true);
    speak('Name as many fruits and vegetables as you remember. Tap or speak naturally.', { lang: 'en', rate: 0.8 });
  };

  const addWord = (w) => {
    const clean = w.trim();
    if (clean && !words.includes(clean)) {
      setWords((prev) => [...prev, clean]);
      setTypedWord('');
    }
  };

  const finishGame = async () => {
    setIsGameActive(false);
    setIsListening(false);
    setGameOver(true);
    confetti({ particleCount: 70, spread: 60 });

    const count = words.length;
    speak(`Fabulous! You named ${count} unique items.`, { lang: 'en', rate: 0.8 });

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `fluency-${Date.now()}`,
          gameType: 'voice_fluency',
          level: 'easy',
          step: 'E1',
          score: count * 10,
          accuracy: Math.min(100, count * 15),
          durationSeconds: 60 - timeLeft,
        }),
      });
    } catch (e) {}
  };

  if (gameOver) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Trophy className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Fluency Practice Complete!</h2>
        <p className="text-slate-500 text-sm mb-6">Semantic verbal fluency exercises stimulate frontal lobe activation.</p>
        <div className="text-4xl font-black text-rose-600 mb-6">{words.length} Words Named</div>
        <button onClick={() => navigate('/games')} className="w-full bg-rose-600 text-white font-bold py-3 rounded-2xl shadow-md">
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
        <span className="text-sm font-bold text-slate-500">Category: Fruits & Vegetables (फल और सब्ज़ियां)</span>
        <span className="text-sm font-black bg-rose-50 text-rose-700 px-3 py-1 rounded-full">
          ⏱ {timeLeft}s
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
        {!isGameActive ? (
          <div className="py-8 space-y-4">
            <h3 className="text-xl font-black text-slate-800">Ready to name fruits & vegetables?</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You will have 60 seconds to speak or tap all the fruits and vegetables that come to mind.
            </p>
            <button
              onClick={startGame}
              className="bg-rose-600 hover:bg-rose-700 text-white font-black px-8 py-3.5 rounded-2xl shadow-lg text-base"
            >
              Start 60s Practice
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setIsListening(!isListening)}
                className={`p-4 rounded-full shadow-md transition-all ${
                  isListening ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isListening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
              </button>
              <div className="text-left">
                <span className="text-xs font-bold text-slate-400 block">Listening State</span>
                <span className="text-sm font-black text-slate-800">{isListening ? 'Listening...' : 'Muted'}</span>
              </div>
            </div>

            {/* Quick Tap fallback chips */}
            <div>
              <span className="text-xs text-slate-400 block mb-2 font-bold">Quick Tap Suggestions</span>
              <div className="flex flex-wrap gap-2 justify-center">
                {SAMPLE_FRUITS.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => addWord(f)}
                    className="bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                  >
                    + {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Typed input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Or type a word..."
                value={typedWord}
                onChange={(e) => setTypedWord(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWord(typedWord)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-sm"
              />
              <button onClick={() => addWord(typedWord)} className="bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-bold">
                Add
              </button>
            </div>

            {/* Words list */}
            <div className="p-4 bg-slate-50 rounded-2xl min-h-[100px] text-left">
              <span className="text-xs font-bold text-slate-400 block mb-2">Words named ({words.length}):</span>
              <div className="flex flex-wrap gap-2">
                {words.map((w, idx) => (
                  <span key={idx} className="bg-white border border-slate-200 text-slate-800 font-bold text-xs px-3 py-1 rounded-lg shadow-2xs">
                    ✓ {w}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={finishGame}
              className="text-xs text-slate-400 hover:text-slate-600 underline font-semibold"
            >
              Finish Early
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
