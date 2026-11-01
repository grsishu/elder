import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import EmergencyBar from './components/EmergencyBar';
import LostCheckinModal from './components/LostCheckinModal';
import VoiceSafetyCheckModal from './components/VoiceSafetyCheckModal';
import LocationConsentModal from './components/LocationConsentModal';
import ElderLocationStatusBar from './components/ElderLocationStatusBar';
import TalkingAlarm from './components/TalkingAlarm';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Diagnostics from './pages/Diagnostics';
import Reports from './pages/Reports';
import LiveLocation from './pages/LiveLocation';
import PublicLiveMonitor from './pages/PublicLiveMonitor';
import CaregiverDashboard from './pages/CaregiverDashboard';
import SafeHome from './pages/SafeHome';
import LanguageSettings from './pages/LanguageSettings';
import Wizard from './pages/Wizard';
import Family from './pages/Family';
import FamilyUpload from './pages/FamilyUpload';
import GamesHub from './pages/games/GamesHub';
import NameFaceGame from './pages/games/NameFaceGame';
import WhoseVoiceGame from './pages/games/WhoseVoiceGame';
import PictureMatchingGame from './pages/games/PictureMatchingGame';
import RememberObjectsGame from './pages/games/RememberObjectsGame';
import PatternGame from './pages/games/PatternGame';
import FindObjectGame from './pages/games/FindObjectGame';
import DailyRoutineGame from './pages/games/DailyRoutineGame';
import VoiceFluencyGame from './pages/games/VoiceFluencyGame';
import SortItOutGame from './pages/games/SortItOutGame';
import MemoryLaneGame from './pages/games/MemoryLaneGame';
import PuzzleTimeGame from './pages/games/PuzzleTimeGame';
import MusicMemoriesGame from './pages/games/MusicMemoriesGame';
import Dashboard from './pages/Dashboard';
import ReminderHealth from './pages/ReminderHealth';
import TakeMeHome from './pages/TakeMeHome';
import SosPage from './pages/SosPage';
import Rides from './pages/Rides';
import { cancelSpeech } from './utils/voice';

// Speech cancellation on route navigation
function RouteSpeechManager() {
  const location = useLocation();
  useEffect(() => {
    cancelSpeech();
  }, [location.pathname]);
  return null;
}

