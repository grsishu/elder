/**
 * Shared Location Module for Smriti Saathi
 * Used across address pin, I am lost, Silent Guardian, ride pickup, and family live tracking.
 * NEVER call navigator.geolocation anywhere else.
 */

let simulatedLocation = null;
const SIMULATION_KEY = 'smriti_simulated_location';
const LAST_KNOWN_KEY = 'smriti_last_known_location';

// Try loading simulated location from storage for Demo Mode
try {
  const savedSim = localStorage.getItem(SIMULATION_KEY);
  if (savedSim) simulatedLocation = JSON.parse(savedSim);
} catch {
  // ignore
}

export function setSimulatedLocation(coords) {
  simulatedLocation = coords;
  if (coords) {
    localStorage.setItem(SIMULATION_KEY, JSON.stringify(coords));
  } else {
    localStorage.removeItem(SIMULATION_KEY);
  }
}

export function getSimulatedLocation() {
  return simulatedLocation;
}

export function getLastKnownLocation() {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastKnownLocation(loc) {
  try {
    localStorage.setItem(
      LAST_KNOWN_KEY,
      JSON.stringify({
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
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

/**
 * Gets high-accuracy position with automatic fallback and retry.
 * @returns {Promise<{ latitude: number, longitude: number, accuracy: number, simulated?: boolean, isFallback?: boolean }>}
 */
export async function getCurrentLocation() {
  // 1. Check for Simulation (Demo Mode override)
  if (simulatedLocation) {
    return {
      latitude: simulatedLocation.latitude,
      longitude: simulatedLocation.longitude,
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

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw {
      code: 'NOT_SUPPORTED',
      message: 'Geolocation is not supported by your device.',
    };
  }

  // Helper promise for getCurrentPosition with customizable options
  const getFix = (options) =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // Attempt 1: High accuracy, 15s timeout
  try {
    const pos = await getFix({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
    const fix = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: new Date(pos.timestamp).toISOString(),
    };
    saveLastKnownLocation(fix);
    return fix;
  } catch (firstErr) {
    // If timeout, retry once with enableHighAccuracy: false
    if (firstErr.code === 3) {
      try {
        const retryPos = await getFix({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 30000,
        });
        const retryFix = {
          latitude: retryPos.coords.latitude,
          longitude: retryPos.coords.longitude,
          accuracy: retryPos.coords.accuracy,
          timestamp: new Date(retryPos.timestamp).toISOString(),
          isRetry: true,
        };
        saveLastKnownLocation(retryFix);
        return retryFix;
      } catch (secondErr) {
        // Fall back to last known location if available
        const lastKnown = getLastKnownLocation();
        if (lastKnown) {
          return { ...lastKnown, isFallback: true };
        }
        throw mapGeolocationError(secondErr);
      }
    }

    // If permission denied or other error
    const lastKnown = getLastKnownLocation();
    if (lastKnown && firstErr.code !== 1) {
      return { ...lastKnown, isFallback: true };
    }
    throw mapGeolocationError(firstErr);
  }
}

/**
 * Watch location for tracking, throttled to send at most once every 30 seconds.
 */
let watchId = null;
let lastWatchSendTime = 0;

export function startLocationWatch(onLocationUpdate, onError) {
  if (simulatedLocation) {
    const interval = setInterval(() => {
      onLocationUpdate({
        latitude: simulatedLocation.latitude,
        longitude: simulatedLocation.longitude,
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

function mapGeolocationError(err) {
  if (err.code === 1) {
    return {
      code: 'PERMISSION_DENIED',
      message: 'Location permission was denied. Please allow location in your browser settings.',
      details: err.message,
    };
  }
  if (err.code === 2) {
    return {
      code: 'POSITION_UNAVAILABLE',
      message: 'Turn on GPS and move near a window or outdoors.',
      details: err.message,
    };
  }
  if (err.code === 3) {
    return {
      code: 'TIMEOUT',
      message: 'Finding location timed out. Please tap retry.',
      details: err.message,
    };
  }
  return {
    code: 'UNKNOWN',
    message: err.message || 'Could not determine location.',
  };
}
