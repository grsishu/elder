import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Compass,
  Home,
  MapPin,
  Volume2,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  PhoneCall,
  RefreshCw,
  XCircle,
  HelpCircle,
  Mic,
  MicOff,
  Award,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCurrentLocation } from '../utils/location';
import { speak, cancelSpeech } from '../utils/voice';
import {
  listenForNavigationCommand,
  classifyVoiceIntent,
  ACTION_INTENTS,
} from '../utils/navigationVoiceAI';

// Default destination categories with elderly-friendly icons and emojis
const DEFAULT_DESTINATIONS = [
  { id: 'home', place_type: 'home', category: 'home', nameKey: 'navigation.destination_home', emoji: '🏠', icon: Home },
  { id: 'hospital', place_type: 'hospital', category: 'hospital', nameKey: 'navigation.destination_hospital', emoji: '🏥', icon: MapPin },
  { id: 'clinic', place_type: 'clinic', category: 'doctor_clinic', nameKey: 'navigation.doctor_clinic', emoji: '🩺', icon: MapPin },
  { id: 'son', place_type: 'relative', category: 'family', nameKey: 'navigation.destination_son', emoji: '👨‍👦', icon: MapPin },
  { id: 'daughter', place_type: 'relative', category: 'family', nameKey: 'navigation.destination_daughter', emoji: '👧', icon: MapPin },
  { id: 'temple', place_type: 'temple', category: 'community', nameKey: 'navigation.destination_temple', emoji: '🛕', icon: MapPin },
  { id: 'market', place_type: 'shop', category: 'shop', nameKey: 'navigation.destination_market', emoji: '🛒', icon: MapPin },
];