// Protected Route helper
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-600">
        Loading Smriti Saathi...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function MainLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login' || location.pathname === '/register';
  const isPublicUpload = location.pathname.startsWith('/family/upload/');
  const isPublicMonitor =
    location.pathname.startsWith('/live-monitor') ||
    location.pathname.startsWith('/monitor') ||
    location.pathname.startsWith('/live-tracking');
  const isPublicStandalone = isPublicUpload || isPublicMonitor;

  return (
    <div className="flex flex-col min-h-screen">
      {!isPublicStandalone && <Header />}
      <main className="flex-1 pb-24">
        <Routes>
          {/* Auth & Registration */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />

          {/* Main Dashboard */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/elderly"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />

          {/* Diagnostics */}
          <Route path="/diagnostics" element={<Diagnostics />} />

          {/* Setup Wizard & Family */}
          <Route
            path="/wizard"
            element={
              <RequireAuth>
                <Wizard />
              </RequireAuth>
            }
          />
          <Route
            path="/setup"
            element={
              <RequireAuth>
                <Wizard />
              </RequireAuth>
            }
          />
          <Route
            path="/family"
            element={
              <RequireAuth>
                <Family />
              </RequireAuth>
            }
          />
          <Route path="/family/upload/:token" element={<FamilyUpload />} />

          {/* 6 Cognitive Games */}
          <Route
            path="/games"
            element={
              <RequireAuth>
                <GamesHub />
              </RequireAuth>
            }
          />
          <Route
            path="/games/picture-matching"
            element={
              <RequireAuth>
                <PictureMatchingGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/remember-objects"
            element={
              <RequireAuth>
                <RememberObjectsGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/name-face"
            element={
              <RequireAuth>
                <NameFaceGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/pattern"
            element={
              <RequireAuth>
                <PatternGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/find-object"
            element={
              <RequireAuth>
                <FindObjectGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/daily-routine"
            element={
              <RequireAuth>
                <DailyRoutineGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/whose-voice"
            element={
              <RequireAuth>
                <WhoseVoiceGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/voice-fluency"
            element={
              <RequireAuth>
                <VoiceFluencyGame />
              </RequireAuth>
            }
          />

          {/* 8 Canonical Cognitive Game Routes */}
          <Route
            path="/games/memory-match"
            element={
              <RequireAuth>
                <RememberObjectsGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/memory-lane"
            element={
              <RequireAuth>
                <MemoryLaneGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/find-pair"
            element={
              <RequireAuth>
                <PictureMatchingGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/word-wizard"
            element={
              <RequireAuth>
                <FindObjectGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/sort-it-out"
            element={
              <RequireAuth>
                <SortItOutGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/music-memories"
            element={
              <RequireAuth>
                <MusicMemoriesGame />
              </RequireAuth>
            }
          />
          <Route
            path="/games/puzzle-time"
            element={
              <RequireAuth>
                <PuzzleTimeGame />
              </RequireAuth>
            }
          />

          {/* Dashboard & Observational Insights */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />

          {/* Daily Reminders */}
          <Route
            path="/reminders"
            element={
              <RequireAuth>
                <ReminderHealth />
              </RequireAuth>
            }
          />

          {/* SafeHome & Voice Navigation */}
          <Route
            path="/safehome"
            element={
              <RequireAuth>
                <SafeHome />
              </RequireAuth>
            }
          />
          <Route
            path="/direction"
            element={
              <RequireAuth>
                <SafeHome />
              </RequireAuth>
            }
          />
          <Route
            path="/lost"
            element={
              <RequireAuth>
                <SafeHome />
              </RequireAuth>
            }
          />
          <Route
            path="/take-me-home"
            element={
              <RequireAuth>
                <SafeHome />
              </RequireAuth>
            }
          />

          {/* Dedicated Caregiver Dashboard */}
          <Route
            path="/caregiver"
            element={
              <RequireAuth>
                <CaregiverDashboard />
              </RequireAuth>
            }
          />

          {/* Live Location Tracking */}
          <Route
            path="/caregiver/location"
            element={
              <RequireAuth>
                <LiveLocation />
              </RequireAuth>
            }
          />
          <Route
            path="/location"
            element={
              <RequireAuth>
                <LiveLocation />
              </RequireAuth>
            }
          />
          <Route
            path="/location/:elderId"
            element={
              <RequireAuth>
                <LiveLocation />
              </RequireAuth>
            }
          />
          <Route
            path="/live"
            element={
              <RequireAuth>
                <LiveLocation />
              </RequireAuth>
            }
          />
          <Route
            path="/live/:elderId"
            element={
              <RequireAuth>
                <LiveLocation />
              </RequireAuth>
            }
          />

          {/* Autonomous 5-Min AI Location Monitor (Public View) */}
          <Route path="/live-monitor" element={<PublicLiveMonitor />} />
          <Route path="/monitor" element={<PublicLiveMonitor />} />
          <Route path="/live-tracking" element={<PublicLiveMonitor />} />

          {/* Emergency SOS */}
          <Route
            path="/sos"
            element={
              <RequireAuth>
                <SosPage />
              </RequireAuth>
            }
          />

          {/* EasyRide Auto/Cab */}
          <Route
            path="/easyride"
            element={
              <RequireAuth>
                <Rides />
              </RequireAuth>
            }
          />
          <Route
            path="/rides"
            element={
              <RequireAuth>
                <Rides />
              </RequireAuth>
            }
          />

          {/* Settings & Language */}
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <LanguageSettings />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/language"
            element={
              <RequireAuth>
                <LanguageSettings />
              </RequireAuth>
            }
          />

          {/* Caregiver Observation Reports */}
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />

          {/* Fallback to Home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Interactive Modals: Voice Safety Check, Consent & Talking Medication Alarm */}
      {!isLoginPage && !isPublicStandalone && (
        <>
          <VoiceSafetyCheckModal />
          <LocationConsentModal />
          <ElderLocationStatusBar />
          <TalkingAlarm />
        </>
      )}

      {!isPublicStandalone && <Footer />}
      {!isLoginPage && !isPublicStandalone && <EmergencyBar />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteSpeechManager />
        <MainLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}
