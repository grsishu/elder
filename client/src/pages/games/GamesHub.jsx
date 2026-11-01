import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Brain,
  Sparkles,
  Users,
  Mic,
  Grid,
  Music,
  Clock,
  MessageSquare,
  Smile,
  BarChart2,
  ChevronRight,
  Star,
  Eye,
  Search,
} from 'lucide-react';
import MoodModal from '../../components/MoodModal';
import { speak } from '../../utils/voice';

export default function GamesHub() {
  const { t } = useTranslation();
  const [todayGames, setTodayGames] = useState([]);
  const [ratings, setRatings] = useState({});
  const [loading, setLoading] = useState(true);
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [currentMood, setCurrentMood] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/games/today', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/games/ratings', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([tRes, rRes]) => {
        if (tRes.success) setTodayGames(tRes.exercises || []);
        if (rRes.success) {
          const map = {};
          (rRes.ratings || []).forEach((r) => {
            map[r.game_type] = r;
          });
          setRatings(map);
        }
      })
      .catch((e) => console.warn(e.message))
      .finally(() => setLoading(false));
  }, []);

  const allGames = [
    {
      id: 'memory_match',
      title: t('games.remember_objects_title', 'Memory Match (वस्तुएं याद रखें)'),
      desc: t('games.remember_objects_desc', 'Memorize objects shown and identify them'),
      icon: Eye,
      path: '/games/memory-match',
      color: 'bg-teal-50 border-teal-200 text-teal-700',
    },
    {
      id: 'memory_lane',
      title: t('games.name_face_title', 'Memory Lane (परिवार की यादें)'),
      desc: t('games.name_face_desc', 'Recognize beloved family members and photographs'),
      icon: Users,
      path: '/games/memory-lane',
      color: 'bg-rose-50 border-rose-200 text-rose-700',
    },
    {
      id: 'find_pair',
      title: t('games.picture_match_title', 'Find the Pair (जोड़े ढूंढें)'),
      desc: t('games.picture_match_desc', 'Match pairs of traditional cultural cards'),
      icon: Grid,
      path: '/games/find-pair',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      id: 'daily_routine',
      title: t('games.routine_recall_title', 'Daily Routine (दैनिक दिनचर्या)'),
      desc: t('games.routine_recall_desc', 'Order your day: morning tea, medicines, walk, meals'),
      icon: Clock,
      path: '/games/daily-routine',
      color: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      id: 'word_wizard',
      title: t('games.find_object_title', 'Word Wizard (शब्द पहचान)'),
      desc: t('games.find_object_desc', 'Spot and identify everyday familiar objects'),
      icon: Search,
      path: '/games/word-wizard',
      color: 'bg-violet-50 border-violet-200 text-violet-700',
    },
    {
      id: 'sort_it_out',
      title: t('games.sort_it_out_title', 'Sort It Out (वर्गीकरण)'),
      desc: t('games.sort_it_out_desc', 'Group fruits, vegetables, animals and household objects'),
      icon: Sparkles,
      path: '/games/sort-it-out',
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    },
    {
      id: 'music_memories',
      title: t('games.whose_voice_title', 'Music Memories (संगीत और स्वर)'),
      desc: t('games.whose_voice_desc', 'Recognize cultural melodies and loving family voices'),
      icon: Music,
      path: '/games/music-memories',
      color: 'bg-purple-50 border-purple-200 text-purple-700',
    },
    {
      id: 'puzzle_time',
      title: t('games.pattern_game_title', 'Puzzle Time (तस्वीर पहेली)'),
      desc: t('games.pattern_game_desc', 'Complete visual tile puzzles with large friendly pieces'),
      icon: Grid,
      path: '/games/puzzle-time',
      color: 'bg-blue-50 border-blue-200 text-blue-700',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Brain className="w-8 h-8 text-indigo-600" />
            {t('games.title', 'Brain Practice Games')}
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            {t('games.encouragement', 'Gentle memory stimulation adapted dynamically to your comfort level.')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMoodModalOpen(true)}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
          >
            <Smile className="w-4 h-4" />
            {currentMood ? `Mood: ${currentMood}` : 'Check In Mood'}
          </button>
          <Link
            to="/dashboard"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
          >
            <BarChart2 className="w-4 h-4" /> Progress
          </Link>
        </div>
      </div>

      {/* Today's 3 Brain Exercises (Spaced Repetition) */}
      <div className="mb-10 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-5 h-5 text-amber-300 fill-amber-300 animate-pulse" />
          <h2 className="text-xl font-black">{t('games.today_exercise', "Today's Brain Exercise")}</h2>
        </div>
        <p className="text-indigo-100 text-xs mb-6 max-w-lg">
          Curated by our adaptive AI to support cognitive vitality without fatigue.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {todayGames.map((tg) => {
            const gameObj = allGames.find((g) => g.id === tg.gameType) || allGames[0];
            return (
              <Link
                key={tg.gameType}
                to={gameObj.path}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex flex-col justify-between transition-transform hover:-translate-y-1"
              >
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full inline-block mb-2">
                    Level: {tg.step} ({tg.level})
                  </span>
                  <h4 className="font-bold text-white text-base leading-snug">{gameObj.title}</h4>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-bold text-indigo-200">
                  <span>Start Practice</span>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* All 6 Games Grid */}
      <h3 className="text-xl font-black text-slate-800 mb-4">All Exercises (सभी खेल)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {allGames.map((g) => {
          const Icon = g.icon;
          const r = ratings[g.id];
          const currentStep = r?.current_step || 'E1';
          return (
            <Link
              key={g.id}
              to={g.path}
              className={`p-5 rounded-3xl border ${g.color} flex flex-col justify-between hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start gap-4">
                <div className="p-3.5 bg-white rounded-2xl shadow-sm">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800 text-base">{g.title}</h4>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/80 border border-slate-200">
                      Step {currentStep}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{g.desc}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-500">{r?.sessions_count || 0} sessions played</span>
                <span className="flex items-center gap-1 text-indigo-600">
                  Play Now <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <MoodModal
        isOpen={moodModalOpen}
        onClose={() => setMoodModalOpen(false)}
        onSelectMood={(m) => setCurrentMood(m)}
      />
    </div>
  );
}
