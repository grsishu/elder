import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Volume2,
  Trophy,
  Camera,
  Plus,
  RefreshCw,
  Heart,
  Mic,
  MicOff,
  Sparkles,
  HelpCircle,
  Layers,
  Clock,
  VolumeX,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';
import { queueOfflineSession } from '../../utils/offlineSync';

// Cultural fallback distractors when elder has fewer family members uploaded
const CULTURAL_DISTRACTORS = [
  { name: 'Arun Kumar', relationship: 'Son' },
  { name: 'Ravi Sharma', relationship: 'Grandson' },
  { name: 'Suresh Patel', relationship: 'Brother' },
  { name: 'Kavita Devi', relationship: 'Daughter' },
  { name: 'Meera Rao', relationship: 'Daughter-in-law' },
  { name: 'Priya Iyer', relationship: 'Granddaughter' },
  { name: 'Ananya Verma', relationship: 'Granddaughter' },
  { name: 'Sunita Joshi', relationship: 'Sister' },
  { name: 'Vikram Singh', relationship: 'Son' },
  { name: 'Mohan Lal', relationship: 'Brother' },
];

const DIFFICULTY_CONFIG = {
  easy: { choicesCount: 2, label: 'Easy (2 Choices)' },
  medium: { choicesCount: 4, label: 'Medium (4 Choices)' },
  hard: { choicesCount: 6, label: 'Hard (6 Choices)' },
};

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function NameFaceGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState([]);
  const [difficulty, setDifficulty] = useState('easy'); // 'easy' (2) | 'medium' (4) | 'hard' (6)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [options, setOptions] = useState([]);

  // Voice playback of family audio
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);

  // Speech recognition (voice answering)
  const [isListening, setIsListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Metrics tracking
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [hintsCount, setHintsCount] = useState(0);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [responseTimes, setResponseTimes] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [adaptiveFeedback, setAdaptiveFeedback] = useState(null);

  // 1. Fetch family profiles
  useEffect(() => {
    Promise.all([
      fetch('/api/family/members', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/games/family-cards', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([mRes, cRes]) => {
        let membersList = [];
        if (mRes.success && Array.isArray(mRes.members) && mRes.members.length > 0) {
          membersList = mRes.members;
        } else if (cRes.success && Array.isArray(cRes.members) && cRes.members.length > 0) {
          membersList = cRes.members;
        }

        setFamily(membersList);
      })
      .catch((e) => console.warn('[NameFaceGame] Error loading family:', e))
      .finally(() => setLoading(false));

    return () => {
      cancelSpeech();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const membersWithPhotos = family.filter((m) => m.hasPhoto || m.has_photo || m.photoUrl);
  const totalQuestions = Math.min(6, Math.max(1, membersWithPhotos.length));
  const currentMember = membersWithPhotos[currentQuestionIndex] || membersWithPhotos[0];

  // 2. Prepare Multiple Choice Options (Scaling by Difficulty with Randomized Correct Position)
  useEffect(() => {
    if (!currentMember || membersWithPhotos.length === 0) return;

    const currentRel = t(
      `relationships.${currentMember.relationship?.toLowerCase()}`,
      currentMember.relationship || 'Loved One'
    );
    const correctLabel = `${currentMember.name} • ${currentRel}`;

    // Target count based on difficulty
    const targetCount = DIFFICULTY_CONFIG[difficulty]?.choicesCount || 2;
    const requiredDistractors = targetCount - 1;

    // Build distractor candidates from other family members
    const familyDistractors = family
      .filter((m) => m.name !== currentMember.name)
      .map((m) => {
        const rel = t(`relationships.${m.relationship?.toLowerCase()}`, m.relationship || 'Family');
        return `${m.name} • ${rel}`;
      });

    // Cultural fallback distractors if family is smaller than needed
    const fallbackDistractors = CULTURAL_DISTRACTORS.filter(
      (d) => !d.name.toLowerCase().includes(currentMember.name.toLowerCase())
    ).map((d) => {
      const rel = t(`relationships.${d.relationship.toLowerCase()}`, d.relationship);
      return `${d.name} • ${rel}`;
    });

    const combinedPool = [...shuffle(familyDistractors), ...shuffle(fallbackDistractors)];
    const chosenDistractors = combinedPool.slice(0, requiredDistractors);

    // Thorough Fisher-Yates shuffle so correct answer is NEVER always first!
    const allOptions = shuffle([correctLabel, ...chosenDistractors]);

    setOptions(allOptions);
    setSelectedOption(null);
    setIsCorrect(null);
    setQuestionStartTime(Date.now());
    setSpeechTranscript('');

    // Speak warm question prompt
    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const promptVoice = isHi
      ? `तस्वीर को ध्यान से देखें। यह कौन हैं?`
      : isTa
      ? `படத்தை கவனமாகப் பாருங்கள். இவர் யார்?`
      : `Look closely at this familiar photograph. Who is this?`;

    cancelSpeech();
    speak(promptVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
  }, [currentQuestionIndex, membersWithPhotos.length, currentMember?.name, difficulty, i18n.language, t]);

  // 3. Play person's recorded voice audio
  const handlePlayVoice = () => {
    if (!currentMember) return;

    if (currentMember.hasVoice || currentMember.has_voice || currentMember.voiceUrl) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setIsPlayingAudio(true);
      const audioUrl = currentMember.voiceUrl || `/api/family/members/${currentMember.id}/voice`;
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        const rel = t(`relationships.${currentMember.relationship?.toLowerCase()}`, currentMember.relationship);
        speak(`Namaskar from ${currentMember.name}, your loving ${rel}.`, { lang: 'en', rate: 0.8 });
      };

      audio.play().catch(() => {
        setIsPlayingAudio(false);
        const rel = t(`relationships.${currentMember.relationship?.toLowerCase()}`, currentMember.relationship);
        speak(`Namaskar from ${currentMember.name}, your loving ${rel}.`, { lang: 'en', rate: 0.8 });
      });
    } else {
      const rel = t(`relationships.${currentMember.relationship?.toLowerCase()}`, currentMember.relationship);
      const isHi = i18n.language.startsWith('hi');
      const msg = isHi
        ? `नमस्ते! मैं आपका ${rel}, ${currentMember.name} बोल रहा हूँ।`
        : `Hello! This is your ${rel}, ${currentMember.name}.`;
      speak(msg, { lang: isHi ? 'hi' : 'en', rate: 0.8 });
    }
  };

  // 4. Speech Recognition (Voice Answer)
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice answering is not supported on this browser. Please tap your answer.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = i18n.language.startsWith('hi')
        ? 'hi-IN'
        : i18n.language.startsWith('ta')
        ? 'ta-IN'
        : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript.toLowerCase();
        setSpeechTranscript(spoken);
        setIsListening(false);

        // Match against options
        const match = options.find((opt) => {
          const optLower = opt.toLowerCase();
          return optLower.includes(spoken) || spoken.includes(optLower.split('•')[0].trim());
        });

        if (match) {
          handleSelectOption(match);
        } else {
          // Check if spoken text matches current member name
          if (spoken.includes(currentMember.name.toLowerCase())) {
            const correctOpt = options.find((o) => o.startsWith(currentMember.name));
            if (correctOpt) handleSelectOption(correctOpt);
          }
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.warn('[NameFaceGame] Speech recognition error:', e);
      setIsListening(false);
    }
  };

  // 5. Answer Selection Handler
  const handleSelectOption = (option) => {
    if (selectedOption || !currentMember) return;
    setSelectedOption(option);

    const isMatch = option.startsWith(currentMember.name);
    setIsCorrect(isMatch);

    const qTime = Math.round((Date.now() - questionStartTime) / 1000);
    setResponseTimes((prev) => [...prev, qTime]);

    const currentRel = t(
      `relationships.${currentMember.relationship?.toLowerCase()}`,
      currentMember.relationship || 'Loved One'
    );
    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');

    if (isMatch) {
      setScore((s) => s + 20);
      setCorrectCount((c) => c + 1);
      setConsecutiveErrors(0);
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });

      const praise = isHi
        ? `शाबाश! यह आपके प्यारे ${currentRel}, ${currentMember.name} हैं।`
        : isTa
        ? `மிகவும் நன்று! இவர் உங்கள் ${currentRel}, ${currentMember.name}.`
        : `Wonderful! This is your loving ${currentRel}, ${currentMember.name}.`;

      speak(praise, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });

      // Automatically play member voice recording if available
      if (currentMember.hasVoice || currentMember.has_voice) {
        setTimeout(handlePlayVoice, 1200);
      }
    } else {
      setErrorsCount((e) => e + 1);
      setConsecutiveErrors((ce) => ce + 1);

      // Gentle, supportive guidance with ZERO scolding
      const supportiveMsg = isHi
        ? `कोई बात नहीं। यह आपके प्यारे ${currentRel}, ${currentMember.name} हैं। अगली तस्वीर देखते हैं।`
        : isTa
        ? `பரவாயில்லை. இவர் உங்கள் ${currentRel}, ${currentMember.name}. அடுத்த படத்தைப் பார்ப்போம்.`
        : `That's completely okay. This is your loving ${currentRel}, ${currentMember.name}. Let's look at the next one together.`;

      speak(supportiveMsg, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });
    }

    // Advance to next question or finish game
    setTimeout(() => {
      if (currentQuestionIndex + 1 < totalQuestions) {
        setCurrentQuestionIndex((prev) => prev + 1);
      } else {
        finishGame(
          isMatch ? score + 20 : score,
          isMatch ? correctCount + 1 : correctCount,
          isMatch ? errorsCount : errorsCount + 1
        );
      }
    }, 2800);
  };

  // 6. Complete Session & Submit to Adaptive AI Engine
  const finishGame = async (finalScore, finalCorrect, finalErrors) => {
    setGameOver(true);
    confetti({ particleCount: 100, spread: 80 });

    const accuracy = Math.round((finalCorrect / totalQuestions) * 100);
    const duration = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const avgResponseTimeMs =
      responseTimes.length > 0
        ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 1000)
        : 2000;

    // AI Adaptive recommendation
    let nextDifficulty = difficulty;
    let rationale = 'Maintaining current comfortable practice.';
    if (accuracy >= 85 && difficulty === 'easy') {
      nextDifficulty = 'medium';
      rationale = 'Great recall! Advancing from Easy to Medium.';
    } else if (accuracy >= 85 && difficulty === 'medium') {
      nextDifficulty = 'hard';
      rationale = 'Superb facial recognition! Advancing to Hard.';
    } else if (accuracy < 50 && difficulty === 'hard') {
      nextDifficulty = 'medium';
      rationale = 'Easing difficulty to Medium for comfort.';
    } else if (accuracy < 50 && difficulty === 'medium') {
      nextDifficulty = 'easy';
      rationale = 'Easing difficulty to Easy to build confidence.';
    }

    setAdaptiveFeedback({ nextDifficulty, rationale });

    const sessionPayload = {
      clientSessionId: `nameface-${Date.now()}`,
      gameType: 'name_face',
      level: difficulty,
      step: difficulty === 'easy' ? 'E1' : difficulty === 'medium' ? 'M1' : 'H1',
      score: finalScore,
      accuracy,
      responseTimeMs: avgResponseTimeMs,
      errorsCount: finalErrors,
      hintsCount,
      durationSeconds: duration,
      totalQuestions,
      correctAnswers: finalCorrect,
      incorrectAnswers: finalErrors,
      completionStatus: 'completed',
    };

    try {
      await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(sessionPayload),
      });
    } catch {
      queueOfflineSession(sessionPayload);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center font-bold text-slate-700">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-3" />
        Loading Family Memories (यादें लोड हो रही हैं)...
      </div>
    );
  }

  // Graceful fallback if no photos uploaded yet
  if (membersWithPhotos.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center space-y-4">
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl mx-auto flex items-center justify-center">
            <Camera className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black text-slate-800">
            No Family Photos Added Yet (कोई तस्वीर नहीं मिली)
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            This memory game uses real photographs of your loved ones to stimulate facial and name recall.
            Please add photos of your family members in the setup wizard or family portal.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/wizard"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Photos in Setup
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

  // Session Complete Modal
  if (gameOver) {
    const finalAccuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
      <div className="max-w-md mx-auto mt-10 px-4 animate-fade-in">
        <div className="bg-white border-2 border-indigo-100 rounded-3xl p-8 text-center shadow-xl space-y-5">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto animate-bounce" />
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              Session Complete! (सत्र पूरा हुआ!)
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Practicing loving family faces strengthens emotional well-being and visual memory recall.
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

          {adaptiveFeedback && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-800 font-medium">
              <span className="font-bold block mb-0.5">Adaptive AI Assessment:</span>
              {adaptiveFeedback.rationale}
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              onClick={() => {
                setGameOver(false);
                setCurrentQuestionIndex(0);
                setScore(0);
                setCorrectCount(0);
                setErrorsCount(0);
                setStartTime(Date.now());
                if (adaptiveFeedback?.nextDifficulty) {
                  setDifficulty(adaptiveFeedback.nextDifficulty);
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-md text-xs transition-colors"
            >
              Play Again (फिर से खेलें)
            </button>
            <button
              onClick={() => navigate('/games')}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-xs transition-colors"
            >
              Back to Games Hub (खेल केंद्र)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentRel = t(
    `relationships.${currentMember?.relationship?.toLowerCase()}`,
    currentMember?.relationship || 'Loved One'
  );

  return (
    <div className="max-w-xl mx-auto px-4 py-6 md:py-8">
      {/* Top Bar with Difficulty Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition-colors"
            title="Back to Games"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 flex items-center gap-1.5">
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
              Name & Face Memory
            </h1>
            <span className="text-xs text-slate-500">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Difficulty selector */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            {Object.entries(DIFFICULTY_CONFIG).map(([lvl, conf]) => (
              <button
                key={lvl}
                onClick={() => setDifficulty(lvl)}
                className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition-all ${
                  difficulty === lvl
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <span className="text-xs font-black bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-2xl border border-indigo-200">
            Score: {score}
          </span>
        </div>
      </div>

      {/* Main Question Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm text-center">
        {/* Family Photograph */}
        <div className="w-52 h-52 sm:w-60 sm:h-60 mx-auto rounded-3xl overflow-hidden mb-4 border-4 border-indigo-100 shadow-md bg-slate-100 relative group">
          <img
            src={currentMember?.photoUrl || `/api/family/members/${currentMember?.id}/photo`}
            alt={currentMember?.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>

        {/* Audio Button for Person's Recorded Voice */}
        <div className="mb-4 flex justify-center gap-2">
          <button
            onClick={handlePlayVoice}
            disabled={isPlayingAudio}
            className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Volume2 className={`w-4 h-4 ${isPlayingAudio ? 'animate-bounce text-purple-600' : ''}`} />
            {isPlayingAudio ? 'Playing Voice...' : 'Listen to Voice (आवाज़ सुनें)'}
          </button>

          {/* Voice Speech Recognition Button */}
          <button
            onClick={toggleSpeechRecognition}
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all border shadow-sm ${
              isListening
                ? 'bg-rose-500 text-white border-rose-600 animate-pulse'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isListening ? 'Listening... (बोलिए)' : 'Speak Answer (बोलें)'}
          </button>
        </div>

        {speechTranscript && (
          <p className="text-xs text-indigo-600 font-bold mb-3 italic">
            Recognized: "{speechTranscript}"
          </p>
        )}

        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-1">
          Who is this beloved person?
        </h2>
        <p className="text-xs text-slate-500 mb-6">
          यह कौन हैं? • யார் இவர்? • এরা কে?
        </p>

        {/* Scaled Multiple Choice Options */}
        <div
          className={`grid gap-3 ${
            options.length > 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {options.map((opt, i) => {
            const isSelected = selectedOption === opt;
            const isTargetCorrect = opt.startsWith(currentMember?.name);

            let btnStyle = 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200';
            if (selectedOption) {
              if (isSelected) {
                btnStyle = isCorrect
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-md ring-2 ring-emerald-300'
                  : 'bg-rose-500 text-white border-rose-500 shadow-md ring-2 ring-rose-300';
              } else if (isTargetCorrect) {
                btnStyle = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold ring-2 ring-emerald-400';
              }
            }

            return (
              <button
                key={i}
                disabled={Boolean(selectedOption)}
                onClick={() => handleSelectOption(opt)}
                className={`p-4 rounded-2xl border-2 font-bold text-left text-sm transition-all flex items-center justify-between ${btnStyle} active:scale-98`}
              >
                <span>{opt}</span>
                {isSelected && (
                  isCorrect ? (
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 ml-2" />
                  ) : (
                    <XCircle className="w-5 h-5 flex-shrink-0 ml-2" />
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
