import express from 'express';
import crypto from 'crypto';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { query } from '../db.js';
import { sendOtp, checkTwilioOtp } from '../services/twilio.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';

const router = express.Router();

// Memory store for per-phone & per-IP hourly request counts to enforce 5/hour rate limits
const phoneRateMap = new Map();
const ipRateMap = new Map();

function checkHourlyRateLimit(map, key) {
  const now = Date.now();
  const history = (map.get(key) || []).filter(t => now - t < 3600 * 1000);
  if (history.length >= 5) {
    return false;
  }
  history.push(now);
  map.set(key, history);
  return true;
}

// POST /api/auth/request-otp
router.post('/request-otp', async (req, res) => {
  try {
    const { rawPhone, channel = 'sms', fallbackDemo = false } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    if (!rawPhone) {
      return res.status(400).json({ error: 'PHONE_REQUIRED', message: 'Phone number is required' });
    }

    let parsed;
    try {
      parsed = parsePhoneNumber(rawPhone, 'IN');
    } catch {
      return res.status(400).json({ error: 'INVALID_PHONE', message: 'Please enter a valid mobile number' });
    }

    if (!parsed || !parsed.isValid()) {
      return res.status(400).json({ error: 'INVALID_PHONE', message: 'Please enter a valid mobile number' });
    }

    const e164Phone = parsed.number;

    // Rate limits: 5 per hour per phone and per IP
    if (!checkHourlyRateLimit(phoneRateMap, e164Phone)) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many OTP requests for this phone number. Please wait an hour.',
      });
    }

    if (!checkHourlyRateLimit(ipRateMap, clientIp)) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many OTP requests from this network. Please wait an hour.',
      });
    }

    // Check 30-second resend limit
    const recentOtpRes = await query(
      `SELECT created_at FROM otp_verifications
       WHERE phone = $1 AND verified = FALSE AND created_at > NOW() - INTERVAL '30 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [e164Phone]
    );

    if (recentOtpRes.rows.length > 0) {
      const waitRemaining = Math.max(
        1,
        30 - Math.floor((Date.now() - new Date(recentOtpRes.rows[0].created_at).getTime()) / 1000)
      );
      return res.status(429).json({
        error: 'RESEND_WAIT',
        message: `Please wait ${waitRemaining} seconds before requesting a new code.`,
        waitRemaining,
      });
    }

    // Attempt OTP delivery
    let otpResult;
    if (fallbackDemo) {
      const demoCode = Math.floor(100000 + Math.random() * 900000).toString();
      otpResult = {
        success: true,
        demoMode: true,
        demoCode,
        message: `DEMO MODE: no SMS is sent. Your code is ${demoCode}`,
      };
    } else {
      otpResult = await sendOtp(e164Phone, channel);
    }

    if (!otpResult.success) {
      return res.status(400).json({
        error: 'PROVIDER_ERROR',
        message: otpResult.userMessage || 'Could not send verification code.',
        providerError: otpResult.providerError,
        canFallbackToDemo: otpResult.canFallbackToDemo || false,
      });
    }

    // Store in DB
    const codeToHash = otpResult.demoCode || 'TWILIO_VERIFY';
    const codeHash = crypto.createHash('sha256').update(codeToHash).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await query(
      `INSERT INTO otp_verifications (phone, code_hash, channel, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [e164Phone, codeHash, channel, expiresAt]
    );

    return res.json({
      success: true,
      phone: e164Phone,
      demoMode: otpResult.demoMode,
      demoCode: otpResult.demoCode || null,
      message: otpResult.demoCode
        ? `DEMO MODE: no SMS is sent. Your code is ${otpResult.demoCode}`
        : 'Verification code sent.',
      expiresInSeconds: 300,
    });
  } catch (err) {
    logServerError({
      message: `Error in request-otp: ${err.message}`,
      stack: err.stack,
      route: '/api/auth/request-otp',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Internal server error' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { rawPhone, code } = req.body;
    if (!rawPhone || !code) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Phone and code are required' });
    }

    let parsed;
    try {
      parsed = parsePhoneNumber(rawPhone, 'IN');
    } catch {
      return res.status(400).json({ error: 'INVALID_PHONE', message: 'Invalid phone number format' });
    }
    const e164Phone = parsed.number;

    // Fetch the latest unverified OTP for this phone
    const otpRes = await query(
      `SELECT id, code_hash, channel, attempts, expires_at, created_at
       FROM otp_verifications
       WHERE phone = $1 AND verified = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [e164Phone]
    );

    if (otpRes.rows.length === 0) {
      return res.status(400).json({
        error: 'NO_ACTIVE_OTP',
        message: 'No active code found. Please request a new one.',
      });
    }

    const otpRow = otpRes.rows[0];

    // Check attempts limit (max 5)
    if (otpRow.attempts >= 5) {
      return res.status(400).json({
        error: 'OTP_LOCKED',
        message: 'Too many wrong tries. This code is locked. Please request a new code.',
      });
    }

    // Check expiration (5 minutes)
    if (new Date() > new Date(otpRow.expires_at)) {
      return res.status(400).json({
        error: 'OTP_EXPIRED',
        message: 'Code has expired. Please request a new code.',
      });
    }

    let isValid = false;

    if (otpRow.code_hash === crypto.createHash('sha256').update('TWILIO_VERIFY').digest('hex')) {
      // Real Twilio verification
      const checkRes = await checkTwilioOtp(e164Phone, code.trim());
      isValid = checkRes.success;
    } else {
      // Demo mode verification
      const enteredHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      isValid = enteredHash === otpRow.code_hash;
    }

    if (!isValid) {
      const updatedAttempts = otpRow.attempts + 1;
      await query(`UPDATE otp_verifications SET attempts = $1 WHERE id = $2`, [updatedAttempts, otpRow.id]);
      const triesLeft = Math.max(0, 5 - updatedAttempts);
      if (updatedAttempts >= 5) {
        return res.status(400).json({
          error: 'OTP_LOCKED',
          message: 'Too many wrong tries. This code is locked. Please request a new code.',
          triesLeft: 0,
        });
      }
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: `Incorrect code. ${triesLeft} tries remaining.`,
        triesLeft,
      });
    }

    // Mark OTP as verified
    await query(`UPDATE otp_verifications SET verified = TRUE WHERE id = $1`, [otpRow.id]);

    // Upsert User
    let userRes = await query(`SELECT id, phone, role, created_at FROM users WHERE phone = $1`, [e164Phone]);
    if (userRes.rows.length === 0) {
      userRes = await query(
        `INSERT INTO users (phone, role) VALUES ($1, 'caregiver') RETURNING id, phone, role, created_at`,
        [e164Phone]
      );
    }
    const user = userRes.rows[0];

    // Create 90-day session
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, sessionExpiresAt]
    );

    // Set secure httpOnly cookie
    res.cookie('smriti_session', rawSessionToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000,
    });

    // Check if elder profile exists
    const elderRes = await query(
      `SELECT id, name, age, language, region, voice_speed
       FROM elders WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    return res.json({
      success: true,
      token: rawSessionToken,
      user,
      elder: elderRes.rows[0] || null,
      message: 'Verified successfully',
    });
  } catch (err) {
    logServerError({
      message: `Error in verify-otp: ${err.message}`,
      stack: err.stack,
      route: '/api/auth/verify-otp',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false, user: null, elder: null });
  }

  // Get consent settings if elder profile exists
  let consent = null;
  if (req.elder) {
    const consentRes = await query(
      `SELECT share_location, share_health, share_progress FROM elder_consent WHERE elder_id = $1`,
      [req.elder.id]
    );
    consent = consentRes.rows[0] || { share_location: false, share_health: false, share_progress: false };
  }

  return res.json({
    authenticated: true,
    user: req.user,
    elder: req.elder,
    consent,
  });
});

