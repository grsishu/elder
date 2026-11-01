/**
 * Location Scheduler for Smriti Saathi
 * Handles automatic periodic checks (default 5 min), Screen Wake Lock in Guardian Mode,
 * tab visibility catch-up, and offline IndexedDB queue flushing.
 */

import { WebLocationProvider, NativeLocationProvider } from './locationProvider.js';
import { enqueueSample, getPendingSamples, removeSamples } from './locationQueue.js';

let activeSchedulerTimer = null;
let wakeLockSentinel = null;
let lastCapturedTime = 0;
let isGuardianModeEnabled = false;
let currentElderId = null;
let currentIntervalMin = 5;
let isRunning = false;
let isFlushingQueue = false;

// Callbacks
let statusChangeCallback = null;
let errorCallback = null;
let sampleCallback = null;

// Determine default provider
let provider = new WebLocationProvider();

export function setLocationProvider(newProvider) {
  provider = newProvider;
}

export function getLocationProvider() {
  return provider;
}

/**
 * Screen Wake Lock management
 */
export async function enableWakeLock() {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      if (!wakeLockSentinel) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch (err) {
      console.warn('[WakeLock] Unable to acquire wake lock:', err.message);
    }
  }
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }
}

/**
 * Flush pending offline samples to server
 */
export async function flushLocationQueue(elderId = currentElderId) {
  if (isFlushingQueue) return;
  if (!elderId) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushingQueue = true;
  try {
    const pending = await getPendingSamples();
    if (pending.length === 0) return;

    // Send batch to server (max 50 at a time)
    const batch = pending.slice(0, 50);
    const res = await fetch('/api/location/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elderId,
        samples: batch,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const removedIds = batch.map(s => s.client_id);
      await removeSamples(removedIds);

      // If more pending, recursively flush
      if (pending.length > 50) {
        setTimeout(() => flushLocationQueue(elderId), 500);
      }
    } else if (res.status === 403) {
      console.warn('[LocationScheduler] Location consent is not active on server.');
    }
  } catch (err) {
    console.warn('[LocationScheduler] Queue flush error (will retry when online):', err.message);
  } finally {
    isFlushingQueue = false;
  }
}

/**
 * Capture fix and store/send
 */
export async function captureAndProcessFix() {
  if (!currentElderId) return;

  try {
    const sample = await provider.getCurrentPosition();
    lastCapturedTime = Date.now();

    // 1. Store in IndexedDB first
    await enqueueSample(sample);

    // 2. Notify client sample callback
    if (sampleCallback) sampleCallback(sample);

    // 3. Update status
    if (statusChangeCallback) {
      statusChangeCallback({
        state: 'active',
        lastUpdated: new Date(),
        minutesAgo: 0,
        sample,
      });
    }

    // 4. Flush queue to server
    await flushLocationQueue(currentElderId);
    return sample;
  } catch (err) {
    console.warn('[LocationScheduler] Capture error:', err);
    if (errorCallback) errorCallback(err);
    if (statusChangeCallback) {
      statusChangeCallback({
        state: 'error',
        error: err,
        lastUpdated: lastCapturedTime ? new Date(lastCapturedTime) : null,
      });
    }
    throw err;
  }
}

/**
 * Handle visibility change and window focus for immediate catch-up
 */
function handleVisibilityOrResume() {
  if (!isRunning || !currentElderId) return;

  // Re-enable Wake Lock if Guardian mode is on
  if (isGuardianModeEnabled && document.visibilityState === 'visible') {
    enableWakeLock();
  }

  // Check if catch-up fix is needed
  const elapsedMs = Date.now() - lastCapturedTime;
  const intervalMs = currentIntervalMin * 60 * 1000;

  if (elapsedMs >= intervalMs) {
    console.log('[LocationScheduler] Tab resumed / visible: running immediate catch-up check...');
    captureAndProcessFix().catch(() => {});
  } else {
    // Flush any pending queue
    flushLocationQueue(currentElderId).catch(() => {});
  }
}

/**
 * Start 5-minute location scheduler
 */
export function startLocationScheduler({
  elderId,
  intervalMin = 5,
  guardianMode = false,
  onSample = null,
  onStatusChange = null,
  onError = null,
}) {
  currentElderId = elderId;
  currentIntervalMin = intervalMin;
  isGuardianModeEnabled = guardianMode;
  sampleCallback = onSample;
  statusChangeCallback = onStatusChange;
  errorCallback = onError;

  stopLocationScheduler();
  isRunning = true;

  // Guardian Mode Wake Lock
  if (isGuardianModeEnabled) {
    enableWakeLock();
  }

  // Set up listeners for catch-up and offline recovery
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityOrResume);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrResume);
    window.addEventListener('online', () => flushLocationQueue(currentElderId));
  }

  // Run initial fix immediately
  captureAndProcessFix().catch(() => {});

  // Schedule recurring checks
  const intervalMs = currentIntervalMin * 60 * 1000;
  activeSchedulerTimer = setInterval(() => {
    captureAndProcessFix().catch(() => {});
  }, intervalMs);

  return () => stopLocationScheduler();
}

/**
 * Stop location scheduler
 */
export function stopLocationScheduler() {
  if (activeSchedulerTimer) {
    clearInterval(activeSchedulerTimer);
    activeSchedulerTimer = null;
  }
  releaseWakeLock();
  isRunning = false;

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityOrResume);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleVisibilityOrResume);
  }
}

/**
 * Toggle Guardian mode
 */
export function setGuardianMode(enabled) {
  isGuardianModeEnabled = enabled;
  if (enabled) {
    enableWakeLock();
  } else {
    releaseWakeLock();
  }
}

export function isSchedulerRunning() {
  return isRunning;
}

export function getLastCapturedTime() {
  return lastCapturedTime;
}

