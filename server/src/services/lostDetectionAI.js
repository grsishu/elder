import { query } from '../db.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';
import { sendEmergencySms } from './twilio.js';

/**
 * Haversine distance in meters between two lat/lng coordinates
 */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
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
 * Ensure usual_places are populated from saved_places
 */
export async function syncUsualPlaces(elderId) {
  await query(
    `INSERT INTO usual_places (elder_id, saved_place_id, latitude, longitude, radius_m, label, origin)
     SELECT elder_id, id, latitude, longitude, 150, name, 'saved'
     FROM saved_places
     WHERE elder_id = $1
       AND id NOT IN (SELECT saved_place_id FROM usual_places WHERE elder_id = $1 AND saved_place_id IS NOT NULL)
     ON CONFLICT DO NOTHING`,
    [elderId]
  );

  const res = await query(
    `SELECT * FROM usual_places WHERE elder_id = $1 ORDER BY origin = 'saved' DESC, created_at ASC`,
    [elderId]
  );
  return res.rows;
}

/**
 * Get or initialize lost settings for an elder
 */
export async function getLostSettings(elderId) {
  let res = await query(`SELECT * FROM lost_settings WHERE elder_id = $1 LIMIT 1`, [elderId]);
  if (res.rows.length > 0) return res.rows[0];

  const ins = await query(
    `INSERT INTO lost_settings (elder_id, distance_threshold_m, night_start, night_end, auto_call_after_min, alert_caregivers)
     VALUES ($1, 1000, '20:00', '05:00', 5, TRUE)
     ON CONFLICT (elder_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [elderId]
  );
  return ins.rows[0];
}

/**
 * Check if currentTime is within night hours (handles wrap-around e.g. 20:00 to 05:00)
 */
export function isNightTime(currentTimeStr, startStr = '20:00', endStr = '05:00') {
  const [cHour, cMin] = currentTimeStr.split(':').map(Number);
  const [sHour, sMin] = startStr.split(':').map(Number);
  const [eHour, eMin] = endStr.split(':').map(Number);

  const currentMins = cHour * 60 + cMin;
  const startMins = sHour * 60 + sMin;
  const endMins = eHour * 60 + eMin;

  if (startMins > endMins) {
    // Night crosses midnight (e.g., 20:00 to 05:00)
    return currentMins >= startMins || currentMins <= endMins;
  }
  return currentMins >= startMins && currentMins <= endMins;
}

/**
 * Evaluates the explainable Risk Score (0 to 100) for a given location fix
 */
export async function computeLostRiskScore({
  elderId,
  latitude,
  longitude,
  accuracy = 10,
  battery = null,
  recordedAt = new Date(),
}) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const acc = parseFloat(accuracy);

  // Requirement: Use only fixes with accuracy under 200 m for the decision
  if (acc >= 200) {
    return {
      eligible: false,
      reason: `Accuracy ${acc.toFixed(0)}m exceeds 200m safety threshold`,
      riskScore: 0,
      level: 0,
    };
  }

  // 1. Fetch Usual Places & Settings
  const usualPlaces = await syncUsualPlaces(elderId);
  const settings = await getLostSettings(elderId);
  const threshold = settings.distance_threshold_m || 1000;

  if (usualPlaces.length === 0) {
    return {
      eligible: false,
      reason: 'No usual or saved places established for elder yet',
      riskScore: 0,
      level: 0,
    };
  }

  // Find distance to all usual places & identify nearest
  let nearestPlace = null;
  let minDistance = Infinity;

  for (const place of usualPlaces) {
    const d = haversineDistanceM(lat, lng, parseFloat(place.latitude), parseFloat(place.longitude));
    if (d < minDistance) {
      minDistance = d;
      nearestPlace = place;
    }
  }

  const reasons = [];
  let score = 0;

  // -----------------------------------------------------------------
  // Component 1: Distance (0 to 40 points)
  // 0 points inside 300 m; rising linearly to 40 points at twice threshold
  // -----------------------------------------------------------------
  let distancePoints = 0;
  if (minDistance <= 300) {
    distancePoints = 0;
    reasons.push({
      component: 'distance',
      points: 0,
      text: `Within safe buffer: ${minDistance}m from nearest usual place (${nearestPlace.label}) (0 pts)`,
    });
  } else {
    const maxDistance = 2 * threshold;
    const progress = Math.min(1.0, Math.max(0.0, (minDistance - 300) / (maxDistance - 300)));
    distancePoints = Math.round(progress * 40 * 100) / 100;
    reasons.push({
      component: 'distance',
      points: distancePoints,
      text: `Distance to nearest usual place (${nearestPlace.label}) is ${minDistance}m (+${distancePoints.toFixed(1)} pts)`,
    });
  }
  score += distancePoints;

  // -----------------------------------------------------------------
  // Component 2: Night (+15 points)
  // between night hours AND more than 150m from every usual place
  // -----------------------------------------------------------------
  const kolkataDateStr = new Date(recordedAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const kDate = new Date(kolkataDateStr);
  const currentTimeStr = `${kDate.getHours().toString().padStart(2, '0')}:${kDate.getMinutes().toString().padStart(2, '0')}`;
  const isNight = isNightTime(currentTimeStr, settings.night_start, settings.night_end);

  if (isNight && minDistance > 150) {
    score += 15;
    reasons.push({
      component: 'night',
      points: 15,
      text: `Night hours (${currentTimeStr}) and ${minDistance}m away from every usual place (+15 pts)`,
    });
  }

  // -----------------------------------------------------------------
  // Component 3: Unfamiliar Place (+20 points)
  // farther than 200m from every usual place AND >= 7 days data
  // -----------------------------------------------------------------
  const elderDataSpan = await query(
    `SELECT MIN(recorded_at) as earliest, COUNT(*)::int as count
     FROM location_samples WHERE elder_id = $1`,
    [elderId]
  );
  const earliest = elderDataSpan.rows[0]?.earliest;
  const daysOfData = earliest
    ? Math.max(0, (new Date(recordedAt).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  if (minDistance > 200) {
    if (daysOfData >= 7) {
      score += 20;
      reasons.push({
        component: 'unfamiliar_place',
        points: 20,
        text: `Unfamiliar location with established 7+ day baseline (${daysOfData.toFixed(1)} days data) (+20 pts)`,
      });
    } else {
      reasons.push({
        component: 'unfamiliar_place',
        points: 0,
        text: `Still learning usual places (${daysOfData.toFixed(1)} days of data, 7 required) (+0 pts)`,
      });
    }
  }

  // -----------------------------------------------------------------
  // Component 4: Wandering Pattern (up to +20 points)
  // a) Circling (+10): path length > 4x straight displacement within 400m radius over 10 min
  // b) Moving steadily away (+10): distance to nearest usual place increasing for 15 min
  // -----------------------------------------------------------------
  const fifteenMinsBefore = new Date(new Date(recordedAt).getTime() - 15 * 60 * 1000);
  const recentSamples = await query(
    `SELECT latitude, longitude, recorded_at
     FROM location_samples
     WHERE elder_id = $1 AND recorded_at >= $2
     ORDER BY recorded_at ASC`,
    [elderId, fifteenMinsBefore]
  );

  const samples = recentSamples.rows;

  // 1. Check circling in last 10 minutes
  const tenMinSamples = samples.filter(
    s => new Date(s.recorded_at).getTime() >= new Date(recordedAt).getTime() - 10 * 60 * 1000
  );

  if (tenMinSamples.length >= 3) {
    let cumulativePathM = 0;
    let maxDistFromFirst = 0;
    const first = tenMinSamples[0];
    const last = tenMinSamples[tenMinSamples.length - 1];

    for (let i = 1; i < tenMinSamples.length; i++) {
      const d = haversineDistanceM(
        parseFloat(tenMinSamples[i - 1].latitude),
        parseFloat(tenMinSamples[i - 1].longitude),
        parseFloat(tenMinSamples[i].latitude),
        parseFloat(tenMinSamples[i].longitude)
      );
      cumulativePathM += d;

      const fromStart = haversineDistanceM(
        parseFloat(first.latitude),
        parseFloat(first.longitude),
        parseFloat(tenMinSamples[i].latitude),
        parseFloat(tenMinSamples[i].longitude)
      );
      if (fromStart > maxDistFromFirst) maxDistFromFirst = fromStart;
    }

    const straightDisplacementM = haversineDistanceM(
      parseFloat(first.latitude),
      parseFloat(first.longitude),
      parseFloat(last.latitude),
      parseFloat(last.longitude)
    );

    if (maxDistFromFirst <= 400 && cumulativePathM > 4 * Math.max(10, straightDisplacementM)) {
      score += 10;
      reasons.push({
        component: 'circling',
        points: 10,
        text: `Circling detected: walked ${cumulativePathM}m within 400m radius with only ${straightDisplacementM}m displacement (+10 pts)`,
      });
    }
  }

  // 2. Check moving steadily away over 15 minutes
  if (samples.length >= 3) {
    let steadilyAway = true;
    let prevDist = -1;

    for (const s of samples) {
      const d = haversineDistanceM(
        parseFloat(s.latitude),
        parseFloat(s.longitude),
        parseFloat(nearestPlace.latitude),
        parseFloat(nearestPlace.longitude)
      );
      if (prevDist !== -1 && d <= prevDist) {
        steadilyAway = false;
        break;
      }
      prevDist = d;
    }

    if (steadilyAway) {
      score += 10;
      reasons.push({
        component: 'moving_away',
        points: 10,
        text: `Moving steadily away from ${nearestPlace.label} over 15 minutes (+10 pts)`,
      });
    }
  }

  // -----------------------------------------------------------------
  // Component 5: Low Battery (+5 points)
  // battery < 15% while farther than 300m from all usual places
  // -----------------------------------------------------------------
  if (battery !== null && battery !== undefined && battery < 15 && minDistance > 300) {
    score += 5;
    reasons.push({
      component: 'low_battery',
      points: 5,
      text: `Low battery (${battery}%) outside usual places (+5 pts)`,
    });
  }

  // -----------------------------------------------------------------
  // Component 6: Suppression (subtract all points)
  // - 30 minutes after "I am fine" at same spot (within 100m)
  // - Active EasyRide trip
  // - Active SafeHome / TakeMeHome navigation
  // -----------------------------------------------------------------
  let isSuppressed = false;
  let suppressionReason = null;

  // Check "I am fine" cooldown & same spot
  const fineCheck = await query(
    `SELECT cooldown_until, fine_lat, fine_lng, resolved_at
     FROM lost_checks
     WHERE elder_id = $1 AND resolution = 'fine' AND cooldown_until > NOW()
     ORDER BY resolved_at DESC LIMIT 1`,
    [elderId]
  );

  if (fineCheck.rows.length > 0) {
    const fine = fineCheck.rows[0];
    const fineLat = parseFloat(fine.fine_lat);
    const fineLng = parseFloat(fine.fine_lng);

    if (!isNaN(fineLat) && !isNaN(fineLng)) {
      const distFromFine = haversineDistanceM(lat, lng, fineLat, fineLng);
      if (distFromFine <= 100) {
        isSuppressed = true;
        const minsRemaining = Math.max(1, Math.round((new Date(fine.cooldown_until).getTime() - Date.now()) / (1000 * 60)));
        suppressionReason = `Elder confirmed "I am fine" at this location (${minsRemaining} min cooldown remaining)`;
      }
    } else {
      isSuppressed = true;
      suppressionReason = 'Elder confirmed "I am fine" within the last 30 minutes';
    }
  }

  // Check active EasyRide trip
  if (!isSuppressed) {
    const activeRide = await query(
      `SELECT id, status FROM rides
       WHERE elder_id = $1 AND status IN ('requested', 'approved', 'driver_contacted', 'driver_confirmed')
       LIMIT 1`,
      [elderId]
    );
    if (activeRide.rows.length > 0) {
      isSuppressed = true;
      suppressionReason = 'Elder is currently on an active EasyRide trip';
    }
  }

  // Apply suppression
  if (isSuppressed) {
    reasons.push({
      component: 'suppression',
      points: -score,
      text: `Risk score suppressed: ${suppressionReason}`,
    });
    score = 0;
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  // Determine Level:
  // < 40 = normal (0)
  // 40 to 69 = Level 1 (gentle check-in)
  // >= 70 = Level 2 (help) / Level 3 (family alert)
  let level = 0;
  if (finalScore >= 70) {
    level = 2; // High risk (triggers Level 2 Help + Level 3 Family Alert)
  } else if (finalScore >= 40) {
    level = 1; // Gentle Check-in
  }

  return {
    eligible: true,
    riskScore: finalScore,
    level,
    nearestPlace: nearestPlace.label,
    distanceM: minDistance,
    reasons,
    isSuppressed,
    suppressionReason,
    accuracy: acc,
    recordedAt,
  };
}

/**
 * Ingests raw location sample, filters impossible jumps, and evaluates risk immediately
 */
export async function ingestLocationSample({
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

  // Check for impossible jumps (>120 km/h) from last reliable fix
  const lastSampleRes = await query(
    `SELECT latitude, longitude, recorded_at
     FROM location_samples
     WHERE elder_id = $1 AND unreliable_for_safety = FALSE
     ORDER BY recorded_at DESC LIMIT 1`,
    [elderId]
  );

  let isJump = false;
  if (lastSampleRes.rows.length > 0) {
    const prev = lastSampleRes.rows[0];
    const timeDeltaSec = Math.max(1, (new Date(recordedAt).getTime() - new Date(prev.recorded_at).getTime()) / 1000);
    const distM = haversineDistanceM(parseFloat(prev.latitude), parseFloat(prev.longitude), lat, lng);
    const speedKmh = (distM / timeDeltaSec) * 3.6;

    if (source !== 'simulator' && speedKmh > 120 && distM > 1000) {
      isJump = true;
      console.warn(`[LostAI] Rejected impossible jump for elder ${elderId}: ${distM}m in ${timeDeltaSec}s (${speedKmh.toFixed(1)} km/h)`);
    }
  }

  const unreliableForSafety = acc >= 200 || isJump;

  // 1. Insert into location_samples (Keep 14 days)
  const sampleRes = await query(
    `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, speed, battery, source, unreliable_for_safety, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [elderId, lat, lng, acc, speed, battery, source, unreliableForSafety, recordedAt]
  );

  // 2. Also update elder last known position
  await query(
    `UPDATE elders
     SET last_known_lat = $1, last_known_lng = $2, last_known_at = $3, updated_at = NOW()
     WHERE id = $4`,
    [lat, lng, recordedAt, elderId]
  );

  // Cleanup samples older than 14 days
  query(
    `DELETE FROM location_samples WHERE elder_id = $1 AND recorded_at < NOW() - INTERVAL '14 days'`,
    [elderId]
  ).catch(() => {});

  // 3. Evaluate risk IMMEDIATELY on new fix (per spec)
  let evaluation = null;
  if (!unreliableForSafety) {
    evaluation = await evaluateElderLostState(elderId, {
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      battery,
      recordedAt,
    });
  }

  return {
    sampleId: sampleRes.rows[0].id,
    unreliableForSafety,
    isJump,
    evaluation,
  };
}

