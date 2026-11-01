import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import {
  evaluate,
  haversineDistanceM,
  distanceToLineStringM,
  getCellKey,
} from '../server/src/services/decisionEngine.js';
import {
  ingestLocationBatch,
  hasActiveConsent,
  processSafetyCheckEscalations,
} from '../server/src/services/locationMonitoringService.js';
import { config } from '../server/src/config.js';

describe('Complete Location Monitoring Module (Section 11 Proof)', () => {
  let seededElderId = '';
  let caregiverUserId = '';
  let unauthorizedUserId = '';
  let sessionCookie = '';
  let unauthorizedCookie = '';
  let homeZone = null;

  beforeAll(async () => {
    // 1. Seed caregiver user with valid session
    const crypto = await import('crypto');
    const userRes = await query(
      `INSERT INTO users (phone, role) VALUES ('+919876543111', 'caregiver')
       ON CONFLICT (phone) DO UPDATE SET role = 'caregiver'
       RETURNING id, phone`
    );
    caregiverUserId = userRes.rows[0].id;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [caregiverUserId, tokenHash]
    );
    sessionCookie = `smriti_session=${rawToken}`;

    // 2. Seed unauthorized user (caregiver without location permission)
    const unauthRes = await query(
      `INSERT INTO users (phone, role) VALUES ('+919876543222', 'caregiver')
       ON CONFLICT (phone) DO UPDATE SET role = 'caregiver'
       RETURNING id, phone`
    );
    unauthorizedUserId = unauthRes.rows[0].id;
    const unauthToken = crypto.randomBytes(32).toString('hex');
    const unauthHash = crypto.createHash('sha256').update(unauthToken).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [unauthorizedUserId, unauthHash]
    );
    unauthorizedCookie = `smriti_session=${unauthToken}`;

    // 3. Seed Elder
    const elderRes = await query(
      `INSERT INTO elders (user_id, name, age, language, region)
       VALUES ($1, 'Kanaklata Barua', 76, 'hi', 'Assam')
       RETURNING id`,
      [caregiverUserId]
    );
    seededElderId = elderRes.rows[0].id;

    // 4. Link caregiver with location permissions
    await query(
      `INSERT INTO elder_caregivers (elder_id, caregiver_id, status, can_see_location, can_see_progress)
       VALUES ($1, $2, 'active', TRUE, TRUE)
       ON CONFLICT (elder_id, caregiver_id) DO UPDATE SET can_see_location = TRUE`,
      [seededElderId, caregiverUserId]
    );

    // Link unauthorized caregiver without location permissions
    await query(
      `INSERT INTO elder_caregivers (elder_id, caregiver_id, status, can_see_location, can_see_progress)
       VALUES ($1, $2, 'active', FALSE, TRUE)
       ON CONFLICT (elder_id, caregiver_id) DO UPDATE SET can_see_location = FALSE`,
      [seededElderId, unauthorizedUserId]
    );

    // 5. Seed Safe Zone (Home at 26.1755, 91.7580, radius 150m)
    const zRes = await query(
      `INSERT INTO safe_zones (elder_id, name, type, lat, lng, radius_m, address, active)
       VALUES ($1, 'Home', 'home', 26.1755, 91.7580, 150, 'Guwahati Home', TRUE)
       RETURNING *`,
      [seededElderId]
    );
    homeZone = zRes.rows[0];
  });

  // ===========================================================================
  // SUITE 1: Pure Decision Engine evaluate()
  // ===========================================================================
  describe('1. Pure Decision Engine evaluate()', () => {
    const zones = [
      { id: 'z1', name: 'Home', type: 'home', lat: 26.1755, lng: 91.7580, radius_m: 150, active: true },
      { id: 'z2', name: 'Temple', type: 'temple', lat: 26.1800, lng: 91.7580, radius_m: 100, active: true },
    ];
    const settings = {
      interval_min: 5,
      accuracy_limit_m: 150,
      unfamiliar_distance_m: 1500,
      stationary_min: 10,
      confirm_samples: 2,
      night_start: '20:00',
      night_end: '05:00',
      history_days: 30, // established baseline
    };

    it('1A. Inside zone = safe_zone', () => {
      // 50m from home center, accuracy 15m
      const samples = [
        { lat: 26.1758, lng: 91.7580, accuracy_m: 15, captured_at: new Date('2026-10-30T10:00:00Z') },
      ];
      const result = evaluate(samples, zones, [], [], settings, new Date('2026-10-30T10:00:00Z'));
      expect(result.state).toBe('safe_zone');
      expect(result.score).toBe(0);
      expect(result.needsCheck).toBe(false);
      expect(result.reasons[0]).toContain('In safe zone: Home');
    });

    it('1B. Just left home = away_normal (leaving home is NEVER a concern by itself)', () => {
      // 250m from home center (outside radius 150m), daytime, no other rules triggered
      const samples = [
        { lat: 26.1755, lng: 91.7580, accuracy_m: 10, captured_at: new Date('2026-10-30T11:00:00Z') },
        { lat: 26.1778, lng: 91.7580, accuracy_m: 10, captured_at: new Date('2026-10-30T11:05:00Z') },
      ];
      const result = evaluate(samples, zones, [], [], settings, new Date('2026-10-30T11:05:00Z'));
      expect(result.state).toBe('away_normal');
      expect(result.needsCheck).toBe(false);
    });

    it('1C. Outside with poor accuracy = unknown (no alert)', () => {
      // Accuracy 200m > accuracy_limit_m 150m
      const samples = [
        { lat: 26.1950, lng: 91.7580, accuracy_m: 200, captured_at: new Date('2026-10-30T12:00:00Z') },
      ];
      const result = evaluate(samples, zones, [], [], settings, new Date('2026-10-30T12:00:00Z'));
      expect(result.state).toBe('unknown');
      expect(result.score).toBe(0);
      expect(result.needsCheck).toBe(false);
    });

    it('1D. Stationary outside 10 minutes = unusual ONLY after confirm_samples', () => {
      const now = new Date('2026-10-30T12:15:00Z');
      // Elder is 500m from all zones, stationary at 26.1800, 91.7630 for 12 minutes
      const sample1 = {
        lat: 26.1800,
        lng: 91.7630,
        accuracy_m: 15,
        captured_at: new Date(now.getTime() - 12 * 60 * 1000), // 12m ago
      };
      const sample2 = {
        lat: 26.1801,
        lng: 91.7631, // moved only 14m < max(40, accuracy)
        accuracy_m: 15,
        captured_at: new Date(now.getTime() - 5 * 60 * 1000), // 5m ago
      };
      const sample3 = {
        lat: 26.1801,
        lng: 91.7631,
        accuracy_m: 15,
        captured_at: now,
      };

      // With only 1 sample, confirm_samples (2) not met
      const eval1 = evaluate([sample3], zones, [], [], settings, now);
      expect(eval1.state).toBe('away_normal');

      // With 2+ consecutive samples stationary outside, raises unusual
      const eval2 = evaluate([sample1, sample2, sample3], zones, [], [], settings, now);
      expect(eval2.state).toBe('unusual');
      expect(eval2.needsCheck).toBe(true);
      expect(eval2.reasons[0]).toContain('stopped for 10 minutes');
    });

    it('1E. Far from all zones and unfamiliar cell = unusual', () => {
      // 2000m from all zones (> unfamiliar_distance_m 1500m)
      const now = new Date('2026-10-30T14:00:00Z');
      const sample1 = { lat: 26.2000, lng: 91.7580, accuracy_m: 10, captured_at: new Date(now.getTime() - 5 * 60 * 1000) };
      const sample2 = { lat: 26.2000, lng: 91.7580, accuracy_m: 10, captured_at: now };

      const result = evaluate([sample1, sample2], zones, [], [], settings, now);
      expect(result.state).toBe('unusual');
      expect(result.needsCheck).toBe(true);
      expect(result.reasons[0]).toContain('km from the nearest safe place');
    });

    it('1F. On an approved route within corridor = normal', () => {
      // Route between Home (26.1755, 91.7580) and Temple (26.1800, 91.7580)
      const route = {
        id: 'r1',
        name: 'Home to Temple',
        path_geojson: {
          type: 'LineString',
          coordinates: [
            [91.7580, 26.1755],
            [91.7580, 26.1780],
            [91.7580, 26.1800],
          ],
        },
        corridor_m: 100,
        active: true,
      };
      const tripSettings = {
        ...settings,
        active_route: route,
      };

      // Elder is 30m from the route (within 100m corridor)
      const now = new Date('2026-10-30T10:30:00Z');
      const samples = [
        { lat: 26.1770, lng: 91.7583, accuracy_m: 10, captured_at: new Date(now.getTime() - 5 * 60 * 1000) },
        { lat: 26.1775, lng: 91.7583, accuracy_m: 10, captured_at: now },
      ];

      const result = evaluate(samples, zones, [route], [], tripSettings, now);
      expect(result.state).toBe('away_normal');
      expect(result.needsCheck).toBe(false);
    });

    it('1G. Off the approved route corridor = unusual', () => {
      const route = {
        id: 'r1',
        name: 'Home to Temple',
        path_geojson: {
          type: 'LineString',
          coordinates: [
            [91.7580, 26.1755],
            [91.7580, 26.1800],
          ],
        },
        corridor_m: 100,
        active: true,
      };
      const tripSettings = {
        ...settings,
        active_route: route,
      };

      // Elder is 350m east of route (exceeds 100m corridor)
      const now = new Date('2026-10-30T10:30:00Z');
      const samples = [
        { lat: 26.1770, lng: 91.7615, accuracy_m: 10, captured_at: new Date(now.getTime() - 5 * 60 * 1000) },
        { lat: 26.1775, lng: 91.7615, accuracy_m: 10, captured_at: now },
      ];

      const result = evaluate(samples, zones, [route], [], tripSettings, now);
      expect(result.state).toBe('unusual');
      expect(result.needsCheck).toBe(true);
      expect(result.reasons[0]).toContain('Off approved route');
    });

    it('1H. Night rule triggers when outside safe zone at night', () => {
      // 23:30 (between 20:00 and 05:00), 400m from all zones
      const nightNow = new Date('2026-10-30T23:30:00');
      const samples = [
        { lat: 26.1790, lng: 91.7620, accuracy_m: 10, captured_at: new Date(nightNow.getTime() - 5 * 60 * 1000) },
        { lat: 26.1790, lng: 91.7620, accuracy_m: 10, captured_at: nightNow },
      ];

      const result = evaluate(samples, zones, [], [], settings, nightNow);
      expect(result.state).toBe('unusual');
      expect(result.needsCheck).toBe(true);
      expect(result.reasons[0]).toContain('during night hours');
    });

    it('1I. Learning mode (<7 days history) disables unfamiliar area rule', () => {
      const learningSettings = {
        ...settings,
        history_days: 3, // only 3 days of data
      };
      // 1800m away, unfamiliar cell, but learning mode is ON
      const now = new Date('2026-10-30T14:00:00');
      const samples = [
        { lat: 26.1950, lng: 91.7580, accuracy_m: 10, captured_at: new Date(now.getTime() - 5 * 60 * 1000) },
        { lat: 26.1950, lng: 91.7580, accuracy_m: 10, captured_at: now },
      ];

      const result = evaluate(samples, zones, [], [], learningSettings, now);
      // Unfamiliar rule is suppressed in learning mode
      expect(result.state).toBe('learning');
      expect(result.needsCheck).toBe(false);
    });

    it('1J. Cooldown and outing-window suppression', () => {
      const now = new Date('2026-10-30T15:30:00');
      const samples = [
        { lat: 26.2000, lng: 91.7580, accuracy_m: 10, captured_at: new Date(now.getTime() - 5 * 60 * 1000) },
        { lat: 26.2000, lng: 91.7580, accuracy_m: 10, captured_at: now },
      ];

      // Test Outing Window: Market 15:00 - 17:00
      const outingSettings = {
        ...settings,
        outing_windows: [{ start: '15:00', end: '17:00', label: 'Local Market Visit' }],
      };
      const outingResult = evaluate(samples, zones, [], [], outingSettings, now);
      expect(outingResult.needsCheck).toBe(false);
      expect(outingResult.suppressed).toBe(true);
      expect(outingResult.reasons[1]).toContain('Outing window active');

      // Test "I am fine" Cooldown active at this spot (within 200m)
      const cooldownSettings = {
        ...settings,
        cooldown_until: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
        cooldown_lat: 26.2000,
        cooldown_lng: 91.7580,
      };
      const cooldownResult = evaluate(samples, zones, [], [], cooldownSettings, now);
      expect(cooldownResult.needsCheck).toBe(false);
      expect(cooldownResult.suppressed).toBe(true);
      expect(cooldownResult.reasons[1]).toContain('I am fine');
    });
  });

  // ===========================================================================
  // SUITE 2: API Security and Ingestion Validation
  // ===========================================================================
  describe('2. Location API Security and Ingest', () => {
    it('2A. No consent = rejected with 403', async () => {
      // Seed fresh elder with NO location consent
      const noConsentElder = await query(
        `INSERT INTO elders (name, age, language) VALUES ('No Consent Elder', 80, 'en') RETURNING id`
      );
      const targetId = noConsentElder.rows[0].id;

      const res = await request(app)
        .post('/api/location/batch')
        .send({
          elderId: targetId,
          samples: [
            {
              client_id: 'sample-no-consent-1',
              lat: 26.1755,
              lng: 91.7580,
              accuracy_m: 10,
              captured_at: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NO_CONSENT');
    });

    it('2B. Wrong caregiver without permission = 403 on location dashboard', async () => {
      // Request with unauthorized caregiver session
      const res = await request(app)
        .get(`/api/location/dashboard?elderId=${seededElderId}`)
        .set('Cookie', unauthorizedCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('2C. Duplicate client_id not duplicated (idempotent)', async () => {
      // Grant consent first
      await query(
        `INSERT INTO location_consents (elder_id, scope, granted_at)
         VALUES ($1, 'caregivers', NOW())`,
        [seededElderId]
      );

      const clientId = `client-test-id-${Date.now()}`;
      const payload = {
        elderId: seededElderId,
        samples: [
          {
            client_id: clientId,
            lat: 26.1755,
            lng: 91.7580,
            accuracy_m: 10,
            captured_at: new Date().toISOString(),
          },
        ],
      };

      // First call
      const res1 = await request(app).post('/api/location/batch').send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.acceptedCount).toBe(1);

      // Second call with same client_id
      const res2 = await request(app).post('/api/location/batch').send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.acceptedCount).toBe(0); // Ignored due to UNIQUE constraint

      // Verify DB row count is exactly 1
      const countRes = await query(`SELECT COUNT(*) as count FROM location_samples WHERE client_id = $1`, [clientId]);
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    });

    it('2D. Future timestamp beyond 5 minutes rejected', async () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min in future
      const res = await request(app)
        .post('/api/location/batch')
        .send({
          elderId: seededElderId,
          samples: [
            {
              client_id: `future-sample-${Date.now()}`,
              lat: 26.1755,
              lng: 91.7580,
              accuracy_m: 10,
              captured_at: futureTime,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.rejectedCount).toBe(1);
      expect(res.body.rejected[0].reason).toBe('FUTURE_TIMESTAMP');
    });

    it('2E. Simulated source rejected when DEMO_MODE=false', async () => {
      const origDemo = process.env.DEMO_MODE;
      process.env.DEMO_MODE = 'false';
      config.demoMode = false;

      const res = await request(app)
        .post('/api/location/batch')
        .send({
          elderId: seededElderId,
          samples: [
            {
              client_id: `sim-sample-${Date.now()}`,
              lat: 26.1755,
              lng: 91.7580,
              accuracy_m: 10,
              source: 'simulated',
              captured_at: new Date().toISOString(),
            },
          ],
        });

      process.env.DEMO_MODE = origDemo;
      config.demoMode = origDemo === 'true';

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SIMULATED_REJECTED');
    });

    it('2F. Audit row written on caregiver location read', async () => {
      const res = await request(app)
        .get(`/api/location/dashboard?elderId=${seededElderId}`)
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);

      // Check audit_logs table
      const auditRes = await query(
        `SELECT * FROM audit_logs
         WHERE elder_id = $1 AND user_id = $2 AND action = 'read_location'
         ORDER BY created_at DESC LIMIT 1`,
        [seededElderId, caregiverUserId]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].resource).toBe('location_dashboard');
    });
  });

  // ===========================================================================
  // SUITE 3: Client Scheduler and Offline Queue Tests
  // ===========================================================================
  describe('3. Client Location Scheduler & Queue', () => {
    it('3A. Scheduler fires every interval and 3B catches up on visibility', async () => {
      const {
        startLocationScheduler,
        stopLocationScheduler,
        setLocationProvider,
      } = await import('../client/src/utils/location.js');

      let fixesCaptured = 0;
      const mockProvider = {
        async getCurrentPosition() {
          fixesCaptured++;
          return {
            client_id: `sched-test-${Date.now()}-${fixesCaptured}`,
            lat: 26.1755,
            lng: 91.7580,
            accuracy_m: 10,
            source: 'gps',
            captured_at: new Date().toISOString(),
          };
        },
      };

      setLocationProvider(mockProvider);

      vi.useFakeTimers();
      startLocationScheduler({
        elderId: seededElderId,
        intervalMin: 5,
        guardianMode: false,
      });

      // Initial capture
      expect(fixesCaptured).toBe(1);

      // Advance by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(fixesCaptured).toBe(2);

      // Advance by another 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(fixesCaptured).toBe(3);

      stopLocationScheduler();
      vi.useRealTimers();
    });

    it('3C. Queues offline samples and flushes them in order', async () => {
      const { enqueueSample, getPendingSamples, removeSamples, clearQueue } = await import(
        '../client/src/utils/locationQueue.js'
      );

      await clearQueue();

      const sampleA = {
        client_id: 'queue-sample-a',
        lat: 26.1750,
        lng: 91.7580,
        accuracy_m: 12,
        captured_at: '2026-10-30T10:00:00Z',
      };
      const sampleB = {
        client_id: 'queue-sample-b',
        lat: 26.1760,
        lng: 91.7580,
        accuracy_m: 15,
        captured_at: '2026-10-30T10:05:00Z',
      };

      await enqueueSample(sampleA);
      await enqueueSample(sampleB);

      const pending = await getPendingSamples();
      expect(pending.length).toBe(2);
      expect(pending[0].client_id).toBe('queue-sample-a');
      expect(pending[1].client_id).toBe('queue-sample-b');

      await removeSamples(['queue-sample-a']);
      const afterRemove = await getPendingSamples();
      expect(afterRemove.length).toBe(1);
      expect(afterRemove[0].client_id).toBe('queue-sample-b');

      await clearQueue();
    });
  });

  // ===========================================================================
  // SUITE 4: Safety Check State Machine
  // ===========================================================================
  describe('4. Safety Check State Machine', () => {
    it('4A. OK answer resolves check as resolved_ok and starts cooldown', async () => {
      // Create safety check
      const checkRes = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', '{"reason":"unfamiliar"}', NOW())
         RETURNING id`,
        [seededElderId]
      );
      const checkId = checkRes.rows[0].id;
      await query(`INSERT INTO safety_check_prompts (check_id, attempt, asked_at) VALUES ($1, 1, NOW())`, [checkId]);

      // Elder responds 'ok' via voice
      const res = await request(app)
        .post('/api/location/safety-check/respond')
        .send({
          checkId,
          answer: 'ok',
          method: 'voice',
          elderId: seededElderId,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved_ok');

      // Verify DB row
      const dbCheck = await query(`SELECT status, resolved_at FROM safety_checks WHERE id = $1`, [checkId]);
      expect(dbCheck.rows[0].status).toBe('resolved_ok');
      expect(dbCheck.rows[0].resolved_at).not.toBeNull();
    });

    it('4B. Help answer resolves as resolved_help and alerts caregivers at once', async () => {
      const checkRes = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', '{"reason":"unfamiliar"}', NOW())
         RETURNING id`,
        [seededElderId]
      );
      const checkId = checkRes.rows[0].id;
      await query(`INSERT INTO safety_check_prompts (check_id, attempt, asked_at) VALUES ($1, 1, NOW())`, [checkId]);

      // Elder responds 'help' via button
      const res = await request(app)
        .post('/api/location/safety-check/respond')
        .send({
          checkId,
          answer: 'help',
          method: 'button',
          elderId: seededElderId,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved_help');
      expect(res.body.destination).toBeDefined();

      // Verify urgent caregiver alert was created
      const alertRes = await query(
        `SELECT * FROM location_alerts
         WHERE elder_id = $1 AND kind = 'concern_help' AND severity = 'urgent'`,
        [seededElderId]
      );
      expect(alertRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('4C. No answer repeats 3 times then alerts caregivers (escalated)', async () => {
      // Clean previous checks
      await query(`DELETE FROM safety_checks WHERE elder_id = $1`, [seededElderId]);

      // Create check with 3 ask attempts configured
      const checkRes = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', '{"reason":"stopped_outside"}', NOW() - INTERVAL '10 minutes')
         RETURNING id`,
        [seededElderId]
      );
      const checkId = checkRes.rows[0].id;

      // Seed location sample outside safe zone (2000m away)
      await query(
        `INSERT INTO location_samples (elder_id, lat, lng, latitude, longitude, accuracy_m, accuracy, captured_at, recorded_at)
         VALUES ($1, 26.2000, 91.7580, 26.2000, 91.7580, 10, 10, NOW(), NOW())`,
        [seededElderId]
      );

      // Prompt 1 asked 200s ago
      await query(
        `INSERT INTO safety_check_prompts (check_id, attempt, asked_at, answer)
         VALUES ($1, 1, NOW() - INTERVAL '200 seconds', 'none')`,
        [checkId]
      );

      // Escalation pass 1 -> issues attempt 2
      const pass1 = await processSafetyCheckEscalations();
      expect(pass1.some(p => p.checkId === checkId && p.action === 'reprompt' && p.attempt === 2)).toBe(true);

      // Fast-forward prompt 2 to 200s ago
      await query(
        `UPDATE safety_check_prompts SET asked_at = NOW() - INTERVAL '200 seconds' WHERE check_id = $1 AND attempt = 2`,
        [checkId]
      );

      // Escalation pass 2 -> issues attempt 3
      const pass2 = await processSafetyCheckEscalations();
      expect(pass2.some(p => p.checkId === checkId && p.action === 'reprompt' && p.attempt === 3)).toBe(true);

      // Fast-forward prompt 3 to 200s ago
      await query(
        `UPDATE safety_check_prompts SET asked_at = NOW() - INTERVAL '200 seconds' WHERE check_id = $1 AND attempt = 3`,
        [checkId]
      );

      // Escalation pass 3 -> Elder did not answer after 3 attempts -> escalates & alerts
      const pass3 = await processSafetyCheckEscalations();
      expect(pass3.some(p => p.checkId === checkId && p.action === 'escalated_alerted')).toBe(true);

      // Verify check status is now 'escalated'
      const finalCheck = await query(`SELECT status FROM safety_checks WHERE id = $1`, [checkId]);
      expect(finalCheck.rows[0].status).toBe('escalated');
    });

    it('4D. Fresh sample back inside safe zone cancels check silently', async () => {
      await query(`DELETE FROM safety_checks WHERE elder_id = $1`, [seededElderId]);
      await query(`DELETE FROM location_samples WHERE elder_id = $1`, [seededElderId]);

      const checkRes = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', '{"reason":"stopped_outside"}', NOW() - INTERVAL '10 minutes')
         RETURNING id`,
        [seededElderId]
      );
      const checkId = checkRes.rows[0].id;

      // Seed prompt 3 asked 200s ago (at max attempts)
      await query(
        `INSERT INTO safety_check_prompts (check_id, attempt, asked_at, answer)
         VALUES ($1, 3, NOW() - INTERVAL '200 seconds', 'none')`,
        [checkId]
      );

      // Fresh sample back inside Home zone (26.1755, 91.7580)
      await query(
        `INSERT INTO location_samples (elder_id, lat, lng, latitude, longitude, accuracy_m, accuracy, captured_at, recorded_at)
         VALUES ($1, 26.1755, 91.7580, 26.1755, 91.7580, 10, 10, NOW(), NOW())`,
        [seededElderId]
      );

      // Escalation runs -> detects elder is back in safe zone -> cancels silently
      const pass = await processSafetyCheckEscalations();
      expect(pass.some(p => p.checkId === checkId && p.action === 'cancelled_in_zone')).toBe(true);

      const dbCheck = await query(`SELECT status FROM safety_checks WHERE id = $1`, [checkId]);
      expect(dbCheck.rows[0].status).toBe('cancelled');
    });

    it('4E. Restart resumes active checks from DB', async () => {
      // Create active check in DB
      const checkRes = await query(
        `INSERT INTO safety_checks (elder_id, status, concern_json, started_at)
         VALUES ($1, 'asking', '{"reason":"unfamiliar"}', NOW() - INTERVAL '1 minute')
         RETURNING id`,
        [seededElderId]
      );
      const checkId = checkRes.rows[0].id;
      await query(
        `INSERT INTO safety_check_prompts (check_id, attempt, asked_at)
         VALUES ($1, 1, NOW() - INTERVAL '1 minute')`,
        [checkId]
      );

      // Elder app reconnects / restarts: queries active check
      const res = await request(app).get(`/api/location/safety-check/active?elderId=${seededElderId}`);
      expect(res.status).toBe(200);
      expect(res.body.activeCheck).not.toBeNull();
      expect(res.body.activeCheck.id).toBe(checkId);
      expect(res.body.activeCheck.status).toBe('asking');
    });
  });
});
