
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  ShieldAlert,
  Clock,
  RefreshCw,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Smartphone,
  Trash2,
  Download,
  Settings,
  Plus,
  Compass,
  Battery,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';

// Safe zone color mapping
const ZONE_COLORS = {
  home: '#10b981', // emerald
  hospital: '#ef4444', // red
  relative: '#3b82f6', // blue
  temple: '#f59e0b', // amber
  shop: '#8b5cf6', // purple
  other: '#64748b', // slate
};

export default function LiveLocation() {
  const { t, i18n } = useTranslation();
  const { elderId: paramElderId } = useParams();
  const { elder } = useAuth();

  const elderId = paramElderId || elder?.id;
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('24h');
  const [activeTab, setActiveTab] = useState('map'); // 'map', 'alerts', 'zones', 'settings'
  const [ackedAlerts, setAckedAlerts] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Map DOM reference
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  const fetchDashboard = async () => {
    if (!elderId) return;
    try {
      const resp = await fetch(`/api/location/dashboard?elderId=${elderId}&timeframe=${timeframe}`);
      if (resp.ok) {
        const json = await resp.json();
        setDashboardData(json);
      }
    } catch (err) {
      console.warn('[LiveLocation] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000); // 10s poll / live updates
    return () => clearInterval(interval);
  }, [elderId, timeframe]);

  // Leaflet Map Initialization and Layer Updating
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Initialize map
      const map = L.map(mapContainerRef.current).setView([26.1755, 91.7580], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layers = layerGroupRef.current;
    layers.clearLayers();

    if (!dashboardData) return;

    const bounds = L.latLngBounds([]);

    // 1. Draw Safe Zones (colored circles by type)
    (dashboardData.safeZones || []).forEach((zone) => {
      const zLat = parseFloat(zone.lat || zone.latitude);
      const zLng = parseFloat(zone.lng || zone.longitude);
      const color = ZONE_COLORS[zone.type] || ZONE_COLORS.other;

      const circle = L.circle([zLat, zLng], {
        radius: zone.radius_m || 150,
        color: color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(layers);

      circle.bindPopup(`<b>${zone.name}</b><br/>Type: ${zone.type}<br/>Radius: ${zone.radius_m}m`);
      bounds.extend([zLat, zLng]);
    });

    // 2. Draw Approved Routes
    (dashboardData.approvedRoutes || []).forEach((route) => {
      const coords = route.path_geojson?.coordinates || route.path_geojson;
      if (Array.isArray(coords) && coords.length > 0) {
        // GeoJSON uses [lng, lat]
        const latLngs = coords.map((c) => [c[1], c[0]]);
        const polyline = L.polyline(latLngs, {
          color: '#6366f1',
          weight: 4,
          dashArray: '5, 8',
        }).addTo(layers);
        polyline.bindPopup(`<b>${route.name}</b><br/>Corridor: ${route.corridor_m}m`);
      }
    });

    // 3. Draw History Trail (colored by time)
    const trail = dashboardData.trail || [];
    if (trail.length > 1) {
      const trailPoints = [];
      trail.forEach((point) => {
        const pLat = parseFloat(point.lat || point.latitude);
        const pLng = parseFloat(point.lng || point.longitude);
        trailPoints.push([pLat, pLng]);
        bounds.extend([pLat, pLng]);
      });

      L.polyline(trailPoints, {
        color: '#f97316', // Orange trail
        weight: 3,
        opacity: 0.65,
      }).addTo(layers);
    }

    // 4. Draw Latest Fix & Accuracy Circle
    const latest = dashboardData.latestSample;
    if (latest) {
      const lat = parseFloat(latest.lat || latest.latitude);
      const lng = parseFloat(latest.lng || latest.longitude);
      const acc = parseFloat(latest.accuracy_m || latest.accuracy || 15);

      // Accuracy circle
      L.circle([lat, lng], {
        radius: acc,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(layers);

      // Pulse Marker
      const elderIcon = L.divIcon({
        className: 'custom-elder-pin',
        html: `
          <div style="position:relative; width:28px; height:28px;">
            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:#2563eb; opacity:0.75; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:absolute; width:20px; height:20px; top:4px; left:4px; border-radius:50%; background:#1d4ed8; border:3px solid #ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.3);"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon: elderIcon }).addTo(layers);
      marker.bindPopup(
        `<b>${dashboardData.elder?.name || 'Elder'}</b><br/>Accuracy: ±${acc}m<br/>Source: ${latest.source || 'gps'}`
      );
      bounds.extend([lat, lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [dashboardData]);

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      const resp = await fetch(`/api/location/alerts/${alertId}/ack`, {
        method: 'POST',
      });
      if (resp.ok) {
        setAckedAlerts((prev) => new Set([...prev, alertId]));
        fetchDashboard();
      }
    } catch (e) {
      console.warn('[Alert] Ack error:', e);
    }
  };

  const handleDeleteHistory = async () => {
    if (!window.confirm(t('location.confirm_delete_history', 'Are you sure you want to delete all stored location history for this elder? This action cannot be undone.'))) {
      return;
    }
    setIsDeleting(true);
    try {
      const resp = await fetch('/api/location/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elderId }),
      });
      if (resp.ok) {
        alert(t('location.history_deleted', 'Location history deleted successfully.'));
        fetchDashboard();
      }
    } catch (err) {
      console.warn('Delete history failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRevokeConsent = async () => {
    if (!window.confirm(t('location.confirm_revoke', 'Revoking consent will stop all location collection immediately. Continue?'))) {
      return;
    }
    try {
      const resp = await fetch('/api/location/consent/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elderId }),
      });
      if (resp.ok) {
        fetchDashboard();
      }
    } catch (err) {
      console.warn('Revoke consent failed:', err);
    }
  };

  // Determine State Chip
  let stateLabel = t('location.state_safe_zone', 'In Safe Zone');
  let stateClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  const latestAlert = dashboardData?.alerts?.[0];

  if (latestAlert?.severity === 'urgent' || latestAlert?.kind === 'escalated') {
    stateLabel = t('location.state_unusual', 'Unusual (Help Requested / No Answer)');
    stateClass = 'bg-red-100 text-red-800 border-red-300';
  } else if (latestAlert?.severity === 'attention') {
    stateLabel = t('location.state_away', 'Away from Safe Zones');
    stateClass = 'bg-amber-100 text-amber-800 border-amber-300';
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-32 space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
              {dashboardData?.elder?.name || 'Elder'}'s {t('location.title', 'Location Guardian')}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${stateClass}`}>
              {stateLabel}
            </span>
          </div>

          {/* Stale Badge & Last Updated */}
          <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>
              {dashboardData?.diffMinutes !== null
                ? t('location.last_updated_min', 'Updated {{count}} min ago', { count: dashboardData?.diffMinutes || 0 })
                : t('location.never_updated', 'No location fix recorded yet')}
            </span>

            {dashboardData?.isStale && (
              <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-md text-xs font-black tracking-wide uppercase shadow-sm">
                STALE
              </span>
            )}

            {dashboardData?.latestSample?.source === 'simulated' && (
              <span className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold uppercase tracking-wider">
                SIMULATED
              </span>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl self-stretch md:self-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'map' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('location.tab_map', 'Live Map')}
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition relative ${
              activeTab === 'alerts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('location.tab_alerts', 'Alerts & Checks')}
            {dashboardData?.alerts?.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                {dashboardData.alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('location.tab_settings', 'Settings & Privacy')}
          </button>
        </div>
      </div>

      {/* Main Tab 1: Map View */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          {/* Map Controls Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            {/* Timeframe selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">{t('location.trail_history', 'Trail')}:</span>
              {['6h', '24h', '7d'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    timeframe === tf ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tf === '6h' ? '6 Hours' : tf === '24h' ? '24 Hours' : '7 Days'}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchDashboard}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('location.refresh', 'Refresh')}</span>
            </button>
          </div>

          {/* Leaflet Map Container */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
            <div ref={mapContainerRef} className="w-full h-[520px] z-10" />

            {/* Map Legend */}
            <div className="absolute bottom-4 left-4 z-20 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-slate-200 text-xs space-y-1.5 pointer-events-auto">
              <div className="font-bold text-slate-700 mb-1">{t('location.legend', 'Safe Zone Legend')}:</div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>Home (150m)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Relative (150m)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span>Hospital (200m)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span>Temple (150m)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500" />
                <span>Shop (100m)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 2: Alerts & Checks */}
      {activeTab === 'alerts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Active Alerts */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600" />
              <span>{t('location.alerts_list', 'Caregiver Notifications')}</span>
            </h2>

            {(!dashboardData?.alerts || dashboardData.alerts.length === 0) && (
              <div className="p-8 bg-white rounded-2xl border text-center text-slate-500 text-sm">
                {t('location.no_alerts', 'No active alerts. Elder is safe.')}
              </div>
            )}

            {(dashboardData?.alerts || []).map((alert) => (
              <div
                key={alert.id}
                className={`p-5 rounded-2xl border shadow-sm ${
                  alert.severity === 'urgent'
                    ? 'bg-red-50/70 border-red-200'
                    : alert.severity === 'attention'
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                        alert.severity === 'urgent'
                          ? 'bg-red-600 text-white'
                          : alert.severity === 'attention'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-600 text-white'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <p className="font-semibold text-slate-800 mt-2">{alert.message}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(alert.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>

                  {alert.map_link && (
                    <a
                      href={alert.map_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-indigo-600 hover:bg-slate-50 shrink-0"
                    >
                      Map
                    </a>
                  )}
                </div>

                {/* Acknowledgement Button */}
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-xs text-slate-600">
                    Elder response: <b>{alert.elder_responded || 'No response'}</b>
                  </span>

                  {!alert.acknowledged_by && !ackedAlerts.has(alert.id) ? (
                    <button
                      onClick={() => handleAcknowledgeAlert(alert.id)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>{t('location.ack_button', "I got it, I'm calling now")}</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Acknowledged</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Safety Check State Machine Timeline */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <span>{t('location.check_timeline', 'Voice Safety Check Timeline')}</span>
            </h2>

            {(!dashboardData?.safetyChecks || dashboardData.safetyChecks.length === 0) && (
              <div className="p-8 bg-white rounded-2xl border text-center text-slate-500 text-sm">
                {t('location.no_checks', 'No safety checks triggered recently.')}
              </div>
            )}

            {(dashboardData?.safetyChecks || []).map((check) => {
              const prompts = Array.isArray(check.prompts) ? check.prompts : [];
              return (
                <div key={check.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Check: {check.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(check.started_at).toLocaleTimeString('en-IN')}
                    </span>
                  </div>

                  {/* Prompts attempts progression */}
                  <div className="space-y-2">
                    {prompts.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                        <span>Attempt {p.attempt}</span>
                        <span>
                          Answer: <b>{p.answer}</b> ({p.method})
                        </span>
                        <span className="text-slate-400">
                          {p.asked_at ? new Date(p.asked_at).toLocaleTimeString('en-IN') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Tab 3: Settings & Privacy */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Section 9: Honest Web/Native Limitations Card */}
          <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-3xl p-6 md:p-8 space-y-3">
            <div className="flex items-center gap-3 text-indigo-900">
              <Smartphone className="w-6 h-6 text-indigo-600 shrink-0" />
              <h3 className="text-lg font-bold">
                {t('location.background_limits_title', 'How Location Tracking Works on Phones')}
              </h3>
            </div>
            <p className="text-sm text-indigo-950/80 leading-relaxed">
              {t(
                'location.background_limits_desc',
                'A web app or PWA gets GPS positions only while it is open. For the most reliable tracking, install the app to the phone Home Screen and keep the screen awake with Guardian mode. When the phone is locked or the browser is minimized, Android and iOS stop timers and location fixes. For guaranteed 24/7 background tracking with the phone locked, install our native Android companion app with background location permissions.'
              )}
            </p>
          </div>

          {/* Privacy & Consent Controls */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-800">
              {t('location.privacy_settings', 'Privacy & Data Controls')}
            </h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-2xl gap-3">
              <div>
                <p className="font-semibold text-slate-800">{t('location.consent_status', 'Consent Status')}</p>
                <p className="text-xs text-slate-500">
                  {dashboardData?.hasConsent
                    ? t('location.consent_active', 'Active: location sharing permitted by elder.')
                    : t('location.consent_inactive', 'Inactive or revoked: no GPS collection.')}
                </p>
              </div>

              {dashboardData?.hasConsent && (
                <button
                  onClick={handleRevokeConsent}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition border border-red-200"
                >
                  {t('location.revoke_button', 'Revoke Consent')}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
              <a
                href={`/api/location/history/download?elderId=${elderId}`}
                download
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                <span>{t('location.download_history', 'Download My Location Data (JSON)')}</span>
              </a>

              <button
                onClick={handleDeleteHistory}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('location.delete_history', 'Delete Location History')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
