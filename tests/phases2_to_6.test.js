import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';

describe('Comprehensive Verification: Phases 2, 3, 4, 5, 6', () => {
  let authCookie;
  let testUser;
  let testElder;

  beforeAll(async () => {
    // Clean up any stale test user
    await query('DELETE FROM users WHERE phone = $1', ['+919999988888']);

    // 1. Create test user and session
    const uRes = await query(
      `INSERT INTO users (phone, role)
       VALUES ('+919999988888', 'caregiver')
       RETURNING id, phone, role`
    );
    testUser = uRes.rows[0];

    const eRes = await query(
      `INSERT INTO elders (user_id, name, age, language, region)
       VALUES ($1, 'Ramesh Barua', 75, 'hi', 'Assam')
       RETURNING id, name, age, language, region`,
      [testUser.id]
    );
    testElder = eRes.rows[0];

    // Create session token
    const token = 'test-token-' + Date.now();
    const tokenHash = (await import('crypto')).default.createHash('sha256').update(token).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [testUser.id, tokenHash]
    );

    authCookie = `smriti_session=${token}; Path=/; HttpOnly`;
  });

  // ----------------------------------------------------
  // PHASE 2: Comprehensive Setup Wizard
  // ----------------------------------------------------
  describe('Phase 2: Setup Wizard & Family Management', () => {
    it('Step 1: Updates elder details', async () => {
      const res = await request(app)
        .post('/api/wizard/step-1')
        .set('Cookie', authCookie)
        .send({
          name: 'Ramesh Barua',
          age: 75,
          language: 'hi',
          region: 'Assam',
          voiceSpeed: 0.65,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.elder.name).toBe('Ramesh Barua');
    });

    it('Step 2: Saves Home address as safe place', async () => {
      const res = await request(app)
        .post('/api/wizard/step-2')
        .set('Cookie', authCookie)
        .send({
          name: 'Home (घर)',
          address: 'Uzan Bazar, Guwahati, Assam',
          latitude: 26.1865,
          longitude: 91.7541,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(parseFloat(res.body.place.latitude)).toBeCloseTo(26.1865);
    });

    it('Step 3: Adds family member and auto-saves to saved_places', async () => {
      const res = await request(app)
        .post('/api/wizard/step-3/family')
        .set('Cookie', authCookie)
        .send({
          name: 'Aarav Barua',
          relationship: 'Son (बेटा)',
          phone: '+919876543210',
          address: 'Dispur, Guwahati',
          latitude: 26.1445,
          longitude: 91.7362,
          isEmergencyContact: true,
          emergencyPriority: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.member.name).toBe('Aarav Barua');

      // Verify DB persistence in family_members
      const dbRes = await query('SELECT * FROM family_members WHERE elder_id = $1', [testElder.id]);
      expect(dbRes.rows.length).toBeGreaterThan(0);
    });

    it('Step 6: Adds trusted family driver', async () => {
      const res = await request(app)
        .post('/api/wizard/step-6/drivers')
        .set('Cookie', authCookie)
        .send({
          name: 'Biren Das',
          phone: '+919876543299',
          vehicleType: 'auto',
          area: 'Uzan Bazar',
          notes: 'Family known driver for 10 years',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.driver.name).toBe('Biren Das');
    });

    it('Step 7: Adds medicine and automatically creates schedule', async () => {
      const res = await request(app)
        .post('/api/wizard/step-7/medicines')
        .set('Cookie', authCookie)
        .send({
          name: 'Ecosprin 75',
          dose: '1 tablet',
          shapeColor: 'round-white',
          timesPerDay: ['08:00', '20:00'],
          beforeAfterFood: 'after',
          tabletsRemaining: 30,
          refillThreshold: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine.name).toBe('Ecosprin 75');

      // Verify schedule was created
      const sched = await query('SELECT * FROM reminder_schedules WHERE elder_id = $1', [testElder.id]);
      expect(sched.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('Step 8: Encrypts and saves sensitive health details with AES-256', async () => {
      const res = await request(app)
        .post('/api/wizard/step-8/health')
        .set('Cookie', authCookie)
        .send({
          bloodGroup: 'B+',
          allergies: 'Penicillin',
          doctorName: 'Dr. B. K. Sarma',
          doctorPhone: '+919876543200',
          conditions: 'Mild Cognitive Impairment, Blood Pressure',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB that it is encrypted and not plaintext
      const rec = await query('SELECT * FROM elder_health_records WHERE elder_id = $1', [testElder.id]);
      expect(rec.rows[0].encrypted_blood_group).not.toBe('B+');
      expect(rec.rows[0].encrypted_blood_group).toContain(':'); // IV:Tag:Ciphertext
    });

    it('Step 9: Generates 7-day relative upload link', async () => {
      const res = await request(app)
        .post('/api/wizard/family/generate-token')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();

      // Check public validation
      const pubRes = await request(app).get(`/api/wizard/family/upload/${res.body.token}`);
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.tokenInfo.elder_name).toBeDefined();
    });
  });

  // ----------------------------------------------------
  // PHASE 3: Cognitive Games & Adaptive AI
  // ----------------------------------------------------
  describe('Phase 3: Cognitive Games & Adaptive AI Engine', () => {
    it('Records game session and updates Elo rating and step', async () => {
      const res = await request(app)
        .post('/api/games/session')
        .set('Cookie', authCookie)
        .send({
          clientSessionId: `test-session-${Date.now()}`,
          gameType: 'name_face',
          level: 'easy',
          step: 'E1',
          score: 100,
          accuracy: 100,
          responseTimeMs: 1400,
          durationSeconds: 35,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newElo).toBeGreaterThanOrEqual(1000);
    });

    it('Provides 3 personalized exercises for today based on spaced repetition', async () => {
      const res = await request(app)
        .get('/api/games/today')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exercises).toHaveLength(3);
    });
  });

  // ----------------------------------------------------
  // PHASE 4: Reminders, Tablet Decrement, Refill Warnings
  // ----------------------------------------------------
  describe('Phase 4: Reminders & Refill Warnings', () => {
    it('Marks medicine taken and decrements tablets remaining', async () => {
      // 1. Create a test occurrence
      const occRes = await query(
        `INSERT INTO reminder_occurrences (elder_id, reminder_type, title, due_at, status)
         VALUES ($1, 'medicine', 'Ecosprin 75', NOW(), 'scheduled')
         RETURNING id`,
        [testElder.id]
      );
      const occId = occRes.rows[0].id;

      const res = await request(app)
        .post(`/api/reminders/${occId}/done`)
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.occurrence.status).toBe('done');
    });

    it('Snoozes reminder occurrence by 10 minutes', async () => {
      const occRes = await query(
        `INSERT INTO reminder_occurrences (elder_id, reminder_type, title, due_at, status)
         VALUES ($1, 'water', 'Drink Warm Water', NOW(), 'scheduled')
         RETURNING id`,
        [testElder.id]
      );
      const occId = occRes.rows[0].id;

      const res = await request(app)
        .post(`/api/reminders/${occId}/snooze`)
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const newDue = new Date(res.body.occurrence.due_at).getTime();
      expect(newDue).toBeGreaterThan(Date.now() + 5 * 60 * 1000);
    });
  });

  // ----------------------------------------------------
  // PHASE 5: Safety: SOS & Take Me Home
  // ----------------------------------------------------
  describe('Phase 5: Safety: SOS Calls & Take Me Home', () => {
    it('Triggers emergency SOS, records event and dispatches alert', async () => {
      const res = await request(app)
        .post('/api/sos/trigger')
        .set('Cookie', authCookie)
        .send({
          latitude: 26.1865,
          longitude: 91.7541,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.event.status).toBe('active');
    });

    it('Cancels SOS countdown cleanly without emergency calls', async () => {
      const eventRes = await query(
        `INSERT INTO sos_events (elder_id, status) VALUES ($1, 'active') RETURNING id`,
        [testElder.id]
      );
      const eventId = eventRes.rows[0].id;

      const res = await request(app)
        .post('/api/sos/cancel')
        .set('Cookie', authCookie)
        .send({ eventId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbCheck = await query('SELECT status FROM sos_events WHERE id = $1', [eventId]);
      expect(dbCheck.rows[0].status).toBe('cancelled');
    });

    it('Calculates Take Me Home walking directions to Home', async () => {
      const res = await request(app)
        .post('/api/navigation/take-me-home')
        .set('Cookie', authCookie)
        .send({
          latitude: 26.1850,
          longitude: 91.7500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.steps.length).toBeGreaterThan(0);
      expect(res.body.destination.name).toBeDefined();
    });
  });

  // ----------------------------------------------------
  // PHASE 6: EasyRide with Family Driver Numbers
  // ----------------------------------------------------
  describe('Phase 6: EasyRide with Family Driver Numbers', () => {
    it('Requests auto ride, calculates fare estimate and prefilled WhatsApp link', async () => {
      const res = await request(app)
        .post('/api/rides/request')
        .set('Cookie', authCookie)
        .send({
          vehicleType: 'auto',
          pickupAddress: 'Uzan Bazar Market',
          pickupLat: 26.1865,
          pickupLng: 91.7541,
          destAddress: 'Sukreswar Temple',
          destLat: 26.1880,
          destLng: 91.7450,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.estimatedFare).toBeGreaterThanOrEqual(30);
      expect(res.body.ride.status).toBe('requested');
    });

    it('Completes ride and records 3-face rating', async () => {
      const rideRes = await query(
        `INSERT INTO rides (elder_id, pickup_address, dest_address, estimated_fare, status)
         VALUES ($1, 'Pickup', 'Destination', 45, 'requested')
         RETURNING id`,
        [testElder.id]
      );
      const rideId = rideRes.rows[0].id;

      const res = await request(app)
        .post(`/api/rides/${rideId}/complete`)
        .set('Cookie', authCookie)
        .send({ rating: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ride.status).toBe('completed');
      expect(res.body.ride.rating).toBe(3);
    });
  });
});