// POST /api/auth/demo-quick-login - Instant access for reviewers & public visitors
router.post('/demo-quick-login', async (req, res) => {
  try {
    const demoPhone = '+919876543210';
    let userRes = await query(`SELECT id, phone, role, created_at FROM users WHERE phone = $1`, [demoPhone]);
    if (userRes.rows.length === 0) {
      userRes = await query(
        `INSERT INTO users (phone, role) VALUES ($1, 'caregiver') RETURNING id, phone, role, created_at`,
        [demoPhone]
      );
    }
    const user = userRes.rows[0];

    // Ensure elder profile
    let elderRes = await query(`SELECT id, name, age, language, region, voice_speed FROM elders WHERE user_id = $1 LIMIT 1`, [user.id]);
    if (elderRes.rows.length === 0) {
      elderRes = await query(
        `INSERT INTO elders (user_id, name, age, language, region) VALUES ($1, 'Ramesh', 74, 'en', 'Assam') RETURNING id, name, age, language, region, voice_speed`,
        [user.id]
      );
    }

    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, sessionExpiresAt]
    );

    res.cookie('smriti_session', rawSessionToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token: rawSessionToken,
      user,
      elder: elderRes.rows[0],
      message: 'Logged in as Demo User',
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies?.smriti_session || req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(`DELETE FROM user_sessions WHERE token_hash = $1`, [tokenHash]);
  }
  res.clearCookie('smriti_session');
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
