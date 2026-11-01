
import { z } from 'zod';
import { query } from '../db.js';
import { evaluate, haversineDistanceM, getCellKey } from './decisionEngine.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';
import { sendEmergencySms } from './twilio.js';
import { sendWebPushNotification } from './push.js';

// Zod Schema for location batch ingest
export const LocationSampleSchema = z.object({
  client_id: z.string().min(1, 'client_id is required'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative(),
  speed_mps: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  battery_pct: z.number().int().min(0).max(100).nullable().optional(),
  source: z.enum(['gps', 'network', 'native', 'simulated']).default('gps'),
  captured_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)),
});

export const LocationBatchSchema = z.object({
  elderId: z.string().min(1),
  samples: z.array(LocationSampleSchema).min(1),
});

/**
 * Check if active consent exists for elder
 */
export async function hasActiveConsent(elderId) {
  const res = await query(
    `SELECT id FROM location_consents
     WHERE elder_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [elderId]
  );
  return res.rows.length > 0;
}

/**
 * Check if user is linked caregiver with can_see_location permission or elder themselves
 */
export async function checkLocationPermission(userId, elderId) {
  if (!userId) return false;

  // 1. Check if user is the elder themselves
  const elderRes = await query('SELECT id FROM elders WHERE id = $1 AND user_id = $2', [elderId, userId]);
  if (elderRes.rows.length > 0) return true;

  // 2. Check if user is active caregiver with can_see_location
  const cgRes = await query(
    `SELECT can_see_location FROM elder_caregivers
     WHERE elder_id = $1 AND caregiver_id = $2 AND status = 'active'`,
    [elderId, userId]
  );
  if (cgRes.rows.length > 0 && cgRes.rows[0].can_see_location) {
    return true;
  }
  return false;
}

/**
 * Audit log caregiver reading location
 */
export async function auditLocationAccess(userId, elderId, ipAddress = null, details = {}) {
  await query(
    `INSERT INTO audit_logs (user_id, elder_id, action, resource, ip_address, details)
     VALUES ($1, $2, 'read_location', 'location_dashboard', $3, $4)`,
    [userId || null, elderId, ipAddress || '127.0.0.1', JSON.stringify(details)]
  );
}

/**
 * Ingest batch of location samples
 */
export async function ingestLocationBatch({ elderId, samples, userId, clientIp }) {
  // 1. Consent verification (REJECT if no active consent)
  const consentActive = await hasActiveConsent(elderId);
  if (!consentActive) {
    const err = new Error('LOCATION_CONSENT_REQUIRED: Active consent is required to collect location samples');
    err.statusCode = 403;
    err.code = 'NO_CONSENT';
    throw err;
  }

  // 2. Load elder settings
  let settingsRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
  let settings = settingsRes.rows[0];
  if (!settings) {
    // Create default settings
    const ins = await query(
      `INSERT INTO location_settings (elder_id) VALUES ($1) RETURNING *`,
      [elderId]
    );
    settings = ins.rows[0];
  }

  const accuracyLimitM = settings.accuracy_limit_m || 150;
  const nowMs = Date.now();
  const maxFutureAllowedMs = nowMs + 5 * 60 * 1000; // 5 min future tolerance

  // Get last known sample for impossible jump detection (> 70 m/s)
  const lastKnownRes = await query(
    `SELECT lat, lng, captured_at FROM location_samples
     WHERE elder_id = $1 AND flags NOT LIKE '%impossible_jump%'
     ORDER BY captured_at DESC LIMIT 1`,
    [elderId]
  );
  let lastKnown = lastKnownRes.rows[0] || null;

  const accepted = [];
  const rejected = [];

  for (const sample of samples) {
    const capTime = new Date(sample.captured_at).getTime();

    // Reject future timestamps beyond 5 minutes
    if (capTime > maxFutureAllowedMs) {
      rejected.push({ client_id: sample.client_id, reason: 'FUTURE_TIMESTAMP' });
      continue;
    }

    // Reject simulated source when DEMO_MODE is false
    if (sample.source === 'simulated' && config.demoMode !== true && process.env.DEMO_MODE !== 'true') {
      const err = new Error('SIMULATED_SOURCE_REJECTED: Simulated location fixes are prohibited in production mode');
      err.statusCode = 400;
      err.code = 'SIMULATED_REJECTED';
      throw err;
    }

    // Compute flags
    const flags = [];

    // Flag: low_accuracy
    if (sample.accuracy_m > accuracyLimitM) {
      flags.push('low_accuracy');
    }

    // Flag: impossible_jump (> 70 m/s relative to previous fix)
    if (lastKnown && lastKnown.lat && lastKnown.lng) {
      const prevTime = new Date(lastKnown.captured_at).getTime();
      const timeDiffSec = Math.max(1, (capTime - prevTime) / 1000);
      const distM = haversineDistanceM(sample.lat, sample.lng, parseFloat(lastKnown.lat), parseFloat(lastKnown.lng));
      const speedCalculated = distM / timeDiffSec;
      if (speedCalculated > 70) {
        flags.push('impossible_jump');
      }
    }

    // Insert sample idempotently
    try {
      const insRes = await query(
        `INSERT INTO location_samples 
         (client_id, elder_id, lat, lng, latitude, longitude, accuracy_m, accuracy, speed_mps, speed, heading, battery_pct, battery, source, flags, captured_at, recorded_at, received_at)
         VALUES ($1, $2, $3, $4, $3, $4, $5, $5, $6, $6, $7, $8, $8, $9, $10, $11, $11, NOW())
         ON CONFLICT (client_id) DO NOTHING
         RETURNING id`,
        [
          sample.client_id,
          elderId,
          sample.lat,
          sample.lng,
          sample.accuracy_m,
          sample.speed_mps || null,
          sample.heading || null,
          sample.battery_pct !== undefined ? sample.battery_pct : null,
          sample.source,
          JSON.stringify(flags),
          new Date(sample.captured_at).toISOString(),
        ]
      );

      if (insRes.rowCount > 0) {
        accepted.push(sample.client_id);
        if (!flags.includes('impossible_jump')) {
          lastKnown = { lat: sample.lat, lng: sample.lng, captured_at: sample.captured_at };
        }

        // Update familiar_cells if good sample
        if (!flags.includes('low_accuracy') && !flags.includes('impossible_jump')) {
          const cellKey = getCellKey(sample.lat, sample.lng);
          await query(
            `INSERT INTO familiar_cells (elder_id, cell_key, visits, last_visit)
             VALUES ($1, $2, 1, NOW())
             ON CONFLICT (elder_id, cell_key)
             DO UPDATE SET visits = familiar_cells.visits + 1, last_visit = NOW()`,
            [elderId, cellKey]
          );

          // Update elder last known
          await query(
            `UPDATE elders
             SET last_known_lat = $1, last_known_lng = $2, last_known_at = $3
             WHERE id = $4`,
            [sample.lat, sample.lng, new Date(sample.captured_at).toISOString(), elderId]
          );
        }
      }
    } catch (dbErr) {
      console.error('[Ingest] DB insert error on sample:', dbErr.message);
    }
  }

  // 3. Run Decision Engine immediately on the elder's state
  const decisionResult = await runDecisionEngineForElder(elderId);

  return {
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted,
    rejected,
    decision: decisionResult,
  };
}

/**
 * Execute decision engine for elder using stored data
 */
export async function runDecisionEngineForElder(elderId) {
  // Load settings
  const sRes = await query(`SELECT * FROM location_settings WHERE elder_id = $1`, [elderId]);
  const settings = sRes.rows[0] || {};

  // Load safe zones
  const zRes = await query(`SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE`, [elderId]);
  const zones = zRes.rows;

  // Load approved routes
  const rRes = await query(`SELECT * FROM approved_routes WHERE elder_id = $1 AND active = TRUE`, [elderId]);
  const routes = rRes.rows;

  // Load familiar cells (visited in last 30 days)
  const fcRes = await query(
    `SELECT cell_key, visits FROM familiar_cells
     WHERE elder_id = $1 AND last_visit >= NOW() - INTERVAL '30 days'`,
    [elderId]
  );
  const familiarCells = fcRes.rows;

  // Load recent location samples (last 20 good samples)
  const samplesRes = await query(
    `SELECT lat, lng, latitude, longitude, accuracy_m, accuracy, speed_mps, speed, heading, battery_pct, battery, source, captured_at, recorded_at, flags
     FROM location_samples
     WHERE elder_id = $1 AND flags NOT LIKE '%impossible_jump%'
     ORDER BY captured_at DESC LIMIT 20`,
    [elderId]
  );
  const samples = samplesRes.rows.reverse(); // ascending order

  // Check elder history duration for learning mode
  const histRes = await query(
    `SELECT MIN(captured_at) as earliest FROM location_samples WHERE elder_id = $1`,
    [elderId]
  );
  const earliest = histRes.rows[0]?.earliest;
  const historyDays = earliest
    ? Math.max(0, (Date.now() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Check cooldown status from latest safety_checks or settings
  const cdRes = await query(
    `SELECT sc.id, sc.resolved_at, sc.concern_json
     FROM safety_checks sc
     WHERE sc.elder_id = $1 AND sc.status = 'resolved_ok'
     ORDER BY sc.resolved_at DESC LIMIT 1`,
    [elderId]
  );
  let cooldownUntil = null;
  let cooldownLat = null;
  let cooldownLng = null;

  if (cdRes.rows.length > 0) {
    const lastResolved = cdRes.rows[0];
    const resolvedMs = new Date(lastResolved.resolved_at).getTime();
    const cdMs = (settings.cooldown_min || 30) * 60 * 1000;
    if (Date.now() < resolvedMs + cdMs) {
      cooldownUntil = new Date(resolvedMs + cdMs).toISOString();
      const concern = typeof lastResolved.concern_json === 'string' ? JSON.parse(lastResolved.concern_json) : lastResolved.concern_json;
      cooldownLat = concern?.lat || null;
      cooldownLng = concern?.lng || null;
    }
  }

  const evalSettings = {
    ...settings,
    history_days: historyDays,
    cooldown_until: cooldownUntil,
    cooldown_lat: cooldownLat,
    cooldown_lng: cooldownLng,
  };

  const decision = evaluate(samples, zones, routes, familiarCells, evalSettings, new Date());

  // If needsCheck is true, create safety check in DB if none active
  if (decision.needsCheck) {
    const activeCheckRes = await query(
      `SELECT id FROM safety_checks WHERE elder_id = $1 AND status = 'asking' LIMIT 1`,
      [elderId]
    );

    if (activeCheckRes.rows.length === 0) {
      const latestFix = samples[samples.length - 1];
      const concernData = {
        rule: decision.rule,
        reasons: decision.reasons,
        score: decision.score,
        lat: latestFix?.lat || latestFix?.latitude,
        lng: latestFix?.lng || latestFix?.longitude,
      };

      const newCheck = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', $2, NOW())
         RETURNING id`,
        [elderId, JSON.stringify(concernData)]
      );

      const checkId = newCheck.rows[0].id;

      // Insert first prompt
      await query(
        `INSERT INTO safety_check_prompts (check_id, attempt, asked_at)
         VALUES ($1, 1, NOW())`,
        [checkId]
      );

      // Create alert for caregivers (Severity: attention)
      const mapLink = latestFix ? `https://www.google.com/maps?q=${latestFix.lat || latestFix.latitude},${latestFix.lng || latestFix.longitude}` : '';
      await createLocationAlert({
        elderId,
        severity: 'attention',
        kind: decision.rule || 'unusual',
        message: decision.reasons[0] || 'Elder may need assistance: location is unusual.',
        reasonJson: concernData,
        mapLink,
        elderResponded: 'pending',
      });
    }
  }

  return decision;
}

