import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import { containsBannedWords, computeElderStats, buildTemplateDraft, polishDraftWithGemini } from '../server/src/services/aiReport.js';
import { haversineDistanceM, ingestLocationFix, evaluateElderLocation, processLostCheckEscalations } from '../server/src/services/locationAI.js';
import { executeCronTick } from '../server/src/cron.js';

describe('Backend Features A & B: AI Reports and Server Location AI', () => {
  let seededElderId = '';
  let caregiverUserId = '';
  let sessionCookie = '';
  let generatedDraftId = '';
  let deliveryAccessToken = '';

  beforeAll(async () => {
    // 1. Seed test user & elder
    const userRes = await query(
      `INSERT INTO users (phone, role) VALUES ('+919876543201', 'caregiver')
       ON CONFLICT (phone) DO UPDATE SET role = 'caregiver'
       RETURNING id, phone`
    );
    caregiverUserId = userRes.rows[0].id;

    // Create session
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [caregiverUserId, tokenHash]
    );
    sessionCookie = `smriti_session=${rawToken}`;

    const elderRes = await query(
      `INSERT INTO elders (user_id, name, age, language, region)
       VALUES ($1, 'Aita', 76, 'hi', 'Assam')
       RETURNING id`,
      [caregiverUserId]
    );
    seededElderId = elderRes.rows[0].id;

    // Grant location and progress consent
    await query(
      `INSERT INTO elder_consent (elder_id, share_location, share_health, share_progress)
       VALUES ($1, TRUE, TRUE, TRUE)
       ON CONFLICT (elder_id) DO UPDATE SET share_location = TRUE, share_progress = TRUE`,
      [seededElderId]
    );

    // Link caregiver
    await query(
      `INSERT INTO elder_caregivers (elder_id, caregiver_id, status, can_see_location, can_see_progress)
       VALUES ($1, $2, 'active', TRUE, TRUE)
       ON CONFLICT (elder_id, caregiver_id) DO UPDATE SET can_see_location = TRUE, can_see_progress = TRUE`,
      [seededElderId, caregiverUserId]
    );

    // Seed saved places: Home (Guwahati)
    await query(
      `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type)
       VALUES ($1, 'Home', 'Ulubari, Guwahati, Assam', 26.1755, 91.7580, 'home')`,
      [seededElderId]
    );

    // Seed cognitive game sessions
    await query(
      `INSERT INTO game_sessions (elder_id, game_type, level, step, score, accuracy, duration_seconds)
       VALUES 
       ($1, 'picture_match', 'easy', 'E1', 90, 85, 120),
       ($1, 'whose_voice', 'easy', 'E2', 100, 100, 95),
       ($1, 'name_face', 'medium', 'M1', 80, 75, 140)`,
      [seededElderId]
    );

    // Seed medicines, schedules and occurrences
    const medRes = await query(
      `INSERT INTO medicines (elder_id, name, dose, times_per_day)
       VALUES ($1, 'Amlodipine', '5mg', '["08:00"]')
       RETURNING id`,
      [seededElderId]
    );

    const schedRes = await query(
      `INSERT INTO reminder_schedules (elder_id, reminder_type, title, time_of_day)
       VALUES ($1, 'medicine', 'Amlodipine 5mg', '08:00')
       RETURNING id`,
      [seededElderId]
    );
    const schedId = schedRes.rows[0].id;

    await query(
      `INSERT INTO reminder_occurrences (schedule_id, elder_id, reminder_type, title, due_at, status)
       VALUES 
       ($2, $1, 'medicine', 'Amlodipine 5mg', NOW() - INTERVAL '1 day', 'done'),
       ($2, $1, 'medicine', 'Amlodipine 5mg', NOW() - INTERVAL '2 days', 'done'),
       ($2, $1, 'medicine', 'Amlodipine 5mg', NOW() - INTERVAL '3 days', 'missed')`,
      [seededElderId, schedId]
    );
  });

  // Proof 1: AI report draft generation, DB stats, LLM polish, banned word rejection
  it('Proof 1: Computes real DB stats, enforces banned diagnostic words, and drafts report', async () => {
    // Test Banned Words filter unit test
    expect(containsBannedWords('Patient has severe dementia stage 2.')).toBe(true);
    expect(containsBannedWords('Possible Alzheimer diagnosis confirmed.')).toBe(true);
    expect(containsBannedWords('रोगी को अल्जाइमर रोग का निदान हुआ है।')).toBe(true);
    expect(containsBannedWords('Wonderful memory practice completed with 85% accuracy.')).toBe(false);

    // Compute stats from DB
    const stats = await computeElderStats(seededElderId, 7);
    expect(stats.totalSessions).toBeGreaterThanOrEqual(3);
    expect(stats.medicines.confirmed).toBeGreaterThanOrEqual(2);
    expect(stats.medicines.missed).toBeGreaterThanOrEqual(1);

    // Create report draft via API
    const res = await request(app)
      .post('/api/reports/draft')
      .set('Cookie', sessionCookie)
      .send({ elderId: seededElderId, periodDays: 7 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.draft).toBeDefined();
    expect(res.body.draft.summary_text).toBeDefined();
    expect(res.body.draft.summary_text.length).toBeGreaterThan(20);

    generatedDraftId = res.body.draft.id;

    // Verify draft was saved in DB
    const dbDraft = await query(`SELECT * FROM report_drafts WHERE id = $1`, [generatedDraftId]);
    expect(dbDraft.rows.length).toBe(1);
    expect(dbDraft.rows[0].pdf).toBeDefined();
  }, 25000);

  // Proof 2: Edit draft, send it, verify report_deliveries and public 7-day token link
  it('Proof 2: Edit draft, send it, verify deliveries and 7-day token access', async () => {
    // Edit draft text
    const editedText = 'Aita had a very encouraging week with regular family memory practice.';
    const editRes = await request(app)
      .patch(`/api/reports/drafts/${generatedDraftId}`)
      .set('Cookie', sessionCookie)
      .send({ summaryText: editedText });

    expect(editRes.status).toBe(200);
    expect(editRes.body.draft.summary_text).toBe(editedText);

    // Send report
    const sendRes = await request(app)
      .post(`/api/reports/drafts/${generatedDraftId}/send`)
      .set('Cookie', sessionCookie);

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.deliveries).toBeDefined();

    // Check report_deliveries rows in database
    const delivRows = await query(
      `SELECT * FROM report_deliveries WHERE draft_id = $1`,
      [generatedDraftId]
    );
    expect(delivRows.rows.length).toBeGreaterThanOrEqual(1);
    expect(delivRows.rows[0].access_token_hash).toBeDefined();

    // Verify WhatsApp ready link was generated
    const waDelivery = sendRes.body.deliveries.find(d => d.channel === 'whatsapp');
    expect(waDelivery).toBeDefined();
    expect(waDelivery.waLink).toContain('wa.me');

    // Extract raw token from waLink to test public access without login
    const match = waDelivery.publicReportUrl.match(/\/public\/([a-f0-9]+)/);
    expect(match).toBeDefined();
    deliveryAccessToken = match[1];

    // Open public token link without auth headers/cookies
    const publicRes = await request(app).get(`/api/reports/public/${deliveryAccessToken}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.headers['content-type']).toBe('application/pdf');

    // Verify audit log has recorded the view
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE elder_id = $1 AND action = 'VIEW_PUBLIC_REPORT'`,
      [seededElderId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
  });

  // Proof 3: Auto-send schedule with cron tick
  it('Proof 3: Auto-send schedule executes and prevents double-send via DB lock', async () => {
    // Enable weekly Sunday 18:00 report
    await query(
      `INSERT INTO elder_report_settings (elder_id, send_weekly_sunday_1800, last_report_job_at)
       VALUES ($1, TRUE, NOW() - INTERVAL '7 days')
       ON CONFLICT (elder_id) DO UPDATE SET send_weekly_sunday_1800 = TRUE, last_report_job_at = NOW() - INTERVAL '7 days'`,
      [seededElderId]
    );

    // Trigger cron tick
    const tickRes = await request(app).get('/api/cron/tick');
    expect(tickRes.status).toBe(200);
    expect(tickRes.body.success).toBe(true);

    // Verify last_report_job_at was updated to NOW()
    const settingsCheck = await query(
      `SELECT last_report_job_at FROM elder_report_settings WHERE elder_id = $1`,
      [seededElderId]
    );
    expect(new Date(settingsCheck.rows[0].last_report_job_at).getTime()).toBeGreaterThan(Date.now() - 30000);

    // Trigger tick again immediately - should NOT send twice
    const secondTick = await request(app).get('/api/cron/tick');
    expect(secondTick.body.result.reports.length).toBe(0);
  }, 25000);

  // Proof 4: Location Ingestion & Safety Rejection
  it('Proof 4: Ingests valid fixes and rejects impossible jumps / high accuracy', async () => {
    // Ingest good fix near Home
    const goodFix = await ingestLocationFix({
      elderId: seededElderId,
      latitude: 26.1755,
      longitude: 91.7580,
      accuracy: 15,
      recordedAt: new Date(Date.now() - 120000),
    });
    expect(goodFix.unreliableForSafety).toBe(false);

    // Ingest bad fix with 250m accuracy -> should be flagged unreliable for safety
    const inaccurateFix = await ingestLocationFix({
      elderId: seededElderId,
      latitude: 26.1760,
      longitude: 91.7590,
      accuracy: 250,
      recordedAt: new Date(Date.now() - 60000),
    });
    expect(inaccurateFix.unreliableForSafety).toBe(true);
  });

  // Proof 5: Simulated 2km distance triggers check-in, and 2-min timeout triggers caregiver alerts
  it('Proof 5: 2 fixes 2km from saved place triggers check-in, and 2-min timeout alerts caregivers', async () => {
    // Clear any active cooldowns or checks and previous fixes
    await query(`DELETE FROM locations WHERE elder_id = $1`, [seededElderId]);
    await query(`DELETE FROM lost_checks WHERE elder_id = $1`, [seededElderId]);

    // Home is at 26.1755, 91.7580. Post fixes ~2.5km away (26.1980, 91.7580)
    const simRes = await request(app)
      .post('/api/location/simulate')
      .send({
        elderId: seededElderId,
        latitude: 26.1980,
        longitude: 91.7580,
        accuracy: 15,
        count: 2,
        delaySeconds: 70,
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.evaluation.triggered).toBe(true);
    expect(['FAR_FROM_SAVED_PLACES', 'NIGHT_RULE']).toContain(simRes.body.evaluation.check.rule);

    const checkId = simRes.body.evaluation.check.id;

    // Fast-forward started_at to simulate 2 minutes passing with no elder answer
    await query(
      `UPDATE lost_checks SET started_at = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
      [checkId]
    );

    // Run escalation worker
    const escalated = await processLostCheckEscalations();
    expect(escalated.length).toBeGreaterThanOrEqual(1);

    // Verify caregiver in-app alert was created
    const alerts = await query(
      `SELECT * FROM caregiver_alerts WHERE elder_id = $1 AND alert_type = 'lost_check'`,
      [seededElderId]
    );
    expect(alerts.rows.length).toBeGreaterThanOrEqual(1);
    expect(alerts.rows[0].message).toContain('Home');
  });

  // Proof 6: "I am fine" starts 30-minute cooldown
  it('Proof 6: "I am fine" sets status to fine and starts 30-minute cooldown', async () => {
    // Create new check
    const newCheck = await query(
      `INSERT INTO lost_checks (elder_id, status, rule, nearest_place_name, distance_m, score)
       VALUES ($1, 'active', 'FAR_FROM_SAVED_PLACES', 'Home', 2200, 75)
       RETURNING id`,
      [seededElderId]
    );

    const respondRes = await request(app)
      .post('/api/location/checkin/respond')
      .send({ checkId: newCheck.rows[0].id, response: 'fine' });

    expect(respondRes.status).toBe(200);
    expect(respondRes.body.action).toBe('cooldown_started');

    // Verify DB row
    const dbCheck = await query(`SELECT status, cooldown_until FROM lost_checks WHERE id = $1`, [newCheck.rows[0].id]);
    expect(dbCheck.rows[0].status).toBe('fine');
    expect(new Date(dbCheck.rows[0].cooldown_until).getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

    // Evaluating location during cooldown should not trigger a new check
    const evalDuringCooldown = await evaluateElderLocation(seededElderId);
    expect(evalDuringCooldown.inCooldown).toBe(true);
  });

  // Proof 7: Diagnostics reports all required Part A and B metrics
  it('Proof 7: /api/diagnostics/status reports last report job, location check, and fresh elder count', async () => {
    const diagRes = await request(app).get('/api/diagnostics/status');
    expect(diagRes.status).toBe(200);
    expect(diagRes.body.publicBaseUrl).toBeDefined();
    expect(diagRes.body.lastLocationCheck).toBeDefined();
    expect(diagRes.body.lastReportJob).toBeDefined();
    expect(diagRes.body.eldersWithFreshLocation).toBeGreaterThanOrEqual(1);
    expect(diagRes.body.gemini.configured).toBe(true);
  });
});
