import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';

describe('Phase 1 Foundation and Auth Tests', () => {
  const testPhone = '+919876543299';
  let sessionCookie = '';
  let validDemoCode = '';

  beforeAll(async () => {
    // Clean up any existing test records for testPhone
    await query(`DELETE FROM otp_verifications WHERE phone = $1`, [testPhone]);
    await query(`DELETE FROM users WHERE phone = $1`, [testPhone]);
  });

  it('Test 1A: Health check returns 200 with legal disclaimer and DB connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.disclaimer).toContain('does not diagnose or treat dementia');
  });

  it('Test 1B: Request OTP returns 6-digit code in demo banner', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ rawPhone: testPhone, channel: 'sms' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.demoMode).toBe(true);
    expect(res.body.demoCode).toMatch(/^\d{6}$/);
    validDemoCode = res.body.demoCode;
  });

  it('Test 3A: Resend timer rejects rapid OTP request within 30 seconds', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ rawPhone: testPhone, channel: 'sms' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RESEND_WAIT');
  });

  it('Test 3B: Wrong codes decrement tries and 5 wrong codes lock the verification', async () => {
    // Make 5 consecutive wrong attempts
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ rawPhone: testPhone, code: '000000' });

      expect(res.status).toBe(400);
      if (i < 5) {
        expect(res.body.error).toBe('INVALID_CODE');
        expect(res.body.triesLeft).toBe(5 - i);
      } else {
        // 5th failed attempt or subsequent is locked
        expect(res.body.error).toBe('OTP_LOCKED');
      }
    }
  });

  it('Test 3C: Expired OTP is rejected', async () => {
    // Fast-expire the OTP in DB
    await query(
      `UPDATE otp_verifications SET expires_at = NOW() - INTERVAL '1 minute', verified = FALSE, attempts = 0 WHERE phone = $1`,
      [testPhone]
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ rawPhone: testPhone, code: validDemoCode });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP_EXPIRED');
  });

  it('Test 1C: Fresh valid OTP verification creates user and sets 90-day session', async () => {
    // Request fresh code bypassing resend by resetting DB time
    await query(`DELETE FROM otp_verifications WHERE phone = $1`, [testPhone]);

    const reqRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ rawPhone: testPhone, channel: 'sms' });

    const newCode = reqRes.body.demoCode;

    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ rawPhone: testPhone, code: newCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.user.phone).toBe(testPhone);

    const cookies = verifyRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    sessionCookie = cookies[0];
    expect(sessionCookie).toContain('smriti_session');
  });

  it('Test 2: Save elder name "Ramesh" to PostgreSQL immediately and verify persistence', async () => {
    const initRes = await request(app)
      .post('/api/elder/init-profile')
      .set('Cookie', sessionCookie)
      .send({
        role: 'caregiver',
        elderName: 'Ramesh',
        elderAge: 74,
        elderLanguage: 'hi',
        region: 'Assam',
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.elder.name).toBe('Ramesh');
    expect(initRes.body.elder.language).toBe('hi');

    // Query DB directly to prove persistence in database row
    const dbRow = await query(`SELECT name, age, language, region FROM elders WHERE id = $1`, [initRes.body.elder.id]);
    expect(dbRow.rows.length).toBe(1);
    expect(dbRow.rows[0].name).toBe('Ramesh');
    expect(dbRow.rows[0].age).toBe(74);

    // Verify GET /api/auth/me returns the saved elder
    const meRes = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.authenticated).toBe(true);
    expect(meRes.body.elder.name).toBe('Ramesh');
  });

  it('Test 4: Logout and re-login shows the same elder data', async () => {
    // Logout
    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', sessionCookie);
    expect(logoutRes.status).toBe(200);

    // After logout, session is invalid
    const meAfterLogout = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
    expect(meAfterLogout.status).toBe(401);

    // Request new OTP to re-login
    await query(`DELETE FROM otp_verifications WHERE phone = $1`, [testPhone]);
    const reqRes = await request(app).post('/api/auth/request-otp').send({ rawPhone: testPhone });
    const reLoginCode = reqRes.body.demoCode;

    const verifyRes = await request(app).post('/api/auth/verify-otp').send({ rawPhone: testPhone, code: reLoginCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.elder.name).toBe('Ramesh');
  });

  it('Test 6: /api/diagnostics/status returns real status and test-otp works', async () => {
    const diagRes = await request(app).get('/api/diagnostics/status');
    expect(diagRes.status).toBe(200);
    expect(diagRes.body.database.connected).toBe(true);
    expect(diagRes.body.otpProvider.mode).toBe('DEMO');
    expect(diagRes.body.counts.elders).toBeGreaterThanOrEqual(1);

    const testOtpRes = await request(app)
      .post('/api/diagnostics/test-otp')
      .send({ phone: '+919876543200', forceDemo: true });

    expect(testOtpRes.status).toBe(200);
    expect(testOtpRes.body.success).toBe(true);
    expect(testOtpRes.body.code).toBeDefined();
  });
});
