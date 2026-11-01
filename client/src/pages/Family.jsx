import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Phone, Volume2, Share2, Plus, Heart, ShieldAlert, FileText, Download, ExternalLink, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { speak } from '../utils/voice';

export default function Family() {
  const { t } = useTranslation();
  const [elder, setElder] = useState(null);
  const [family, setFamily] = useState([]);
  const [weeklyReports, setWeeklyReports] = useState([]);
  const [generatingWeekly, setGeneratingWeekly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [shareLink, setShareLink] = useState(null);

  const fetchFamilyData = () => {
    Promise.all([
      fetch('/api/wizard/state', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/family/photos', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/reports/weekly', { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([wData, pData, rData]) => {
        if (wData.success) {
          setElder(wData.elder);
          let list = wData.family || [];
          if (pData.photos && pData.photos.length > 0) {
            const extra = pData.photos.map((p) => ({
              id: p.id,
              name: p.member_name,
              relationship: p.relationship,
              photo_url: `/api/family/photos/${p.id}/file`,
              has_photo: true,
              phone: '+91 98765 00000',
            }));
            list = [...list, ...extra];
          }
          setFamily(list);
        }
        if (rData.reports) {
          setWeeklyReports(rData.reports);
        }
      })
      .catch((e) => console.warn(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFamilyData();
  }, []);

  const handleGenerateWeeklyReport = async () => {
    setGeneratingWeekly(true);
    try {
      await fetch('/api/reports/weekly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      fetchFamilyData();
    } catch (e) {
      console.warn(e);
    } finally {
      setGeneratingWeekly(false);
    }
  };

  const playVoice = (member) => {
    if (member.has_voice) {
      setPlayingVoiceId(member.id);
      const audio = new Audio(`/api/elder/${elder.id}/family/${member.id}/voice`);
      audio.onended = () => setPlayingVoiceId(null);
      audio.onerror = () => {
        setPlayingVoiceId(null);
        speak(`Namaskar from ${member.name}, your loving ${member.relationship}.`, { lang: 'en' });
      };
      audio.play().catch(() => {
        setPlayingVoiceId(null);
        speak(`Namaskar from ${member.name}, your loving ${member.relationship}.`, { lang: 'en' });
      });
    } else {
      speak(`Namaskar from ${member.name}, your loving ${member.relationship}.`, { lang: 'en' });
    }
  };

  const generateUploadLink = async () => {
    try {
      const res = await fetch('/api/wizard/family/generate-token', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setShareLink(data.url);
      }
    } catch (e) {
      console.warn(e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-600">
        Loading My Family...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" /> {t('home.family_btn', 'My Family')}
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Tap on any photo to hear their voice or make a quick call.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateUploadLink}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" /> Share Upload Link
          </button>
          <Link
            to="/wizard"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Member
          </Link>
        </div>
      </div>

      {shareLink && (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-sm text-indigo-900 font-semibold">
          <div>
            <span>7-Day Relative Photo & Voice Upload Link:</span>
            <div className="text-xs text-indigo-600 font-mono mt-0.5 break-all">{shareLink}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(shareLink);
              alert('Upload link copied to clipboard!');
            }}
            className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
          >
            Copy
          </button>
        </div>
      )}

      {family.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Heart className="w-16 h-16 text-rose-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No Family Members Added Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6 text-sm">
            Adding family photos and voice notes helps memory recall and provides one-touch emergency calling.
          </p>
          <Link
            to="/wizard"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl shadow-md"
          >
            <Plus className="w-5 h-5" /> Start Setup Wizard
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {family.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
            >
              <div
                onClick={() => playVoice(member)}
                className="relative h-48 bg-slate-100 flex items-center justify-center cursor-pointer group"
              >
                {member.has_photo ? (
                  <img
                    src={`/api/elder/${elder.id}/family/${member.id}/photo`}
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-2xl">
                    {member.name?.charAt(0) || 'F'}
                  </div>
                )}

                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                    <Volume2
                      className={`w-6 h-6 ${playingVoiceId === member.id ? 'text-emerald-600 animate-pulse' : 'text-indigo-600'}`}
                    />
                  </div>
                </div>

                {member.is_emergency_contact && (
                  <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Priority #{member.emergency_priority}
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{member.name}</h3>
                  <p className="text-sm text-indigo-600 font-bold mb-2">{member.relationship}</p>
                  {member.address && <p className="text-xs text-slate-500 mb-4">{member.address}</p>}
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-2">
                  <button
                    onClick={() => playVoice(member)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    <Volume2 className="w-4 h-4 text-indigo-600" /> Hear Voice
                  </button>
                  <a
                    href={`tel:${member.phone}`}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Phone className="w-4 h-4" /> Call
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION: WEEKLY COGNITIVE PROGRESS REPORTS (MODULE 13) */}
      <div className="mt-12 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              Weekly Cognitive Progress Reports (साप्ताहिक पारिवारिक रिपोर्ट)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Automated weekly summary of cognitive practice across all 8 games, delivered Sundays at 7:00 PM IST.
            </p>
          </div>
          <button
            onClick={handleGenerateWeeklyReport}
            disabled={generatingWeekly}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50 self-start sm:self-auto"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            {generatingWeekly ? 'Generating PDF...' : 'Generate Weekly Report Now'}
          </button>
        </div>

        {weeklyReports.length === 0 ? (
          <div className="p-8 bg-slate-50 rounded-2xl text-center text-slate-500 text-xs font-semibold">
            No weekly reports generated yet. Click "Generate Weekly Report Now" to generate this week's comprehensive family PDF report.
          </div>
        ) : (
          <div className="space-y-3">
            {weeklyReports.map((r) => (
              <div
                key={r.id}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <span className="text-xs font-black text-slate-800 block">
                    Weekly Report: {r.period_start} to {r.period_end}
                  </span>
                  <span className="text-[11px] text-slate-500 line-clamp-1">{r.summary_text}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View PDF
                  </a>
                  <a
                    href={`/api/reports/${r.id}/pdf`}
                    download={`smriti-weekly-report-${r.id}.pdf`}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 font-medium text-center">
          Notice: This report supports memory practice and safety. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns.
        </div>
      </div>
    </div>
  );
}
