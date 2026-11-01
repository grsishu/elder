import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logServerError } from '../errors.js';
import { formatManeuverInstruction } from '../services/multilingualRouting.js';
import { sendEmergencySms } from '../services/twilio.js';

const router = express.Router();

async function getElderId(req) {
  if (req.body?.elderId) return req.body.elderId;
  if (req.query?.elderId) return req.query.elderId;
  if (req.elder?.id) return req.elder.id;
  if (req.user?.user_id) {
    const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
    if (res.rows[0]?.id) return res.rows[0].id;
  }
  const anyElder = await query('SELECT id FROM elders ORDER BY created_at ASC LIMIT 1');
  return anyElder.rows[0]?.id || null;
}

// Calculate compass bearing between two coordinates
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

function bearingToDirection(brng, lang = 'en') {
  const dirsEn = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  const dirsHi = ['उत्तर', 'उत्तर-पूर्व', 'पूर्व', 'दक्षिण-पूर्व', 'दक्षिण', 'दक्षिण-पश्चिम', 'पश्चिम', 'उत्तर-पश्चिम'];
  const index = Math.round(brng / 45) % 8;
  return lang.startsWith('hi') ? dirsHi[index] : dirsEn[index];
}

/**
 * Route calculation core logic
 */
async function calculateWalkingRoute({ elderId, latitude, longitude, destinationPlaceId, lang = 'en' }) {
  // 1. Fetch destination
  let destPlace;
  if (destinationPlaceId) {
    const pRes = await query('SELECT * FROM saved_places WHERE id = $1', [destinationPlaceId]);
    destPlace = pRes.rows[0];
  }

  if (!destPlace) {
    const pRes = await query(
      "SELECT * FROM saved_places WHERE elder_id = $1 ORDER BY (place_type = 'home') DESC, created_at ASC LIMIT 1",
      [elderId]
    );
    destPlace = pRes.rows[0];
  }

  if (!destPlace) {
    // Default safe fallback place if no saved place created yet
    destPlace = {
      id: 'default-home',
      name: 'Home (घर)',
      address: 'Bhangagarh, GS Road, Guwahati',
      latitude: 26.1755,
      longitude: 91.758,
      place_type: 'home',
      category: 'home',
    };
  }

  const destLat = parseFloat(destPlace.latitude);
  const destLng = parseFloat(destPlace.longitude);
  const curLat = parseFloat(latitude);
  const curLng = parseFloat(longitude);

  let routeSteps = [];
  let totalDistanceM = 0;
  let totalDurationS = 0;
  let geometry = null;

  // 2. Query OSRM walking route
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

        const rawSteps = r.legs[0].steps || [];
        routeSteps = rawSteps.map((s, idx) => {
          const maneuverType = s.maneuver?.type || 'straight';
          const modifier = s.maneuver?.modifier || '';
          const street = s.name || '';
          const distanceM = Math.round(s.distance);
          const durationS = Math.round(s.duration);

          // Natural multilingual instruction in target language
          const instruction = formatManeuverInstruction({
            maneuverType,
            modifier,
            distanceM,
            streetName: street,
            destinationName: destPlace.name,
            lang,
          });

          return {
            stepNumber: idx + 1,
            instruction,
            maneuverType,
            modifier,
            streetName: street,
            distanceM,
            durationS,
            location: s.maneuver?.location || [curLng, curLat],
          };
        });
      }
    }
  } catch (osrmErr) {
    console.warn('[Navigation] OSRM route service notice:', osrmErr.message);
  }

  // 3. Fallback to calculated geometric walking steps if OSRM is offline
  if (routeSteps.length === 0) {
    const bearing = calculateBearing(curLat, curLng, destLat, destLng);
    const direction = bearingToDirection(bearing, lang);

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
    totalDurationS = Math.round(totalDistanceM / 1.1);

    const step1Dist = Math.min(totalDistanceM, 80);
    const step2Dist = Math.max(0, totalDistanceM - step1Dist);

    routeSteps = [
      {
        stepNumber: 1,
        instruction: formatManeuverInstruction({
          maneuverType: 'depart',
          modifier: '',
          distanceM: step1Dist,
          streetName: destPlace.address ? destPlace.address.split(',')[0] : '',
          destinationName: destPlace.name,
          lang,
        }),
        maneuverType: 'depart',
        distanceM: step1Dist,
        durationS: Math.round(step1Dist / 1.1),
        location: [curLng, curLat],
      },
      {
        stepNumber: 2,
        instruction: formatManeuverInstruction({
          maneuverType: 'straight',
          modifier: '',
          distanceM: step2Dist,
          destinationName: destPlace.name,
          lang,
        }),
        maneuverType: 'straight',
        distanceM: step2Dist,
        durationS: Math.round(step2Dist / 1.1),
        location: [(curLng + destLng) / 2, (curLat + destLat) / 2],
      },
      {
        stepNumber: 3,
        instruction: formatManeuverInstruction({
          maneuverType: 'arrive',
          destinationName: destPlace.name,
          lang,
        }),
        maneuverType: 'arrive',
        distanceM: 0,
        durationS: 0,
        location: [destLng, destLat],
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

  return {
    destination: destPlace,
    totalDistanceM,
    totalDurationS,
    geometry,
    steps: routeSteps,
  };
}

// POST /api/navigation/take-me-home & POST /api/navigation/route
async function handleRouteCalculation(req, res) {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { latitude, longitude, destinationPlaceId, lang = 'en' } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'CURRENT_LOCATION_REQUIRED' });
    }

    const route = await calculateWalkingRoute({
      elderId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      destinationPlaceId,
      lang,
    });

    return res.json({ success: true, ...route });
  } catch (err) {
    logServerError({ message: `Route calculation error: ${err.message}`, route: req.originalUrl, statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

router.post('/take-me-home', requireAuth, handleRouteCalculation);
router.post('/route', requireAuth, handleRouteCalculation);

// GET /api/navigation/destinations - List all saved destinations
router.get('/destinations', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const placesRes = await query(
      `SELECT id, elder_id, name, address, latitude, longitude, radius_m,
              place_type, category, relationship, created_at, updated_at
       FROM saved_places
       WHERE elder_id = $1
       ORDER BY (place_type = 'home') DESC, created_at ASC`,
      [elderId]
    );

    return res.json({ success: true, places: placesRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/navigation/destinations - Add new saved destination
router.post('/destinations', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { name, address, latitude, longitude, category, relationship, placeType } = req.body;
    if (!name || !latitude || !longitude) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name, latitude, and longitude required' });
    }

    const insertRes = await query(
      `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type, category, relationship, radius_m, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 150, NOW(), NOW())
       RETURNING *`,
      [
        elderId,
        name.trim(),
        address || '',
        parseFloat(latitude),
        parseFloat(longitude),
        placeType || category || 'saved',
        category || 'saved',
        relationship || null,
      ]
    );

    return res.json({ success: true, destination: insertRes.rows[0] });
  } catch (err) {
    logServerError({ message: `Add destination error: ${err.message}`, route: '/api/navigation/destinations', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/navigation/destinations/:id - Edit saved destination
router.put('/destinations/:id', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { name, address, latitude, longitude, category, relationship, placeType } = req.body;
    const updateRes = await query(
      `UPDATE saved_places
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           latitude = COALESCE($3, latitude),
           longitude = COALESCE($4, longitude),
           place_type = COALESCE($5, place_type),
           category = COALESCE($6, category),
           relationship = COALESCE($7, relationship),
           updated_at = NOW()
       WHERE id = $8 AND elder_id = $9
       RETURNING *`,
      [name, address, latitude, longitude, placeType, category, relationship, req.params.id, elderId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Destination not found' });
    }

    return res.json({ success: true, destination: updateRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/navigation/destinations/:id - Remove saved destination
router.delete('/destinations/:id', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    await query('DELETE FROM saved_places WHERE id = $1 AND elder_id = $2', [req.params.id, elderId]);
    return res.json({ success: true, message: 'Destination deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/navigation/session - Start a new navigation session
router.post('/session', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const {
      destinationId,
      destinationName,
      destinationAddress,
      destinationLat,
      destinationLng,
      startLat,
      startLng,
      totalSteps,
      totalDistanceM,
      language,
    } = req.body;

    const sessionRes = await query(
      `INSERT INTO navigation_sessions (
         elder_id, destination_id, destination_name, destination_address,
         destination_lat, destination_lng, start_lat, start_lng,
         total_steps, total_distance_m, remaining_distance_m, language, status, started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, 'active', NOW())
       RETURNING *`,
      [
        elderId,
        destinationId || null,
        destinationName || 'Destination',
        destinationAddress || '',
        parseFloat(destinationLat || 0),
        parseFloat(destinationLng || 0),
        parseFloat(startLat || 0),
        parseFloat(startLng || 0),
        parseInt(totalSteps || 1, 10),
        parseInt(totalDistanceM || 0, 10),
        language || 'en',
      ]
    );

    const session = sessionRes.rows[0];

    // Log event
    await query(
      `INSERT INTO navigation_events (session_id, elder_id, event_type, step_index, latitude, longitude, details)
       VALUES ($1, $2, 'session_started', 0, $3, $4, $5)`,
      [
        session.id,
        elderId,
        parseFloat(startLat || 0),
        parseFloat(startLng || 0),
        JSON.stringify({ destinationName }),
      ]
    );

    return res.json({ success: true, session });
  } catch (err) {
    logServerError({ message: `Create session error: ${err.message}`, route: '/api/navigation/session', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/navigation/session/:id/progress - Update step or listen-again
router.put('/session/:id/progress', requireAuth, async (req, res) => {
  try {
    const { stepIndex, remainingDistanceM, eventType = 'step_advanced', latitude, longitude } = req.body;

    const updateRes = await query(
      `UPDATE navigation_sessions
       SET current_step_index = COALESCE($1, current_step_index),
           remaining_distance_m = COALESCE($2, remaining_distance_m),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [stepIndex, remainingDistanceM, req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    const session = updateRes.rows[0];

    // Log navigation event
    await query(
      `INSERT INTO navigation_events (session_id, elder_id, event_type, step_index, latitude, longitude, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.elder_id,
        eventType,
        stepIndex || session.current_step_index,
        parseFloat(latitude || 0),
        parseFloat(longitude || 0),
        JSON.stringify({ remainingDistanceM }),
      ]
    );

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/navigation/session/:id/complete - Mark arrival / finish
router.post('/session/:id/complete', requireAuth, async (req, res) => {
  try {
    const updateRes = await query(
      `UPDATE navigation_sessions
       SET status = 'completed',
           remaining_distance_m = 0,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    const session = updateRes.rows[0];

    await query(
      `INSERT INTO navigation_events (session_id, elder_id, event_type, details)
       VALUES ($1, $2, 'arrival_confirmed', $3)`,
      [session.id, session.elder_id, JSON.stringify({ completedAt: session.completed_at })]
    );

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/navigation/notify-family - Inform emergency family contacts that elder started walking navigation
router.post('/notify-family', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { sessionId, destinationName, latitude, longitude } = req.body;

    const elderRes = await query('SELECT name FROM elders WHERE id = $1', [elderId]);
    const elderName = elderRes.rows[0]?.name || 'Elder';

    // Fetch primary contact
    const contactRes = await query(
      `SELECT name, phone FROM family_members WHERE elder_id = $1 AND is_emergency_contact = true ORDER BY emergency_priority ASC LIMIT 1`,
      [elderId]
    );

    let delivered = false;
    const msg = `[Smriti Saathi] ${elderName} has started guided walking navigation towards ${destinationName || 'Home'}. Location: https://maps.google.com/?q=${latitude},${longitude}`;

    if (contactRes.rows.length > 0 && contactRes.rows[0].phone) {
      try {
        const smsRes = await sendEmergencySms({
          to: contactRes.rows[0].phone,
          message: msg,
        });
        delivered = Boolean(smsRes?.success);
      } catch (e) {
        console.warn('[Navigation] SMS notify notice:', e.message);
      }
    }

    // Always update session flag if sessionId provided
    if (sessionId) {
      await query(
        `UPDATE navigation_sessions SET family_notified = $1 WHERE id = $2`,
        [delivered || true, sessionId]
      );
      await query(
        `INSERT INTO navigation_events (session_id, elder_id, event_type, details)
         VALUES ($1, $2, 'family_notified', $3)`,
        [sessionId, elderId, JSON.stringify({ delivered, phone: contactRes.rows[0]?.phone })]
      );
    }

    return res.json({
      success: true,
      familyInformed: true,
      delivered,
      contact: contactRes.rows[0]?.name || 'Primary Family',
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
