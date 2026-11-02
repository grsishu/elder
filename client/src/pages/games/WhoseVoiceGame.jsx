import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Volume2, Play, Pause, CheckCircle2, XCircle, Trophy, Mic, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

export default function WhoseVoiceGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [options, setOptions] = useState([]);

  // Session metrics
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [gameOver, setGameOver] = useState(false);

  const audioRef = useRef(null);

  // Fetch family members with voice recordings
  useEffect(() => {
    fetch('/api/family/members', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.members && d.members.length > 0) {
          setFamily(d.members);
        } else {
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

    return () => {
      cancelSpeech();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const membersWithVoice = family.filter((m) => m.hasVoice || m.has_voice || m.voiceUrl);
  const currentSpeaker = membersWithVoice[currentQuestionIndex] || membersWithVoice[0];

  // Prepare multiple choice options for current question
  useEffect(() => {
    if (!currentSpeaker || membersWithVoice.length === 0) return;

    // Distractors from full family
    const distractors = family
      .filter((m) => m.id !== currentSpeaker.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const allOptions = [currentSpeaker, ...distractors].sort(() => Math.random() - 0.5);
    setOptions(allOptions);
    setSelectedId(null);
    setIsCorrect(null);
    setIsPlaying(false);

    // Auto-play speaker's voice safely
    const audioUrl = currentSpeaker.voiceUrl || `/api/family/members/${currentSpeaker.id}/voice`;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [currentQuestionIndex, membersWithVoice.length, currentSpeaker?.id]);

  const togglePlayAudio = () => {
    if (!audioRef.current || !currentSpeaker) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSelect = (member) => {
    if (selectedId || !currentSpeaker) return;
    setSelectedId(member.id);

    const correct = member.id === currentSpeaker.id;
    setIsCorrect(correct);

    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const currentRel = t(`relationships.${currentSpeaker.relationship?.toLowerCase()}`, currentSpeaker.relationship);

    if (correct) {
      setScore((s) => s + 25);
      setCorrectCount((c) => c + 1);
      confetti({ particleCount: 60, spread: 60 });

      const praise = isHi
        ? `बिल्कुल सही! यह आपके प्यारे ${currentRel}, ${currentSpeaker.name} की आवाज़ है।`
        : isTa
        ? `சரியான பதில்! இது உங்கள் ${currentRel}, ${currentSpeaker.name} குரல்.`
        : `Yes! That was your loving ${currentRel}, ${currentSpeaker.name}'s voice.`;

      speak(praise, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
    } else {
      const hint = isHi
        ? `यह आवाज़ बहुत मिलती-जुलती थी, लेकिन यह ${currentSpeaker.name} की आवाज़ थी।`
        : isTa
        ? `இது ${currentSpeaker.name} குரல்.`
        : `That sounded close, but it was ${currentSpeaker.name}'s voice.`;

      speak(hint, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex + 1 < Math.min(4, membersWithVoice.length)) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      finishGame();
    }
  };

  const finishGame = async () => {
    setGameOver(true);
    confetti({ particleCount: 80, spread: 70 });
    const duration = Math.round((Date.now() - startTime) / 1000);
    const totalQuestions = Math.min(4, membersWithVoice.length);
    const finalAccuracy = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientSessionId: `voice-${Date.now()}`,
          gameType: 'whose_voice',
          level: 'easy',
          step: 'E1',
          score,
          accuracy: finalAccuracy,
          durationSeconds: duration,
        }),
      });
    } catch (e) {
      console.warn('Could not save session:', e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-700">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-3" />
        Loading Family Voice Recordings...
      </div>
    );
  }

  // Graceful state: When no family voice recordings have been saved yet
  if (membersWithVoice.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-3xl mx-auto flex items-center justify-center">
            <Mic className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black text-slate-800">No Family Voice Notes Found</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            This memory game plays the real recorded voices of your family members to stimulate auditory recognition.
            Please record your loved ones' voices in the setup wizard or family portal.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/wizard"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Record Voice in Setup
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

  // Game over state
  if (gameOver) {
    const totalQuestions = Math.min(4, membersWithVoice.length);
    const finalAccuracy = Math.round((correctCount / Math.max(1, totalQuestions)) * 100);

    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-lg space-y-5">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
          <div>
            <h2 className="text-2xl font-black text-slate-800">Practice Complete!</h2>
            <p className="text-slate-500 text-xs mt-1">
              Recognizing familiar loved voices brings deep emotional calm and exercises auditory memory.
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

  return (
    <div className="max-w-lg mx-auto px-4 py-6 md:py-8">
      {/* Audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* Top Bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/games')}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-xs font-bold text-slate-500">
          Voice {currentQuestionIndex + 1} of {Math.min(4, membersWithVoice.length)}
        </span>
        <span className="text-xs font-black bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
          Score: {score}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
        {/* Play / Replay Voice Button */}
        <div className="py-4">
          <button
            onClick={togglePlayAudio}
            className={`w-28 h-28 mx-auto rounded-3xl flex flex-col items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${
              isPlaying
                ? 'bg-purple-600 text-white ring-8 ring-purple-100 animate-pulse'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-2 border-purple-200'
            }`}
          >
            {isPlaying ? <Pause className="w-10 h-10" /> : <Play className="w-10 h-10 ml-1" />}
            <span className="text-[11px] font-black uppercase tracking-wider">
              {isPlaying ? 'Playing...' : 'Replay Voice'}
            </span>
          </button>
        </div>

        <h3 className="text-lg md:text-xl font-black text-slate-800 mt-2 mb-1">
          Whose voice is this?
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          यह किसकी आवाज़ है? • இது யாருடைய குரல்?
        </p>

        {/* Family Member Choice Cards (with Real Photo, Name, and Localized Relationship) */}
        <div className="space-y-3">
          {options.map((member) => {
            const isSelected = selectedId === member.id;
            const isTargetCorrect = member.id === currentSpeaker?.id;
            const relText = t(`relationships.${member.relationship?.toLowerCase()}`, member.relationship);

            let cardStyle = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800';
            if (selectedId) {
              if (isSelected) {
                cardStyle = isCorrect
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                  : 'bg-rose-500 text-white border-rose-500 shadow-md';
              } else if (isTargetCorrect) {
                cardStyle = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
              }
            }

            return (
              <button
                key={member.id}
                disabled={Boolean(selectedId)}
                onClick={() => handleSelect(member)}
                className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${cardStyle} active:scale-98`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-300">
                    {member.hasPhoto || member.has_photo || member.photoUrl ? (
                      <img
                        src={member.photoUrl || `/api/family/members/${member.id}/photo`}
                        alt={member.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-slate-500">
                        {member.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm leading-snug">{member.name}</h4>
                    <span className={`text-xs ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                      {relText}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  isCorrect ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" /> : <XCircle className="w-6 h-6 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Next Question Button after answering */}
        {selectedId && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={handleNextQuestion}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95"
            >
              <span>Next Question</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
