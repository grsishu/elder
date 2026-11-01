import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [elder, setElder] = useState(null);
  const [consent, setConsent] = useState(null);
  const [loading, setLoading] = useState(true);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          setElder(data.elder);
          setConsent(data.consent);
          if (data.elder?.language) {
            localStorage.setItem('smriti_elder_language', data.elder.language);
          }
          if (data.elder?.voice_speed) {
            localStorage.setItem('smriti_voice_speed', String(data.elder.voice_speed));
          }
        } else {
          try {
            const demoRes = await fetch('/api/auth/demo-quick-login', { method: 'POST' });
            if (demoRes.ok) {
              const demoData = await demoRes.json();
              setUser(demoData.user);
              setElder(demoData.elder);
            } else {
              setUser(null);
              setElder(null);
            }
          } catch {
            setUser(null);
            setElder(null);
          }
        }
      } else {
        try {
          const demoRes = await fetch('/api/auth/demo-quick-login', { method: 'POST' });
          if (demoRes.ok) {
            const demoData = await demoRes.json();
            setUser(demoData.user);
            setElder(demoData.elder);
          } else {
            setUser(null);
            setElder(null);
          }
        } catch {
          setUser(null);
          setElder(null);
        }
      }
    } catch (err) {
      console.warn('[AuthContext] checkAuth failed:', err.message);
      setUser(null);
      setElder(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  const login = (userData, elderData, consentData) => {
    setUser(userData);
    setElder(elderData || null);
    setConsent(consentData || null);
    if (elderData?.language) {
      localStorage.setItem('smriti_elder_language', elderData.language);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setElder(null);
    setConsent(null);
  };

  const updateElder = (updatedElder) => {
    setElder(updatedElder);
    if (updatedElder?.language) {
      localStorage.setItem('smriti_elder_language', updatedElder.language);
    }
    if (updatedElder?.voice_speed) {
      localStorage.setItem('smriti_voice_speed', String(updatedElder.voice_speed));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        elder,
        consent,
        loading,
        login,
        logout,
        updateElder,
        refreshAuth: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
