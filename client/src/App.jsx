import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import EmergencyBar from './components/EmergencyBar';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Diagnostics from './pages/Diagnostics';
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
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

          {/* Fallback routes for other phases */}
          <Route
            path="/setup"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">Setup Wizard (Phase 2)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/games"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">Cognitive Games (Phase 3)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/reminders"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">Daily Reminders (Phase 4)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/family"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">My Family (Phase 2)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/lost"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">Take Me Home (Phase 5)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/easyride"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">EasyRide (Phase 6)</div>
              </RequireAuth>
            }
          />
          <Route
            path="/sos"
            element={
              <RequireAuth>
                <div className="p-8 text-center text-xl font-bold">Emergency SOS Timeline (Phase 5)</div>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      {/* Pinned SOS bar appears on all screens except /login */}
      {!isLoginPage && <EmergencyBar />}
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
