import express from 'express';
import { pool, query } from '../db.js';
import { getTwilioStatus, sendOtp } from '../services/twilio.js';
import { getRecentErrors } from '../errors.js';
import { getCronDiagnostics } from '../cron.js';
import { config } from '../config.js';

const router = express.Router();

// GET /api/diagnostics and /api/diagnostics/status
router.get(['/status', '/'], async (req, res) => {
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

  // Fetch counts and fresh location count from DB
  let counts = { users: 0, elders: 0, places: 0, medicines: 0, sos_events: 0, reports: 0, lostChecks: 0 };
  let freshLocationsCount = 0;

  if (dbStatus.connected) {
    try {
      const uCount = await query('SELECT count(*)::int as c FROM users');
      const eCount = await query('SELECT count(*)::int as c FROM elders');
      const pCount = await query('SELECT count(*)::int as c FROM saved_places');
      const mCount = await query('SELECT count(*)::int as c FROM medicines');
      const sCount = await query('SELECT count(*)::int as c FROM sos_events');
      const rCount = await query('SELECT count(*)::int as c FROM report_drafts');
      const lCount = await query('SELECT count(*)::int as c FROM lost_checks');

      // Count elders with a location fix within the last 15 minutes
      const freshRes = await query(
        `SELECT count(*)::int as c FROM elders WHERE last_known_at >= NOW() - INTERVAL '15 minutes'`
      );

      const uPlaces = await query(`SELECT origin, count(*)::int as c FROM usual_places GROUP BY origin`);
      const sampleCount = await query(`SELECT count(*)::int as c FROM location_samples`);
      const latestCheck = await query(
        `SELECT id, elder_id, status, level, risk_score, reasons_json, nearest_place, distance_m, started_at
         FROM lost_checks ORDER BY started_at DESC LIMIT 1`
      );

      const usualPlacesBreakdown = { saved: 0, learned: 0, approved: 0 };
      uPlaces.rows.forEach(r => {
        usualPlacesBreakdown[r.origin] = r.c;
      });

      counts = {
        users: uCount.rows[0].c,
        elders: eCount.rows[0].c,
        places: pCount.rows[0].c,
        usualPlaces: usualPlacesBreakdown,
        locationSamples: sampleCount.rows[0].c,
        medicines: mCount.rows[0].c,
        sos_events: sCount.rows[0].c,
        reports: rCount.rows[0].c,
        lostChecks: lCount.rows[0].c,
        latestLostCheck: latestCheck.rows[0] || null,
      };
      freshLocationsCount = freshRes.rows[0]?.c || 0;
    } catch {
      // ignore
    }
  }

  const twilioStatus = getTwilioStatus();
  const pushConfigured = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
  const recentErrors = getRecentErrors();
  const cronDiag = getCronDiagnostics();

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    demoMode: config.demoMode,
    publicBaseUrl: config.publicBaseUrl,
    database: dbStatus,
    databaseUrlMasked: config.databaseUrl.replace(/:[^:@]*@/, ':****@'),
    counts,
    eldersWithFreshLocation: freshLocationsCount,
    lastLocationCheck: cronDiag.lastLocationCheckTime,
    lastReportJob: cronDiag.lastReportJobTime,
    gemini: {
      configured: Boolean(config.geminiApiKey),
      model: 'gemini-2.5-flash',
    },
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