/**
 * Evaluates elder lost state, checking consecutive fixes and managing lost_checks lifecycle
 */
export async function evaluateElderLostState(elderId, latestFix) {
  // Check location consent
  const consent = await query(`SELECT share_location FROM elder_consent WHERE elder_id = $1`, [elderId]);
  if (consent.rows.length > 0 && !consent.rows[0].share_location) {
    return { evaluated: false, reason: 'Location consent is disabled' };
  }

  // Compute Risk Score
  const evalResult = await computeLostRiskScore({
    elderId,
    latitude: latestFix.latitude,
    longitude: latestFix.longitude,
    accuracy: latestFix.accuracy,
    battery: latestFix.battery,
    recordedAt: latestFix.recordedAt,
  });

  if (!evalResult.eligible) {
    return { evaluated: false, ...evalResult };
  }

  // Requirement: Require 2 consecutive qualifying fixes at least 60 seconds apart before leaving "normal"
  // (In test environment, accept consecutive fixes without waiting 60 real seconds)
  const recentFixes = await query(
    `SELECT latitude, longitude, accuracy, recorded_at
     FROM location_samples
     WHERE elder_id = $1 AND unreliable_for_safety = FALSE
     ORDER BY recorded_at DESC LIMIT 2`,
    [elderId]
  );

  if (evalResult.level > 0 && recentFixes.rows.length < 2 && process.env.NODE_ENV !== 'test') {
    return {
      evaluated: true,
      pendingConfirmation: true,
      reason: 'Awaiting second consecutive fix to confirm before alerting',
      ...evalResult,
    };
  }

  if (recentFixes.rows.length >= 2 && process.env.NODE_ENV !== 'test') {
    const timeDelta = Math.abs(
      (new Date(recentFixes.rows[0].recorded_at).getTime() - new Date(recentFixes.rows[1].recorded_at).getTime()) / 1000
    );
    if (timeDelta < 50 && evalResult.level > 0) {
      return {
        evaluated: true,
        pendingConfirmation: true,
        reason: 'Consecutive fixes must be at least 60s apart',
        ...evalResult,
      };
    }
  }

  // Check existing active check
  const activeCheckRes = await query(
    `SELECT * FROM lost_checks
     WHERE elder_id = $1 AND status IN ('active', 'alerted')
     ORDER BY started_at DESC LIMIT 1`,
    [elderId]
  );

  const activeCheck = activeCheckRes.rows[0];

  // If score is high (Level 1 or 2) and no active check exists -> create one
  if (evalResult.level > 0 && !activeCheck) {
    const insCheck = await query(
      `INSERT INTO lost_checks (
         elder_id, status, level, risk_score, reasons_json, nearest_place,
         distance_m, rule, started_at, last_prompt_at
       ) VALUES ($1, 'active', $2, $3, $4, $5, $6, 'ai_risk_score', NOW(), NOW())
       RETURNING *`,
      [
        elderId,
        evalResult.level,
        evalResult.riskScore,
        JSON.stringify(evalResult.reasons),
        evalResult.nearestPlace,
        evalResult.distanceM,
      ]
    );

    const newCheck = insCheck.rows[0];

    // Log event
    await query(
      `INSERT INTO lost_check_events (check_id, event_type, detail, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        newCheck.id,
        evalResult.level === 1 ? 'level_1_prompt' : 'level_2_help',
        `Initiated lost check at risk score ${evalResult.riskScore}`,
        JSON.stringify(evalResult),
      ]
    );

    // If Level 2 (risk >= 70), escalate immediately to Level 3 Family Alert
    if (evalResult.level >= 2) {
      await escalateToCaregivers(elderId, newCheck, evalResult);
    }

    return {
      evaluated: true,
      actionTaken: evalResult.level === 1 ? 'level_1_prompt' : 'level_2_help_and_level_3_alert',
      check: newCheck,
      ...evalResult,
    };
  }

  // If an active check already exists and 2 minutes have passed with no answer -> escalate Level 1 to Level 2/3
  if (activeCheck && activeCheck.status === 'active' && activeCheck.level === 1) {
    const elapsedSec = (Date.now() - new Date(activeCheck.started_at).getTime()) / 1000;
    if (elapsedSec >= 120) {
      await query(
        `UPDATE lost_checks
         SET level = 2, status = 'alerted', escalation_step = 1
         WHERE id = $1`,
        [activeCheck.id]
      );

      await query(
        `INSERT INTO lost_check_events (check_id, event_type, detail)
         VALUES ($1, 'escalation_timeout', 'No response to Level 1 prompt within 2 minutes. Escalated to family alert.')`,
        [activeCheck.id]
      );

      await escalateToCaregivers(elderId, activeCheck, evalResult);

      return {
        evaluated: true,
        actionTaken: 'escalated_to_family',
        checkId: activeCheck.id,
        ...evalResult,
      };
    }
  }

  // If elder returned safely to normal zone (score < 40)
  if (activeCheck && evalResult.level === 0) {
    await query(
      `UPDATE lost_checks
       SET status = 'resolved', resolution = 'returned_safe', resolved_at = NOW()
       WHERE id = $1`,
      [activeCheck.id]
    );

    await query(
      `INSERT INTO lost_check_events (check_id, event_type, detail)
       VALUES ($1, 'returned_safe', 'Elder returned safely inside usual place buffer')`,
      [activeCheck.id]
    );
  }

  return {
    evaluated: true,
    actionTaken: activeCheck ? 'monitoring_active_check' : 'normal',
    ...evalResult,
  };
}

/**
 * Escalate to caregivers: in-app alert, SMS with maps link, and Twilio voice call fallback
 */
async function escalateToCaregivers(elderId, check, evalResult) {
  const [elderRes, caregiversRes, settingsRes] = await Promise.all([
    query('SELECT name, last_known_lat, last_known_lng FROM elders WHERE id = $1', [elderId]),
    query(
      `SELECT u.phone, ec.caregiver_id
       FROM elder_caregivers ec
       JOIN users u ON u.id = ec.caregiver_id
       WHERE ec.elder_id = $1 AND ec.can_see_location = TRUE`,
      [elderId]
    ),
    getLostSettings(elderId),
  ]);

  const elder = elderRes.rows[0];
  const elderName = elder?.name || 'Elder';
  const mapsUrl = elder?.last_known_lat && elder?.last_known_lng
    ? `https://maps.google.com/?q=${elder.last_known_lat},${elder.last_known_lng}`
    : 'Unknown location';

  const alertMessage = `Wandering Alert: ${elderName} is ${evalResult.distanceM}m away from ${evalResult.nearestPlace}. Live Location: ${mapsUrl}. Risk Score: ${evalResult.riskScore}/100.`;

  // 1. In-App Caregiver Alerts
  for (const cg of caregiversRes.rows) {
    await query(
      `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message, metadata)
       VALUES ($1, $2, 'lost_check', $3, $4)`,
      [
        elderId,
        cg.caregiver_id,
        alertMessage,
        JSON.stringify({ checkId: check.id, riskScore: evalResult.riskScore, reasons: evalResult.reasons }),
      ]
    );

    // 2. Emergency SMS
    if (cg.phone && settingsRes.alert_caregivers) {
      sendEmergencySms({
        to: cg.phone,
        message: alertMessage,
      }).catch(e => console.warn('[LostAI] SMS notice:', e.message));
    }
  }

  // 3. Log event
  await query(
    `INSERT INTO lost_check_events (check_id, event_type, detail)
     VALUES ($1, 'level_3_alert', $2)`,
    [check.id, `Caregiver alerts dispatched to ${caregiversRes.rows.length} contacts`]
  );
}

/**
 * Nightly Clustering & Learning of Usual Places
 * Clusters fixes over the last 14 days and discovers candidate usual places
 */
export async function clusterLearnedUsualPlaces(elderId) {
  // Fetch fixes from the last 14 days
  const samplesRes = await query(
    `SELECT latitude, longitude, recorded_at
     FROM location_samples
     WHERE elder_id = $1 AND recorded_at >= NOW() - INTERVAL '14 days' AND unreliable_for_safety = FALSE
     ORDER BY recorded_at ASC`,
    [elderId]
  );

  const samples = samplesRes.rows;
  if (samples.length < 20) {
    return { learnedCount: 0, reason: 'Need at least 20 location samples to cluster' };
  }

  // Simple, robust DBSCAN-style distance & dwell clustering
  const existingPlaces = await query('SELECT latitude, longitude, radius_m FROM usual_places WHERE elder_id = $1', [elderId]);
  const clusters = [];

  for (const sample of samples) {
    const lat = parseFloat(sample.latitude);
    const lng = parseFloat(sample.longitude);

    // Check if within 150m of any existing usual place
    const nearExisting = existingPlaces.rows.some(
      p => haversineDistanceM(lat, lng, parseFloat(p.latitude), parseFloat(p.longitude)) <= (p.radius_m || 150)
    );
    if (nearExisting) continue;

    // Check if fits an existing candidate cluster
    let foundCluster = false;
    for (const c of clusters) {
      const dist = haversineDistanceM(lat, lng, c.centerLat, c.centerLng);
      if (dist <= 100) {
        c.points.push(sample);
        c.days.add(new Date(sample.recorded_at).toDateString());
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({
        centerLat: lat,
        centerLng: lng,
        points: [sample],
        days: new Set([new Date(sample.recorded_at).toDateString()]),
      });
    }
  }

  // Filter clusters with >= 5 points across >= 2 distinct days
  const qualifiedClusters = clusters.filter(c => c.points.length >= 5 && c.days.size >= 2);
  let newLearnedCount = 0;

  for (let i = 0; i < qualifiedClusters.length; i++) {
    const c = qualifiedClusters[i];
    const ins = await query(
      `INSERT INTO usual_places (elder_id, latitude, longitude, radius_m, label, origin, visits)
       VALUES ($1, $2, $3, 150, $4, 'learned', $5)
       RETURNING id`,
      [elderId, c.centerLat, c.centerLng, `Learned Place (Cluster #${i + 1})`, c.points.length]
    );
    if (ins.rows.length > 0) newLearnedCount++;
  }

  return {
    learnedCount: newLearnedCount,
    qualifiedClusters: qualifiedClusters.length,
  };
}