/**
 * Create caregiver alert (with 15-minute deduplication)
 */
export async function createLocationAlert({
  elderId,
  severity = 'attention',
  kind,
  message,
  reasonJson = {},
  mapLink = '',
  elderResponded = 'no_response',
}) {
  // Dedupe within 15 minutes for same kind and elder
  const recentAlertRes = await query(
    `SELECT id FROM location_alerts
     WHERE elder_id = $1 AND kind = $2 AND created_at >= NOW() - INTERVAL '15 minutes'
     LIMIT 1`,
    [elderId, kind]
  );

  if (recentAlertRes.rows.length > 0) {
    return recentAlertRes.rows[0];
  }

  const ins = await query(
    `INSERT INTO location_alerts (elder_id, severity, kind, message, reason_json, map_link, elder_responded, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [elderId, severity, kind, message, JSON.stringify(reasonJson), mapLink, elderResponded]
  );

  // Send Push notification to caregivers
  try {
    const cgRes = await query(
      `SELECT caregiver_id FROM elder_caregivers WHERE elder_id = $1 AND status = 'active' AND can_see_location = TRUE`,
      [elderId]
    );
    for (const cg of cgRes.rows) {
      await sendWebPushNotification({
        userId: cg.caregiver_id,
        title: severity === 'urgent' ? '⚠️ Smriti Saathi: Immediate Attention' : 'Smriti Saathi: Location Update',
        body: message,
        data: { url: `/location?elderId=${elderId}` },
      });
    }
  } catch (pushErr) {
    console.warn('[Alert] Push dispatch warning:', pushErr.message);
  }

  // Send SMS via Twilio if urgent
  if (severity === 'urgent') {
    try {
      const elderRes = await query('SELECT name FROM elders WHERE id = $1', [elderId]);
      const elderName = elderRes.rows[0]?.name || 'Elder';
      const contactsRes = await query(
        `SELECT phone, name FROM family_members
         WHERE elder_id = $1 AND is_emergency_contact = TRUE
         ORDER BY emergency_priority ASC LIMIT 1`,
        [elderId]
      );
      if (contactsRes.rows.length > 0) {
        const contact = contactsRes.rows[0];
        await sendEmergencySms({
          to: contact.phone,
          elderName,
          locationUrl: mapLink,
          reason: message,
        });
      }
    } catch (smsErr) {
      console.warn('[Alert] SMS dispatch warning:', smsErr.message);
    }
  }

  return ins.rows[0];
}

/**
 * Handle Elder response to Safety Check (Voice or Button)
 */
export async function respondToSafetyCheck({ checkId, answer, method = 'voice', elderId }) {
  const checkRes = await query(
    `SELECT sc.*, e.name as elder_name FROM safety_checks sc
     JOIN elders e ON e.id = sc.elder_id
     WHERE sc.id = $1`,
    [checkId]
  );

  if (checkRes.rows.length === 0) {
    const err = new Error('SAFETY_CHECK_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  const check = checkRes.rows[0];
  const targetElderId = check.elder_id;

  // Update latest prompt
  await query(
    `UPDATE safety_check_prompts
     SET answered_at = NOW(), answer = $1, method = $2
     WHERE check_id = $3 AND attempt = (SELECT MAX(attempt) FROM safety_check_prompts WHERE check_id = $3)`,
    [answer, method, checkId]
  );

  if (answer === 'ok') {
    // Resolve as resolved_ok
    await query(
      `UPDATE safety_checks
       SET status = 'resolved_ok', resolved_at = NOW()
       WHERE id = $1`,
      [checkId]
    );

    // Create calm attention alert for caregiver: "Elder said I am okay"
    await createLocationAlert({
      elderId: targetElderId,
      severity: 'attention',
      kind: 'concern_ok',
      message: `${check.elder_name} was asked if they were okay and responded: "I am fine" (via ${method}).`,
      reasonJson: { checkId, method, answer },
      elderResponded: `ok_${method}`,
    });

    return { success: true, status: 'resolved_ok', message: 'Resolved as okay. Monitoring continues.' };
  } else {
    // Answer is 'help' or 'lost'
    await query(
      `UPDATE safety_checks
       SET status = 'resolved_help', resolved_at = NOW()
       WHERE id = $1`,
      [checkId]
    );

    // Find nearest safe zone (Home first)
    const zonesRes = await query(
      `SELECT * FROM safe_zones WHERE elder_id = $1 AND active = TRUE ORDER BY type = 'home' DESC`,
      [targetElderId]
    );
    const homeZone = zonesRes.rows[0] || null;

    // Latest location sample
    const locRes = await query(
      `SELECT lat, lng, latitude, longitude FROM location_samples WHERE elder_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [targetElderId]
    );
    const latestLoc = locRes.rows[0] || null;
    const mapLink = latestLoc ? `https://www.google.com/maps?q=${latestLoc.lat || latestLoc.latitude},${latestLoc.lng || latestLoc.longitude}` : '';

    // Create URGENT caregiver alert
    await createLocationAlert({
      elderId: targetElderId,
      severity: 'urgent',
      kind: 'concern_help',
      message: `${check.elder_name} requested assistance: responded "I need help" (via ${method}).`,
      reasonJson: { checkId, method, answer, homeZone },
      mapLink,
      elderResponded: `help_${method}`,
    });

    return {
      success: true,
      status: 'resolved_help',
      destination: homeZone,
      mapLink,
      message: 'Urgent caregiver alert dispatched. Initiating guidance home.',
    };
  }
}

