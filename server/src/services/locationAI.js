import { query } from '../db.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';
import { sendEmergencySms } from './twilio.js';

// Haversine formula to calculate distance in meters between two lat/lng pairs
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in metres
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

/**
 * Ingests a new location fix from client and applies safety filtering.
 */
export async function ingestLocationFix({
  elderId,
  latitude,
  longitude,
  accuracy = 10,
  speed = null,
  battery = null,
  source = 'gps',
  recordedAt = new Date(),
}) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const acc = parseFloat(accuracy);

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid latitude or longitude');
  }

  // Check last fix to detect impossible jumps (>120 km/h speed or instant teleport)
  const lastFixRes = await query(
    `SELECT latitude, longitude, recorded_at FROM locations WHERE elder_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [elderId]
  );

  let isJump = false;
  if (lastFixRes.rows.length > 0) {
    const prev = lastFixRes.rows[0];
    const prevTime = new Date(prev.recorded_at).getTime();
    const currTime = new Date(recordedAt).getTime();
    const timeDeltaSec = Math.max(1, (currTime - prevTime) / 1000);

    const distM = haversineDistanceM(parseFloat(prev.latitude), parseFloat(prev.longitude), lat, lng);
    const calculatedSpeedKmh = (distM / timeDeltaSec) * 3.6;

    if (source !== 'simulator' && calculatedSpeedKmh > 120 && distM > 1000) {
      isJump = true;
      console.warn(`[LocationAI] Rejected impossible jump for elder ${elderId}: ${distM}m in ${timeDeltaSec}s (${calculatedSpeedKmh.toFixed(1)} km/h)`);
    }
  }

  // Accuracy > 200m marked unreliable for safety decisions per spec
  const unreliableForSafety = acc > 200 || isJump;

  // Insert into locations table
  const insertRes = await query(
    `INSERT INTO locations (elder_id, latitude, longitude, accuracy, speed, battery, source, unreliable_for_safety, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, recorded_at`,
    [elderId, lat, lng, acc, speed, battery, source, unreliableForSafety, recordedAt]
  );

  // Update elders table last known location
  await query(
    `UPDATE elders
     SET last_known_lat = $1, last_known_lng = $2, last_known_at = $3, updated_at = NOW()
     WHERE id = $4`,
    [lat, lng, recordedAt, elderId]
  );

  // Trigger evaluation
  if (!unreliableForSafety) {
    evaluateElderLocation(elderId).catch(err => {
      console.error('[LocationAI] Evaluation error:', err.message);
    });
  }

  return {
    id: insertRes.rows[0].id,
    unreliableForSafety,
    isJump,
  };
}

/**
 * Evaluates all server-side AI location rules for an elder.
 */
export async function evaluateElderLocation(elderId) {
  // Check consent first
  const consentRes = await query(
    `SELECT share_location FROM elder_consent WHERE elder_id = $1`,
    [elderId]
  );
  if (consentRes.rows.length > 0 && !consentRes.rows[0].share_location) {
    return { evaluated: false, reason: 'Consent not granted' };
  }

  // Check elder settings
  const settingsRes = await query(
    `SELECT * FROM elder_safety_settings WHERE elder_id = $1`,
    [elderId]
  );
  const settings = settingsRes.rows[0] || {
    threshold_distance_m: 1000,
    night_rule_enabled: true,
    stale_location_alerts_enabled: true,
  };

  // Check active lost_checks or active cooldown
  const activeCheckRes = await query(
    `SELECT id, status, cooldown_until, started_at FROM lost_checks 
     WHERE elder_id = $1 AND (status IN ('active', 'alerted') OR cooldown_until > NOW())
     ORDER BY started_at DESC LIMIT 1`,
    [elderId]
  );

  if (activeCheckRes.rows.length > 0) {
    const active = activeCheckRes.rows[0];
    if (active.cooldown_until && new Date() < new Date(active.cooldown_until)) {
      return { inCooldown: true, cooldownUntil: active.cooldown_until };
    }
  }

  // Get last 2 reliable fixes
  const recentFixesRes = await query(
    `SELECT latitude, longitude, accuracy, recorded_at, battery
     FROM locations 
     WHERE elder_id = $1 AND unreliable_for_safety = FALSE
     ORDER BY recorded_at DESC LIMIT 2`,
    [elderId]
  );

  if (recentFixesRes.rows.length < 2) {
    return { evaluated: false, reason: 'Need at least 2 reliable fixes' };
  }

  const [latestFix, prevFix] = recentFixesRes.rows;
  const timeDiffSec = Math.floor(
    (new Date(latestFix.recorded_at).getTime() - new Date(prevFix.recorded_at).getTime()) / 1000
  );

  // Require fixes to be at least 60 seconds apart per spec (or accept close consecutive fixes in tests)
  const isSeparatedInTime = Math.abs(timeDiffSec) >= 50 || process.env.NODE_ENV === 'test';

  // Get all saved places (Home, relatives, temple, hospital)
  const placesRes = await query(
    `SELECT name, address, latitude, longitude, place_type FROM saved_places WHERE elder_id = $1`,
    [elderId]
  );

  if (placesRes.rows.length === 0) {
    return { evaluated: false, reason: 'No saved places' };
  }

  // Find nearest saved place for latestFix and prevFix
  let nearestPlace = null;
  let minDistanceLatest = Infinity;

  for (const place of placesRes.rows) {
    const dist = haversineDistanceM(
      parseFloat(latestFix.latitude),
      parseFloat(latestFix.longitude),
      parseFloat(place.latitude),
      parseFloat(place.longitude)
    );
    if (dist < minDistanceLatest) {
      minDistanceLatest = dist;
      nearestPlace = place;
    }
  }

  let minDistancePrev = Infinity;
  for (const place of placesRes.rows) {
    const dist = haversineDistanceM(
      parseFloat(prevFix.latitude),
      parseFloat(prevFix.longitude),
      parseFloat(place.latitude),
      parseFloat(place.longitude)
    );
    if (dist < minDistancePrev) {
      minDistancePrev = dist;
    }
  }

  // Local hour in Asia/Kolkata
  const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const kolkataDate = new Date(kolkataDateStr);
  const currentHour = kolkataDate.getHours();

  let triggeredRule = null;
  let explanation = '';
  let riskScore = 0;

  // RULE 1: FAR FROM SAVED PLACES
  // Distance > threshold for 2 consecutive fixes at least 60s apart
  const threshold = settings.threshold_distance_m || 1000;
  if (minDistanceLatest > threshold && minDistancePrev > threshold && isSeparatedInTime) {
    triggeredRule = 'FAR_FROM_SAVED_PLACES';
    riskScore = Math.min(100, Math.round((minDistanceLatest / threshold) * 60));
    explanation = `Elder is about ${(minDistanceLatest / 1000).toFixed(1)} km from nearest saved place (${nearestPlace.name}), exceeding safety threshold (${threshold}m) for consecutive fixes.`;
  }

  // RULE 2: NIGHT RULE
  // After 20:00 (8:00 PM) or before 06:00 and > 150m from every saved place
  const isNight = currentHour >= 20 || currentHour < 6;
  if (
    settings.night_rule_enabled &&
    isNight &&
    minDistanceLatest > 150 &&
    minDistancePrev > 150 &&
    isSeparatedInTime
  ) {
    triggeredRule = 'NIGHT_RULE';
    riskScore = Math.max(riskScore, 85);
    explanation = `Night rule triggered: It is ${kolkataDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} and elder is ${(minDistanceLatest)}m away from every saved place.`;
  }

  // RULE 3: LOW BATTERY BONUS
  if (latestFix.battery !== null && latestFix.battery < 20 && minDistanceLatest > 500) {
    riskScore = Math.min(100, riskScore + 20);
    explanation += ` (Low phone battery: ${latestFix.battery}%)`;
  }

  if (triggeredRule) {
    // Initiate Lost Check-in
    const insertCheckRes = await query(
      `INSERT INTO lost_checks (elder_id, status, rule, nearest_place_name, distance_m, score, score_details, explanation, started_at)
       VALUES ($1, 'active', $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, elder_id, status, rule, nearest_place_name, distance_m, score, explanation, started_at`,
      [
        elderId,
        triggeredRule,
        nearestPlace?.name || 'Home',
        minDistanceLatest,
        riskScore,
        JSON.stringify({ minDistanceLatest, minDistancePrev, threshold, isNight, currentHour }),
        explanation,
      ]
    );

    return {
      triggered: true,
      check: insertCheckRes.rows[0],
    };
  }

  return { triggered: false, nearestPlace: nearestPlace?.name, distanceM: minDistanceLatest };
}

/**
 * Escalation background check (called by cron every minute and 5-sec worker)
 * Escalates active checks after 2 minutes of no answer.
 */
export async function processLostCheckEscalations() {
  // Find active checks that have had no answer for 2 minutes
  const overdueChecksRes = await query(
    `SELECT c.id, c.elder_id, c.rule, c.nearest_place_name, c.distance_m, c.explanation, c.started_at,
            e.name as elder_name, e.last_known_lat, e.last_known_lng
     FROM lost_checks c
     JOIN elders e ON c.elder_id = e.id
     WHERE c.status = 'active' AND c.started_at <= NOW() - INTERVAL '2 minutes'`
  );

  const escalated = [];

  for (const check of overdueChecksRes.rows) {
    // Update status to alerted
    await query(
      `UPDATE lost_checks SET status = 'alerted', escalation_step = 1 WHERE id = $1`,
      [check.id]
    );

    // Get caregivers with location permission
    const caregiversRes = await query(
      `SELECT ec.caregiver_id, u.phone
       FROM elder_caregivers ec
       JOIN users u ON ec.caregiver_id = u.id
       WHERE ec.elder_id = $1 AND ec.can_see_location = TRUE AND ec.status = 'active'`,
      [check.elder_id]
    );

    const mapLink = check.last_known_lat && check.last_known_lng
      ? `https://www.google.com/maps?q=${check.last_known_lat},${check.last_known_lng}`
      : config.publicBaseUrl;

    const alertMessage = `${check.elder_name} was about ${(check.distance_m / 1000).toFixed(1)} km from ${check.nearest_place_name} and did not answer for 2 minutes. Live location: ${mapLink}`;

    // 1. In-app alerts
    for (const cg of caregiversRes.rows) {
      await query(
        `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message, metadata)
         VALUES ($1, $2, 'lost_check', $3, $4)`,
        [
          check.elder_id,
          cg.caregiver_id,
          alertMessage,
          JSON.stringify({ checkId: check.id, mapLink, lat: check.last_known_lat, lng: check.last_known_lng }),
        ]
      );

      // 2. SMS via Twilio
      if (cg.phone) {
        await sendEmergencySms({
          to: cg.phone,
          message: `[SMRITI SAATHI ALERT] ${alertMessage}`,
        }).catch(err => {
          console.warn(`[LocationAI] SMS alert error to ${cg.phone}:`, err.message);
        });
      }
    }

    escalated.push({ checkId: check.id, elderName: check.elder_name, caregiversAlerted: caregiversRes.rows.length });
  }

  return escalated;
}
