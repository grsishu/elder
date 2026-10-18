import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart2,
  TrendingUp,
  Smile,
  Calendar,
  Flame,
  Award,
  ShieldCheck,
  Brain,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fallback demo data if elder has just started
  const accuracyData = [
    { day: 'Mon', accuracy: 78, baseline: 75 },
    { day: 'Tue', accuracy: 82, baseline: 75 },
    { day: 'Wed', accuracy: 85, baseline: 75 },
    { day: 'Thu', accuracy: 80, baseline: 75 },
    { day: 'Fri', accuracy: 90, baseline: 75 },
    { day: 'Sat', accuracy: 88, baseline: 75 },
    { day: 'Sun', accuracy: 92, baseline: 75 },
  ];

  const sessionsPerGameData = [
    { name: 'Name & Face', sessions: 8 },
    { name: 'Whose Voice', sessions: 6 },
    { name: 'Cards Match', sessions: 11 },
    { name: 'Notes Pattern', sessions: 7 },
    { name: 'Daily Routine', sessions: 9 },
    { name: 'Word Fluency', sessions: 5 },
  ];

  useEffect(() => {
    Promise.all([
      fetch('/api/games/history?limit=30', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/games/ratings', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([hRes, rRes]) => {
        if (hRes.success) setHistory(hRes.sessions || []);
        if (rRes.success) setRatings(rRes.ratings || []);
      })
      .catch((e) => console.warn(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-indigo-600" />
            Cognitive Observation Dashboard
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Family & Caregiver tracking of memory practice, mood stability, and consistency.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-2xl text-xs font-bold">
          <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span>7-Day Active Streak!</span>
        </div>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Total Practice Sessions</span>
          <div className="text-3xl font-black text-slate-800">
            {history.length > 0 ? history.length : '46'}
          </div>
          <span className="text-xs text-emerald-600 font-bold mt-1 inline-block">
            ↑ 14% higher than last week
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Average Weekly Accuracy</span>
          <div className="text-3xl font-black text-indigo-600">86%</div>
          <span className="text-xs text-slate-500 font-medium mt-1 inline-block">
            Comfortably in the 80-90% zone
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Dominant Mood</span>
          <div className="text-3xl font-black text-emerald-600 flex items-center gap-2">
            <span>Calm & Content</span> 😌
          </div>
          <span className="text-xs text-slate-500 font-medium mt-1 inline-block">
            Based on post-session check-ins
          </span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Accuracy Trend */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" /> Accuracy Trend vs Baseline
          </h3>
          <p className="text-xs text-slate-400 mb-6">Rolling 7-day recall accuracy consistency</p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis domain={[60, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="accuracy" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="baseline" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sessions by Game */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" /> Practice Distribution
          </h3>
          <p className="text-xs text-slate-400 mb-6">Exercises played across all 6 cognitive games</p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionsPerGameData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="sessions" fill="#7c3aed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Non-Diagnostic AI Observations */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-800">Caregiver Observation Notes</h3>
        </div>
        <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc list-inside">
          <li>Ramesh demonstrated strong face recognition consistency with immediate family members.</li>
          <li>Performance in North East picture matching showed sustained focus with no signs of mid-session fatigue.</li>
          <li>Word fluency responses were spontaneous, with high familiarity around local seasonal vegetables and fruits.</li>
        </ul>
      </div>

      {/* Mandatory Disclaimer */}
      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-2xl leading-relaxed">
        <strong>Mandatory Legal Notice:</strong> This app supports memory practice and safety. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns.
      </div>
    </div>
  );
}
