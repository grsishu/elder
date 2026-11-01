/**
 * Offline Game Session Sync Manager
 * Queues game sessions in localStorage when offline or network fails,
 * and auto-synchronizes with /api/games/sync-offline when connection returns.
 */

const STORAGE_KEY = 'smriti_offline_game_sessions';

export function getOfflineSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[OfflineSync] Failed to read stored sessions:', err);
    return [];
  }
}

export function queueOfflineSession(session) {
  try {
    const existing = getOfflineSessions();
    const sessionId = session.clientSessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    existing.push({
      ...session,
      clientSessionId: sessionId,
      queuedAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    console.log(`[OfflineSync] Queued session offline: ${sessionId}`);
  } catch (err) {
    console.warn('[OfflineSync] Failed to queue session:', err);
  }
}

export async function flushOfflineSessions() {
  const sessions = getOfflineSessions();
  if (sessions.length === 0) return { success: true, count: 0 };

  try {
    const res = await fetch('/api/games/sync-offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessions }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.removeItem(STORAGE_KEY);
      console.log(`[OfflineSync] Successfully flushed ${data.syncedCount || sessions.length} sessions.`);
      return { success: true, count: data.syncedCount || sessions.length };
    }
  } catch (err) {
    console.warn('[OfflineSync] Flush attempt failed, will retry on next online event:', err.message);
  }

  return { success: false, count: 0 };
}

// Auto-register window online listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineSync] Device is back online. Syncing sessions...');
    flushOfflineSessions();
  });

  // Try flushing on initial script execution
  if (navigator.onLine) {
    setTimeout(flushOfflineSessions, 3000);
  }
}

