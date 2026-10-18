import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { ingestLocationFix, evaluateElderLocation } from '../services/locationAI.js';
import { logServerError } from '../errors.js';

const router = express.Router();

// POST /api/location - Ingestion from client every 30s
router.post('/', async (req, res) => {
  try {
    const { elderId, latitude, longitude, accuracy, speed, battery, source, timestamp } = req.body;
    const targetElderId = elderId || req.elder?.id;

    if (!targetElderId) {
      return res.status(400).json({ error: 'ELDER_ID_REQUIRED' });
    }

    const result = await ingestLocationFix({
      elderId: targetElderId,
      latitude,
      longitude,
      accuracy: accuracy || 10,
      speed,
      battery,
      source: source || 'gps',
      recordedAt: timestamp ? new Date(timestamp) : new Date(),
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: 'LOCATION_INGESTION_ERROR', message: err.message });
  }
});

// GET /api/location/elder/:elderId/live - Caregiver live view
router.get('/elder/:elderId/live', requireAuth, async (req, res) => {
  try {
    const elderRes = await query(
      `SELECT id, name, last_known_lat, last_known_lng, last_known_at FROM elders WHERE id = $1`,
      [req.params.elderId]
    );
    if (elderRes.rows.length === 0) {
      return res.status(404).json({ error: 'ELDER_NOT_FOUND' });
    }

    // Get last 20 locations
    const locRes = await query(
      `SELECT latitude, longitude, accuracy, speed, battery, recorded_at, unreliable_for_safety
       FROM locations WHERE elder_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [req.params.elderId]
    );

    // Get saved places
    const placesRes = await query(
      `SELECT id, name, address, latitude, longitude, place_type FROM saved_places WHERE elder_id = $1`,
      [req.params.elderId]
    );

    // Get lost_checks timeline
    const checksRes = await query(
      `SELECT id, status, rule, nearest_place_name, distance_m, score, explanation, started_at, resolved_at
       FROM lost_checks WHERE elder_id = $1 ORDER BY started_at DESC LIMIT 10`,
      [req.params.elderId]
    );

    return res.json({
      elder: elderRes.rows[0],
      currentFix: locRes.rows[0] || null,
      recentFixes: locRes.rows,
      savedPlaces: placesRes.rows,
      checksTimeline: checksRes.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/location/checkin/active - Checks if an active check-in is pending for the elder
router.get('/checkin/active', async (req, res) => {
  const elderId = req.query.elderId || req.elder?.id;
  if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

  try {
    const activeCheckRes = await query(
      `SELECT id, rule, nearest_place_name, distance_m, explanation, started_at
       FROM lost_checks
       WHERE elder_id = $1 AND status = 'active' AND started_at >= NOW() - INTERVAL '3 minutes'
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

// POST /api/location/checkin/respond - Elder answers prompt
router.post('/checkin/respond', async (req, res) => {
  const { checkId, response } = req.body; // response: 'fine' | 'take_home'
  if (!checkId || !response) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  try {
    if (response === 'fine') {
      // 30-minute cooldown
      await query(
        `UPDATE lost_checks
         SET status = 'fine', resolved_at = NOW(), cooldown_until = NOW() + INTERVAL '30 minutes'
         WHERE id = $1`,
        [checkId]
      );
      return res.json({ success: true, action: 'cooldown_started', minutes: 30 });
    } else if (response === 'take_home') {
      await query(
        `UPDATE lost_checks
         SET status = 'take_home', resolved_at = NOW()
         WHERE id = $1`,
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

// POST /api/location/simulate - Post simulated fixes for testing & demo
router.post('/simulate', async (req, res) => {
  const { elderId, latitude, longitude, accuracy = 10, count = 2, delaySeconds = 65 } = req.body;
  if (!elderId || !latitude || !longitude) {
    return res.status(400).json({ error: 'elderId, latitude, and longitude are required' });
  }

  try {
    const fixes = [];
    const baseTime = Date.now() - count * delaySeconds * 1000;

    for (let i = 0; i < count; i++) {
      const fixTime = new Date(baseTime + i * delaySeconds * 1000);
      const fix = await ingestLocationFix({
        elderId,
        latitude: parseFloat(latitude) + i * 0.0001,
        longitude: parseFloat(longitude) + i * 0.0001,
        accuracy,
        source: 'simulator',
        recordedAt: fixTime,
      });
      fixes.push(fix);
    }

    const evalResult = await evaluateElderLocation(elderId);

    return res.json({
      success: true,
      fixesIngested: fixes.length,
      evaluation: evalResult,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SIMULATION_ERROR', message: err.message });
  }
});

// GET /api/location/safety-settings - Get elder safety settings
router.get('/safety-settings', requireAuth, async (req, res) => {
  const elderId = req.query.elderId || req.elder?.id;
  if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

  const sRes = await query(`SELECT * FROM elder_safety_settings WHERE elder_id = $1`, [elderId]);
  return res.json({
    settings: sRes.rows[0] || {
      threshold_distance_m: 1000,
      night_rule_enabled: true,
      auto_calls_enabled: false,
      stale_location_alerts_enabled: true,
    },
  });
});

// POST /api/location/safety-settings - Update elder safety settings
router.post('/safety-settings', requireAuth, async (req, res) => {
  const elderId = req.body.elderId || req.elder?.id;
  const { thresholdDistanceM, nightRuleEnabled, autoCallsEnabled, staleLocationAlertsEnabled } = req.body;
  if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

  const upsertRes = await query(
    `INSERT INTO elder_safety_settings (elder_id, threshold_distance_m, night_rule_enabled, auto_calls_enabled, stale_location_alerts_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (elder_id) DO UPDATE
     SET threshold_distance_m = COALESCE($2, elder_safety_settings.threshold_distance_m),
         night_rule_enabled = COALESCE($3, elder_safety_settings.night_rule_enabled),
         auto_calls_enabled = COALESCE($4, elder_safety_settings.auto_calls_enabled),
         stale_location_alerts_enabled = COALESCE($5, elder_safety_settings.stale_location_alerts_enabled),
         updated_at = NOW()
     RETURNING *`,
    [
      elderId,
      thresholdDistanceM ? parseInt(thresholdDistanceM, 10) : 1000,
      nightRuleEnabled !== undefined ? Boolean(nightRuleEnabled) : true,
      autoCallsEnabled !== undefined ? Boolean(autoCallsEnabled) : false,
      staleLocationAlertsEnabled !== undefined ? Boolean(staleLocationAlertsEnabled) : true,
    ]
  );

  return res.json({ success: true, settings: upsertRes.rows[0] });
});

// GET /api/location/alerts - Caregiver notifications
router.get('/alerts', requireAuth, async (req, res) => {
  try {
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
