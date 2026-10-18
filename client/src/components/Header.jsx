import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Volume2, Settings, ShieldAlert, Activity, LogOut, Sun, Moon, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak, cancelSpeech } from '../utils/voice';

export default function Header({ currentScreenText }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, elder, logout } = useAuth();
  const [helperMenuOpen, setHelperMenuOpen] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const longPressTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const startLongPress = () => {
    setPressProgress(0);
    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / 3000) * 100));
      setPressProgress(pct);
    }, 50);

    longPressTimerRef.current = setTimeout(() => {
      clearInterval(progressIntervalRef.current);
      setPressProgress(0);
      setHelperMenuOpen(true);
      speak(t('home.helper_menu_title'));
    }, 3000);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setPressProgress(0);
  };

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('smriti_language', lang);
    localStorage.setItem('smriti_elder_language', lang);
  };

  const toggleHighContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    if (next) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  };

  const handleSpeakCurrentScreen = () => {
    const textToSpeak = currentScreenText || `${t('app.title')}. ${elder?.name ? t('home.greeting', { name: elder.name }) : ''}`;
    speak(textToSpeak);
  };

  return (
    <header className="bg-white border-b-2 border-slate-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* App Title with 3-second press handler for Caregivers */}
        <div className="relative">
          <div
            id="app-header-title"
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            className="cursor-pointer select-none active:opacity-80"
            title={t('home.helper_hint')}
          >
            <h1 className="text-2xl md:text-3xl font-black text-amber-700 tracking-tight flex items-center gap-2">
              <span className="text-3xl">🪷</span>
              <span>{t('app.title')}</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium hidden sm:block">
              {t('home.helper_hint')}
            </p>
          </div>
          {pressProgress > 0 && (
            <div className="absolute -bottom-2 left-0 w-full h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all duration-75"
                style={{ width: `${pressProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Speaker Button: Hear Screen Aloud */}
          <button
            id="header-speak-button"
            onClick={handleSpeakCurrentScreen}
            className="btn-elder p-3 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-2xl flex items-center gap-1.5 text-base font-bold shadow-sm"
            aria-label={t('common.hear_again')}
          >
            <Volume2 className="w-7 h-7 text-amber-800" />
            <span className="hidden md:inline">{t('common.hear_again')}</span>
          </button>

          {/* Language Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-300">
            {[
              { code: 'en', label: 'EN' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'as', label: 'অসমীয়া' },
              { code: 'bn', label: 'বাংলা' },
            ].map(lang => (
              <button
                key={lang.code}
                id={`lang-btn-${lang.code}`}
                onClick={() => handleLanguageChange(lang.code)}
                className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${
                  i18n.language === lang.code
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Quick Caregiver Menu Trigger Button */}
          <button
            id="header-settings-btn"
            onClick={() => setHelperMenuOpen(true)}
            className="p-3 text-slate-600 hover:bg-slate-100 rounded-2xl border border-slate-200"
            title={t('home.helper_menu_title')}
            aria-label="Caregiver settings"
          >
            <Settings className="w-6 h-6 text-slate-700" />
          </button>
        </div>
      </div>

      {/* Caregiver Settings Modal */}
      {helperMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-4 border-amber-500 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-7 h-7 text-amber-600" />
                {t('home.helper_menu_title')}
              </h2>
              <button
                id="close-helper-menu"
                onClick={() => setHelperMenuOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <button
                id="menu-nav-home"
                onClick={() => {
                  setHelperMenuOpen(false);
                  navigate('/');
                }}
                className="w-full btn-elder bg-slate-100 hover:bg-slate-200 text-slate-900 justify-start px-4 gap-3 text-lg"
              >
                <Home className="w-6 h-6 text-blue-600" />
                {t('common.home')}
              </button>

              <button
                id="menu-nav-wizard"
                onClick={() => {
                  setHelperMenuOpen(false);
                  navigate('/setup');
                }}
                className="w-full btn-elder bg-amber-50 hover:bg-amber-100 text-amber-900 justify-start px-4 gap-3 text-lg"
              >
                <Settings className="w-6 h-6 text-amber-600" />
                {t('home.open_wizard')}
              </button>

              <button
                id="menu-nav-reports"
                onClick={() => {
                  setHelperMenuOpen(false);
                  navigate('/reports');
                }}
                className="w-full btn-elder bg-purple-50 hover:bg-purple-100 text-purple-900 justify-start px-4 gap-3 text-lg"
              >
                <Activity className="w-6 h-6 text-purple-600" />
                <span>Caregiver Reports</span>
              </button>

              <button
                id="menu-nav-live"
                onClick={() => {
                  setHelperMenuOpen(false);
                  navigate('/live');
                }}
                className="w-full btn-elder bg-emerald-50 hover:bg-emerald-100 text-emerald-900 justify-start px-4 gap-3 text-lg"
              >
                <ShieldAlert className="w-6 h-6 text-emerald-600" />
                <span>Live Location Tracking</span>
              </button>

              <button
                id="menu-nav-diagnostics"
                onClick={() => {
                  setHelperMenuOpen(false);
                  navigate('/diagnostics');
                }}
                className="w-full btn-elder bg-blue-50 hover:bg-blue-100 text-blue-900 justify-start px-4 gap-3 text-lg"
              >
                <Activity className="w-6 h-6 text-blue-600" />
                {t('home.open_diagnostics')}
              </button>

              <div className="p-3 bg-slate-50 rounded-2xl space-y-2 border">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{t('home.high_contrast_toggle')}</span>
                  <button
                    onClick={toggleHighContrast}
                    className={`px-4 py-2 rounded-xl font-bold text-sm ${
                      highContrast ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {highContrast ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {user && (
                <button
                  id="menu-logout-btn"
                  onClick={async () => {
                    setHelperMenuOpen(false);
                    await logout();
                    navigate('/login');
                  }}
                  className="w-full btn-elder bg-rose-50 hover:bg-rose-100 text-rose-700 justify-start px-4 gap-3 text-lg"
                >
                  <LogOut className="w-6 h-6 text-rose-600" />
                  {t('auth.logout')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
