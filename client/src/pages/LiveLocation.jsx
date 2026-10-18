import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  MapPin,
  ShieldAlert,
  Clock,
  Compass,
  RefreshCw,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LiveLocation() {
  const { t } = useTranslation();
  const { elderId: paramElderId } = useParams();
  const { elder } = useAuth();

  const elderId = paramElderId || elder?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acked, setAcked] = useState(false);

  const fetchLive = async () => {
    if (!elderId) return;
    try {
      const resp = await fetch(`/api/location/elder/${elderId}/live`);
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
      }
    } catch (err) {
      console.warn('Error fetching live location:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [elderId]);

  const handleAcknowledge = async (checkId) => {
    try {
      await fetch('/api/location/checkin/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId, response: 'fine' }),
      });
      setAcked(true);
      fetchLive();
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Compass className="w-8 h-8 text-emerald-600 animate-spin-slow" />
            <span>Live Family Location Tracking</span>
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Real-time coordinates, safety zone status, and wandering checks for {data?.elder?.name || 'Elder'}
          </p>
        </div>

        <button
          onClick={fetchLive}
          disabled={loading}
          className="btn-elder px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-2xl flex items-center gap-2 min-h-[44px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Browser Limitation Notice per spec */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 p-4 rounded-2xl text-xs text-blue-900">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p>
          <strong>Notice for Caregivers:</strong> Location works while the app is open or installed as a PWA. Browsers cannot track a phone when the app is fully closed.
        </p>
      </div>

      {/* Current Fix Card */}
      {data?.currentFix ? (
        <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
              <MapPin className="w-6 h-6 text-emerald-600" />
              <span>Latest Verified Fix</span>
            </div>
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{new Date(data.currentFix.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl text-xs font-mono">
            <div>
              <span className="text-slate-500 block">Latitude</span>
              <strong className="text-slate-900">{parseFloat(data.currentFix.latitude).toFixed(5)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Longitude</span>
              <strong className="text-slate-900">{parseFloat(data.currentFix.longitude).toFixed(5)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Accuracy</span>
              <strong className="text-emerald-700">±{data.currentFix.accuracy}m</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Phone Battery</span>
              <strong className="text-slate-900">{data.currentFix.battery !== null ? `${data.currentFix.battery}%` : 'N/A'}</strong>
            </div>
          </div>

          <div className="pt-2">
            <a
              href={`https://www.google.com/maps?q=${data.currentFix.latitude},${data.currentFix.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="btn-elder w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 min-h-[48px]"
            >
              <MapPin className="w-5 h-5" />
              <span>Open in Google Maps</span>
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-3xl border text-center text-slate-500 font-bold">
          No location fixes recorded yet.
        </div>
      )}

      {/* Lost Checks Timeline */}
      <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-amber-600" />
          <span>Wandering & Safety Check-ins</span>
        </h2>

        {data?.checksTimeline?.length > 0 ? (
          <div className="space-y-3">
            {data.checksTimeline.map((check) => (
              <div
                key={check.id}
                className={`p-4 rounded-2xl border-2 space-y-2 ${
                  check.status === 'active' || check.status === 'alerted'
                    ? 'bg-red-50 border-red-300 text-red-950'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="px-2 py-0.5 bg-white rounded-lg border font-mono">
                    RULE: {check.rule}
                  </span>
                  <span>{new Date(check.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <p className="text-sm font-semibold">{check.explanation}</p>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span>Status: <strong>{check.status.toUpperCase()}</strong></span>
                  {(check.status === 'alerted' || check.status === 'active') && !acked && (
                    <button
                      onClick={() => handleAcknowledge(check.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-1.5"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>I got it, I'm calling now</span>
                    </button>
                  )}
                  {acked && <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Acknowledged</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-2xl text-center text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>No wandering checks or alerts. Elder is safe within normal routine.</span>
          </div>
        )}
      </div>

      {/* Saved Places List */}
      <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-blue-600" />
          <span>Configured Safe Places ({data?.savedPlaces?.length || 0})</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data?.savedPlaces?.map((p) => (
            <div key={p.id} className="p-3 bg-slate-50 rounded-2xl border text-xs space-y-1">
              <strong className="text-slate-900 block text-sm">{p.name}</strong>
              <div className="text-slate-600">{p.address}</div>
              <div className="text-slate-400 font-mono">({parseFloat(p.latitude).toFixed(4)}, {parseFloat(p.longitude).toFixed(4)})</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
