import React, { useState, useEffect } from 'react';
import { BellRing, CheckCircle2, AlertTriangle, Send, RefreshCw, ShieldCheck } from 'lucide-react';

export default function ReminderHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchHealth = () => {
    setLoading(true);
    fetch('/api/reminders/health', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
      })
      .catch((e) => console.warn(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const sendTestPush = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/reminders/push/test', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await res.json();
      setTestResult(d);
    } catch (e) {
      setTestResult({ error: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <BellRing className="w-8 h-8 text-indigo-600" />
            Reminder Health & Push Status
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Verification of cron schedulers, push notification subscriptions, and escalation logs.
          </p>
        </div>
        <button
          onClick={fetchHealth}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Active Push Subscriptions</span>
          <div className="text-3xl font-black text-indigo-600">
            {data?.subscriptionsCount || 0} Devices
          </div>
          <span className="text-xs text-slate-500 font-medium mt-1 inline-block">
            Registered browser service workers
          </span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block mb-1">Missed in Last 7 Days</span>
          <div className="text-3xl font-black text-amber-600">
            {data?.missedReminders7d || 0} Reminders
          </div>
          <span className="text-xs text-slate-500 font-medium mt-1 inline-block">
            Auto-escalated to caregiver
          </span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8">
        <h3 className="text-lg font-black text-slate-800 mb-2">Test Live Web Push</h3>
        <p className="text-xs text-slate-500 mb-4">
          Sends an immediate high-priority push notification with sound and vibration to your device.
        </p>
        <button
          onClick={sendTestPush}
          disabled={testing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md flex items-center gap-2 text-sm"
        >
          <Send className="w-4 h-4" /> {testing ? 'Sending...' : 'Send Test Notification'}
        </button>

        {testResult && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono">
            {JSON.stringify(testResult, null, 2)}
          </div>
        )}
      </div>

      {/* Push Logs */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 mb-4">Recent Push Delivery Logs</h3>
        {data?.recentLogs && data.recentLogs.length > 0 ? (
          <div className="space-y-2">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800">{log.title}</span>
                  <span className="text-slate-400 block text-[10px]">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <span className={`px-2 py-0.5 rounded font-black uppercase text-[10px] ${
                  log.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No push events logged yet.</p>
        )}
      </div>
    </div>
  );
}
