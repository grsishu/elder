import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  LocationBatchSchema,
  ingestLocationBatch,
  hasActiveConsent,
  checkLocationPermission,
  auditLocationAccess,
  respondToSafetyCheck,
  createLocationAlert,
} from '../services/locationMonitoringService.js';
import {
  ingestLocationSample,
  computeLostRiskScore,
  evaluateElderLostState,
  syncUsualPlaces,
  getLostSettings,
  clusterLearnedUsualPlaces,
} from '../services/lostDetectionAI.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';
import { evaluate, haversineDistanceM } from '../services/decisionEngine.js';

const router = express.Router();

// Helper to get active elder ID
async function getElderId(req) {
  if (req.body?.elderId) return req.body.elderId;
  if (req.query?.elderId) return req.query.elderId;
  if (req.elder?.id) return req.elder.id;
  if (req.user?.user_id) {
    const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
    return res.rows[0]?.id || null;
  }
  return null;
}

// -----------------------------------------------------------------------------
// SECTION 4: POST /api/location/batch - Ingest batch of location fixes (Zod)
// -----------------------------------------------------------------------------
router.post('/batch', async (req, res) => {
  try {
    const parsed = LocationBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        details: parsed.error.format(),
      });
    }

    const { elderId, samples } = parsed.data;

    const result = await ingestLocationBatch({
      elderId,
      samples,
      userId: req.user?.user_id || null,
      clientIp: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'NO_CONSENT') {
      return res.status(403).json({ error: 'NO_CONSENT', message: err.message });
    }
    if (err.code === 'SIMULATED_REJECTED') {
      return res.status(400).json({ error: 'SIMULATED_REJECTED', message: err.message });
    }
    logServerError({ message: `Location batch ingest error: ${err.message}`, route: '/api/location/batch', statusCode: err.statusCode || 500 });
    return res.status(err.statusCode || 500).json({ error: 'BATCH_INGEST_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: CONSENT MANAGEMENT
// -----------------------------------------------------------------------------

// GET /api/location/consent - Check consent status
router.get('/consent', async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const consentRes = await query(
      `SELECT * FROM location_consents
       WHERE elder_id = $1 AND revoked_at IS NULL
       ORDER BY granted_at DESC LIMIT 1`,
      [elderId]
    );

    const hasConsent = consentRes.rows.length > 0;
    return res.json({
      hasConsent,
      consent: consentRes.rows[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/location/consent/grant - Grant location consent
router.post('/consent/grant', async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });
    const { scope = 'caregivers' } = req.body;

    // Insert consent record
    const ins = await query(
      `INSERT INTO location_consents (elder_id, granted_by, granted_at, scope)
       VALUES ($1, $2, NOW(), $3)
       RETURNING *`,
      [elderId, req.user?.user_id || null, scope]
    );

    // Sync legacy elder_consent
    await query(
      `INSERT INTO elder_consent (elder_id, share_location)
       VALUES ($1, TRUE)
       ON CONFLICT (elder_id) DO UPDATE SET share_location = TRUE`,
      [elderId]
    );

    return res.json({ success: true, consent: ins.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/location/consent/revoke - Revoke location consent immediately
router.post('/consent/revoke', async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    await query(
      `UPDATE location_consents
       SET revoked_at = NOW()
       WHERE elder_id = $1 AND revoked_at IS NULL`,
      [elderId]
    );

    await query(
      `UPDATE elder_consent
       SET share_location = FALSE
       WHERE elder_id = $1`,
      [elderId]
    );

    return res.json({ success: true, message: 'Location sharing revoked immediately.' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/location/history/delete - Delete all location history for elder
router.post('/history/delete', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAuthorized = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAuthorized) return res.status(403).json({ error: 'FORBIDDEN' });

    await query(`DELETE FROM location_samples WHERE elder_id = $1`, [elderId]);
    await query(`DELETE FROM locations WHERE elder_id = $1`, [elderId]);
    await query(`DELETE FROM familiar_cells WHERE elder_id = $1`, [elderId]);

    return res.json({ success: true, message: 'All location history permanently deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/location/history/download - Export location data
router.get('/history/download', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAuthorized = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAuthorized) return res.status(403).json({ error: 'FORBIDDEN' });

    const samples = await query(
      `SELECT client_id, lat, lng, accuracy_m, speed_mps, heading, battery_pct, source, captured_at
       FROM location_samples WHERE elder_id = $1 ORDER BY captured_at ASC`,
      [elderId]
    );

    await auditLocationAccess(req.user.user_id, elderId, req.ip, { exportCount: samples.rows.length });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="smriti-location-history-${elderId}.json"`);
    return res.json({
      elderId,
      exportedAt: new Date().toISOString(),
      sampleCount: samples.rows.length,
      samples: samples.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// PUBLIC LIVE 5-MINUTE AI MONITOR (Shared, No Login Required)
// -----------------------------------------------------------------------------

// GET /api/location/public-monitor - Public shared live monitor with 5-min AI comparison
router.get('/public-monitor', async (req, res) => {
  try {
    let elderId = req.query.elderId;
    if (!elderId) {
      // Find default elder with samples or coordinates
      const eRes = await query(
        `SELECT id FROM elders WHERE last_known_lat IS NOT NULL ORDER BY id DESC LIMIT 1`
      );
      if (eRes.rows.length > 0) {
        elderId = eRes.rows[0].id;
      } else {
        const anyE = await query(`SELECT id FROM elders ORDER BY created_at ASC LIMIT 1`);
        if (anyE.rows.length > 0) elderId = anyE.rows[0].id;
      }
    }

    if (!elderId) {
      return res.status(404).json({ error: 'NO_ELDERS_FOUND' });
    }

    // Elder info
    const elderRes = await query(`SELECT id, name, last_known_lat, last_known_lng, last_known_at FROM elders WHERE id = $1`, [elderId]);
    if (elderRes.rows.length === 0) return res.status(404).json({ error: 'ELDER_NOT_FOUND' });
    const elder = elderRes.rows[0];

    // Safe Zones
    const zonesRes = await query(
      `SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE ORDER BY CASE WHEN type = 'home' THEN 0 ELSE 1 END ASC`,
      [elderId]
    );
    const safeZones = zonesRes.rows;

    // Approved Routes
    const routesRes = await query(`SELECT * FROM approved_routes WHERE elder_id = $1 AND active = TRUE`, [elderId]);
    const approvedRoutes = routesRes.rows;

    // Settings
    const sRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
    const settings = sRes.rows[0] || {
      interval_min: 5,
      accuracy_limit_m: 150,
      unfamiliar_distance_m: 1500,
      stationary_min: 10,
      confirm_samples: 2,
      stale_after_min: 15,
      night_start: '20:00',
      night_end: '05:00',
    };

    // 24h Trail
    const trailRes = await query(
      `SELECT client_id, lat, lng, latitude, longitude, accuracy_m, accuracy, speed_mps, battery_pct, source, flags, captured_at
       FROM location_samples
       WHERE elder_id = $1 AND captured_at >= NOW() - INTERVAL '24 hours'
       ORDER BY captured_at ASC`,
      [elderId]
    );

    const goodSamples = trailRes.rows.filter(s => (s.accuracy_m || s.accuracy || 10) <= (settings.accuracy_limit_m || 150));
    const latestSample = trailRes.rows[trailRes.rows.length - 1] || null;

    // Compute AI Evaluation for Current Fix
    const currentEvaluation = evaluate(
      goodSamples,
      safeZones,
      approvedRoutes,
      [],
      settings,
      new Date()
    );

    // Compute 5-Minute Comparison Windows
    const comparisons = [];
    for (let i = 0; i < goodSamples.length; i++) {
      const cur = goodSamples[i];
      const prev = i > 0 ? goodSamples[i - 1] : null;

      const curLat = parseFloat(cur.lat ?? cur.latitude);
      const curLng = parseFloat(cur.lng ?? cur.longitude);

      let displacementM = 0;
      let timeDeltaMin = 5;
      if (prev) {
        const prevLat = parseFloat(prev.lat ?? prev.latitude);
        const prevLng = parseFloat(prev.lng ?? prev.longitude);
        displacementM = Math.round(haversineDistanceM(curLat, curLng, prevLat, prevLng));
        const tCur = new Date(cur.captured_at).getTime();
        const tPrev = new Date(prev.captured_at).getTime();
        timeDeltaMin = Math.max(1, Math.round((tCur - tPrev) / 60000));
      }

      // Proximity to nearest zone
      let nearestZone = null;
      let minDist = Infinity;
      for (const z of safeZones) {
        const zLat = parseFloat(z.lat ?? z.latitude);
        const zLng = parseFloat(z.lng ?? z.longitude);
        const d = Math.round(haversineDistanceM(curLat, curLng, zLat, zLng));
        if (d < minDist) {
          minDist = d;
          nearestZone = {
            name: z.name,
            type: z.type,
            radius_m: z.radius_m,
            distanceM: d,
            isInside: d <= (z.radius_m + (cur.accuracy_m || 15)),
          };
        }
      }

      // Run evaluation up to this point
      const samplesUpToCur = goodSamples.slice(0, i + 1);
      const evalAtPoint = evaluate(
        samplesUpToCur,
        safeZones,
        approvedRoutes,
        [],
        settings,
        new Date(cur.captured_at)
      );

      comparisons.push({
        index: i + 1,
        captured_at: cur.captured_at,
        client_id: cur.client_id,
        lat: curLat,
        lng: curLng,
        accuracy_m: cur.accuracy_m || 10,
        battery_pct: cur.battery_pct,
        speed_mps: cur.speed_mps,
        displacementM,
        timeDeltaMin,
        nearestZone,
        state: evalAtPoint.state,
        score: evalAtPoint.score,
        reasons: evalAtPoint.reasons,
        needsCheck: evalAtPoint.needsCheck,
      });
    }

    const reversedComparisons = [...comparisons].reverse();

    // Stale check
    let diffMinutes = null;
    let isStale = true;
    if (elder.last_known_at) {
      diffMinutes = Math.floor((Date.now() - new Date(elder.last_known_at).getTime()) / 60000);
      isStale = diffMinutes > (settings.stale_after_min || 15);
    }

    // Active alerts
    const alertRes = await query(
      `SELECT * FROM location_alerts WHERE elder_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [elderId]
    );

    const allElders = await query(`SELECT id, name FROM elders ORDER BY name ASC`);

    return res.json({
      elder,
      isStale,
      diffMinutes,
      settings,
      safeZones,
      approvedRoutes,
      latestSample,
      trail: trailRes.rows,
      currentEvaluation,
      comparisons: reversedComparisons,
      alerts: alertRes.rows,
      allElders: allElders.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/location/public-compare - Inject or simulate a 5-min fix and run AI comparison
router.post('/public-compare', async (req, res) => {
  try {
    let { elderId, scenario = 'normal', lat, lng, latitude, longitude } = req.body;
    if (!elderId) {
      const eRes = await query('SELECT id FROM elders ORDER BY created_at ASC LIMIT 1');
      elderId = eRes.rows[0]?.id;
    }
    if (!elderId) return res.status(400).json({ error: 'ELDER_ID_REQUIRED' });

    lat = lat || latitude;
    lng = lng || longitude;

    // Find Home zone
    const zRes = await query(`SELECT * FROM safe_zones WHERE elder_id = $1 AND type = 'home' LIMIT 1`, [elderId]);
    const home = zRes.rows[0] || { lat: 26.1755, lng: 91.7580, radius_m: 150 };

    let targetLat = lat;
    let targetLng = lng;
    const now = new Date();

    if (!targetLat || !targetLng) {
      if (scenario === 'home') {
        // Inside home
        targetLat = parseFloat(home.lat) + 0.0001;
        targetLng = parseFloat(home.lng) + 0.0001;
      } else if (scenario === 'walking') {
        // Walking down street (220m from home)
        targetLat = parseFloat(home.lat) + 0.0020;
        targetLng = parseFloat(home.lng) + 0.0005;
      } else if (scenario === 'stopped') {
        // Stopped outside for 10+ min
        targetLat = parseFloat(home.lat) + 0.0045;
        targetLng = parseFloat(home.lng) + 0.0040;
        // Seed an older sample 12m ago at the same coordinates
        await query(
          `INSERT INTO location_samples (client_id, elder_id, lat, lng, latitude, longitude, accuracy_m, accuracy, source, captured_at, recorded_at)
           VALUES ($1, $2, $3, $4, $3, $4, 15, 15, 'simulated', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-12 minutes'), NOW())
           ON CONFLICT (client_id) DO NOTHING`,
          [`sim-stop-${Date.now()}-1`, elderId, targetLat, targetLng]
        );
      } else if (scenario === 'unfamiliar') {
        // Unfamiliar area (1.9 km from home)
        targetLat = parseFloat(home.lat) + 0.0170;
        targetLng = parseFloat(home.lng) + 0.0100;
      } else {
        targetLat = parseFloat(home.lat) + 0.0015;
        targetLng = parseFloat(home.lng) + 0.0010;
      }
    }

    const clientId = `public-compare-${Date.now()}`;
    await query(
      `INSERT INTO location_samples (client_id, elder_id, lat, lng, latitude, longitude, accuracy_m, accuracy, source, captured_at, recorded_at)
       VALUES ($1, $2, $3, $4, $3, $4, 12, 12, 'simulated', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NOW())
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId, elderId, targetLat, targetLng]
    );

    await query(
      `UPDATE elders SET last_known_lat = $1, last_known_lng = $2, last_known_at = NOW() WHERE id = $3`,
      [targetLat, targetLng, elderId]
    );

    // Fetch updated evaluation
    const zList = await query(`SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE`, [elderId]);
    const sList = await query(`SELECT * FROM location_samples WHERE elder_id = $1 ORDER BY captured_at ASC`, [elderId]);
    const setRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
    const settings = setRes.rows[0] || { interval_min: 5, accuracy_limit_m: 150, unfamiliar_distance_m: 1500, stationary_min: 10, confirm_samples: 2 };

    const evaluation = evaluate(sList.rows, zList.rows, [], [], settings, now);

    return res.json({
      success: true,
      scenario,
      fix: { lat: targetLat, lng: targetLng, captured_at: now.toISOString() },
      evaluation,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECTION 8: CAREGIVER DASHBOARD & AUDIT LOGGING
// -----------------------------------------------------------------------------

// GET /api/location/dashboard - Comprehensive caregiver location dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    // Check permission
    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to view this elder’s location data.',
      });
    }

    // Audit log read access
    await auditLocationAccess(req.user.user_id, elderId, req.ip, { timeframe: req.query.timeframe || '24h' });

    // Elder info
    const elderRes = await query(`SELECT id, name, last_known_lat, last_known_lng, last_known_at FROM elders WHERE id = $1`, [elderId]);
    if (elderRes.rows.length === 0) return res.status(404).json({ error: 'ELDER_NOT_FOUND' });
    const elder = elderRes.rows[0];

    // Settings
    let sRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
    const settings = sRes.rows[0] || { stale_after_min: 15, interval_min: 5 };

    // Stale check
    const staleLimitMin = settings.stale_after_min || 15;
    let isStale = true;
    let diffMinutes = null;
    if (elder.last_known_at) {
      diffMinutes = Math.floor((Date.now() - new Date(elder.last_known_at).getTime()) / 60000);
      isStale = diffMinutes > staleLimitMin;
    }

    // Safe Zones
    const zonesRes = await query(`SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE ORDER BY CASE WHEN type = 'home' THEN 0 ELSE 1 END ASC`, [elderId]);
    const safeZones = zonesRes.rows;

    // Approved Routes
    const routesRes = await query(`SELECT * FROM approved_routes WHERE elder_id = $1 AND active = TRUE`, [elderId]);
    const approvedRoutes = routesRes.rows;

    // Location history trail based on timeframe query (6h, 24h, 7d)
    const tf = req.query.timeframe || '24h';
    let intervalStr = "24 hours";
    if (tf === '6h') intervalStr = "6 hours";
    if (tf === '7d') intervalStr = "7 days";

    const trailRes = await query(
      `SELECT client_id, lat, lng, latitude, longitude, accuracy_m, accuracy, speed_mps, battery_pct, source, flags, captured_at
       FROM location_samples
       WHERE elder_id = $1 AND captured_at >= NOW() - INTERVAL '${intervalStr}'
       ORDER BY captured_at ASC`,
      [elderId]
    );

    // Latest sample
    const latestSample = trailRes.rows[trailRes.rows.length - 1] || null;

    // Safety checks timeline (last 10 prompts & checks)
    const checksRes = await query(
      `SELECT sc.id, sc.status, sc.concern_json, sc.started_at, sc.resolved_at
       FROM safety_checks sc
       WHERE sc.elder_id = $1
       ORDER BY sc.started_at DESC LIMIT 10`,
      [elderId]
    );

    const checkIds = checksRes.rows.map(c => c.id);
    let promptsByCheck = {};
    if (checkIds.length > 0) {
      const placeholders = checkIds.map((_, i) => `$${i + 1}`).join(', ');
      const pRes = await query(
        `SELECT id, check_id, attempt, asked_at, answered_at, answer, method
         FROM safety_check_prompts
         WHERE check_id IN (${placeholders})
         ORDER BY attempt ASC`,
        checkIds
      );
      for (const p of pRes.rows) {
        if (!promptsByCheck[p.check_id]) promptsByCheck[p.check_id] = [];
        promptsByCheck[p.check_id].push(p);
      }
    }

    const checksWithPrompts = checksRes.rows.map(c => ({
      ...c,
      prompts: promptsByCheck[c.id] || [],
    }));

    // Alerts list
    const alertsRes = await query(
      `SELECT * FROM location_alerts WHERE elder_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [elderId]
    );

    // Consent
    const consentActive = await hasActiveConsent(elderId);

    return res.json({
      elder,
      isStale,
      diffMinutes,
      staleLimitMin,
      safeZones,
      approvedRoutes,
      latestSample,
      trail: trailRes.rows,
      safetyChecks: checksWithPrompts,
      alerts: alertsRes.rows,
      settings,
      hasConsent: consentActive,
    });
  } catch (err) {
    logServerError({ message: `Dashboard error: ${err.message}`, route: '/api/location/dashboard', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECTION 5: SAFE ZONES CRUD
// -----------------------------------------------------------------------------
router.get('/zones', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) return res.status(403).json({ error: 'FORBIDDEN' });

    const zonesRes = await query(
      `SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE ORDER BY created_at ASC`,
      [elderId]
    );
    return res.json({ zones: zonesRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/zones', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) return res.status(403).json({ error: 'FORBIDDEN' });

    const { name, type = 'other', lat, lng, radius_m = 150, address = '' } = req.body;
    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    const ins = await query(
      `INSERT INTO safe_zones (elder_id, name, type, lat, lng, radius_m, address, active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NOW())
       RETURNING *`,
      [elderId, name, type, parseFloat(lat), parseFloat(lng), parseInt(radius_m, 10), address, req.user.user_id]
    );

    return res.status(201).json({ zone: ins.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.put('/zones/:id', requireAuth, async (req, res) => {
  try {
    const { name, type, lat, lng, radius_m, address, active } = req.body;
    const up = await query(
      `UPDATE safe_zones
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           lat = COALESCE($3, lat),
           lng = COALESCE($4, lng),
           radius_m = COALESCE($5, radius_m),
           address = COALESCE($6, address),
           active = COALESCE($7, active)
       WHERE id = $8
       RETURNING *`,
      [
        name || null,
        type || null,
        lat !== undefined ? parseFloat(lat) : null,
        lng !== undefined ? parseFloat(lng) : null,
        radius_m !== undefined ? parseInt(radius_m, 10) : null,
        address !== undefined ? address : null,
        active !== undefined ? Boolean(active) : null,
        req.params.id,
      ]
    );
    if (up.rows.length === 0) return res.status(404).json({ error: 'ZONE_NOT_FOUND' });
    return res.json({ zone: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.delete('/zones/:id', requireAuth, async (req, res) => {
  try {
    await query(`UPDATE safe_zones SET active = FALSE WHERE id = $1`, [req.params.id]);
    return res.json({ success: true, message: 'Safe zone removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECTION 5: APPROVED ROUTES CRUD
// -----------------------------------------------------------------------------
router.get('/routes', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) return res.status(403).json({ error: 'FORBIDDEN' });

    const routesRes = await query(
      `SELECT * FROM approved_routes WHERE elder_id = $1 AND active = TRUE ORDER BY created_at ASC`,
      [elderId]
    );
    return res.json({ routes: routesRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/routes', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) return res.status(403).json({ error: 'FORBIDDEN' });

    const { name, from_zone_id, to_zone_id, path_geojson, corridor_m = 100 } = req.body;
    if (!name || !path_geojson) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    const ins = await query(
      `INSERT INTO approved_routes (elder_id, name, from_zone_id, to_zone_id, path_geojson, corridor_m, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       RETURNING *`,
      [elderId, name, from_zone_id || null, to_zone_id || null, JSON.stringify(path_geojson), parseInt(corridor_m, 10)]
    );

    return res.status(201).json({ route: ins.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.delete('/routes/:id', requireAuth, async (req, res) => {
  try {
    await query(`UPDATE approved_routes SET active = FALSE WHERE id = $1`, [req.params.id]);
    return res.json({ success: true, message: 'Route removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECTION 7: VOICE SAFETY CHECK (Elder Side State Machine)
// -----------------------------------------------------------------------------
router.get('/safety-check/active', async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const checkRes = await query(
      `SELECT sc.*, 
              (SELECT attempt FROM safety_check_prompts WHERE check_id = sc.id ORDER BY attempt DESC LIMIT 1) as current_attempt,
              (SELECT asked_at FROM safety_check_prompts WHERE check_id = sc.id ORDER BY attempt DESC LIMIT 1) as prompt_asked_at
       FROM safety_checks sc
       WHERE sc.elder_id = $1 AND sc.status = 'asking'
       ORDER BY sc.started_at DESC LIMIT 1`,
      [elderId]
    );

    if (checkRes.rows.length === 0) {
      return res.json({ activeCheck: null });
    }

    const check = checkRes.rows[0];
    const promptAskedAt = check.prompt_asked_at ? new Date(check.prompt_asked_at).getTime() : Date.now();
    const elapsedSec = Math.floor((Date.now() - promptAskedAt) / 1000);

    return res.json({
      activeCheck: {
        ...check,
        elapsedSec,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/safety-check/respond', async (req, res) => {
  try {
    const { checkId, answer, method = 'voice', elderId } = req.body;
    if (!checkId || !answer) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    const result = await respondToSafetyCheck({
      checkId,
      answer, // 'ok' or 'help'
      method, // 'voice' or 'button'
      elderId,
    });

    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: 'SAFETY_CHECK_ERROR', message: err.message });
  }
});

// POST /api/location/alerts/:id/ack - Caregiver taps "I got it, I'm calling now"
router.post('/alerts/:id/ack', requireAuth, async (req, res) => {
  try {
    const up = await query(
      `UPDATE location_alerts
       SET acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.user_id, req.params.id]
    );
    return res.json({ success: true, alert: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// BACKWARD COMPATIBILITY: Existing Endpoints
// -----------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { elderId, latitude, longitude, accuracy, speed, battery, source, timestamp, time } = req.body;
    let targetElderId = elderId || req.elder?.id;

    if (!targetElderId && req.user?.user_id) {
      const eRes = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
      targetElderId = eRes.rows[0]?.id;
    }

    if (!targetElderId) {
      const firstElder = await query('SELECT id FROM elders LIMIT 1');
      targetElderId = firstElder.rows[0]?.id;
    }

    if (!targetElderId) {
      return res.status(400).json({ error: 'ELDER_ID_REQUIRED' });
    }

    const recordedAt = timestamp ? new Date(timestamp) : time ? new Date(time) : new Date();

    const result = await ingestLocationSample({
      elderId: targetElderId,
      latitude,
      longitude,
      accuracy: accuracy !== undefined ? parseFloat(accuracy) : 10,
      speed: speed !== undefined ? parseFloat(speed) : null,
      battery: battery !== undefined ? parseInt(battery, 10) : null,
      source: source || 'gps',
      recordedAt,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    logServerError({ message: `Location intake error: ${err.message}`, route: '/api/location', statusCode: 500 });
    return res.status(500).json({ error: 'LOCATION_INGESTION_ERROR', message: err.message });
  }
});

router.get('/checkin/active', async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const activeCheckRes = await query(
      `SELECT id, elder_id, status, level, risk_score, reasons_json, nearest_place,
              distance_m, started_at, rule, explanation
       FROM lost_checks
       WHERE elder_id = $1 AND status IN ('active', 'alerted')
         AND started_at >= NOW() - INTERVAL '4 minutes'
       ORDER BY started_at DESC LIMIT 1`,
      [elderId]
    );

    if (activeCheckRes.rows.length === 0) {
      return res.json({ activeCheck: null });
    }

    const check = activeCheckRes.rows[0];
    const elapsedSec = Math.floor((Date.now() - new Date(check.started_at).getTime()) / 1000);
    const remainingSec = Math.max(0, 120 - elapsedSec);

    return res.json({
      activeCheck: {
        ...check,
        remainingSec,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/checkin/respond', async (req, res) => {
  const { checkId, response, latitude, longitude } = req.body;
  if (!checkId || !response) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  try {
    if (response === 'fine') {
      await query(
        `UPDATE lost_checks
         SET status = 'fine', resolution = 'fine', resolved_at = NOW(),
             cooldown_until = NOW() + INTERVAL '30 minutes',
             fine_lat = $1, fine_lng = $2
         WHERE id = $3`,
        [latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null, checkId]
      );

      await query(
        `INSERT INTO lost_check_events (check_id, event_type, detail, metadata)
         VALUES ($1, 'fine_acknowledged', 'Elder confirmed "I am fine" (30-minute cooldown started)', $2)`,
        [checkId, JSON.stringify({ latitude, longitude })]
      );

      return res.json({ success: true, action: 'cooldown_started', minutes: 30 });
    } else if (response === 'take_home') {
      await query(
        `UPDATE lost_checks
         SET status = 'take_home', resolution = 'take_home', level = 2, resolved_at = NOW()
         WHERE id = $1`,
        [checkId]
      );

      await query(
        `INSERT INTO lost_check_events (check_id, event_type, detail)
         VALUES ($1, 'take_home_clicked', 'Elder requested assistance to return home')`,
        [checkId]
      );

      return res.json({ success: true, action: 'take_home_triggered' });
    } else {
      return res.status(400).json({ error: 'INVALID_RESPONSE' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.get('/elder/:elderId/live', requireAuth, async (req, res) => {
  try {
    const elderRes = await query(
      `SELECT id, name, last_known_lat, last_known_lng, last_known_at FROM elders WHERE id = $1`,
      [req.params.elderId]
    );
    if (elderRes.rows.length === 0) {
      return res.status(404).json({ error: 'ELDER_NOT_FOUND' });
    }

    const locRes = await query(
      `SELECT latitude, longitude, accuracy, speed, battery, recorded_at, unreliable_for_safety
       FROM location_samples WHERE elder_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [req.params.elderId]
    );

    const placesRes = await syncUsualPlaces(req.params.elderId);

    const checksRes = await query(
      `SELECT id, status, level, risk_score, reasons_json, nearest_place, distance_m,
              resolution, started_at, resolved_at
       FROM lost_checks WHERE elder_id = $1 ORDER BY started_at DESC LIMIT 10`,
      [req.params.elderId]
    );

    return res.json({
      elder: elderRes.rows[0],
      currentFix: locRes.rows[0] || null,
      recentFixes: locRes.rows,
      usualPlaces: placesRes,
      checksTimeline: checksRes.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.get('/usual-places', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const places = await syncUsualPlaces(elderId);
    return res.json({ success: true, places });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/usual-places/:id/approve', requireAuth, async (req, res) => {
  try {
    const { label, radiusM } = req.body;
    const up = await query(
      `UPDATE usual_places
       SET origin = 'approved',
           label = COALESCE($1, label),
           radius_m = COALESCE($2, radius_m)
       WHERE id = $3
       RETURNING *`,
      [label ? label.trim() : null, radiusM ? parseInt(radiusM, 10) : null, req.params.id]
    );
    return res.json({ success: true, place: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const sRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
    return res.json({ success: true, settings: sRes.rows[0] || {} });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/settings', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const isAllowed = await checkLocationPermission(req.user.user_id, elderId);
    if (!isAllowed) return res.status(403).json({ error: 'FORBIDDEN' });

    const {
      interval_min,
      accuracy_limit_m,
      unfamiliar_distance_m,
      stationary_min,
      confirm_samples,
      night_start,
      night_end,
      quiet_hours,
      ask_attempts,
      ask_wait_sec,
      cooldown_min,
      alert_channels,
      stale_after_min,
      outing_windows,
    } = req.body;

    const up = await query(
      `INSERT INTO location_settings 
       (elder_id, interval_min, accuracy_limit_m, unfamiliar_distance_m, stationary_min, confirm_samples,
        night_start, night_end, quiet_hours, ask_attempts, ask_wait_sec, cooldown_min, alert_channels, stale_after_min, outing_windows, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (elder_id) DO UPDATE SET
         interval_min = COALESCE($2, location_settings.interval_min),
         accuracy_limit_m = COALESCE($3, location_settings.accuracy_limit_m),
         unfamiliar_distance_m = COALESCE($4, location_settings.unfamiliar_distance_m),
         stationary_min = COALESCE($5, location_settings.stationary_min),
         confirm_samples = COALESCE($6, location_settings.confirm_samples),
         night_start = COALESCE($7, location_settings.night_start),
         night_end = COALESCE($8, location_settings.night_end),
         quiet_hours = COALESCE($9, location_settings.quiet_hours),
         ask_attempts = COALESCE($10, location_settings.ask_attempts),
         ask_wait_sec = COALESCE($11, location_settings.ask_wait_sec),
         cooldown_min = COALESCE($12, location_settings.cooldown_min),
         alert_channels = COALESCE($13, location_settings.alert_channels),
         stale_after_min = COALESCE($14, location_settings.stale_after_min),
         outing_windows = COALESCE($15, location_settings.outing_windows),
         updated_at = NOW()
       RETURNING *`,
      [
        elderId,
        interval_min ? parseInt(interval_min, 10) : null,
        accuracy_limit_m ? parseInt(accuracy_limit_m, 10) : null,
        unfamiliar_distance_m ? parseInt(unfamiliar_distance_m, 10) : null,
        stationary_min ? parseInt(stationary_min, 10) : null,
        confirm_samples ? parseInt(confirm_samples, 10) : null,
        night_start || null,
        night_end || null,
        quiet_hours || null,
        ask_attempts ? parseInt(ask_attempts, 10) : null,
        ask_wait_sec ? parseInt(ask_wait_sec, 10) : null,
        cooldown_min ? parseInt(cooldown_min, 10) : null,
        alert_channels ? JSON.stringify(alert_channels) : null,
        stale_after_min ? parseInt(stale_after_min, 10) : null,
        outing_windows ? JSON.stringify(outing_windows) : null,
      ]
    );

    return res.json({ success: true, settings: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const { elderId, latitude, longitude, accuracy = 15, count = 2, delaySeconds = 70 } = req.body;
    let targetElderId = elderId;
    if (!targetElderId) {
      const eRes = await query('SELECT id FROM elders LIMIT 1');
      targetElderId = eRes.rows[0]?.id;
    }

    if (!targetElderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const now = Date.now();
    for (let i = count - 1; i >= 0; i--) {
      const recTime = new Date(now - i * delaySeconds * 1000);
      await query(
        `INSERT INTO locations (elder_id, latitude, longitude, accuracy, source, recorded_at)
         VALUES ($1, $2, $3, $4, 'simulator', $5)`,
        [targetElderId, latitude, longitude, accuracy, recTime]
      );
    }

    const { evaluateElderLocation } = await import('../services/locationAI.js');
    const evaluation = await evaluateElderLocation(targetElderId);

    return res.json({ success: true, count, evaluation });
  } catch (err) {
    return res.status(500).json({ error: 'SIMULATION_ERROR', message: err.message });
  }
});

router.post('/test-eval', async (req, res) => {
  try {
    const { elderId, latitude, longitude, accuracy = 10, battery = 80, recordedAt = new Date() } = req.body;
    let targetElderId = elderId;

    if (!targetElderId) {
      const eRes = await query('SELECT id FROM elders LIMIT 1');
      targetElderId = eRes.rows[0]?.id;
    }

    if (!targetElderId) return res.status(400).json({ error: 'NO_ELDER_FOUND' });

    const scoreResult = await computeLostRiskScore({
      elderId: targetElderId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      accuracy: parseFloat(accuracy),
      battery: parseInt(battery, 10),
      recordedAt: new Date(recordedAt),
    });

    return res.json({ success: true, targetElderId, ...scoreResult });
  } catch (err) {
    return res.status(500).json({ error: 'EVAL_ERROR', message: err.message });
  }
});

router.post('/cluster-now', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

    const result = await clusterLearnedUsualPlaces(elderId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.get('/events/:checkId', requireAuth, async (req, res) => {
  try {
    const events = await query(
      `SELECT * FROM lost_check_events WHERE check_id = $1 ORDER BY event_time ASC`,
      [req.params.checkId]
    );
    return res.json({ success: true, events: events.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (elderId) {
      const alerts = await query(
        `SELECT * FROM location_alerts WHERE elder_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [elderId]
      );
      return res.json({ alerts: alerts.rows });
    }
    const alertsRes = await query(
      `SELECT id, elder_id, alert_type, message, metadata, read, created_at
       FROM caregiver_alerts WHERE caregiver_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.user.user_id]
    );
    return res.json({ alerts: alertsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
