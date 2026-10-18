import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Send,
  Download,
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Edit3,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { t } = useTranslation();
  const { elder } = useAuth();

  const [periodDays, setPeriodDays] = useState(7);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editSteps, setEditSteps] = useState('');
  const [sendResult, setSendResult] = useState(null);
  const [settings, setSettings] = useState({ send_weekly_sunday_1800: false, send_monthly: false });

  const elderId = elder?.id;

  const fetchLatestDraft = async () => {
    if (!elderId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/reports/drafts?elderId=${elderId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.drafts?.length > 0) {
          const latest = data.drafts[0];
          setDraft(latest);
          setEditText(latest.summary_text);
          setEditSteps(latest.suggested_next_steps || '');
        }
      }

      // Fetch auto-send settings
      const setResp = await fetch(`/api/reports/settings?elderId=${elderId}`);
      if (setResp.ok) {
        const setData = await setResp.json();
        setSettings(setData.settings);
      }
    } catch (err) {
      console.warn('Error fetching report drafts:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestDraft();
  }, [elderId]);

  const handleCreateDraft = async () => {
    if (!elderId) return;
    setLoading(true);
    setSendResult(null);
    try {
      const resp = await fetch('/api/reports/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elderId, periodDays }),
      });
      const data = await resp.json();
      if (data.success && data.draft) {
        setDraft(data.draft);
        setEditText(data.draft.summary_text);
        setEditSteps(data.draft.suggested_next_steps || '');
      }
    } catch (err) {
      alert(`Error generating draft: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!draft?.id) return;
    try {
      const resp = await fetch(`/api/reports/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryText: editText, suggestedNextSteps: editSteps }),
      });
      const data = await resp.json();
      if (data.success) {
        setDraft(prev => ({ ...prev, summary_text: editText, suggested_next_steps: editSteps }));
        setEditing(false);
      }
    } catch (err) {
      alert(`Error saving edits: ${err.message}`);
    }
  };

  const handleSendReport = async () => {
    if (!draft?.id) return;
    setSending(true);
    setSendResult(null);
    try {
      const resp = await fetch(`/api/reports/drafts/${draft.id}/send`, { method: 'POST' });
      const data = await resp.json();
      setSendResult(data);
    } catch (err) {
      setSendResult({ success: false, message: err.message });
    } finally {
      setSending(false);
    }
  };

  const handleToggleAutoSend = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await fetch('/api/reports/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elderId,
          sendWeeklySunday1800: updated.send_weekly_sunday_1800,
          sendMonthly: updated.send_monthly,
        }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <FileText className="w-8 h-8 text-amber-600" />
            <span>Caregiver Observation Reports</span>
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            AI-drafted cognitive progress and adherence reports for family & health workers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(parseInt(e.target.value, 10))}
            className="px-3 py-2 text-sm font-bold bg-white border-2 border-slate-300 rounded-xl outline-none"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>

          <button
            id="generate-draft-btn"
            onClick={handleCreateDraft}
            disabled={loading}
            className="btn-elder px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-sm font-bold flex items-center gap-2 shadow-sm min-h-[44px]"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Draft New Report</span>
          </button>
        </div>
      </div>

      {/* Auto-Send Schedules Settings */}
      <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-3xl space-y-3">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
          <Calendar className="w-5 h-5 text-amber-700" />
          <span>Automated Delivery Settings (Cron Job)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <label className="flex items-center gap-3 bg-white p-3 rounded-2xl border cursor-pointer hover:bg-amber-50/50">
            <input
              type="checkbox"
              checked={Boolean(settings.send_weekly_sunday_1800)}
              onChange={() => handleToggleAutoSend('send_weekly_sunday_1800')}
              className="w-5 h-5 text-amber-600 rounded"
            />
            <span className="text-xs font-bold text-slate-800">
              Send automatically every Sunday 18:00 (Asia/Kolkata)
            </span>
          </label>
          <label className="flex items-center gap-3 bg-white p-3 rounded-2xl border cursor-pointer hover:bg-amber-50/50">
            <input
              type="checkbox"
              checked={Boolean(settings.send_monthly)}
              onChange={() => handleToggleAutoSend('send_monthly')}
              className="w-5 h-5 text-amber-600 rounded"
            />
            <span className="text-xs font-bold text-slate-800">
              Send monthly report automatically
            </span>
          </label>
        </div>
      </div>

      {/* Draft Review Card */}
      {draft ? (
        <div className="bg-white rounded-3xl border-2 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-black rounded-xl">
                STATUS: {draft.status?.toUpperCase()}
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Report Draft for {elder?.name || 'Elder'} ({draft.period?.replace('_', ' ')})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <a
                id="preview-pdf-btn"
                href={`/api/reports/drafts/${draft.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="btn-elder px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px]"
              >
                <Download className="w-4 h-4" />
                <span>Preview PDF</span>
              </a>

              <button
                id="send-report-now-btn"
                onClick={handleSendReport}
                disabled={sending}
                className="btn-elder px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md min-h-[40px]"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Send Now</span>
              </button>
            </div>
          </div>

          {/* Delivery Results Banner */}
          {sendResult && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>{sendResult.message || 'Report Delivered!'}</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700">
                {sendResult.deliveries?.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white rounded-xl border">
                    <span className="font-bold">Channel: {d.channel?.toUpperCase()}</span>
                    <span>Status: <strong className={d.status === 'failed' ? 'text-red-600' : 'text-emerald-700'}>{d.status}</strong></span>
                    {d.error && <span className="text-red-600 text-[11px]">({d.error})</span>}
                    {d.waLink && (
                      <a
                        href={d.waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold flex items-center gap-1"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share WhatsApp</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Text (Editable) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-800">
                AI Observation Summary:
              </label>
              {!editing ? (
                <button
                  id="edit-summary-btn"
                  onClick={() => setEditing(true)}
                  className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Text</span>
                </button>
              ) : (
                <button
                  id="save-summary-btn"
                  onClick={handleSaveEdit}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg"
                >
                  Save Changes
                </button>
              )}
            </div>

            {editing ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={5}
                className="w-full p-3 text-sm rounded-2xl border-2 border-amber-400 font-sans outline-none leading-relaxed"
              />
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                {draft.summary_text}
              </div>
            )}
          </div>

          {/* Suggested Next Steps */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-800">
              Suggested Next Steps:
            </label>
            {editing ? (
              <textarea
                value={editSteps}
                onChange={(e) => setEditSteps(e.target.value)}
                rows={4}
                className="w-full p-3 text-sm rounded-2xl border-2 border-amber-400 font-sans outline-none leading-relaxed"
              />
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                {draft.suggested_next_steps}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border-2 border-slate-200 p-12 text-center space-y-4">
          <FileText className="w-16 h-16 text-slate-300 mx-auto" />
          <h2 className="text-xl font-bold text-slate-700">No report draft generated yet</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Click "Draft New Report" above to compute cognitive practice stats and generate the AI summary.
          </p>
        </div>
      )}
    </div>
  );
}