/**
 * Background / Cron Safety Check escalation worker
 */
export async function processSafetyCheckEscalations() {
  const activeChecks = await query(
    `SELECT sc.id, sc.elder_id, sc.started_at, sc.concern_json,
            e.name as elder_name,
            ls.ask_attempts, ls.ask_wait_sec
     FROM safety_checks sc
     JOIN elders e ON e.id = sc.elder_id
     LEFT JOIN location_settings ls ON ls.elder_id = sc.elder_id
     WHERE sc.status = 'asking'`
  );

  const results = [];

  for (const check of activeChecks.rows) {
    const askAttempts = check.ask_attempts || 3;
    const askWaitSec = check.ask_wait_sec || 90;

    // Get prompts count and latest prompt
    const promptsRes = await query(
      `SELECT attempt, asked_at, answered_at, answer
       FROM safety_check_prompts
       WHERE check_id = $1
       ORDER BY attempt DESC LIMIT 1`,
      [check.id]
    );

    if (promptsRes.rows.length === 0) continue;

    const latestPrompt = promptsRes.rows[0];
    const elapsedSec = (Date.now() - new Date(latestPrompt.asked_at).getTime()) / 1000;

    if (elapsedSec >= askWaitSec && latestPrompt.answer === 'none') {
      const currentAttempt = latestPrompt.attempt;

      if (currentAttempt < askAttempts) {
        // Issue next prompt attempt
        await query(
          `INSERT INTO safety_check_prompts (check_id, attempt, asked_at)
           VALUES ($1, $2, NOW())`,
          [check.id, currentAttempt + 1]
        );
        results.push({ checkId: check.id, action: 'reprompt', attempt: currentAttempt + 1 });
      } else {
        // Reached max attempts! Before final escalation, check fresh location
        const latestSampleRes = await query(
          `SELECT lat, lng, latitude, longitude, accuracy_m, accuracy FROM location_samples
           WHERE elder_id = $1 ORDER BY captured_at DESC, id DESC LIMIT 1`,
          [check.elder_id]
        );

        let cancelled = false;
        if (latestSampleRes.rows.length > 0) {
          const s = latestSampleRes.rows[0];
          const sLat = parseFloat(s.lat || s.latitude);
          const sLng = parseFloat(s.lng || s.longitude);
          const sAcc = parseFloat(s.accuracy_m || s.accuracy || 10);

          // Check if back in any zone
          const zonesRes = await query(
            `SELECT lat, lng, radius_m FROM safe_zones WHERE elder_id = $1 AND active = TRUE`,
            [check.elder_id]
          );
          for (const z of zonesRes.rows) {
            const dist = haversineDistanceM(sLat, sLng, parseFloat(z.lat), parseFloat(z.lng));
            if (dist <= (z.radius_m || 150) + sAcc) {
              cancelled = true;
              break;
            }
          }
        }

        if (cancelled) {
          // Back in safe zone: cancel silently
          await query(
            `UPDATE safety_checks SET status = 'cancelled', resolved_at = NOW() WHERE id = $1`,
            [check.id]
          );
          results.push({ checkId: check.id, action: 'cancelled_in_zone' });
        } else {
          // Escalate to URGENT caregiver alert
          await query(
            `UPDATE safety_checks SET status = 'escalated', resolved_at = NOW() WHERE id = $1`,
            [check.id]
          );

          const s = latestSampleRes.rows[0];
          const mapLink = s ? `https://www.google.com/maps?q=${s.lat || s.latitude},${s.lng || s.longitude}` : '';

          await createLocationAlert({
            elderId: check.elder_id,
            severity: 'urgent',
            kind: 'escalated',
            message: `${check.elder_name} did not respond to safety check after ${askAttempts} attempts. Caregiver attention needed immediately.`,
            reasonJson: { checkId: check.id, attempts: askAttempts },
            mapLink,
            elderResponded: 'no_answer',
          });

          results.push({ checkId: check.id, action: 'escalated_alerted' });
        }
      }
    }
  }

  return results;
}

