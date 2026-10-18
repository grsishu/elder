import express from 'express';
import { pool, query } from '../db.js';
import { getTwilioStatus, sendOtp } from '../services/twilio.js';
import { getRecentErrors } from '../errors.js';
import { config } from '../config.js';

const router = express.Router();

// GET /api/diagnostics/status
router.get('/status', async (req, res) => {
  let dbStatus = { connected: false, version: null, error: null };
  try {
    const vRes = await pool.query('SELECT version();');
    dbStatus = {
      connected: true,
      version: vRes.rows[0]?.version?.split(' ')[0] + ' ' + vRes.rows[0]?.version?.split(' ')[1],
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
    };
  } catch (err) {
    dbStatus.error = err.message;
  }

  // Fetch counts from DB
  let counts = { users: 0, elders: 0, places: 0, medicines: 0, sos_events: 0 };
  if (dbStatus.connected) {
    try {
      const uCount = await query('SELECT count(*)::int as c FROM users');
      const eCount = await query('SELECT count(*)::int as c FROM elders');
      const pCount = await query('SELECT count(*)::int as c FROM saved_places');
      const mCount = await query('SELECT count(*)::int as c FROM medicines');
      const sCount = await query('SELECT count(*)::int as c FROM sos_events');
      counts = {
        users: uCount.rows[0].c,
        elders: eCount.rows[0].c,
        places: pCount.rows[0].c,
        medicines: mCount.rows[0].c,
        sos_events: sCount.rows[0].c,
      };
    } catch {
      // ignore
    }
  }

  const twilioStatus = getTwilioStatus();
  const pushConfigured = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
  const recentErrors = getRecentErrors();

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    demoMode: config.demoMode,
    database: dbStatus,
    databaseUrlMasked: config.databaseUrl.replace(/:[^:@]*@/, ':****@'),
    counts,
    otpProvider: {
      mode: config.demoMode ? 'DEMO' : 'TWILIO',
      twilioConfigured: twilioStatus.configured,
      accountSidMasked: twilioStatus.accountSidMasked,
      verifySidMasked: twilioStatus.verifySidMasked,
      lastError: twilioStatus.lastError,
    },
    twilioVoice: {
      configured: Boolean(config.twilio.accountSid && config.twilio.phoneNumber),
      phoneNumber: config.twilio.phoneNumber || null,
      lastError: twilioStatus.lastError,
    },
    push: {
      vapidConfigured: pushConfigured,
      vapidPublicKeyPrefix: config.vapidPublicKey ? config.vapidPublicKey.substring(0, 10) + '...' : null,
      subject: config.vapidSubject,
    },
    recentErrors,
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// POST /api/diagnostics/test-otp
router.post('/test-otp', async (req, res) => {
  const { phone, channel = 'sms', forceDemo = false } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required for test' });
  }

  try {
    if (forceDemo) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      return res.json({
        success: true,
        mode: 'DEMO',
        code,
        message: `DEMO MODE: simulated OTP generated successfully: ${code}`,
      });
    }

    const result = await sendOtp(phone, channel);
    return res.json({
      success: result.success,
      mode: result.demoMode ? 'DEMO' : 'TWILIO',
      providerError: result.providerError || null,
      userMessage: result.userMessage || result.message || 'OTP triggered',
      demoCode: result.demoCode || null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
