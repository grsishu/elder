/**
 * Shared Pure Decision Engine for Smriti Saathi Location Monitoring
 * Used by server ingestion, cron jobs, client, and test suites.
 * MUST be completely pure (no database, no network, no side-effects).
 */

/**
 * Haversine distance in meters between two lat/lng coordinates
 */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
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
 * Distance in meters from a point (lat, lng) to a line segment (latA, lonA) -> (latB, lonB)
 */
export function distanceToSegmentM(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dAB = haversineDistanceM(aLat, aLng, bLat, bLng);
  if (dAB === 0) return haversineDistanceM(pLat, pLng, aLat, aLng);

  // Flat projection approximation for local segment
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat) * 111320;
  const ky = 110540;

  const px = (pLng - aLng) * kx;
  const py = (pLat - aLat) * ky;
  const bx = (bLng - aLng) * kx;
  const by = (bLat - aLat) * ky;

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)));
  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return haversineDistanceM(pLat, pLng, projLat, projLng);
}

/**
 * Minimum distance in meters from a point to a GeoJSON LineString coordinates array [[lng, lat], ...]
 */
export function distanceToLineStringM(lat, lng, coordinates) {
  if (!coordinates || coordinates.length === 0) return Infinity;
  if (coordinates.length === 1) {
    return haversineDistanceM(lat, lng, coordinates[0][1], coordinates[0][0]);
  }

  let minDist = Infinity;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const aLng = coordinates[i][0];
    const aLat = coordinates[i][1];
    const bLng = coordinates[i + 1][0];
    const bLat = coordinates[i + 1][1];

    const d = distanceToSegmentM(lat, lng, aLat, aLng, bLat, bLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Compute 100m grid cell key for a given coordinate
 */
export function getCellKey(lat, lng) {
  const latStep = 0.0009; // approx 100m in latitude
  const lngStep = 0.001;  // approx 80-100m in longitude around India latitudes
  const cellY = Math.floor(lat / latStep);
  const cellX = Math.floor(lng / lngStep);
  return `${cellY}_${cellX}`;
}

/**
 * Get 9 neighbor cell keys (including self) for a given coordinate
 */
export function getNeighborCellKeys(lat, lng) {
  const latStep = 0.0009;
  const lngStep = 0.001;
  const cellY = Math.floor(lat / latStep);
  const cellX = Math.floor(lng / lngStep);

  const keys = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      keys.push(`${cellY + dy}_${cellX + dx}`);
    }
  }
  return keys;
}

/**
 * Check if a time string "HH:MM" is within a night range
 */
export function isTimeInWindow(timeStr, startStr, endStr) {
  if (!timeStr || !startStr || !endStr) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);

  const cur = h * 60 + m;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  if (s <= e) {
    return cur >= s && cur <= e;
  }
  // Crosses midnight (e.g. 20:00 to 05:00)
  return cur >= s || cur <= e;
}

/**
 * Pure evaluation function
 * @param {Array} rawSamples - array of location samples sorted or unsorted
 * @param {Array} zones - array of safe zones
 * @param {Array} routes - array of approved routes
 * @param {Array|Map|Set} familiarCells - familiar 100m grid cells
 * @param {Object} settings - configuration thresholds and flags
 * @param {Date|string} now - current timestamp
 * @returns {Object} { state, score, reasons, needsCheck }
 */
