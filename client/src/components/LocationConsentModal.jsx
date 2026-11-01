import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, ShieldCheck, Clock, Eye, ToggleLeft, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak, cancelSpeech } from '../utils/voice';

export default function LocationConsentModal({ onConsentChanged }) {
  const { t, i18n } = useTranslation();
  const { elder, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check consent status on mount
  useEffect(() => {
    if (!elder?.id) {
      setLoading(false);
      return;
    }

    const checkConsent = async () => {
      try {
        const resp = await fetch(`/api/location/consent?elderId=${elder.id}`);
        if (resp.ok) {
          const data = await resp.json();
          // If no active consent, prompt modal
          if (!data.hasConsent) {
            setIsOpen(true);
          }
        }
      } catch (e) {
        console.warn('[Consent] Check error:', e);
      } finally {
        setLoading(false);
      }
    };

    checkConsent();
  }, [elder?.id]);

  // Read consent aloud slowly when modal opens
  useEffect(() => {
    if (isOpen) {
      const consentSpeech = t(
        'location.consent_read_aloud',
        'Location Safety Protection. We collect your position every 5 minutes so your family knows you are safe. Only your linked caregivers can see this. Data is kept for 30 days and you can turn it off anytime.'
      );
      speak(consentSpeech, {
        rate: 0.65,
        lang: i18n.language || 'hi',
      });
    }
    return () => {
      cancelSpeech();
    };
  }, [isOpen, t, i18n.language]);

  const handleGrant = async () => {
    if (!elder?.id) return;
    setIsSubmitting(true);
    cancelSpeech();

    try {
      const resp = await fetch('/api/location/consent/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elderId: elder.id,
          scope: 'caregivers',
        }),
      });

      if (resp.ok) {
        setIsOpen(false);
        onConsentChanged?.(true);
        speak(t('location.consent_granted_thank_you', 'Location sharing is active. Your family is keeping you safe.'), {
          rate: 0.65,
          lang: i18n.language || 'hi',
        });
      }
    } catch (err) {
      console.warn('[Consent] Grant error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    cancelSpeech();
    setIsOpen(false);
    onConsentChanged?.(false);
  };

  if (!isOpen || loading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border-2 border-indigo-100 animate-fade-in text-left">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center shrink-0">
            <MapPin className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">
              {t('location.consent_title', 'Location Safety Protection')}
            </h2>
            <p className="text-sm text-indigo-600 font-medium">
              {t('location.consent_subtitle', 'Privacy-first location monitoring')}
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6 text-sm text-slate-700">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">
                {t('location.consent_what', 'What is collected')}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('location.consent_what_desc', 'Your GPS position every 5 minutes while Guardian mode is active.')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <Eye className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">
                {t('location.consent_who', 'Who sees it')}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('location.consent_who_desc', 'Only your verified, linked family caregivers with location permissions.')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">
                {t('location.consent_retention', 'How long it is kept')}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('location.consent_retention_desc', 'Retained for 30 days, then purged automatically. You can delete it anytime.')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <ToggleLeft className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">
                {t('location.consent_control', 'How to switch it off')}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('location.consent_control_desc', 'Turn off in settings anytime. Revoking stops all GPS checks immediately.')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGrant}
            disabled={isSubmitting}
            className="flex-1 py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{t('location.consent_accept', 'I Agree (Turn on)')}</span>
          </button>

          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="py-3 px-5 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-xl font-medium transition active:scale-95 text-sm"
          >
            {t('location.consent_decline', 'Not Now')}
          </button>
        </div>
      </div>
    </div>
  );
}

