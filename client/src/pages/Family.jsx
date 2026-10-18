import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Phone, Volume2, Share2, Plus, Heart, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { speak } from '../utils/voice';

export default function Family() {
  const { t } = useTranslation();
  const [elder, setElder] = useState(null);
  const [family, setFamily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [shareLink, setShareLink] = useState(null);

  useEffect(() => {
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setElder(d.elder);
          setFamily(d.family || []);
        }
      })
      .catch((e) => console.warn(e.message))
      .finally(() => setLoading(false));
  }, []);

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
            <Users className="w-8 h-8 text-indigo-600" /> My Family (मेरा परिवार)
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
    </div>
  );
}
