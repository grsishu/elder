import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import {
  haversineDistanceM,
  computeLostRiskScore,
  ingestLocationSample,
  evaluateElderLostState,
  clusterLearnedUsualPlaces,
  syncUsualPlaces,
  getLostSettings,
} from '../server/src/services/lostDetectionAI.js';

describe('Lost Detection and Help AI System', () => {
  let seededElderId = '';
  let caregiverUserId = '';
  let sessionCookie = '';
  let homePlace = null;

  beforeAll(async () => {
    // 1. Seed caregiver user
    const userRes = await query(
      `INSERT INTO users (phone, role) VALUES ('+919876543999', 'caregiver')
       ON CONFLICT (phone) DO UPDATE SET role = 'caregiver'
       RETURNING id, phone`
    );
    caregiverUserId = userRes.rows[0].id;

    // Create session cookie
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [caregiverUserId, tokenHash]
    );
    sessionCookie = `smriti_session=${rawToken}`;

    // 2. Seed elder
    const elderRes = await query(
      `INSERT INTO elders (user_id, name, age, language, region)
       VALUES ($1, 'Bhaben Barua', 79, 'hi', 'Assam')
       RETURNING id`,
      [caregiverUserId]
    );
    seededElderId = elderRes.rows[0].id;

    // 3. Grant location consent
    await query(
      `INSERT INTO elder_consent (elder_id, share_location, share_health, share_progress)
       VALUES ($1, TRUE, TRUE, TRUE)
       ON CONFLICT (elder_id) DO UPDATE SET share_location = TRUE`,
      [seededElderId]
    );

    // 4. Link caregiver with location permissions
    await query(
      `INSERT INTO elder_caregivers (elder_id, caregiver_id, status, can_see_location, can_see_progress)
       VALUES ($1, $2, 'active', TRUE, TRUE)
       ON CONFLICT (elder_id, caregiver_id) DO UPDATE SET can_see_location = TRUE`,
      [seededElderId, caregiverUserId]
    );

    // 5. Seed saved place: Home in Guwahati (26.1755, 91.7580)
    const placeRes = await query(
      `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type)
       VALUES ($1, 'Home', 'Ulubari, Guwahati, Assam', 26.1755, 91.7580, 'home')
       RETURNING *`,
      [seededElderId]
    );
    homePlace = placeRes.rows[0];

    // Seed usual_places from saved_places
    await syncUsualPlaces(seededElderId);

    // Seed default lost_settings
    await getLostSettings(seededElderId);
  });

  // Proof 1: Ingestion & Accuracy Safety Filtering
  it('Proof 1: Accuracy >= 200m is flagged unreliable for safety and rejected from lost state evaluation', async () => {
    // Fix with accuracy = 250m
    const badSample = await ingestLocationSample({
      elderId: seededElderId,
      latitude: 26.1950,
      longitude: 91.7580,
      accuracy: 250,
      recordedAt: new Date(),
    });

    expect(badSample.unreliableForSafety).toBe(true);
    expect(badSample.evaluation).toBeNull();

    // Verify in database
    const dbSample = await query(
      `SELECT unreliable_for_safety FROM location_samples WHERE id = $1`,
      [badSample.sampleId]
    );
    expect(dbSample.rows[0].unreliable_for_safety).toBe(true);

    // Fix with accurate GPS (accuracy = 15m)
    const goodSample = await ingestLocationSample({
      elderId: seededElderId,
      latitude: 26.1756,
      longitude: 91.7581,
      accuracy: 15,
      recordedAt: new Date(),
    });

    expect(goodSample.unreliableForSafety).toBe(false);
    expect(goodSample.evaluation).toBeDefined();
  });

  // Proof 2: Distance Risk Score Calculation
  it('Proof 2: Distance risk score is 0 within 300m and rises linearly to 40 pts at twice threshold', async () => {
    // Home is at 26.1755, 91.7580, threshold = 1000m (2x threshold = 2000m)
    
    // Coords ~150m from home
    const closeCoords = {
      latitude: 26.1765,
      longitude: 91.7580,
    };
    const distClose = haversineDistanceM(26.1755, 91.7580, closeCoords.latitude, closeCoords.longitude);
    expect(distClose).toBeLessThanOrEqual(300);

    const closeScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: closeCoords.latitude,
      longitude: closeCoords.longitude,
      accuracy: 10,
      battery: 90,
      recordedAt: new Date('2026-10-19T11:00:00+05:30'), // Daytime
    });

    expect(closeScore.eligible).toBe(true);
    const distFactorClose = closeScore.reasons.find((r) => r.component === 'distance');
    expect(distFactorClose).toBeDefined();
    expect(distFactorClose.points).toBe(0);

    // Coords ~2000m from home (twice threshold)
    // 26.1935 is ~2000m north of 26.1755
    const farCoords = {
      latitude: 26.1935,
      longitude: 91.7580,
    };
    const distFar = haversineDistanceM(26.1755, 91.7580, farCoords.latitude, farCoords.longitude);
    expect(distFar).toBeGreaterThanOrEqual(1900);

    const farScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: farCoords.latitude,
      longitude: farCoords.longitude,
      accuracy: 10,
      battery: 90,
      recordedAt: new Date('2026-10-19T11:00:00+05:30'), // Daytime
    });

    const distFactorFar = farScore.reasons.find((r) => r.component === 'distance');
    expect(distFactorFar).toBeDefined();
    expect(distFactorFar.points).toBeGreaterThanOrEqual(38);
    expect(distFactorFar.points).toBeLessThanOrEqual(40);
  });

  // Proof 3: Night Rule (+15 points after 20:00 and >150m from usual places)
  it('Proof 3: Night rule adds +15 points during night hours away from safe places, 0 points when at home', async () => {
    // 23:00 IST at 500m away from home
    const nightFarScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1800,
      longitude: 91.7580,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date('2026-10-19T23:00:00+05:30'),
    });

    const nightFactor = nightFarScore.reasons.find((r) => r.component === 'night');
    expect(nightFactor).toBeDefined();
    expect(nightFactor.points).toBe(15);

    // 23:00 IST while safely at home (inside 150m)
    const nightHomeScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1755,
      longitude: 91.7580,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date('2026-10-19T23:00:00+05:30'),
    });

    const nightHomeFactor = nightHomeScore.reasons.find((r) => r.component === 'night');
    expect(nightHomeFactor).toBeUndefined(); // No night penalty when inside usual place buffer
  });

  // Proof 4: Unfamiliar Place (+20 points with >=7 days data baseline)
  it('Proof 4: Unfamiliar place gives +20 points when elder has >=7 days history, 0 pts if baseline learning', async () => {
    // Clear location samples for elder
    await query(`DELETE FROM location_samples WHERE elder_id = $1`, [seededElderId]);

    // Insert a sample from today (less than 7 days span)
    await query(
      `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, recorded_at)
       VALUES ($1, 26.1755, 91.7580, 10, NOW())`,
      [seededElderId]
    );

    const learningScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1850,
      longitude: 91.7580, // >1000m away
      accuracy: 10,
      battery: 80,
      recordedAt: new Date('2026-10-19T12:00:00+05:30'),
    });

    const learnFactor = learningScore.reasons.find((r) => r.component === 'unfamiliar_place');
    expect(learnFactor).toBeDefined();
    expect(learnFactor.points).toBe(0);
    expect(learnFactor.text).toContain('Still learning');

    // Now seed a sample from 10 days ago so daysOfData >= 7
    await query(
      `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, recorded_at)
       VALUES ($1, 26.1755, 91.7580, 10, NOW() - INTERVAL '10 days')`,
      [seededElderId]
    );

    const establishedScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1850,
      longitude: 91.7580, // >1000m away
      accuracy: 10,
      battery: 80,
      recordedAt: new Date(),
    });

    const estabFactor = establishedScore.reasons.find((r) => r.component === 'unfamiliar_place');
    expect(estabFactor).toBeDefined();
    expect(estabFactor.points).toBe(20);
  });

  // Proof 5: Wandering Pattern Detection (Circling and Moving Steadily Away)
  it('Proof 5: Detects wandering patterns: circling loop (+10 pts) and moving steadily away (+10 pts)', async () => {
    const now = Date.now();

    // 1. Circling test: 4 fixes within 400m radius walking a loop of ~350m with near-zero displacement
    // Points: (0,0) -> (100m N) -> (100m E) -> (back near 0,0)
    await query(`DELETE FROM location_samples WHERE elder_id = $1`, [seededElderId]);
    await query(
      `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, recorded_at)
       VALUES 
       ($1, 26.1755, 91.7580, 10, NOW() - INTERVAL '10 days'),
       ($1, 26.1800, 91.7580, 10, TO_TIMESTAMP(${Math.floor((now - 8 * 60 * 1000) / 1000)})),
       ($1, 26.1810, 91.7580, 10, TO_TIMESTAMP(${Math.floor((now - 6 * 60 * 1000) / 1000)})),
       ($1, 26.1810, 91.7590, 10, TO_TIMESTAMP(${Math.floor((now - 4 * 60 * 1000) / 1000)})),
       ($1, 26.1801, 91.7581, 10, TO_TIMESTAMP(${Math.floor((now - 1 * 60 * 1000) / 1000)}))`,
      [seededElderId]
    );

    const circlingScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1801,
      longitude: 91.7581,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date(now),
    });

    const circleFactor = circlingScore.reasons.find((r) => r.component === 'circling');
    expect(circleFactor).toBeDefined();
    expect(circleFactor.points).toBe(10);

    // 2. Moving steadily away test: consecutive samples increasing distance from home
    await query(`DELETE FROM location_samples WHERE elder_id = $1`, [seededElderId]);
    await query(
      `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, recorded_at)
       VALUES 
       ($1, 26.1755, 91.7580, 10, NOW() - INTERVAL '10 days'),
       ($1, 26.1780, 91.7580, 10, TO_TIMESTAMP(${Math.floor((now - 14 * 60 * 1000) / 1000)})),
       ($1, 26.1820, 91.7580, 10, TO_TIMESTAMP(${Math.floor((now - 8 * 60 * 1000) / 1000)})),
       ($1, 26.1860, 91.7580, 10, TO_TIMESTAMP(${Math.floor((now - 2 * 60 * 1000) / 1000)}))`,
      [seededElderId]
    );

    const movingAwayScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1890,
      longitude: 91.7580,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date(now),
    });

    const awayFactor = movingAwayScore.reasons.find((r) => r.component === 'moving_away');
    expect(awayFactor).toBeDefined();
    expect(awayFactor.points).toBe(10);
  });

  // Proof 6: Low Battery Risk
  it('Proof 6: Low battery (<15%) away from safe places adds +5 points', async () => {
    const lowBatScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1850,
      longitude: 91.7580,
      accuracy: 10,
      battery: 12, // < 15%
      recordedAt: new Date('2026-10-19T14:00:00+05:30'),
    });

    const batFactor = lowBatScore.reasons.find((r) => r.component === 'low_battery');
    expect(batFactor).toBeDefined();
    expect(batFactor.points).toBe(5);

    // High battery (75%)
    const highBatScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1850,
      longitude: 91.7580,
      accuracy: 10,
      battery: 75,
      recordedAt: new Date('2026-10-19T14:00:00+05:30'),
    });

    const noBatFactor = highBatScore.reasons.find((r) => r.component === 'low_battery');
    expect(noBatFactor).toBeUndefined();
  });

  // Proof 7: Suppression Logic ("I am fine" at same spot and EasyRide)
  it('Proof 7: "I am fine" at same spot suppresses risk score to 0 for 30 minutes', async () => {
    const spotLat = 26.1870;
    const spotLng = 91.7580;

    // Seed a check where elder responded "fine"
    await query(
      `INSERT INTO lost_checks (
         elder_id, rule, status, resolution, resolved_at, cooldown_until, fine_lat, fine_lng
       ) VALUES ($1, 'ai_risk_score', 'fine', 'fine', NOW(), NOW() + INTERVAL '30 minutes', $2, $3)`,
      [seededElderId, spotLat, spotLng]
    );

    // Elder is at the exact same spot (50m away)
    const suppressedScore = await computeLostRiskScore({
      elderId: seededElderId,
      latitude: 26.1873, // ~33m away
      longitude: 91.7580,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date(),
    });

    expect(suppressedScore.isSuppressed).toBe(true);
    expect(suppressedScore.riskScore).toBe(0);
    expect(suppressedScore.level).toBe(0);

    // Clean up check
    await query(`DELETE FROM lost_checks WHERE elder_id = $1`, [seededElderId]);
  });

  // Proof 8: 2-minute escalation from Level 1 prompt to Level 2/3 caregiver alert
  it('Proof 8: Level 1 prompt automatically escalates to Level 2/3 caregiver alert after 2 minutes', async () => {
    // Clean up previous checks
    await query(`DELETE FROM lost_checks WHERE elder_id = $1`, [seededElderId]);
    await query(`DELETE FROM caregiver_alerts WHERE elder_id = $1`, [seededElderId]);

    // Create a Level 1 active check
    const checkRes = await query(
      `INSERT INTO lost_checks (
         elder_id, rule, status, level, risk_score, nearest_place, distance_m, started_at
       ) VALUES ($1, 'ai_risk_score', 'active', 1, 55, 'Home', 1200, NOW() - INTERVAL '3 minutes')
       RETURNING id`,
      [seededElderId]
    );
    const checkId = checkRes.rows[0].id;

    // Evaluate state now that 3 minutes have passed without elder response
    const evalResult = await evaluateElderLostState(seededElderId, {
      latitude: 26.1850,
      longitude: 91.7580,
      accuracy: 10,
      battery: 80,
      recordedAt: new Date(),
    });

    expect(evalResult.actionTaken).toBe('escalated_to_family');

    // Verify DB update
    const dbCheck = await query(`SELECT status, level FROM lost_checks WHERE id = $1`, [checkId]);
    expect(dbCheck.rows[0].status).toBe('alerted');
    expect(dbCheck.rows[0].level).toBe(2);

    // Verify audit event
    const events = await query(`SELECT * FROM lost_check_events WHERE check_id = $1`, [checkId]);
    expect(events.rows.length).toBeGreaterThanOrEqual(1);

    // Verify caregiver alert was created
    const alerts = await query(
      `SELECT * FROM caregiver_alerts WHERE elder_id = $1 AND alert_type = 'lost_check'`,
      [seededElderId]
    );
    expect(alerts.rows.length).toBeGreaterThanOrEqual(1);
    expect(alerts.rows[0].message).toContain('Wandering Alert');
  });

  // Proof 9: 14-day Clustering Discovers Learned Usual Places
  it('Proof 9: Nightly clustering groups 14-day samples into candidate learned places', async () => {
    // Clear samples
    await query(`DELETE FROM location_samples WHERE elder_id = $1`, [seededElderId]);

    // Seed 25 fixes around Fancy Bazaar (26.1600, 91.7400) spanning 3 distinct days
    const baseLat = 26.1600;
    const baseLng = 91.7400;

    for (let day = 1; day <= 3; day++) {
      for (let i = 0; i < 8; i++) {
        await query(
          `INSERT INTO location_samples (elder_id, latitude, longitude, accuracy, recorded_at)
           VALUES ($1, $2, $3, 10, NOW() - INTERVAL '${day} days' - INTERVAL '${i * 10} minutes')`,
          [seededElderId, baseLat + (i * 0.0001), baseLng + (i * 0.0001)]
        );
      }
    }

    const clusterResult = await clusterLearnedUsualPlaces(seededElderId);
    expect(clusterResult.learnedCount).toBeGreaterThanOrEqual(1);

    // Verify learned place was inserted in usual_places table
    const learnedPlaces = await query(
      `SELECT * FROM usual_places WHERE elder_id = $1 AND origin = 'learned'`,
      [seededElderId]
    );
    expect(learnedPlaces.rows.length).toBeGreaterThanOrEqual(1);
    expect(learnedPlaces.rows[0].label).toContain('Learned Place');
  });

  // Proof 10: Caregiver Approves Learned Usual Place via API
  it('Proof 10: Caregiver approves learned usual place and updates origin to approved', async () => {
    // Find learned place from Proof 9
    const learnedRes = await query(
      `SELECT id FROM usual_places WHERE elder_id = $1 AND origin = 'learned' LIMIT 1`,
      [seededElderId]
    );
    expect(learnedRes.rows.length).toBe(1);
    const placeId = learnedRes.rows[0].id;

    // Caregiver approves it with custom label
    const approveRes = await request(app)
      .post(`/api/location/usual-places/${placeId}/approve`)
      .set('Cookie', sessionCookie)
      .send({
        label: 'Fancy Bazaar Market',
        radiusM: 200,
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.place.origin).toBe('approved');
    expect(approveRes.body.place.label).toBe('Fancy Bazaar Market');
    expect(approveRes.body.place.radius_m).toBe(200);

    // Verify in GET /api/location/elder/:elderId/live
    const liveRes = await request(app)
      .get(`/api/location/elder/${seededElderId}/live`)
      .set('Cookie', sessionCookie);

    expect(liveRes.status).toBe(200);
    const approvedPlace = liveRes.body.usualPlaces.find((p) => p.id === placeId);
    expect(approvedPlace).toBeDefined();
    expect(approvedPlace.origin).toBe('approved');
  });
});
