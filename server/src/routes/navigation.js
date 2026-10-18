import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logServerError } from '../errors.js';

const router = express.Router();

async function getElderId(req) {
  if (req.elder?.id) return req.elder.id;
  const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
  return res.rows[0]?.id || null;
}

// Calculate compass bearing between two points
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

function bearingToDirection(brng) {
  const dirs = ['North (उत्तर)', 'North-East (उत्तर-पूर्व)', 'East (पूर्व)', 'South-East (दक्षिण-पूर्व)', 'South (दक्षिण)', 'South-West (दक्षिण-पश्चिम)', 'West (पश्चिम)', 'North-West (उत्तर-पश्चिम)'];
  const index = Math.round(brng / 45) % 8;
  return dirs[index];
}

// POST /api/navigation/take-me-home
router.post('/take-me-home', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { latitude, longitude, destinationPlaceId } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'CURRENT_LOCATION_REQUIRED' });
    }

    // 1. Fetch destination (default to 'home' or chosen place)
    let destPlace;
    if (destinationPlaceId) {
      const pRes = await query('SELECT * FROM saved_places WHERE id = $1 AND elder_id = $2', [destinationPlaceId, elderId]);
      destPlace = pRes.rows[0];
    } else {
      const pRes = await query("SELECT * FROM saved_places WHERE elder_id = $1 AND place_type = 'home' LIMIT 1", [elderId]);
      destPlace = pRes.rows[0] || (await query('SELECT * FROM saved_places WHERE elder_id = $1 LIMIT 1', [elderId])).rows[0];
    }

    if (!destPlace) {
      return res.status(400).json({
        error: 'NO_DESTINATION',
        message: 'No Home address or saved place found. Please set home address in Setup Wizard.',
      });
    }

    const destLat = parseFloat(destPlace.latitude);
    const destLng = parseFloat(destPlace.longitude);
    const curLat = parseFloat(latitude);
    const curLng = parseFloat(longitude);

    // 2. Log Silent Guardian Event to alert family
    await query(
      `INSERT INTO silent_guardian_events (elder_id, event_type, reason, severity, details)
       VALUES ($1, 'take_me_home_triggered', $2, 'warning', $3)`,
      [
        elderId,
        `Elder triggered 'Take Me Home' routing to ${destPlace.name}`,
        JSON.stringify({ fromLat: curLat, fromLng: curLng, destName: destPlace.name, destLat, destLng }),
      ]
    );

    // 3. Attempt OSRM walking route with graceful fallback
    let routeSteps = [];
    let totalDistanceM = 0;
    let totalDurationS = 0;
    let geometry = null;

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${curLng},${curLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data.routes && data.routes[0]) {
          const r = data.routes[0];
          totalDistanceM = Math.round(r.distance);
          totalDurationS = Math.round(r.duration);
          geometry = r.geometry;

          routeSteps = r.legs[0].steps.map((s, idx) => ({
            stepNumber: idx + 1,
            instruction: s.maneuver.instruction || `Walk ${Math.round(s.distance)} meters`,
            distanceM: Math.round(s.distance),
            durationS: Math.round(s.duration),
          }));
        }
      }
    } catch (osrmErr) {
      console.warn('[Navigation] OSRM walking route fetch fallback:', osrmErr.message);
    }

    // Straight-line fallback if OSRM was unavailable or returned empty steps
    if (routeSteps.length === 0) {
      const bearing = calculateBearing(curLat, curLng, destLat, destLng);
      const direction = bearingToDirection(bearing);

      // Haversine distance
      const R = 6371e3;
      const φ1 = (curLat * Math.PI) / 180;
      const φ2 = (destLat * Math.PI) / 180;
      const Δφ = ((destLat - curLat) * Math.PI) / 180;
      const Δλ = ((destLng - curLng) * Math.PI) / 180;
      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistanceM = Math.round(R * c);
      totalDurationS = Math.round(totalDistanceM / 1.1); // ~1.1 m/s walking speed

      routeSteps = [
        {
          stepNumber: 1,
          instruction: `Walk towards ${direction} heading towards ${destPlace.name}. (${totalDistanceM} meters)`,
          distanceM: totalDistanceM,
          durationS: totalDurationS,
        },
        {
          stepNumber: 2,
          instruction: `You will reach ${destPlace.name} (${destPlace.address || ''}).`,
          distanceM: 0,
          durationS: 0,
        },
      ];

      geometry = {
        type: 'LineString',
        coordinates: [
          [curLng, curLat],
          [destLng, destLat],
        ],
      };
    }

    return res.json({
      success: true,
      destination: destPlace,
      totalDistanceM,
      totalDurationS,
      geometry,
      steps: routeSteps,
    });
  } catch (err) {
    logServerError({ message: `Navigation error: ${err.message}`, route: '/api/navigation/take-me-home', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/navigation/destinations - List saved destinations
router.get('/destinations', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const places = await query('SELECT * FROM saved_places WHERE elder_id = $1 ORDER BY place_type = \'home\' DESC', [elderId]);
    return res.json({ success: true, places: places.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
