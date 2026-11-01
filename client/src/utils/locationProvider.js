/**
 * Location Provider Interface and Implementations
 * Supports WebLocationProvider (browser/PWA) and NativeLocationProvider (Capacitor background)
 */

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Shared interface definition for location providers
 */
export class LocationProvider {
  async getCurrentPosition() {
    throw new Error('getCurrentPosition must be implemented by subclass');
  }

  async isAvailable() {
    return true;
  }
}

/**
 * WebLocationProvider - Uses browser navigator.geolocation
 * High accuracy (20s timeout) with fallback retry to low accuracy (10s timeout)
 */
export class WebLocationProvider extends LocationProvider {
  constructor(options = {}) {
    super();
    this.simulatedLocationGetter = options.getSimulatedLocation || null;
  }

  async isAvailable() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  async getBatteryLevel() {
    if (typeof navigator !== 'undefined' && navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        return Math.round(b.level * 100);
      } catch {
        return null;
      }
    }
    return null;
  }

  async getCurrentPosition() {
    // 1. Check for simulation in DEMO_MODE
    if (this.simulatedLocationGetter) {
      const sim = this.simulatedLocationGetter();
      if (sim) {
        const battery = await this.getBatteryLevel();
        return {
          client_id: generateUUID(),
          lat: sim.latitude !== undefined ? sim.latitude : sim.lat,
          lng: sim.longitude !== undefined ? sim.longitude : sim.lng,
          accuracy_m: sim.accuracy || 10,
          speed_mps: sim.speed || null,
          heading: sim.heading || null,
          battery_pct: battery,
          source: 'simulated',
          captured_at: new Date().toISOString(),
        };
      }
    }

    if (!(await this.isAvailable())) {
      const err = new Error('NOT_SUPPORTED');
      err.code = 'NOT_SUPPORTED';
      err.message = 'Geolocation is not supported by your browser or device.';
      throw err;
    }

    const battery = await this.getBatteryLevel();

    // Helper promise for navigator.geolocation.getCurrentPosition
    const getPos = (opts) =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });

    // Attempt 1: High accuracy, 20s timeout
    try {
      const pos = await getPos({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      });

      return {
        client_id: generateUUID(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: Math.round(pos.coords.accuracy * 10) / 10,
        speed_mps: pos.coords.speed !== null && !isNaN(pos.coords.speed) ? Math.round(pos.coords.speed * 10) / 10 : null,
        heading: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
        battery_pct: battery,
        source: 'gps',
        captured_at: new Date(pos.timestamp).toISOString(),
      };
    } catch (firstErr) {
      // If timeout (code 3), retry once with enableHighAccuracy: false (10s timeout)
      if (firstErr.code === 3) {
        try {
          const retryPos = await getPos({
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 30000,
          });

          return {
            client_id: generateUUID(),
            lat: retryPos.coords.latitude,
            lng: retryPos.coords.longitude,
            accuracy_m: Math.round(retryPos.coords.accuracy * 10) / 10,
            speed_mps: retryPos.coords.speed !== null && !isNaN(retryPos.coords.speed) ? Math.round(retryPos.coords.speed * 10) / 10 : null,
            heading: retryPos.coords.heading !== null && !isNaN(retryPos.coords.heading) ? Math.round(retryPos.coords.heading) : null,
            battery_pct: battery,
            source: 'network',
            captured_at: new Date(retryPos.timestamp).toISOString(),
            isRetry: true,
          };
        } catch (secondErr) {
          throw mapGeolocationError(secondErr);
        }
      }

      throw mapGeolocationError(firstErr);
    }
  }
}

/**
 * NativeLocationProvider - Capacitor Background Geolocation wrapper
 * Used for native Android/iOS tracking with persistent foreground service notification
 */
export class NativeLocationProvider extends LocationProvider {
  constructor() {
    super();
    this.isNative = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  }

  async isAvailable() {
    return this.isNative;
  }

  async getCurrentPosition() {
    if (!this.isNative) {
      // Fallback to web provider if called on non-native platform
      const web = new WebLocationProvider();
      const pos = await web.getCurrentPosition();
      return { ...pos, source: 'native' };
    }

    try {
      // Call Capacitor Background Geolocation plugin or native bridge
      const plugin = window.Capacitor?.Plugins?.BackgroundGeolocation || window.BackgroundGeolocation;
      if (plugin?.getCurrentPosition) {
        const pos = await plugin.getCurrentPosition();
        return {
          client_id: generateUUID(),
          lat: pos.latitude,
          lng: pos.longitude,
          accuracy_m: pos.accuracy,
          speed_mps: pos.speed || null,
          heading: pos.bearing || pos.heading || null,
          battery_pct: pos.battery || null,
          source: 'native',
          captured_at: new Date(pos.time || Date.now()).toISOString(),
        };
      }
    } catch (e) {
      console.warn('[NativeLocation] Native fix failed, falling back to web:', e);
    }

    const web = new WebLocationProvider();
    const pos = await web.getCurrentPosition();
    return { ...pos, source: 'native' };
  }
}

/**
 * Map browser GeolocationPositionError to localized friendly error objects
 */
export function mapGeolocationError(err) {
  if (err.code === 1) {
    return {
      code: 'PERMISSION_DENIED',
      message: 'Location permission was denied.',
      helpText: 'To enable location: On Chrome Android tap the lock icon next to the URL > Permissions > Location > Allow. On iPhone Safari open Settings > Safari > Location > Allow.',
      details: err.message,
    };
  }
  if (err.code === 2) {
    return {
      code: 'POSITION_UNAVAILABLE',
      message: 'GPS signal not available.',
      helpText: 'Please turn on GPS and move near a window or outdoors to get a satellite fix.',
      details: err.message,
    };
  }
  if (err.code === 3) {
    return {
      code: 'TIMEOUT',
      message: 'Finding your location timed out.',
      helpText: 'The network or GPS took too long. Retrying in low accuracy mode.',
      details: err.message,
    };
  }
  return {
    code: err.code || 'UNKNOWN',
    message: err.message || 'Unable to determine location.',
    helpText: 'Please check your device settings and internet connection.',
  };
}

