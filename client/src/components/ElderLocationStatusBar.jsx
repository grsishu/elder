import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  startLocationScheduler,
  stopLocationScheduler,
  getLastCapturedTime,
} from '../utils/location';

export default function ElderLocationStatusBar() {
  const { t } = useTranslation();
  const { elder, user } = useAuth();
  const [lastUpdatedMin, setLastUpdatedMin] = useState(0);
  const [hasConsent, setHasConsent] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null);

  // Check consent and start scheduler if consent is granted
  useEffect(() => {
    if (!elder?.id) return;

    let isMounted = true;
    const init = async () => {
      try {
        const resp = await fetch(`/api/location/consent?elderId=${elder.id}`);
        if (resp.ok) {
          const data = await resp.json();
          if (isMounted) {
            setHasConsent(data.hasConsent);
            if (data.hasConsent) {
              startLocationScheduler({
                elderId: elder.id,
                intervalMin: 5,
                guardianMode: true,
                onStatusChange: (status) => {
                  if (status.state === 'active') {
                    setLastUpdatedMin(0);
                    setErrorStatus(null);
                  } else if (status.state === 'error') {
                    setErrorStatus(status.error?.message || 'GPS paused');
                  }
                },
                onError: (err) => {
                  setErrorStatus(err.message || 'GPS paused');
                },
              });
            }
          }
        }
      } catch (err) {
        console.warn('[ElderStatus] Init error:', err);
      }
    };

    init();

    // Timer to update "updated X minutes ago" display every 30s
    const minuteTimer = setInterval(() => {
      const last = getLastCapturedTime();
      if (last > 0) {
        const diff = Math.floor((Date.now() - last) / 60000);
        setLastUpdatedMin(diff);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(minuteTimer);
      stopLocationScheduler();
    };
  }, [elder?.id]);

  if (!hasConsent || !elder?.id) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pointer-events-none flex justify-center">
      <div className="bg-slate-900/80 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg border border-slate-700/60 pointer-events-auto transition animate-fade-in">
        {errorStatus ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-200">
              {t('location.status_error', 'Location paused: {{msg}}', { msg: errorStatus })}
            </span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-200">
              {lastUpdatedMin === 0
                ? t('location.status_sharing_now', 'Location sharing is on, updated just now')
                : t('location.status_sharing_min', 'Location sharing is on, updated {{count}} min ago', {
                    count: lastUpdatedMin,
                  })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

