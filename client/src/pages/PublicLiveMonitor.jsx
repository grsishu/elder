import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MapPin,
  Shield,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  Battery,
  Navigation,
  Compass,
  CheckCircle,
  Share2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Activity,
  Play
} from 'lucide-react';

export default function PublicLiveMonitor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlElderId = searchParams.get('elderId');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedElderId, setSelectedElderId] = useState(urlElderId || '');
  const [nextCheckSeconds, setNextCheckSeconds] = useState(300); // 5-minute countdown
  const [simulating, setSimulating] = useState(false);
  const [copied, setCopied] = useState(false);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef([]);

  // Fetch public monitor data
  const fetchMonitorData = async (elderIdToFetch) => {
    try {
      const q = elderIdToFetch ? `?elderId=${elderIdToFetch}` : '';
      const res = await fetch(`/api/location/public-monitor${q}`);
      if (!res.ok) throw new Error('Failed to load live monitor data');
      const json = await res.json();
      setData(json);
      if (!selectedElderId && json.elder?.id) {
        setSelectedElderId(json.elder.id);
      }
      setNextCheckSeconds(300); // Reset 5-minute timer
      setError(null);
    } catch (err) {
      console.error('[PublicMonitor] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitorData(selectedElderId);
    const interval = setInterval(() => {
      fetchMonitorData(selectedElderId);
    }, 30000); // Auto poll every 30s for live updates

    return () => clearInterval(interval);
  }, [selectedElderId]);

  // 5-minute Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setNextCheckSeconds((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapRef.current || !data?.latestSample || typeof window.L === 'undefined') return;

    const lat = parseFloat(data.latestSample.lat ?? data.latestSample.latitude);
    const lng = parseFloat(data.latestSample.lng ?? data.latestSample.longitude);

    if (!leafletMap.current) {
      leafletMap.current = window.L.map(mapRef.current).setView([lat, lng], 15);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(leafletMap.current);
    } else {
      leafletMap.current.setView([lat, lng]);
    }

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Draw Safe Zones
    if (data.safeZones) {
      data.safeZones.forEach((zone) => {
        const zLat = parseFloat(zone.lat ?? zone.latitude);
        const zLng = parseFloat(zone.lng ?? zone.longitude);
        const color = zone.type === 'home' ? '#10B981' : zone.type === 'hospital' ? '#EF4444' : '#3B82F6';

        const circle = window.L.circle([zLat, zLng], {
          color,
          fillColor: color,
          fillOpacity: 0.18,
          radius: zone.radius_m || 150,
        }).addTo(leafletMap.current);

        circle.bindPopup(`<b>${zone.name}</b> (${zone.type})<br/>Radius: ${zone.radius_m || 150}m`);
        markersRef.current.push(circle);
      });
    }

    // Draw Trail
    if (data.trail && data.trail.length > 1) {
      const latlngs = data.trail.map((s) => [
        parseFloat(s.lat ?? s.latitude),
        parseFloat(s.lng ?? s.longitude),
      ]);
      const polyline = window.L.polyline(latlngs, {
        color: '#8B5CF6',
        weight: 4,
        dashArray: '6, 8',
      }).addTo(leafletMap.current);
      markersRef.current.push(polyline);
    }

    // Draw Elder Marker
    const elderMarker = window.L.marker([lat, lng], {
      title: data.elder?.name || 'Elder Location',
    }).addTo(leafletMap.current);

    elderMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px;">
        <b style="font-size: 14px; color: #1E293B;">${data.elder?.name || 'Elder'}</b><br/>
        <b>State:</b> ${data.currentEvaluation?.state || 'Normal'}<br/>
        <b>Accuracy:</b> ${Math.round(data.latestSample.accuracy_m || 15)}m<br/>
        <b>Updated:</b> ${new Date(data.latestSample.captured_at).toLocaleTimeString()}
      </div>
    `).openPopup();
    markersRef.current.push(elderMarker);

    // Accuracy Circle
    const accCircle = window.L.circle([lat, lng], {
      color: '#3B82F6',
      fillColor: '#3B82F6',
      fillOpacity: 0.12,
      radius: data.latestSample.accuracy_m || 15,
    }).addTo(leafletMap.current);
    markersRef.current.push(accCircle);
  }, [data]);

  // Trigger Immediate Simulation / Compare
  const handleSimulate = async (scenario) => {
    if (!data?.elder?.id) return;
    setSimulating(true);
    try {
      const res = await fetch('/api/location/public-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elderId: data.elder.id,
          scenario,
        }),
      });
      if (res.ok) {
        await fetchMonitorData(data.elder.id);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const copyPublicLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
        <h2 className="text-xl font-bold">Connecting to Smriti Saathi Live Monitor...</h2>
        <p className="text-slate-400 text-sm mt-2">Loading 5-minute autonomous AI comparison engine</p>
      </div>
    );
  }

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const evalState = data?.currentEvaluation?.state || 'safe_zone';
  const evalScore = data?.currentEvaluation?.score || 0;

  const stateColors = {
    safe_zone: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    away_normal: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    learning: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
    unusual: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  };

  const latestComp = data?.comparisons?.[0] || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Universal Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">Smriti Saathi</span>
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Public Live Monitor
                </span>
              </div>
              <p className="text-xs text-slate-400">Autonomous 5-Minute AI Location Comparison Engine</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Elder Selector */}
            {data?.allElders?.length > 1 && (
              <select
                value={selectedElderId}
                onChange={(e) => {
                  setSelectedElderId(e.target.value);
                  setSearchParams({ elderId: e.target.value });
                }}
                className="bg-slate-800 border border-slate-700 text-sm font-semibold rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {data.allElders.map((el) => (
                  <option key={el.id} value={el.id}>
                    Elder: {el.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={copyPublicLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition shadow-sm"
              title="Copy link to view together"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-slate-400" />}
              <span>{copied ? 'Link Copied!' : 'Share Live Link'}</span>
            </button>

            <Link
              to="/location"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition shadow-sm"
            >
              <span>Caregiver Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-4 lg:p-6 space-y-6 flex-1">
        {/* Ticker & AI State Header Bar */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-xl border font-bold text-sm uppercase tracking-wider flex items-center gap-2 ${stateColors[evalState] || stateColors.safe_zone}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
              <span>{evalState.replace('_', ' ')}</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                <span>{data?.elder?.name || 'Elder'}</span>
                {data?.isStale && (
                  <span className="text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-md font-bold">
                    STALE ({data.diffMinutes}m)
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                {data?.currentEvaluation?.reasons?.[0] || 'Elder is inside safe zone boundary.'}
              </p>
            </div>
          </div>

          {/* 5-Min Comparison Countdown & Manual Trigger */}
          <div className="flex items-center gap-3 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <div className="text-right">
                <span className="text-xs text-slate-500 block leading-none">Next 5-Min AI Check</span>
                <span className="font-mono font-bold text-sm text-amber-300">{formatCountdown(nextCheckSeconds)}</span>
              </div>
            </div>

            <button
              onClick={() => fetchMonitorData(selectedElderId)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Evaluate Now</span>
            </button>
          </div>
        </div>

        {/* 2-Column Grid: Map & Live 5-Min Comparison Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Map Section (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col">
            <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Live GPS Map & Geofence Boundaries</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Home</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Safe Zone</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> 24h Trail</span>
              </div>
            </div>

            {/* Map Container */}
            <div ref={mapRef} className="w-full h-[400px] lg:h-[480px] bg-slate-950 z-10" />

            {/* Map Footer Bar with Latest Metrics */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 grid grid-cols-3 text-center text-xs divide-x divide-slate-800">
              <div>
                <span className="text-slate-500 block">Accuracy</span>
                <span className="font-bold text-slate-200 font-mono">
                  ±{Math.round(data?.latestSample?.accuracy_m || 15)}m
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Battery</span>
                <span className="font-bold text-slate-200 font-mono">
                  {data?.latestSample?.battery_pct ? `${data.latestSample.battery_pct}%` : '85%'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Last Fix</span>
                <span className="font-bold text-slate-200 font-mono">
                  {data?.latestSample?.captured_at ? new Date(data.latestSample.captured_at).toLocaleTimeString() : 'Recent'}
                </span>
              </div>
            </div>
          </div>

          {/* 5-Min AI Comparison Engine Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live 5-Min Comparison Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-extrabold text-base text-white">5-Minute AI Comparison</h2>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                  Interval: 5m
                </span>
              </div>

              {latestComp ? (
                <div className="space-y-4">
                  {/* Delta Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">5-Min Displacement</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-white font-mono">{latestComp.displacementM}</span>
                        <span className="text-xs text-slate-400 font-semibold">meters moved</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-1">
                        Pace: {(latestComp.displacementM / 300).toFixed(2)} m/s (Walking)
                      </span>
                    </div>

                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">Nearest Safe Zone</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-white font-mono">
                          {latestComp.nearestZone ? latestComp.nearestZone.distanceM : '0'}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">m from {latestComp.nearestZone?.name || 'Home'}</span>
                      </div>
                      <span className={`text-[11px] font-bold block mt-1 ${latestComp.nearestZone?.isInside ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {latestComp.nearestZone?.isInside ? '✓ Inside Zone Boundary' : '• Outside Zone Boundary'}
                      </span>
                    </div>
                  </div>

                  {/* AI Risk Score Gauge */}
                  <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-300">AI Risk Score</span>
                      <span className={`font-mono text-sm ${evalScore > 50 ? 'text-red-400' : evalScore > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {evalScore} / 100
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          evalScore > 50 ? 'bg-red-500' : evalScore > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, evalScore))}%` }}
                      />
                    </div>
                  </div>

                  {/* Plain Language AI Explanation */}
                  <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-xl">
                    <span className="text-xs font-bold text-emerald-400 block mb-1 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>AI Decision Verdict</span>
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {latestComp.reasons?.[0] || 'No unusual patterns detected. Elder is within routine movement parameters.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">No 5-minute fixes recorded yet today.</p>
              )}
            </div>

            {/* Live Interactive Scenario Simulator */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-amber-400" />
                  <h3 className="font-extrabold text-sm text-white">Live AI Test Scenarios</h3>
                </div>
                <span className="text-[11px] text-slate-400">Click to compare live</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSimulate('home')}
                  disabled={simulating}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition group disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-emerald-400 block group-hover:underline">🏡 At Home</span>
                  <span className="text-[10px] text-slate-400">Inside 150m safe zone</span>
                </button>

                <button
                  onClick={() => handleSimulate('walking')}
                  disabled={simulating}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition group disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-blue-400 block group-hover:underline">🚶 Walking Outside</span>
                  <span className="text-[10px] text-slate-400">220m from Home (Normal)</span>
                </button>

                <button
                  onClick={() => handleSimulate('stopped')}
                  disabled={simulating}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition group disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-amber-400 block group-hover:underline">🛑 Stopped 10 Min</span>
                  <span className="text-[10px] text-slate-400">Stationary outside</span>
                </button>

                <button
                  onClick={() => handleSimulate('unfamiliar')}
                  disabled={simulating}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition group disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-red-400 block group-hover:underline">🌲 Unfamiliar Area</span>
                  <span className="text-[10px] text-slate-400">1.9 km from Home</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5-Minute Comparison Timeline / Audit Log Table */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              <h2 className="font-extrabold text-base text-white">5-Minute Comparison Timeline Log</h2>
            </div>
            <span className="text-xs text-slate-400">
              Comparing GPS displacement and safe zone distance on every 5-minute tick
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Tick #</th>
                  <th className="py-2.5 px-3">Captured At</th>
                  <th className="py-2.5 px-3">5-Min Displacement</th>
                  <th className="py-2.5 px-3">Nearest Safe Zone</th>
                  <th className="py-2.5 px-3">AI Verdict</th>
                  <th className="py-2.5 px-3">Risk Score</th>
                  <th className="py-2.5 px-3">AI Plain-Language Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {data?.comparisons && data.comparisons.length > 0 ? (
                  data.comparisons.map((c) => (
                    <tr key={c.client_id || c.index} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-bold text-slate-400">#{c.index}</td>
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(c.captured_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-white font-bold">{c.displacementM}m</span>
                        <span className="text-slate-500 block text-[10px]">in {c.timeDeltaMin}m window</span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {c.nearestZone ? (
                          <>
                            <span className="text-white font-bold">{c.nearestZone.distanceM}m</span>
                            <span className="text-slate-500 block text-[10px]">({c.nearestZone.name})</span>
                          </>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${stateColors[c.state] || stateColors.safe_zone}`}>
                          {c.state.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold">
                        <span className={c.score > 50 ? 'text-red-400' : c.score > 20 ? 'text-amber-400' : 'text-emerald-400'}>
                          {c.score}/100
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-300 text-xs max-w-xs truncate" title={c.reasons?.[0]}>
                        {c.reasons?.[0] || 'In safe zone'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-slate-500 font-sans">
                      No 5-minute ticks available yet. Click any test scenario above to generate live comparison ticks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        Smriti Saathi (स्मृति साथी) — AI-Based Cognitive & Location Guardian for Elderly Care • Non-Medical Safety Support
      </footer>
    </div>
  );
}