export default function SafeHome() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Navigation state
  const [viewMode, setViewMode] = useState('guided'); // 'guided' | 'map'
  const [loading, setLoading] = useState(false);
  const [currentPos, setCurrentPos] = useState(null);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [familyInformed, setFamilyInformed] = useState(false);
  const [isArrived, setIsArrived] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Voice recognition state
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Modals & alerts
  const [wrongRouteModal, setWrongRouteModal] = useState(false);
  const [lostModal, setLostModal] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // Leaflet map refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef(null);

  // 1. Fetch saved destinations from backend on mount
  useEffect(() => {
    fetch('/api/navigation/destinations', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d) => {
        if (d.places && d.places.length > 0) {
          setSavedPlaces(d.places);
        }
      })
      .catch((err) => console.warn('Destinations fetch fallback:', err.message));
  }, []);

  // 2. Fetch current GPS location on mount
  useEffect(() => {
    getCurrentLocation()
      .then((pos) => setCurrentPos(pos))
      .catch((err) => console.warn('Initial GPS fetch notice:', err.message));
  }, []);

  // 3. Leaflet map lifecycle
  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([26.1755, 91.758], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();

    const bounds = L.latLngBounds([]);

    // Elder Live Position Marker
    if (currentPos) {
      const elderIcon = L.divIcon({
        className: 'elder-live-pulse-marker',
        html: `
          <div style="position:relative; width:36px; height:36px;">
            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:#4f46e5; opacity:0.4; animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:absolute; width:26px; height:26px; top:5px; left:5px; border-radius:50%; background:#4338ca; border:3px solid #ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:bold;">
              🚶
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker([currentPos.latitude, currentPos.longitude], { icon: elderIcon }).addTo(layers);
      bounds.extend([currentPos.latitude, currentPos.longitude]);
    }

    // Destination Marker
    if (routeData?.destination) {
      const destLat = parseFloat(routeData.destination.latitude);
      const destLng = parseFloat(routeData.destination.longitude);

      const destIcon = L.divIcon({
        className: 'dest-marker',
        html: `
          <div style="background:#10b981; color:#ffffff; width:38px; height:38px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; font-size:20px;">
            🏁
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      L.marker([destLat, destLng], { icon: destIcon }).addTo(layers);
      bounds.extend([destLat, destLng]);
    }

    // Route Polyline
    if (routeData?.geometry?.coordinates) {
      const latLngs = routeData.geometry.coordinates.map((coord) => [coord[1], coord[0]]);
      L.polyline(latLngs, {
        color: '#4f46e5',
        weight: 6,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [viewMode, currentPos, routeData]);

  // 4. Autonomous 5-minute Route Deviation Monitoring
  useEffect(() => {
    if (!routeData) return;

    const interval = setInterval(async () => {
      if (Date.now() < cooldownUntil || isArrived) return;

      try {
        const freshPos = await getCurrentLocation();
        setCurrentPos(freshPos);

        const compResp = await fetch('/api/location/public-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            latitude: freshPos.latitude,
            longitude: freshPos.longitude,
            accuracy: freshPos.accuracy || 15,
            intendedRoute: routeData.geometry || null,
          }),
        });

        if (compResp.ok) {
          const evalResult = await compResp.json();
          if (evalResult.decision === 'wrong_route' || evalResult.isDeviated) {
            triggerWrongRouteAlert();
          }
        }
      } catch (err) {
        console.warn('Periodic route comparison check:', err.message);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [routeData, cooldownUntil, isArrived]);

  // Clean speech when unmounting
  useEffect(() => {
    return () => {
      cancelSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  // Destination Selection & Prompt Confirmation
  const handleSelectDestination = (place) => {
    setSelectedPlace(place);
    setConfirmModal(true);

    const destName = place.nameKey ? t(place.nameKey) : place.name;
    const promptText = t('navigation.shall_i_guide', { destination: destName });

    speak(promptText, {
      lang: i18n.language,
      rate: 0.65,
    });
  };

  // Start Navigation Route Calculation
  const startNavigation = async (place = selectedPlace, isRecalc = false) => {
    setLoading(true);
    setConfirmModal(false);
    setStatusMessage(t('navigation.calculating_route'));

    try {
      const pos = await getCurrentLocation();
      setCurrentPos(pos);

      const targetPlace = place || savedPlaces[0] || DEFAULT_DESTINATIONS[0];
      const destPlaceId = targetPlace.id && targetPlace.id.length > 10 ? targetPlace.id : null;

      const resp = await fetch('/api/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          latitude: pos.latitude,
          longitude: pos.longitude,
          destinationPlaceId: destPlaceId,
          lang: i18n.language,
        }),
      });

      if (!resp.ok) {
        throw new Error('Failed to calculate navigation route');
      }

      const data = await resp.json();
      setRouteData(data);
      setCurrentStepIdx(0);
      setIsArrived(false);
      setViewMode('guided');

      // Create Navigation Session in backend
      let newSessionId = null;
      try {
        const sessResp = await fetch('/api/navigation/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            destinationId: data.destination?.id,
            destinationName: data.destination?.name || targetPlace.nameKey ? t(targetPlace.nameKey) : targetPlace.name,
            destinationAddress: data.destination?.address || '',
            destinationLat: data.destination?.latitude,
            destinationLng: data.destination?.longitude,
            startLat: pos.latitude,
            startLng: pos.longitude,
            totalSteps: data.steps?.length || 1,
            totalDistanceM: data.totalDistanceM || 0,
            language: i18n.language,
          }),
        });

        if (sessResp.ok) {
          const sessData = await sessResp.json();
          newSessionId = sessData.session?.id;
          setSessionId(newSessionId);
        }
      } catch (sessErr) {
        console.warn('Navigation session create notice:', sessErr.message);
      }

      // Automatically inform emergency family contact
      notifyFamily(newSessionId, data.destination?.name || targetPlace.name || 'Destination', pos);

      // Speak initial instruction
      const firstInstruction = data.steps?.[0]?.instruction || t('navigation.walk_straight');
      speak(firstInstruction, {
        lang: i18n.language,
        rate: 0.65,
      });
    } catch (err) {
      console.warn('[SafeHome] Route calculation error:', err.message);
      setStatusMessage(t('navigation.offline_notice'));
    } finally {
      setLoading(false);
    }
  };

  // Notify Family Workflow
  const notifyFamily = async (sessId, destName, pos) => {
    try {
      const resp = await fetch('/api/navigation/notify-family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: sessId || sessionId,
          destinationName: destName,
          latitude: pos?.latitude || currentPos?.latitude || 0,
          longitude: pos?.longitude || currentPos?.longitude || 0,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.familyInformed) {
          setFamilyInformed(true);
        }
      }
    } catch (e) {
      console.warn('Family notification notice:', e.message);
    }
  };

  // Spoken Step Repeating ("Listen Again" button - does NOT advance step or recalculate)
  const handleListenAgain = () => {
    const steps = routeData?.steps || [];
    const currentStep = steps[currentStepIdx];
    if (currentStep) {
      speak(currentStep.instruction, {
        lang: i18n.language,
        rate: 0.65,
      });

      // Audit log event
      if (sessionId) {
        fetch(`/api/navigation/session/${sessionId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            stepIndex: currentStepIdx,
            eventType: 'listen_again',
          }),
        }).catch(() => {});
      }
    }
  };

  // Next Step Advancement ("Next Step" button)
  const handleNextStep = () => {
    const steps = routeData?.steps || [];
    if (currentStepIdx < steps.length - 1) {
      const nextIdx = currentStepIdx + 1;
      setCurrentStepIdx(nextIdx);

      // Remaining distance estimation
      const remainingDistance = steps
        .slice(nextIdx)
        .reduce((sum, s) => sum + (s.distanceM || 0), 0);

      // Speak next instruction automatically
      const nextStep = steps[nextIdx];
      if (nextStep) {
        speak(nextStep.instruction, {
          lang: i18n.language,
          rate: 0.65,
        });
      }

      // Persist step progress to backend
      if (sessionId) {
        fetch(`/api/navigation/session/${sessionId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            stepIndex: nextIdx,
            remainingDistanceM: remainingDistance,
            eventType: 'step_advanced',
          }),
        }).catch(() => {});
      }
    } else {
      // Arrived at destination
      handleArrival();
    }
  };

  // Arrival Confirmation
  const handleArrival = () => {
    setIsArrived(true);
    speak(t('navigation.arrived'), {
      lang: i18n.language,
      rate: 0.65,
    });

    if (sessionId) {
      fetch(`/api/navigation/session/${sessionId}/complete`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
  };

  // Stop Navigation
  const handleStopNavigation = () => {
    cancelSpeech();
    setRouteData(null);
    setSelectedPlace(null);
    setCurrentStepIdx(0);
    setIsArrived(false);
  };

  // Trigger Wrong-Route Checkin
  const triggerWrongRouteAlert = () => {
    setWrongRouteModal(true);
    speak(t('navigation.wrong_route_prompt'), {
      lang: i18n.language,
      rate: 0.65,
    });
  };

  // Voice Listening Interaction
  const toggleVoiceListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    setIsListening(true);
    setVoiceTranscript('');

    const rec = listenForNavigationCommand({
      lang: i18n.language,
      onTranscript: (txt) => setVoiceTranscript(txt),
      onIntentDetected: (intent) => {
        setIsListening(false);
        handleVoiceIntent(intent);
      },
      onError: (err) => {
        console.warn('Voice recognition error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    recognitionRef.current = rec;
  };

  // Handle Recognized Voice Intent across all 13 languages
  const handleVoiceIntent = (intent) => {
    switch (intent) {
      case ACTION_INTENTS.LOST_REQUEST:
        setLostModal(true);
        speak(t('navigation.are_you_lost'), { lang: i18n.language, rate: 0.65 });
        break;
      case ACTION_INTENTS.REPEAT_INSTRUCTION:
        handleListenAgain();
        break;
      case ACTION_INTENTS.NEXT_INSTRUCTION:
        handleNextStep();
        break;
      case ACTION_INTENTS.STOP_NAVIGATION:
        handleStopNavigation();
        break;
      case ACTION_INTENTS.CHANGE_DESTINATION:
        handleStopNavigation();
        break;
      case ACTION_INTENTS.CALL_FAMILY:
        navigate('/sos');
        break;
      case ACTION_INTENTS.CONFIRM_YES:
        if (wrongRouteModal) {
          setWrongRouteModal(false);
          startNavigation(selectedPlace, true);
        } else if (lostModal) {
          setLostModal(false);
          startNavigation(savedPlaces[0] || DEFAULT_DESTINATIONS[0]);
        } else if (confirmModal) {
          startNavigation(selectedPlace);
        }
        break;
      case ACTION_INTENTS.CONFIRM_NO:
        if (wrongRouteModal) {
          setWrongRouteModal(false);
          setCooldownUntil(Date.now() + 15 * 60 * 1000);
        }
        if (lostModal) setLostModal(false);
        if (confirmModal) setConfirmModal(false);
        break;
      default:
        break;
    }
  };

  // Current Step and Remaining Distance Calculation
  const currentStep = routeData?.steps?.[currentStepIdx];
  const steps = routeData?.steps || [];
  const remainingDistanceM = steps
    .slice(currentStepIdx)
    .reduce((sum, s) => sum + (s.distanceM || 0), 0);

  // Destination Display Name and Emoji
  const currentDestName =
    routeData?.destination?.name ||
    (selectedPlace?.nameKey ? t(selectedPlace.nameKey) : selectedPlace?.name) ||
    t('navigation.destination_home');

  const currentDestEmoji = selectedPlace?.emoji || '🏠';

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-slate-800 flex flex-col justify-between">
      {/* Top Bar */}
      <header className="px-4 py-3 sm:py-4 border-b border-amber-100 bg-[#FBF8F3]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          {/* Back Button */}
          <button
            onClick={() => {
              if (routeData) {
                handleStopNavigation();
              } else {
                navigate('/');
              }
            }}
            className="p-3 bg-white text-slate-700 hover:text-slate-900 rounded-2xl shadow-sm border border-slate-200 transition active:scale-95 flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          {/* Center Title or Family Informed Badge */}
          <div className="flex-1 flex justify-center">
            {familyInformed ? (
              <div
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-xs sm:text-sm font-bold shadow-sm"
                title="Family members have received live SMS alert"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="truncate">{t('navigation.family_informed')}</span>
              </div>
            ) : (
              <h1 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-1.5 truncate">
                <Compass className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span>{t('navigation.title')}</span>
              </h1>
            )}
          </div>

          {/* Right Actions: Voice Mic & Lost Check */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoiceListening}
              className={`p-3 rounded-2xl border transition active:scale-95 flex items-center justify-center shadow-sm ${
                isListening
                  ? 'bg-rose-500 border-rose-600 text-white animate-pulse'
                  : 'bg-white border-slate-200 text-indigo-600 hover:bg-indigo-50'
              }`}
              title={isListening ? 'Listening...' : 'Speak Voice Command'}
            >
              {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>

            <button
              onClick={() => {
                setLostModal(true);
                speak(t('navigation.are_you_lost'), { lang: i18n.language, rate: 0.65 });
              }}
              className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-2xl transition active:scale-95 shadow-sm"
              title={t('navigation.lost_prompt')}
            >
              <HelpCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Live Voice Transcript Toast */}
        {isListening && (
          <div className="max-w-xl mx-auto mt-2 text-center">
            <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-900 text-xs font-bold rounded-full animate-pulse">
              🎙️ {voiceTranscript || t('navigation.voice_listening')}
            </span>
          </div>
        )}
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-4 sm:py-6 flex flex-col justify-center">
        {loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-black text-slate-800">{t('navigation.calculating_route')}</p>
          </div>
        )}

        {/* ARRIVAL STATE SCREEN */}
        {!loading && isArrived && (
          <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-xl border-2 border-emerald-300 text-center animate-fade-in">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-inner">
              <Award className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">
              {t('navigation.navigation_completed')}
            </h2>
            <p className="text-lg font-bold text-slate-600 mb-6">
              {t('navigation.arrived')}
            </p>

            <div className="space-y-3">
              <a
                href="tel:112"
                className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-black shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
              >
                <PhoneCall className="w-6 h-6" />
                <span>{t('navigation.call_family_shortcut')}</span>
              </a>

              <button
                onClick={handleStopNavigation}
                className="w-full py-4 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-base font-bold transition active:scale-95"
              >
                {t('navigation.title')}
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE NAVIGATION: GUIDED VIEW (Primary Interface matching screenshot) */}
        {!loading && routeData && !isArrived && viewMode === 'guided' && currentStep && (
          <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-xl border-2 border-indigo-200/80 text-center relative overflow-hidden flex flex-col justify-between">
            {/* Destination Icon in Soft Rounded Circle */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-3xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center text-4xl sm:text-5xl mb-4 shadow-sm">
              {currentDestEmoji}
            </div>

            {/* Step Counter: STEP X OF Y */}
            <p className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-indigo-600 mb-2">
              {t('navigation.step_of', {
                current: currentStepIdx + 1,
                total: steps.length,
              })}
            </p>

            {/* Main Spoken Walking Instruction */}
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug tracking-tight mb-4 min-h-[4.5rem] flex items-center justify-center">
              {currentStep.instruction}
            </h2>

            {/* Destination & Remaining Distance Badge */}
            <div className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 mx-auto mb-6 shadow-sm">
              <span>{t('navigation.destination')}:</span>
              <span className="font-black text-slate-900">{currentDestName}</span>
              <span className="text-slate-500">
                ({remainingDistanceM} {t('navigation.away')})
              </span>
            </div>

            {/* Two Large Primary Buttons Side-by-Side per Specification */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
              {/* Listen Again Button (Light Grey) */}
              <button
                onClick={handleListenAgain}
                className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border-2 border-slate-200 py-4 sm:py-5 px-3 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
              >
                <Volume2 className="w-6 h-6 text-slate-700 flex-shrink-0" />
                <span className="truncate">{t('navigation.listen_again')}</span>
              </button>

              {/* Next Step Button (Purple/Indigo) */}
              <button
                onClick={handleNextStep}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-4 sm:py-5 px-3 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-indigo-200"
              >
                <span className="truncate">
                  {currentStepIdx < steps.length - 1 ? t('navigation.next_step') : t('navigation.arrived')}
                </span>
                <ChevronRight className="w-6 h-6 text-white flex-shrink-0" />
              </button>
            </div>

            {/* Secondary Controls Bar: Stop, Recalculate, Map View */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
              <button
                onClick={handleStopNavigation}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>{t('navigation.stop_navigation')}</span>
              </button>

              <button
                onClick={() => startNavigation(selectedPlace, true)}
                className="px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t('navigation.recalculate_route')}</span>
              </button>

              <button
                onClick={() => setViewMode('map')}
                className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4" />
                <span>{t('navigation.map_view')}</span>
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE NAVIGATION: MAP VIEW (Toggleable without resetting state) */}
        {!loading && routeData && !isArrived && viewMode === 'map' && (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-md relative">
              <div ref={mapContainerRef} className="w-full h-[380px] z-10" />

              {/* View Mode Switcher Pill on Top of Map */}
              <div className="absolute top-3 left-3 z-20">
                <button
                  onClick={() => setViewMode('guided')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t('navigation.guided_view')}</span>
                </button>
              </div>

              <div className="absolute top-3 right-3 z-20 flex gap-2">
                <button
                  onClick={() => startNavigation(selectedPlace, true)}
                  className="p-2.5 bg-white/95 backdrop-blur-md rounded-xl shadow-md text-slate-700 hover:text-indigo-600 border border-slate-200"
                  title={t('navigation.recalculate_route')}
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              {/* Bottom Instruction Preview Banner */}
              {currentStep && (
                <div className="absolute bottom-3 inset-x-3 z-20 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-slate-200 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <p className="text-xs font-bold text-indigo-700">
                      {t('navigation.step_of', { current: currentStepIdx + 1, total: steps.length })}
                    </p>
                    <p className="text-sm font-black text-slate-800 truncate">{currentStep.instruction}</p>
                  </div>
                  <button
                    onClick={handleNextStep}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow font-bold text-xs flex-shrink-0"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Back to Guided View Button */}
            <button
              onClick={() => setViewMode('guided')}
              className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-base shadow-md flex items-center justify-center gap-2"
            >
              <span>{t('navigation.guided_view')}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* DESTINATION SELECTION VIEW (When no active route) */}
        {!loading && !routeData && !isArrived && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-black text-slate-900 mb-1">
                {t('navigation.where_to_go')}
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                {t('navigation.choose_destination')}
              </p>
            </div>

            {/* Grid of Saved Destinations */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(savedPlaces.length > 0 ? savedPlaces : DEFAULT_DESTINATIONS).map((place, idx) => {
                const name = place.nameKey ? t(place.nameKey) : place.name;
                const emoji = place.emoji || (idx === 0 ? '🏠' : idx === 1 ? '🏥' : '📍');

                return (
                  <button
                    key={place.id || idx}
                    onClick={() => handleSelectDestination(place)}
                    className="p-5 bg-white hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-500 rounded-3xl shadow-sm hover:shadow-md transition text-center flex flex-col items-center justify-center gap-2 group active:scale-95"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform">{emoji}</span>
                    <span className="text-base font-black text-slate-800 group-hover:text-indigo-700 leading-tight">
                      {name}
                    </span>
                    {place.address && (
                      <span className="text-xs text-slate-400 line-clamp-1">{place.address}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Emergency Take Me Home Button */}
            <button
              onClick={() => {
                const home = savedPlaces.find((p) => p.place_type === 'home') || DEFAULT_DESTINATIONS[0];
                startNavigation(home);
              }}
              className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Home className="w-6 h-6" />
              <span>{t('navigation.take_me_home')}</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer Emergency Shortcut */}
      <footer className="px-4 py-3 bg-[#FBF8F3] border-t border-amber-100">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3 text-xs">
          <a
            href="tel:112"
            className="flex-1 py-3 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-2xl font-bold flex items-center justify-center gap-2 transition"
          >
            <PhoneCall className="w-4 h-4" />
            <span>{t('navigation.call_family_shortcut')}</span>
          </a>

          <button
            onClick={() => triggerWrongRouteAlert()}
            className="py-3 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-2xl font-bold flex items-center justify-center gap-1.5 transition"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>{t('navigation.are_you_lost')}</span>
          </button>
        </div>
      </footer>

      {/* DESTINATION CONFIRMATION DIALOG MODAL */}
      {confirmModal && selectedPlace && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border-2 border-indigo-200 animate-fade-in">
            <div className="w-20 h-20 bg-indigo-50 border-2 border-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-4xl shadow-sm">
              {selectedPlace.emoji || '📍'}
            </div>

            <h3 className="text-xl font-black text-slate-800 mb-2">
              {t('navigation.shall_i_guide', {
                destination: selectedPlace.nameKey ? t(selectedPlace.nameKey) : selectedPlace.name,
              })}
            </h3>

            <p className="text-xs text-slate-500 mb-6">
              {selectedPlace.address || t('navigation.walk_straight')}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => startNavigation(selectedPlace)}
                className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base shadow-lg transition active:scale-95"
              >
                {t('navigation.start_navigation')}
              </button>

              <button
                onClick={() => setConfirmModal(false)}
                className="w-full py-3.5 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition active:scale-95"
              >
                {t('navigation.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-MINUTE WRONG-ROUTE ALERT MODAL */}
      {wrongRouteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border-4 border-amber-400 animate-fade-in">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 animate-bounce" />
            </div>

            <h2 className="text-2xl font-black text-slate-800 mb-3 leading-snug">
              {t('navigation.wrong_route_prompt')}
            </h2>

            <div className="space-y-3 mt-6">
              <button
                onClick={() => {
                  setWrongRouteModal(false);
                  startNavigation(selectedPlace, true);
                }}
                className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black shadow-lg transition active:scale-95"
              >
                {t('navigation.yes_show_route')}
              </button>

              <button
                onClick={() => {
                  setWrongRouteModal(false);
                  setCooldownUntil(Date.now() + 15 * 60 * 1000);
                }}
                className="w-full py-3.5 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition active:scale-95"
              >
                {t('navigation.no_i_am_fine')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTOMATIC LOST CHECK-IN MODAL */}
      {lostModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border-4 border-rose-400 animate-fade-in">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Compass className="w-10 h-10 text-rose-600" />
            </div>

            <h2 className="text-2xl font-black text-slate-800 mb-3">
              {t('navigation.lost_prompt')}
            </h2>

            <div className="space-y-3 mt-6">
              <button
                onClick={() => {
                  setLostModal(false);
                  const home = savedPlaces.find((p) => p.place_type === 'home') || DEFAULT_DESTINATIONS[0];
                  startNavigation(home);
                }}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-black shadow-lg transition active:scale-95"
              >
                {t('navigation.yes_help_me')}
              </button>

              <button
                onClick={() => setLostModal(false)}
                className="w-full py-3.5 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition active:scale-95"
              >
                {t('navigation.no_i_am_fine')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
