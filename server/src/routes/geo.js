import express from 'express';
import { query } from '../db.js';
import { logServerError } from '../errors.js';

const router = express.Router();

// Rate limiter for Nominatim (1 request per second globally)
let lastNominatimRequestTime = 0;
async function throttleNominatim() {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();
}

// GET /api/geo/search?q=Guwahati
router.get('/search', async (req, res) => {
  const q = req.query.q?.toString().trim();
  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  try {
    // 1. Check geo_cache table
    const cacheRes = await query(
      `SELECT latitude, longitude, display_name FROM geo_cache WHERE LOWER(query) = LOWER($1) LIMIT 1`,
      [q]
    );

    if (cacheRes.rows.length > 0) {
      return res.json({
        cached: true,
        results: [
          {
            lat: parseFloat(cacheRes.rows[0].latitude),
            lon: parseFloat(cacheRes.rows[0].longitude),
            display_name: cacheRes.rows[0].display_name,
          },
        ],
      });
    }

    // 2. Throttle before calling Nominatim
    await throttleNominatim();

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      q
    )}&limit=5&countrycodes=in`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmritiSaathi/1.0 (contact: support@smritisaathi.in)',
        'Accept-Language': 'en,hi',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Nominatim responded with status ${response.status}`);
    }

    const data = await response.json();

    // Cache top result
    if (Array.isArray(data) && data.length > 0) {
      const top = data[0];
      await query(
        `INSERT INTO geo_cache (query, latitude, longitude, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (query) DO NOTHING`,
        [q, top.lat, top.lon, top.display_name]
      ).catch(() => {});
    }

    return res.json({ cached: false, results: data });
  } catch (err) {
    logServerError({
      message: `Geocoding search error for '${q}': ${err.message}`,
      route: '/api/geo/search',
      statusCode: 500,
    });
    return res.status(500).json({
      error: 'GEOCODING_FAILED',
      message: 'Could not lookup address. You can pin location manually on the map.',
      details: err.message,
    });
  }
});

// Calculate compass heading between two coordinates
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  brng = (brng + 360) % 360;

  const directions = [
    'north', 'north-east', 'east', 'south-east',
    'south', 'south-west', 'west', 'north-west',
  ];
  const index = Math.round(brng / 45) % 8;
  return directions[index];
}

// Approximate Haversine distance in meters
function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const toRad = deg => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// GET /api/geo/route?fromLat=&fromLng=&toLat=&toLng=&destName=Home
router.get('/route', async (req, res) => {
  const fromLat = parseFloat(req.query.fromLat);
  const fromLng = parseFloat(req.query.fromLng);
  const toLat = parseFloat(req.query.toLat);
  const toLng = parseFloat(req.query.toLng);
  const destName = req.query.destName || 'Destination';

  if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
    return res.status(400).json({ error: 'Valid coordinates required' });
  }

  const distanceM = haversineDistanceM(fromLat, fromLng, toLat, toLng);
  const heading = calculateBearing(fromLat, fromLng, toLat, toLng);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=walking`;

  // Fallback straight-line instruction
  const fallbackRoute = {
    fallback: true,
    message: `Walk ${heading} about ${distanceM >= 1000 ? (distanceM / 1000).toFixed(1) + ' km' : distanceM + ' metres'} toward ${destName}`,
    distanceMeters: distanceM,
    durationSeconds: Math.round(distanceM / 1.1), // ~4 km/h walking speed
    googleMapsUrl,
    steps: [
      {
        instruction: `Head ${heading} directly toward ${destName} (approx. ${distanceM}m)`,
        distanceMeters: distanceM,
      },
    ],
    coordinates: [
      [fromLat, fromLng],
      [toLat, toLng],
    ],
  };

  // Try calling public OSRM server with 8s timeout and 1 retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const json = await resp.json();
        if (json.code === 'Ok' && json.routes?.length > 0) {
          const route = json.routes[0];
          const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const steps = (route.legs[0]?.steps || []).map(s => ({
            instruction: s.maneuver?.type === 'arrive' ? `You have arrived at ${destName}` : (s.name ? `Walk on ${s.name}` : `Continue ${s.maneuver?.modifier || 'straight'}`),
            distanceMeters: Math.round(s.distance),
            durationSeconds: Math.round(s.duration),
            modifier: s.maneuver?.modifier,
            type: s.maneuver?.type,
          }));

          return res.json({
            fallback: false,
            distanceMeters: Math.round(route.distance),
            durationSeconds: Math.round(route.duration),
            coordinates,
            steps,
            googleMapsUrl,
          });
        }
      }
    } catch (err) {
      if (attempt === 2) {
        logServerError({
          message: `OSRM routing failed after 2 attempts: ${err.message}`,
          route: '/api/geo/route',
          statusCode: 502,
        });
      }
    }
  }

  // If OSRM failed or timed out, return honest fallback
  return res.json(fallbackRoute);
});

export default router;