/**
 * Check for stale location updates (e.g. phone off or app closed)
 */
export async function checkStaleLocations() {
  const activeElders = await query(
    `SELECT e.id, e.name, e.last_known_at, ls.stale_after_min
     FROM elders e
     JOIN location_consents lc ON lc.elder_id = e.id AND lc.revoked_at IS NULL
     LEFT JOIN location_settings ls ON ls.elder_id = e.id`
  );

  const staleAlerts = [];

  for (const elder of activeElders.rows) {
    const staleMin = elder.stale_after_min || 15;
    if (!elder.last_known_at) continue;

    const diffMin = (Date.now() - new Date(elder.last_known_at).getTime()) / (1000 * 60);
    if (diffMin > staleMin) {
      const timeStr = new Date(elder.last_known_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const note = `No location update since ${timeStr}. The phone may be off, out of coverage, or the app closed.`;

      const alert = await createLocationAlert({
        elderId: elder.id,
        severity: 'info',
        kind: 'stale',
        message: note,
        reasonJson: { lastKnownAt: elder.last_known_at, diffMin: Math.round(diffMin) },
        elderResponded: 'n/a',
      });

      if (alert) staleAlerts.push(alert);
    }
  }

  return staleAlerts;
}

/**
 * 30-day retention purge
 */
export async function purgeOldLocationSamples(days = 30) {
  const res = await query(
    `DELETE FROM location_samples
     WHERE captured_at < NOW() - INTERVAL '${days} days'`
  );
  return { purgedCount: res.rowCount };
}

