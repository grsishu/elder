/**
 * Shared Location Module for Smriti Saathi
 * Used across address pin, Take Me Home, Silent Guardian, ride pickup, family live tracking, and diagnostics.
 * THIS IS THE ONLY FILE IN THE CLIENT CODEBASE THAT CALLS navigator.geolocation.
 */

import {
  WebLocationProvider,
  NativeLocationProvider,
  mapGeolocationError,
} from './locationProvider.js';
import {
  startLocationScheduler,
  stopLocationScheduler,
  setGuardianMode,
  flushLocationQueue,
  captureAndProcessFix,
  isSchedulerRunning,
  getLastCapturedTime,
  setLocationProvider,
  getLocationProvider,
} from './locationScheduler.js';
import { enqueueSample, getPendingSamples, removeSamples, clearQueue } from './locationQueue.js';

let simulatedLocation = null;
const SIMULATION_KEY = 'smriti_simulated_location';
const LAST_KNOWN_KEY = 'smriti_last_known_location';

// Try loading simulated location from storage for Demo Mode
try {
  if (typeof localStorage !== 'undefined') {
    const savedSim = localStorage.getItem(SIMULATION_KEY);
    if (savedSim) simulatedLocation = JSON.parse(savedSim);
  }
} catch {
  // ignore
}

export function setSimulatedLocation(coords) {
  simulatedLocation = coords;
  if (typeof localStorage !== 'undefined') {
    if (coords) {
      localStorage.setItem(SIMULATION_KEY, JSON.stringify(coords));
    } else {
      localStorage.removeItem(SIMULATION_KEY);
    }
  }
}

export function getSimulatedLocation() {
  return simulatedLocation;
}

export function getLastKnownLocation() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_KNOWN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLastKnownLocation(loc) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      LAST_KNOWN_KEY,
      JSON.stringify({
        latitude: loc.latitude || loc.lat,
        longitude: loc.longitude || loc.lng,
        accuracy: loc.accuracy || loc.accuracy_m,
        timestamp: new Date().toISOString(),
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Checks if current window context is secure (HTTPS or localhost)
 */
export function isSecureContext() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/**
 * Checks Permissions API state if available
 */
export async function getPermissionStatus() {
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state; // 'granted', 'prompt', 'denied'
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

// Instantiate default web provider connected to simulated location getter
const defaultWebProvider = new WebLocationProvider({
  getSimulatedLocation,
});
setLocationProvider(defaultWebProvider);

/**
 * Gets high-accuracy position with automatic fallback and retry.
 * @returns {Promise<{ latitude: number, longitude: number, accuracy: number, simulated?: boolean, isFallback?: boolean }>}
 */
export async function getCurrentLocation() {
  // 1. Simulation override
  if (simulatedLocation) {
    return {
      latitude: simulatedLocation.latitude || simulatedLocation.lat,
      longitude: simulatedLocation.longitude || simulatedLocation.lng,
      accuracy: simulatedLocation.accuracy || 10,
      simulated: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Validate Secure Context
  if (!isSecureContext()) {
    throw {
      code: 'INSECURE_CONTEXT',
      message: 'Location requires HTTPS or localhost to ensure your privacy.',
    };
  }

  const provider = getLocationProvider();
  try {
    const fix = await provider.getCurrentPosition();
    const result = {
      latitude: fix.lat,
      longitude: fix.lng,
      accuracy: fix.accuracy_m,
      speed: fix.speed_mps,
      heading: fix.heading,
      battery: fix.battery_pct,
      source: fix.source,
      simulated: fix.source === 'simulated',
      timestamp: fix.captured_at,
    };
    saveLastKnownLocation(result);
    return result;
  } catch (err) {
    const lastKnown = getLastKnownLocation();
    if (lastKnown && err.code !== 'PERMISSION_DENIED') {
      return { ...lastKnown, isFallback: true };
    }
    throw err;
  }
}

/**
 * Watch location for continuous tracking throttled to at most once per 30s
 */
let watchId = null;
let lastWatchSendTime = 0;

export function startLocationWatch(onLocationUpdate, onError) {
  if (simulatedLocation) {
    const interval = setInterval(() => {
      onLocationUpdate({
        latitude: simulatedLocation.latitude || simulatedLocation.lat,
        longitude: simulatedLocation.longitude || simulatedLocation.lng,
        accuracy: simulatedLocation.accuracy || 10,
        simulated: true,
        timestamp: new Date().toISOString(),
      });
    }, 10000);
    return () => clearInterval(interval);
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};

  stopLocationWatch();

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastWatchSendTime >= 30000) {
        lastWatchSendTime = now;
        const fix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        };
        saveLastKnownLocation(fix);
        onLocationUpdate(fix);
      }
    },
    (err) => {
      onError?.(mapGeolocationError(err));
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 15000,
    }
  );

  return stopLocationWatch;
}

export function stopLocationWatch() {
  if (watchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// Export Scheduler and Providers
export {
  startLocationScheduler,
  stopLocationScheduler,
  setGuardianMode,
  flushLocationQueue,
  captureAndProcessFix,
  isSchedulerRunning,
  getLastCapturedTime,
  WebLocationProvider,
  NativeLocationProvider,
  enqueueSample,
  getPendingSamples,
  removeSamples,
  clearQueue,
  mapGeolocationError,
  setLocationProvider,
  getLocationProvider,
};
