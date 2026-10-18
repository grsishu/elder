import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import EmergencyBar from './components/EmergencyBar';
import LostCheckinModal from './components/LostCheckinModal';
import TalkingAlarm from './components/TalkingAlarm';

// Pages
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Diagnostics from './pages/Diagnostics';
import Reports from './pages/Reports';
import LiveLocation from './pages/LiveLocation';
import Wizard from './pages/Wizard';
import Family from './pages/Family';
import FamilyUpload from './pages/FamilyUpload';
import GamesHub from './pages/games/GamesHub';
import NameFaceGame from './pages/games/NameFaceGame';
import WhoseVoiceGame from './pages/games/WhoseVoiceGame';
import PictureMatchingGame from './pages/games/PictureMatchingGame';
import PatternGame from './pages/games/PatternGame';
import DailyRoutineGame from './pages/games/DailyRoutineGame';
import VoiceFluencyGame from './pages/games/VoiceFluencyGame';
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
  const isLoginPage = location.pathname === '/login';
  const isPublicUpload = location.pathname.startsWith('/family/upload/');

  return (
    <div className="flex flex-col min-h-screen">
      {!isPublicUpload && <Header />}
      <main className="flex-1 pb-24">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route path="/diagnostics" element={<Diagnostics />} />

          {/* Phase 2: Setup Wizard & Family */}
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

          {/* Phase 3: Cognitive Games & AI Dashboard */}
          <Route
            path="/games"
            element={
              <RequireAuth>
                <GamesHub />
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
            path="/games/whose-voice"
            element={
              <RequireAuth>
                <WhoseVoiceGame />
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
            path="/games/pattern"
            element={
              <RequireAuth>
                <PatternGame />
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
            path="/games/voice-fluency"
            element={
              <RequireAuth>
                <VoiceFluencyGame />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />

          {/* Phase 4: Daily Reminders & Health */}
          <Route
            path="/reminders"
            element={
              <RequireAuth>
                <ReminderHealth />
              </RequireAuth>
            }
          />

          {/* Phase 5: Safety: SOS & Take Me Home */}
          <Route
            path="/sos"
            element={
              <RequireAuth>
                <SosPage />
              </RequireAuth>
            }
          />
          <Route
            path="/lost"
            element={
              <RequireAuth>
                <TakeMeHome />
              </RequireAuth>
            }
          />
          <Route
            path="/take-me-home"
            element={
              <RequireAuth>
                <TakeMeHome />
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

          {/* Phase 6: EasyRide */}
          <Route
            path="/rides"
            element={
              <RequireAuth>
                <Rides />
              </RequireAuth>
            }
          />
          <Route
            path="/easyride"
            element={
              <RequireAuth>
                <Rides />
              </RequireAuth>
            }
          />

          {/* Part A Caregiver Reports */}
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Interactive Modals: Wandering Check-in & Talking Medication Alarm */}
      {!isLoginPage && !isPublicUpload && (
        <>
          <LostCheckinModal />
          <TalkingAlarm />
        </>
      )}

      {!isPublicUpload && <Footer />}
      {!isLoginPage && !isPublicUpload && <EmergencyBar />}
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