export function evaluate(rawSamples = [], zones = [], routes = [], familiarCells = [], settings = {}, now = new Date()) {
  const nowDate = typeof now === 'string' ? new Date(now) : now;
  const accuracyLimitM = settings.accuracy_limit_m ?? 150;
  const unfamiliarDistanceM = settings.unfamiliar_distance_m ?? 1500;
  const stationaryMin = settings.stationary_min ?? 10;
  const confirmSamples = Math.max(1, settings.confirm_samples ?? 2);
  const nightStart = settings.night_start || '20:00';
  const nightEnd = settings.night_end || '05:00';
  const historyDays = settings.history_days !== undefined ? settings.history_days : (settings.is_learning ? 0 : 30);
  const isLearning = historyDays < 7;

  // 1. Sort samples ascending by captured_at / recorded_at
  const sorted = [...rawSamples].sort((a, b) => {
    const timeA = new Date(a.captured_at || a.recorded_at || a.timestamp || 0).getTime();
    const timeB = new Date(b.captured_at || b.recorded_at || b.timestamp || 0).getTime();
    return timeA - timeB;
  });

  // 2. Filter good samples (accuracy <= accuracy_limit_m)
  const goodSamples = sorted.filter(s => {
    const acc = s.accuracy_m !== undefined ? s.accuracy_m : (s.accuracy !== undefined ? s.accuracy : 10);
    return acc <= accuracyLimitM;
  });

  if (goodSamples.length === 0) {
    return {
      state: 'unknown',
      score: 0,
      reasons: ['Location accuracy too low or no good GPS fixes available.'],
      needsCheck: false,
    };
  }

  const latestSample = goodSamples[goodSamples.length - 1];
  const latestLat = parseFloat(latestSample.lat !== undefined ? latestSample.lat : latestSample.latitude);
  const latestLng = parseFloat(latestSample.lng !== undefined ? latestSample.lng : latestSample.longitude);
  const latestAcc = parseFloat(latestSample.accuracy_m !== undefined ? latestSample.accuracy_m : (latestSample.accuracy || 10));

  // Active zones
  const activeZones = zones.filter(z => z.active !== false);

  // 3. Benefit of doubt zone check for latest sample
  // A sample is INSIDE a zone when distance_to_center <= radius + accuracy
  let insideZone = null;
  let minDistanceToZone = Infinity;
  let nearestZone = null;

  for (const zone of activeZones) {
    const zLat = parseFloat(zone.lat !== undefined ? zone.lat : zone.latitude);
    const zLng = parseFloat(zone.lng !== undefined ? zone.lng : zone.longitude);
    const zRadius = zone.radius_m || 150;

    const dist = haversineDistanceM(latestLat, latestLng, zLat, zLng);
    if (dist < minDistanceToZone) {
      minDistanceToZone = dist;
      nearestZone = zone;
    }

    if (dist <= zRadius + latestAcc) {
      insideZone = zone;
      break;
    }
  }

  // If inside any safe zone, state is safe_zone
  if (insideZone) {
    return {
      state: 'safe_zone',
      score: 0,
      reasons: [`In safe zone: ${insideZone.name}.`],
      needsCheck: false,
      zone: insideZone,
    };
  }

  // 4. Check if confirmed outside ALL zones: distance - radius > accuracy
  // If elder is not confirmed outside all zones (benefit of doubt), treat as safe
  let confirmedOutsideAll = true;
  for (const zone of activeZones) {
    const zLat = parseFloat(zone.lat !== undefined ? zone.lat : zone.latitude);
    const zLng = parseFloat(zone.lng !== undefined ? zone.lng : zone.longitude);
    const zRadius = zone.radius_m || 150;
    const dist = haversineDistanceM(latestLat, latestLng, zLat, zLng);

    if (dist - zRadius <= latestAcc) {
      confirmedOutsideAll = false;
      break;
    }
  }

  if (!confirmedOutsideAll) {
    return {
      state: 'away_normal',
      score: 0,
      reasons: ['Within boundary margin of safe zone.'],
      needsCheck: false,
    };
  }

  // 5. Evaluate consecutive good samples to check if rules hold for confirm_samples
  const recentGood = goodSamples.slice(-confirmSamples);
  const hasEnoughConfirmSamples = recentGood.length >= confirmSamples;

  // Function to evaluate single sample against concern rules
  function evaluateSampleConcerns(sample) {
    const sLat = parseFloat(sample.lat !== undefined ? sample.lat : sample.latitude);
    const sLng = parseFloat(sample.lng !== undefined ? sample.lng : sample.longitude);
    const sAcc = parseFloat(sample.accuracy_m !== undefined ? sample.accuracy_m : (sample.accuracy || 10));
    const sTime = new Date(sample.captured_at || sample.recorded_at || sample.timestamp || nowDate);

    // Rule 1: Off route
    let offRouteConcern = null;
    if (settings.active_route || settings.active_trip) {
      const activeRouteId = settings.active_route?.id || settings.active_trip?.route_id;
      const targetRoute = routes.find(r => r.id === activeRouteId) || settings.active_route;
      if (targetRoute && targetRoute.path_geojson) {
        const coords = targetRoute.path_geojson.coordinates || targetRoute.path_geojson;
        if (Array.isArray(coords)) {
          const corridor = targetRoute.corridor_m || 100;
          const distToRoute = distanceToLineStringM(sLat, sLng, coords);
          if (distToRoute > corridor) {
            offRouteConcern = `Off approved route (${Math.round(distToRoute)}m from route, corridor ${corridor}m).`;
          }
        }
      }
    }

    // Rule 2: Unfamiliar Area (disabled during learning mode < 7 days of history)
    let unfamiliarConcern = null;
    let distFromNearest = Infinity;
    let closestZ = null;
    for (const z of activeZones) {
      const zLat = parseFloat(z.lat !== undefined ? z.lat : z.latitude);
      const zLng = parseFloat(z.lng !== undefined ? z.lng : z.longitude);
      const d = haversineDistanceM(sLat, sLng, zLat, zLng);
      if (d < distFromNearest) {
        distFromNearest = d;
        closestZ = z;
      }
    }

    if (!isLearning) {
      if (distFromNearest > unfamiliarDistanceM) {
        const km = (distFromNearest / 1000).toFixed(1);
        const zName = closestZ ? closestZ.name : 'Home';
        unfamiliarConcern = `About ${km} km from the nearest safe place (${zName}).`;
      } else {
        // Grid cell check: only apply if baseline familiarCells data is present,
        // no active approved route is in progress, and elder is beyond immediate safe zone buffer
        const hasCellData = Array.isArray(familiarCells)
          ? familiarCells.length > 0
          : (familiarCells && (familiarCells.size > 0 || familiarCells instanceof Map));
        const isOnApprovedRoute = Boolean(settings.active_route || settings.active_trip);
        const beyondImmediateBuffer = distFromNearest > ((closestZ?.radius_m || 150) + 150);

        if (hasCellData && !isOnApprovedRoute && beyondImmediateBuffer) {
          const neighborKeys = getNeighborCellKeys(sLat, sLng);
          let totalVisits = 0;
          if (Array.isArray(familiarCells)) {
            for (const cell of familiarCells) {
              if (neighborKeys.includes(cell.cell_key)) {
                totalVisits += (cell.visits || 1);
              }
            }
          } else if (familiarCells instanceof Map) {
            for (const k of neighborKeys) {
              totalVisits += familiarCells.get(k) || 0;
            }
          } else if (familiarCells instanceof Set) {
            for (const k of neighborKeys) {
              if (familiarCells.has(k)) totalVisits += 1;
            }
          }

          if (totalVisits < 2) {
            unfamiliarConcern = `Unfamiliar area with no routine visits in last 30 days.`;
          }
        }
      }
    }

    // Rule 3: Stopped Outside (>150m from zones, moved < max(40m, acc) for stationaryMin minutes)
    let stoppedConcern = null;
    const stationaryThresholdM = Math.max(40, sAcc);
    if (distFromNearest > 150) {
      // Find sample from >= stationaryMin minutes before current evaluation time
      const targetTime = nowDate.getTime() - stationaryMin * 60 * 1000;
      const olderSample = goodSamples.find(prev => {
        const t = new Date(prev.captured_at || prev.recorded_at || prev.timestamp || 0).getTime();
        return t <= targetTime && t >= targetTime - 60 * 60 * 1000;
      });

      if (olderSample) {
        const oLat = parseFloat(olderSample.lat !== undefined ? olderSample.lat : olderSample.latitude);
        const oLng = parseFloat(olderSample.lng !== undefined ? olderSample.lng : olderSample.longitude);
        const movedM = haversineDistanceM(sLat, sLng, oLat, oLng);
        if (movedM < stationaryThresholdM) {
          const zName = closestZ ? closestZ.name : 'Home';
          const distStr = distFromNearest >= 1000 ? `${(distFromNearest / 1000).toFixed(1)} km` : `${distFromNearest} m`;
          stoppedConcern = `About ${distStr} from the nearest safe place (${zName}) and stopped for ${stationaryMin} minutes.`;
        }
      }
    }

    // Rule 4: Night Rule
    let nightConcern = null;
    const timeHours = sTime.getHours();
    const timeMins = sTime.getMinutes();
    const timeStr = `${String(timeHours).padStart(2, '0')}:${String(timeMins).padStart(2, '0')}`;
    if (isTimeInWindow(timeStr, nightStart, nightEnd) && distFromNearest > 150) {
      const zName = closestZ ? closestZ.name : 'Home';
      const distStr = distFromNearest >= 1000 ? `${(distFromNearest / 1000).toFixed(1)} km` : `${distFromNearest} m`;
      nightConcern = `Outside safe zone during night hours (${timeStr}), ${distStr} from ${zName}.`;
    }

    // Rule 5: Wrong way / circling
    let wrongWayConcern = null;
    if (goodSamples.length >= 4) {
      // Circling: path length > 4x displacement within 400m radius
      const recent4 = goodSamples.slice(-4);
      let pathLen = 0;
      for (let i = 1; i < recent4.length; i++) {
        const p1 = recent4[i - 1];
        const p2 = recent4[i];
        pathLen += haversineDistanceM(
          parseFloat(p1.lat ?? p1.latitude), parseFloat(p1.lng ?? p1.longitude),
          parseFloat(p2.lat ?? p2.latitude), parseFloat(p2.lng ?? p2.longitude)
        );
      }
      const disp = haversineDistanceM(
        parseFloat(recent4[0].lat ?? recent4[0].latitude), parseFloat(recent4[0].lng ?? recent4[0].longitude),
        sLat, sLng
      );
      if (pathLen > 4 * Math.max(disp, 10) && pathLen <= 400) {
        wrongWayConcern = `Circling detected (${pathLen}m path with only ${disp}m displacement).`;
      }
    }

    return {
      offRoute: offRouteConcern,
      unfamiliar: unfamiliarConcern,
      stopped: stoppedConcern,
      night: nightConcern,
      wrongWay: wrongWayConcern,
      any: offRouteConcern || unfamiliarConcern || stoppedConcern || nightConcern || wrongWayConcern,
      distFromNearest,
      closestZ,
    };
  }

  // 6. Check if rules hold across confirm_samples
  const evaluations = recentGood.map(evaluateSampleConcerns);
  const latestEval = evaluations[evaluations.length - 1];

  let triggeredRule = null;
  let reasonText = '';

  if (hasEnoughConfirmSamples) {
    if (evaluations.every(e => e.offRoute)) {
      triggeredRule = 'off_route';
      reasonText = latestEval.offRoute;
    } else if (evaluations.every(e => e.night)) {
      triggeredRule = 'night';
      reasonText = latestEval.night;
    } else if (evaluations.every(e => e.stopped)) {
      triggeredRule = 'stopped';
      reasonText = latestEval.stopped;
    } else if (evaluations.every(e => e.wrongWay)) {
      triggeredRule = 'wrong_way';
      reasonText = latestEval.wrongWay;
    } else if (evaluations.every(e => e.unfamiliar)) {
      triggeredRule = 'unfamiliar';
      reasonText = latestEval.unfamiliar;
    }
  }

  // Leaving home / safe zone by itself is NEVER a concern
  if (!triggeredRule) {
    return {
      state: isLearning ? 'learning' : 'away_normal',
      score: 10,
      reasons: [isLearning ? 'Away from safe zone (learning baseline mode active).' : 'Away from safe zone (normal routine).'],
      needsCheck: false,
    };
  }

  // 7. Check suppressions
  let isSuppressed = false;
  let suppressionReason = null;

  // A. Outing window
  const curTimeStr = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;
  const windows = settings.outing_windows || [];
  for (const win of windows) {
    if (isTimeInWindow(curTimeStr, win.start, win.end)) {
      isSuppressed = true;
      suppressionReason = `Outing window active: ${win.label || 'Family scheduled outing'} (${win.start} to ${win.end}).`;
      break;
    }
  }

  // B. "I am fine" cooldown within 200m
  if (!isSuppressed && settings.cooldown_until) {
    const cdDate = new Date(settings.cooldown_until);
    if (nowDate < cdDate) {
      if (settings.cooldown_lat !== undefined && settings.cooldown_lng !== undefined && settings.cooldown_lat !== null) {
        const distFromFine = haversineDistanceM(latestLat, latestLng, settings.cooldown_lat, settings.cooldown_lng);
        if (distFromFine <= 200) {
          isSuppressed = true;
          const minsRem = Math.max(1, Math.round((cdDate.getTime() - nowDate.getTime()) / 60000));
          suppressionReason = `Elder confirmed "I am fine" at this location (${minsRem} min cooldown remaining).`;
        }
      } else {
        isSuppressed = true;
        suppressionReason = `Active safety cooldown in progress.`;
      }
    }
  }

  // C. EasyRide trip or TakeMeHome guidance active
  if (!isSuppressed && (settings.active_trip || settings.guidance_active)) {
    isSuppressed = true;
    suppressionReason = 'Trip or route navigation guidance is active.';
  }

  // Compute Risk Score (0-100)
  let score = 40; // baseline for unusual
  if (triggeredRule === 'unfamiliar') score += 25;
  if (triggeredRule === 'night') score += 20;
  if (triggeredRule === 'stopped') score += 15;
  if (triggeredRule === 'off_route') score += 20;
  if (triggeredRule === 'wrong_way') score += 20;

  // Low battery (<15%) adds 10
  if (latestSample.battery_pct !== undefined && latestSample.battery_pct < 15) {
    score += 10;
  }
  score = Math.min(100, Math.max(0, score));

  if (isSuppressed) {
    return {
      state: 'away_normal',
      score: 0,
      reasons: [reasonText, suppressionReason].filter(Boolean),
      needsCheck: false,
      suppressed: true,
      suppressionReason,
    };
  }

  return {
    state: 'unusual',
    score,
    reasons: [reasonText],
    needsCheck: true,
    rule: triggeredRule,
  };
}

