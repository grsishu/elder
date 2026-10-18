import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Database,
  PhoneCall,
  Volume2,
  MapPin,
  Bell,
  AlertTriangle,
  RefreshCw,
  Send,
  Sliders,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import {
  getCurrentLocation,
  isSecureContext,
  getPermissionStatus,
  getSimulatedLocation,
  setSimulatedLocation,
} from '../utils/location';
import { speak, getLoadedVoices, hasVoiceForLanguage } from '../utils/voice';

export default function Diagnostics() {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState(null);

  // Test OTP state
  const [testPhone, setTestPhone] = useState('+919876543210');
  const [testOtpLoading, setTestOtpLoading] = useState(false);
  const [testOtpResult, setTestOtpResult] = useState(null);

  // Location test state
  const [locState, setLocState] = useState({
    secure: isSecureContext(),
    permission: 'unknown',
    currentFix: null,
    testing: false,
    error: null,
  });

  // Simulated location inputs (Guwahati default)
  const [simLat, setSimLat] = useState('26.1445');
  const [simLng, setSimLng] = useState('91.7362');
  const [simActive, setSimActive] = useState(Boolean(getSimulatedLocation()));

  // Voice test state
  const [voices, setVoices] = useState([]);
  const [testSpeechText, setTestSpeechText] = useState(
    'नमस्कार। यह स्मृति साथी की आवाज की जांच है।'
  );

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/diagnostics/status');
      const data = await resp.json();
      setStatusData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Check location permission state
    getPermissionStatus().then((perm) => {
      setLocState((prev) => ({ ...prev, permission: perm }));
    });

    // Load available voices
    const v = getLoadedVoices();
    setVoices(v);
  }, []);

  const handleTestOtp = async () => {
    setTestOtpLoading(true);
    setTestOtpResult(null);
    try {
      const resp = await fetch('/api/diagnostics/test-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone }),
      });
      const data = await resp.json();
      setTestOtpResult(data);
    } catch (err) {
      setTestOtpResult({ success: false, error: err.message });
    } finally {
      setTestOtpLoading(false);
    }
  };

  const handleTestLocation = async () => {
    setLocState((prev) => ({ ...prev, testing: true, error: null }));
    try {
      const fix = await getCurrentLocation();
      setLocState((prev) => ({
        ...prev,
        currentFix: fix,
        testing: false,
      }));
    } catch (err) {
      setLocState((prev) => ({
        ...prev,
        testing: false,
        error: err.message || 'Location error',
      }));
    }
  };

  const handleApplySimLocation = () => {
    const lat = parseFloat(simLat);
    const lng = parseFloat(simLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setSimulatedLocation({ latitude: lat, longitude: lng, accuracy: 10 });
      setSimActive(true);
    }
  };

  const handleClearSimLocation = () => {
    setSimulatedLocation(null);
    setSimActive(false);
  };

  const handleTestSpeech = () => {
    speak(testSpeechText, { lang: i18n.language });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <span>{t('diagnostics.title')}</span>
          </h1>
          <p className="text-slate-600 text-sm mt-1">{t('diagnostics.subtitle')}</p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="btn-elder px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-2xl flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 rounded-2xl text-red-700 font-bold">
          {error}
        </div>
      )}

      {/* Grid of Diagnostics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Database Status */}
        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900">
              <Database className="w-6 h-6 text-emerald-600" />
              <span>{t('diagnostics.db_card')}</span>
            </div>
            {statusData?.database?.connected ? (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> CONNECTED
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-xl text-xs font-black flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> DISCONNECTED
              </span>
            )}
          </div>
          <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-3 rounded-2xl">
            <div>URL: {statusData?.databaseUrlMasked || 'N/A'}</div>
            <div>Version: {statusData?.database?.version || 'Unknown'}</div>
            <div>Active Connections: {statusData?.database?.totalConnections ?? 0}</div>
            <div className="pt-1 text-slate-800 font-semibold">
              Records: Elders ({statusData?.counts?.elders ?? 0}), Users ({statusData?.counts?.users ?? 0}), Places ({statusData?.counts?.places ?? 0}), Medicines ({statusData?.counts?.medicines ?? 0})
            </div>
          </div>
        </div>

        {/* 2. OTP & Twilio Provider Status */}
        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900">
              <PhoneCall className="w-6 h-6 text-amber-600" />
              <span>{t('diagnostics.otp_card')}</span>
            </div>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-black ${
                statusData?.otpProvider?.mode === 'DEMO'
                  ? 'bg-yellow-200 text-yellow-900'
                  : 'bg-blue-100 text-blue-900'
              }`}
            >
              MODE: {statusData?.otpProvider?.mode || 'DEMO'}
            </span>
          </div>

          <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-3 rounded-2xl">
            <div>Twilio Configured: {statusData?.otpProvider?.twilioConfigured ? 'YES' : 'NO (Demo Mode Active)'}</div>
            <div>Account SID: {statusData?.otpProvider?.accountSidMasked || 'Not set'}</div>
            <div>Verify SID: {statusData?.otpProvider?.verifySidMasked || 'Not set'}</div>
            {statusData?.otpProvider?.lastError && (
              <div className="text-red-600 font-bold">
                Last Provider Error: {JSON.stringify(statusData.otpProvider.lastError.message)}
              </div>
            )}
          </div>

          {/* Test OTP form */}
          <div className="pt-2 border-t space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              {t('diagnostics.test_otp_title')}
            </label>
            <div className="flex gap-2">
              <input
                id="test-otp-phone-input"
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+919876543210"
                className="flex-1 px-3 py-2 text-sm rounded-xl border font-bold text-slate-800"
              />
              <button
                id="test-otp-submit-btn"
                onClick={handleTestOtp}
                disabled={testOtpLoading}
                className="btn-elder px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 min-h-[44px]"
              >
                {testOtpLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="ml-1">{t('diagnostics.test_otp_btn')}</span>
              </button>
            </div>

            {testOtpResult && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  testOtpResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-red-50 text-red-800 border border-red-300'
                }`}
              >
                <div>Result: {testOtpResult.success ? 'SUCCESS' : 'FAILED'} (Mode: {testOtpResult.mode})</div>
                <div>{testOtpResult.userMessage || testOtpResult.message || testOtpResult.error}</div>
                {testOtpResult.providerError && (
                  <div className="text-red-700 mt-1 font-mono">Raw Provider Error: {testOtpResult.providerError}</div>
                )}
                {testOtpResult.demoCode && (
                  <div className="text-amber-800 text-sm mt-1">Generated Code: {testOtpResult.demoCode}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Location & GPS Service */}
        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900">
              <MapPin className="w-6 h-6 text-rose-600" />
              <span>{t('diagnostics.location_card')}</span>
            </div>
            {simActive ? (
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-xl text-xs font-black">
                GPS SIMULATED
              </span>
            ) : locState.secure ? (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black">
                SECURE CONTEXT
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-xl text-xs font-black">
                INSECURE
              </span>
            )}
          </div>

          <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-3 rounded-2xl">
            <div>Secure Context (HTTPS/localhost): {locState.secure ? 'YES' : 'NO'}</div>
            <div>Browser Permission: {locState.permission.toUpperCase()}</div>
            {locState.currentFix && (
              <div className="text-emerald-700 font-bold">
                Last Fix: Lat {locState.currentFix.latitude.toFixed(5)}, Lng {locState.currentFix.longitude.toFixed(5)} (Acc: {locState.currentFix.accuracy}m) {locState.currentFix.simulated ? '[SIMULATED]' : ''}
              </div>
            )}
            {locState.error && <div className="text-red-600 font-bold">Error: {locState.error}</div>}
          </div>

          <button
            id="test-location-btn"
            onClick={handleTestLocation}
            disabled={locState.testing}
            className="w-full btn-elder bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-sm min-h-[48px] flex items-center justify-center gap-2"
          >
            {locState.testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            <span>Test My Location Fix</span>
          </button>

          {/* Simulate Location Override for Demo Mode */}
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>{t('diagnostics.simulate_gps_title')}</span>
              {simActive && (
                <button
                  onClick={handleClearSimLocation}
                  className="text-red-600 hover:underline text-xs"
                >
                  Clear Mock
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={simLat}
                onChange={(e) => setSimLat(e.target.value)}
                placeholder="Latitude"
                className="px-2 py-1.5 text-xs rounded-xl border font-mono"
              />
              <input
                type="text"
                value={simLng}
                onChange={(e) => setSimLng(e.target.value)}
                placeholder="Longitude"
                className="px-2 py-1.5 text-xs rounded-xl border font-mono"
              />
            </div>
            <button
              id="apply-mock-gps-btn"
              onClick={handleApplySimLocation}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
            >
              {t('diagnostics.apply_simulation')}
            </button>
          </div>
        </div>

        {/* 4. Voice Synthesizer Status */}
        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900">
              <Volume2 className="w-6 h-6 text-violet-600" />
              <span>{t('diagnostics.voice_card')}</span>
            </div>
            <span className="px-3 py-1 bg-violet-100 text-violet-900 rounded-xl text-xs font-black">
              LANG: {i18n.language.toUpperCase()}
            </span>
          </div>

          <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-3 rounded-2xl">
            <div>Loaded Voices: {voices.length}</div>
            <div>Has Voice for Language ({i18n.language}): {hasVoiceForLanguage(i18n.language) ? 'YES' : 'NO (Fallback Audio/TTS)'}</div>
            <div>Default Voice Speed: 0.65 (Slow)</div>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={testSpeechText}
              onChange={(e) => setTestSpeechText(e.target.value)}
              className="w-full p-2 text-xs rounded-xl border font-bold text-slate-800"
            />
            <button
              id="test-voice-btn"
              onClick={handleTestSpeech}
              className="w-full btn-elder bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-bold text-sm min-h-[48px] flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              <span>Speak Test Text Aloud</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Last 20 Server Errors */}
      <div className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-rose-600" />
          <span>{t('diagnostics.recent_errors')}</span>
        </h2>

        {statusData?.recentErrors?.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {statusData.recentErrors.map((err) => (
              <div
                key={err.id}
                className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs font-mono space-y-1"
              >
                <div className="flex justify-between text-red-900 font-bold">
                  <span>[{err.statusCode}] {err.route}</span>
                  <span className="text-slate-500 font-normal">{new Date(err.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-red-700">{err.message}</div>
                {err.stack && <pre className="text-[10px] text-slate-500 overflow-x-auto">{err.stack}</pre>}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-2xl text-center text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{t('diagnostics.no_errors')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
