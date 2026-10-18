import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t-2 border-amber-200/60 bg-amber-50/70 py-6 px-4 text-center">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Strict Medical & Non-Diagnosis Disclaimer */}
        <div className="flex items-start justify-center gap-2 text-xs md:text-sm text-slate-700 font-semibold bg-white p-3 rounded-2xl border border-amber-300 shadow-sm">
          <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-left leading-relaxed">
            {t('disclaimer.legal')}
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 text-xs text-slate-500 font-medium pt-2">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>North East India Elderly Guardian</span>
          </span>
          <Link to="/diagnostics" className="text-blue-600 hover:underline">
            {t('home.open_diagnostics')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
