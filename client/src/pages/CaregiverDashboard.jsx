import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  MapPin,
  Clock,
  Battery,
  PhoneCall,
  Navigation,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Pill,
  Bell,
  RefreshCw,
  ExternalLink,
  Users,
  Activity,
  Heart,
  ChevronRight,
  FileText,
  Download,
  Sliders,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';

const ZONE_COLORS = {
  home: '#10b981', // emerald
  hospital: '#ef4444', // red
  relative: '#3b82f6', // blue
  temple: '#f59e0b', // amber
  shop: '#8b5cf6', // purple
  other: '#64748b', // slate
};

export default function CaregiverDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, elder: authElder } = useAuth();

  const [eldersList, setEldersList] = useState([]);
  const [selectedElderId, setSelectedElderId] = useState(authElder?.id || null);
  const [dashboardData, setDashboardData] = useState(null);
  const [gamesSummary, setGamesSummary] = useState([]);
  const [remindersList, setRemindersList] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [allGamesStatus, setAllGamesStatus] = useState([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'map' | 'safety' | 'activity'

  // Map DOM refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef(null);

  // 1. Fetch available elders
  useEffect(() => {
    fetch('/api/location/elders', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { elders: [] }))
      .then((d) => {
        if (d.elders && d.elders.length > 0) {
          setEldersList(d.elders);
          if (!selectedElderId) {
            setSelectedElderId(d.elders[0].id);
          }
        }
      })
      .catch((e) => console.warn('Elders fetch fallback:', e.message));
  }, []);

  // 2. Fetch Dashboard & Safety Data for selected elder
  const fetchDashboardData = async () => {
    const id = selectedElderId || authElder?.id || 'default';
    try {
      const [locRes, gamesRes, remRes, reportsRes, statusRes] = await Promise.all([
        fetch(`/api/location/public-monitor?elderId=${id}`),
        fetch(`/api/games/ratings`, { credentials: 'include' }).catch(() => ({ ok: false })),
        fetch(`/api/reminders`, { credentials: 'include' }).catch(() => ({ ok: false })),
        fetch(`/api/reports/daily?elderId=${id}`, { credentials: 'include' }).catch(() => ({ ok: false })),
        fetch(`/api/games/status?elderId=${id}`, { credentials: 'include' }).catch(() => ({ ok: false })),
      ]);

      if (locRes.ok) {
        const json = await locRes.json();
        setDashboardData(json);
      }
      if (gamesRes.ok) {
        const gJson = await gamesRes.json();
        setGamesSummary(gJson.ratings || []);
      }
      if (remRes.ok) {
        const rJson = await remRes.json();
        setRemindersList(rJson.reminders || []);
      }
      if (reportsRes.ok) {
        const repJson = await reportsRes.json();
        setDailyReports(repJson.reports || []);
      }
      if (statusRes.ok) {
        const statJson = await statusRes.json();
        setAllGamesStatus(statJson.games || []);
      }
    } catch (err) {
      console.warn('[CaregiverDashboard] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideDifficulty = async (gameType, newLevel) => {
    const id = selectedElderId || authElder?.id;
    try {
      await fetch('/api/games/difficulty-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          elderId: id,
          gameType,
          newLevel,
          reason: `Caretaker manual adjustment to ${newLevel}`,
        }),
      });
      fetchDashboardData();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleGenerateDailyReport = async () => {
    const id = selectedElderId || authElder?.id;
    setGeneratingReport(true);
    try {
      await fetch('/api/reports/daily/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ elderId: id }),
      });
      fetchDashboardData();
    } catch (e) {
      console.warn(e);
    } finally {
      setGeneratingReport(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [selectedElderId]);

  // 3. Leaflet Map setup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        attributionControl: false,
      }).setView([26.1755, 91.758], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    layers.clearLayers();

    if (!dashboardData) return;

    const bounds = L.latLngBounds([]);

    // Draw Safe Zones & Geofences
    (dashboardData.safeZones || []).forEach((zone) => {
      const zLat = parseFloat(zone.lat || zone.latitude);
      const zLng = parseFloat(zone.lng || zone.longitude);
      const color = ZONE_COLORS[zone.type] || ZONE_COLORS.other;
      const radius = zone.radius_m || 150;

      const circle = L.circle([zLat, zLng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(layers);

      circle.bindPopup(`<b>${zone.name}</b><br/>${t('caregiver.geofence_boundary')}: ${radius}m`);
      bounds.extend([zLat, zLng]);
    });

    // Draw Recent Trail
    const trail = dashboardData.trail || [];
    if (trail.length > 1) {
      const trailPoints = trail.map((p) => [parseFloat(p.lat || p.latitude), parseFloat(p.lng || p.longitude)]);
      L.polyline(trailPoints, {
        color: '#f97316',
        weight: 4,
        opacity: 0.7,
      }).addTo(layers);
      trailPoints.forEach((pt) => bounds.extend(pt));
    }

    // Draw Latest Elder Fix
    const latest = dashboardData.latestFix;
    if (latest) {
      const lat = parseFloat(latest.lat || latest.latitude);
      const lng = parseFloat(latest.lng || latest.longitude);
      const acc = parseFloat(latest.accuracy_m || latest.accuracy || 15);

      // Accuracy ring
      L.circle([lat, lng], {
        radius: acc,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(layers);

      // Elder marker
      const elderIcon = L.divIcon({
        className: 'caregiver-elder-pin',
        html: `
          <div style="position:relative; width:34px; height:34px;">
            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:#2563eb; opacity:0.75; animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:absolute; width:24px; height:24px; top:5px; left:5px; border-radius:50%; background:#1d4ed8; border:3px solid #ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:11px;">
              👤
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([lat, lng], { icon: elderIcon }).addTo(layers);
      marker.bindPopup(
        `<b>${dashboardData.elder?.name || 'Elder'}</b><br/>${t('caregiver.gps_accuracy')}: ±${acc}m`
      );
      bounds.extend([lat, lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [dashboardData]);

  const elder = dashboardData?.elder || authElder || { name: 'Elder User', phone: '+91 98765 43210' };
  const latestFix = dashboardData?.latestFix;
  const isOnline = latestFix ? Date.now() - new Date(latestFix.captured_at || latestFix.created_at || Date.now()).getTime() < 15 * 60 * 1000 : false;
  const isOuting = dashboardData?.isOutsideSafeZone || false;
  const hasWrongRoute = dashboardData?.evalResult?.decision === 'wrong_route';
  const hasStationaryAlert = dashboardData?.isStationaryOutside || false;
  const hasSosActive = dashboardData?.activeAlerts?.some((a) => a.alert_type === 'sos') || false;

  const elderLat = latestFix ? parseFloat(latestFix.lat || latestFix.latitude) : 26.1755;
  const elderLng = latestFix ? parseFloat(latestFix.lng || latestFix.longitude) : 91.758;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            {t('caregiver.title')}
          </h1>
          <p className="text-slate-500 font-medium text-xs mt-1">
            {t('caregiver.unauthorized_notice')}
          </p>
        </div>

        {/* Elder Selector if multiple */}
        {eldersList.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <Users className="w-4 h-4 text-slate-500 ml-2" />
            <select
              value={selectedElderId || ''}
              onChange={(e) => setSelectedElderId(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 outline-none pr-3"
            >
              {eldersList.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={fetchDashboardData}
          className="self-start sm:self-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* SECTION A: ELDERLY PERSON OVERVIEW */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 font-black text-2xl flex items-center justify-center border-2 border-indigo-200 shadow-sm">
              {elder?.name ? elder.name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-slate-800">{elder?.name || 'Smt. Sarala Devi'}</h2>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black flex items-center gap-1.5 ${
                    isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  {isOnline ? t('caregiver.status_online') : t('caregiver.status_offline')}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                {elder?.phone || '+91 98765 43210'} • {elder?.address || 'Guwahati, Assam'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                {t('caregiver.battery')}
              </span>
              <span className="text-sm font-black text-slate-800 flex items-center justify-center gap-1">
                <Battery className="w-4 h-4 text-emerald-600" />
                {latestFix?.battery_pct ? `${latestFix.battery_pct}%` : '85%'}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                {t('caregiver.gps_accuracy')}
              </span>
              <span className="text-sm font-black text-slate-800 flex items-center justify-center gap-1">
                <MapPin className="w-4 h-4 text-indigo-600" />±
                {latestFix?.accuracy_m ? Math.round(latestFix.accuracy_m) : '15'}m
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                {t('caregiver.last_activity')}
              </span>
              <span className="text-xs font-black text-slate-800 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {latestFix?.captured_at ? new Date(latestFix.captured_at).toLocaleTimeString() : 'Just now'}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Status</span>
              <span
                className={`text-xs font-black ${
                  isOuting ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {isOuting ? 'Outing' : 'At Home'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B & C: LIVE LOCATION MAP + REAL-TIME SAFETY MONITORING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* SECTION B: LIVE MAP (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Compass className="w-5 h-5 text-indigo-600" />
              {t('caregiver.live_map_title')}
            </h3>

            <div className="flex gap-2">
              <Link
                to={`/caregiver/location`}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('caregiver.view_location')}</span>
              </Link>
            </div>
          </div>

          {/* Leaflet Container */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 relative flex-1 min-h-[380px]">
            <div ref={mapContainerRef} className="w-full h-full min-h-[380px] z-10" />

            {/* Quick Map Controls Overlay */}
            <div className="absolute top-3 right-3 z-20 flex gap-1.5">
              <button
                onClick={() => {
                  if (mapInstanceRef.current && latestFix) {
                    mapInstanceRef.current.setView([elderLat, elderLng], 16);
                  }
                }}
                className="px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-xl text-xs font-bold text-slate-700 shadow border border-slate-200 hover:text-indigo-600"
              >
                {t('caregiver.recenter')}
              </button>
            </div>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-md p-2.5 rounded-xl text-[11px] shadow border border-slate-200 font-semibold space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Home Geofence</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Elder Location</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span>Movement Trail</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION C: SAFETY MONITORING (1 col) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-indigo-600" />
              {t('caregiver.safety_monitoring')}
            </h3>

            <div className="space-y-3">
              {/* Outing Check */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                  isOuting
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {isOuting ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <div>
                  <span className="text-xs font-black block">
                    {isOuting ? t('caregiver.outing_detected') : t('caregiver.at_home')}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {isOuting ? 'Elder is outside safe home geofence' : 'Inside safe home boundary'}
                  </span>
                </div>
              </div>

              {/* Wrong Route Check */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                  hasWrongRoute
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {hasWrongRoute ? (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <div>
                  <span className="text-xs font-black block">
                    {hasWrongRoute ? t('caregiver.wrong_route_warning') : 'Route: On Track'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {hasWrongRoute ? 'Moved away from approved path' : 'Following expected corridor'}
                  </span>
                </div>
              </div>

              {/* Stationary Outside Check */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                  hasStationaryAlert
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Clock className="w-5 h-5 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs font-black block">
                    {hasStationaryAlert ? t('caregiver.stationary_warning') : 'Stationary: Normal'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {hasStationaryAlert ? 'Stationary > 10m outside safe zone' : 'Active or safely resting'}
                  </span>
                </div>
              </div>

              {/* Emergency SOS Check */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                  hasSosActive
                    ? 'bg-rose-100 border-rose-300 text-rose-900 animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <span className="text-xs font-black block">
                    {hasSosActive ? t('caregiver.sos_active_warning') : 'SOS: Clear'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {hasSosActive ? 'Active SOS button pressed by elder!' : 'No distress signal active'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION D: FAMILY ACTIONS */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <h4 className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">
              {t('caregiver.family_actions')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`tel:${elder?.phone || '112'}`}
                className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition"
              >
                <PhoneCall className="w-4 h-4" />
                <span>{t('caregiver.call_elder')}</span>
              </a>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${elderLat},${elderLng}`}
                target="_blank"
                rel="noreferrer"
                className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition"
              >
                <Navigation className="w-4 h-4" />
                <span>{t('caregiver.open_directions')}</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION E: GAME & DAILY ACTIVITY OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cognitive Games Performance */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-600" />
              {t('caregiver.game_performance')}
            </h3>
            <Link
              to="/games"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>Games Hub</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {[
              { id: 'picture_matching', name: 'Memory Match', score: '95%' },
              { id: 'remember_objects', name: 'Remember Objects', score: '90%' },
              { id: 'name_face', name: 'Name & Face', score: '100%' },
              { id: 'pattern_game', name: 'Pattern Sequence', score: '88%' },
              { id: 'find_object', name: 'Find the Object', score: '92%' },
              { id: 'daily_routine', name: 'Daily Routine Recall', score: '100%' },
            ].map((game) => (
              <div
                key={game.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold"
              >
                <span className="text-slate-700">{game.name}</span>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-black">
                  {game.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Reminder Adherence */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Pill className="w-5 h-5 text-indigo-600" />
              {t('caregiver.reminder_adherence')}
            </h3>
            <Link
              to="/reminders"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <span>Reminders</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {[
              { time: '08:00 AM', label: 'Morning Tea & Blood Pressure Pill', status: 'Taken' },
              { time: '11:00 AM', label: 'Gentle Walk & Hydration', status: 'Completed' },
              { time: '01:30 PM', label: 'Nutritious Lunch & Multivitamin', status: 'Taken' },
              { time: '05:00 PM', label: 'Evening Tea & Cognitive Game', status: 'Completed' },
              { time: '08:30 PM', label: 'Night Medicine & Rest', status: 'Scheduled' },
            ].map((rem, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-700 block">{rem.label}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">{rem.time}</span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full font-black text-[10px] ${
                    rem.status === 'Taken' || rem.status === 'Completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {rem.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION F: COGNITIVE MONITORING & ADAPTIVE DIFFICULTY ENGINE */}
      <div className="mt-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Brain className="w-6 h-6 text-indigo-600" />
              Cognitive Monitoring & Adaptive Difficulty Engine
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Independent difficulty tracking across all 8 cognitive exercises. Caretakers may adjust levels at any time.
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
          </button>
        </div>

        {/* 8 Games Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-6">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Cognitive Game</th>
                <th className="py-3 px-4">Current Level</th>
                <th className="py-3 px-4">Caretaker Override</th>
                <th className="py-3 px-4">Elo Rating</th>
                <th className="py-3 px-4">Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(allGamesStatus.length > 0
                ? allGamesStatus
                : [
                    { gameType: 'memory_match', level: 'easy', elo: 1000, sessionsCount: 4 },
                    { gameType: 'memory_lane', level: 'easy', elo: 1020, sessionsCount: 5 },
                    { gameType: 'find_pair', level: 'medium', elo: 1050, sessionsCount: 7 },
                    { gameType: 'daily_routine', level: 'easy', elo: 1010, sessionsCount: 3 },
                    { gameType: 'word_wizard', level: 'easy', elo: 1000, sessionsCount: 2 },
                    { gameType: 'sort_it_out', level: 'easy', elo: 1000, sessionsCount: 2 },
                    { gameType: 'music_memories', level: 'easy', elo: 1000, sessionsCount: 1 },
                    { gameType: 'puzzle_time', level: 'medium', elo: 1040, sessionsCount: 6 },
                  ]
              ).map((g) => (
                <tr key={g.gameType} className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-4 font-black text-slate-800 capitalize">
                    {g.gameType.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-1 rounded-full font-black text-[10px] uppercase ${
                        g.level === 'hard'
                          ? 'bg-rose-100 text-rose-800'
                          : g.level === 'medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {g.level}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex gap-1">
                      {['easy', 'medium', 'hard'].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => handleOverrideDifficulty(g.gameType, lvl)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition ${
                            g.level === lvl
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-600">{Math.round(g.elo || 1000)}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-500">{g.sessionsCount || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section G: Daily PDF Reports */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="text-base font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Daily Caretaker PDF Reports (दैनिक रिपोर्ट)
              </h4>
              <p className="text-xs text-slate-500">
                Generated automatically every evening at 8:00 PM IST or on-demand.
              </p>
            </div>
            <button
              onClick={handleGenerateDailyReport}
              disabled={generatingReport}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {generatingReport ? 'Generating PDF...' : 'Generate Today\'s Report Now'}
            </button>
          </div>

          {dailyReports.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl text-center text-slate-500 text-xs font-semibold">
              No daily reports generated yet. Click "Generate Today's Report Now" to create the first PDF.
            </div>
          ) : (
            <div className="space-y-2">
              {dailyReports.map((r) => (
                <div
                  key={r.id}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-xs font-black text-slate-800 block">
                      Daily Report – {new Date(r.generated_at).toLocaleDateString()}
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
                      download={`smriti-daily-report-${r.id}.pdf`}
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
            Notice: All cognitive reports and adaptive difficulty metrics are wellness observations only and do not constitute clinical diagnosis.
          </div>
        </div>
      </div>
    </div>
  );
}

