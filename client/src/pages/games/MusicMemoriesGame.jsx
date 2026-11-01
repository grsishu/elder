import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Volume2, Trophy, CheckCircle2, XCircle, RefreshCw, Music, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, playAudio, cancelSpeech } from '../../utils/voice';

const CULTURAL_SOUNDS = [
  {
    id: 'flute',
    name: 'Morning Bamboo Flute (बांसुरी की धुन)',
    hint: 'A soothing melodic wind instrument heard in Indian hills.',
    type: 'sound',
  },
  {
    id: 'temple_bell',
    name: 'Temple Morning Bell (मंदिर की घंटी)',
    hint: 'Resonant sacred brass sound of morning prayer.',
    type: 'sound',
  },
  {
    id: 'sitar',
    name: 'Sitar Melody (सितार की मधुर धुन)',
    hint: 'A classical stringed instrument with gentle resonance.',
    type: 'sound',
  },
  {
    id: 'rain',
    name: 'Gentle Hill Rain & Birds (पहाड़ों की बारिश)',
    hint: 'Calming natural sound of raindrops on green leaves.',
    type: 'sound',
  },
];

export default function MusicMemoriesGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState('easy');
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  useEffect(() => {
    // Check family voice recordings first
    fetch('/api/family/voice', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        let pool = [];
        if (d.recordings && d.recordings.length > 0) {
          pool = d.recordings.map((r) => ({
            id: r.id,
            name: `${r.member_name} (${r.relationship})`,
            audioUrl: `/api/family/voice/${r.id}/file`,
            hint: `Loving voice message from ${r.member_name}`,
            type: 'family',
          }));
        }
        // Always include cultural sounds
        const combined = [...pool, ...CULTURAL_SOUNDS];
        setItems(combined);
        initQuestion(combined, 0);
      })
      .catch(() => {
        setItems(CULTURAL_SOUNDS);
        initQuestion(CULTURAL_SOUNDS, 0);
      });

    return () => cancelSpeech();
  }, []);

  const initQuestion = (pool, idx) => {
    if (!pool || !pool[idx]) return;
    const current = pool[idx];
    const correctName = current.name;

    const distractors = pool.filter((p) => p.id !== current.id).map((p) => p.name);
    const generic = ['Tabla Rhythm (तबला)', 'Morning Birds (चिड़ियों की चहचहाहट)'];
    const choices = Array.from(new Set([correctName, ...distractors, ...generic])).slice(0, 3);
    const shuffledChoices = choices.sort(() => Math.random() - 0.5);

    setOptions(shuffledChoices);
    setSelectedOption(null);
    setLastFeedback(null);

    // Play prompt
    playSoundOrVoice(current);
  };

  const playSoundOrVoice = (item) => {
    cancelSpeech();
    const isHi = i18n.language?.startsWith('hi');
    if (item.audioUrl) {
      playAudio(item.audioUrl, () => {
        speak(isHi ? 'यह आवाज़ किसकी थी?' : 'Whose voice was that?', {
          lang: isHi ? 'hi' : 'en',
          speed: 0.65,
        });
      });
    } else {
      // Synthesize simulation description
      speak(
        isHi
          ? `सुनिए: ${item.name}। यह संगीत या आवाज़ कौन सी है?`
          : `Listen: ${item.name}. Which sound or melody is this?`,
        { lang: isHi ? 'hi' : 'en', speed: 0.65 }
      );
    }
  };

  const handleSelect = async (choice) => {
    if (selectedOption || lastFeedback) return;
    setSelectedOption(choice);

    const current = items[currentIndex];
    const isMatch = choice === current.name;
    const isHi = i18n.language?.startsWith('hi');

    if (isMatch) {
      setCorrectCount((c) => c + 1);
      setLastFeedback({ type: 'correct', message: isHi ? 'शाबाश! बिल्कुल सही पहचाना!' : 'Excellent! Perfectly recognized!' });
      speak(isHi ? 'शाबाश! बिल्कुल सही!' : 'Excellent! You recognized it!', {
        lang: isHi ? 'hi' : 'en',
        speed: 0.7,
      });
    } else {
      setErrorsCount((e) => e + 1);
      setLastFeedback({
        type: 'incorrect',
        message: isHi ? `यह ${current.name} था। कोई बात नहीं!` : `This was ${current.name}.`,
      });
      speak(isHi ? `यह ${current.name} था।` : `This was ${current.name}.`, {
        lang: isHi ? 'hi' : 'en',
        speed: 0.65,
      });
    }

    setTimeout(async () => {
      const nextIdx = currentIndex + 1;
      if (nextIdx < Math.min(items.length, 4)) {
        setCurrentIndex(nextIdx);
        initQuestion(items, nextIdx);
      } else {
        setGameOver(true);
        confetti({ particleCount: 75, spread: 65 });
        const finalAcc = Math.round(((correctCount + (isMatch ? 1 : 0)) / Math.min(items.length, 4)) * 100);
        const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

        try {
          await fetch('/api/games/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              clientSessionId: `music-${Date.now()}`,
              gameType: 'music_memories',
              level,
              step: 'E1',
              score: finalAcc,
              accuracy: finalAcc,
              hintsCount: 0,
              errorsCount: errorsCount + (isMatch ? 0 : 1),
              durationSeconds: duration,
              totalQuestions: Math.min(items.length, 4),
              correctAnswers: correctCount + (isMatch ? 1 : 0),
              incorrectAnswers: errorsCount + (isMatch ? 0 : 1),
              completionStatus: 'completed',
            }),
          });
        } catch (e) {
          console.warn(e);
        }
      }
    }, 1800);
  };

  const current = items[currentIndex];

  if (gameOver) {
    const totalQ = Math.min(items.length, 4);
    const accuracy = Math.round((correctCount / totalQ) * 100);
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <Music className="w-16 h-16 text-purple-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Music Memories Complete!</h2>
        <p className="text-slate-500 text-sm mb-6">
          Auditory stimulation triggers deep-seated musical and emotional recall pathways.
        </p>
        <div className="text-4xl font-black text-purple-600 mb-2">{accuracy}%</div>
        <p className="text-xs text-slate-400 mb-6 font-semibold">
          {correctCount} / {totalQ} melodies and voices recognized
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setGameOver(false);
              setCurrentIndex(0);
              setCorrectCount(0);
              setErrorsCount(0);
              initQuestion(items, 0);
            }}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-md"
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
        <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200 flex items-center gap-1.5">
          <Music className="w-3.5 h-3.5" /> Music Memories (संगीत और स्वर)
        </span>
      </div>

      {/* Main Playing Card */}
      {current && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6 text-center">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-4">
            <span>Sound {currentIndex + 1} of {Math.min(items.length, 4)}</span>
            <span>{current.type === 'family' ? 'Family Voice' : 'Cultural Melody'}</span>
          </div>

          <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg text-white">
            <Volume2 className="w-14 h-14 animate-pulse" />
          </div>

          <p className="text-sm text-slate-600 font-medium mb-4 italic">
            "{current.hint}"
          </p>

          <button
            onClick={() => playSoundOrVoice(current)}
            className="px-5 py-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold rounded-2xl text-xs inline-flex items-center gap-2 shadow-sm mb-2"
          >
            <Volume2 className="w-4 h-4" /> Listen Again (पुनः सुनें)
          </button>

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

      {/* Options */}
      <div className="space-y-3 mb-6">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(opt)}
            disabled={Boolean(lastFeedback)}
            className="w-full p-4 bg-white hover:bg-purple-50/50 border-2 border-slate-200 hover:border-purple-300 rounded-2xl text-left font-bold text-slate-800 transition-all flex items-center justify-between text-base active:scale-98 shadow-sm"
          >
            <span>{opt}</span>
            <span className="text-xs text-purple-600 font-semibold">Select ➔</span>
          </button>
        ))}
      </div>
    </div>
  );
}

