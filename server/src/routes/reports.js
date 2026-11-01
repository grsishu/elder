import express from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createReportDraft, computeElderStats, generateDailyCaretakerReport, generateWeeklyFamilyReport } from '../services/aiReport.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { sendEmergencySms } from '../services/twilio.js';
import { config } from '../config.js';
import { logServerError } from '../errors.js';

const router = express.Router();

// POST /api/reports/draft - Generates a new report draft
router.post('/draft', requireAuth, async (req, res) => {
  try {
    const elderId = req.body.elderId || req.elder?.id;
    const periodDays = parseInt(req.body.periodDays || '7', 10);

    if (!elderId) {
      return res.status(400).json({ error: 'ELDER_REQUIRED', message: 'Elder ID is required' });
    }

    const draft = await createReportDraft(elderId, periodDays);

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, elder_id, action, resource, details)
       VALUES ($1, $2, 'CREATE_REPORT_DRAFT', 'report_drafts', $3)`,
      [req.user.user_id, elderId, JSON.stringify({ draftId: draft.id, periodDays })]
    );

    return res.json({
      success: true,
      draft,
      message: 'Report draft created successfully',
    });
  } catch (err) {
    logServerError({
      message: `Error creating report draft: ${err.message}`,
      stack: err.stack,
      route: '/api/reports/draft',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/drafts - List drafts for elder
router.get('/drafts', requireAuth, async (req, res) => {
  const elderId = req.query.elderId || req.elder?.id;
  if (!elderId) {
    return res.status(400).json({ error: 'ELDER_REQUIRED' });
  }

  try {
    const draftsRes = await query(
      `SELECT id, elder_id, period, status, language, summary_text, suggested_next_steps, stats_json, created_at, updated_at
       FROM report_drafts
       WHERE elder_id = $1
       ORDER BY created_at DESC`,
      [elderId]
    );

    return res.json({ drafts: draftsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/drafts/:id - Get draft detail
router.get('/drafts/:id', requireAuth, async (req, res) => {
  try {
    const draftRes = await query(
      `SELECT id, elder_id, period, status, language, summary_text, suggested_next_steps, stats_json, created_at, updated_at
       FROM report_drafts WHERE id = $1`,
      [req.params.id]
    );
    if (draftRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Report draft not found' });
    }

    const deliveriesRes = await query(
      `SELECT id, caregiver_id, channel, status, error, sent_at
       FROM report_deliveries WHERE draft_id = $1 ORDER BY sent_at DESC`,
      [req.params.id]
    );

    return res.json({ draft: draftRes.rows[0], deliveries: deliveriesRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/reports/drafts/:id - Edit draft text
router.patch('/drafts/:id', requireAuth, async (req, res) => {
  const { summaryText, suggestedNextSteps } = req.body;
  try {
    const updateRes = await query(
      `UPDATE report_drafts
       SET summary_text = COALESCE($1, summary_text),
           suggested_next_steps = COALESCE($2, suggested_next_steps),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, summary_text, suggested_next_steps, updated_at`,
      [summaryText, suggestedNextSteps, req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    return res.json({ success: true, draft: updateRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/drafts/:id/pdf - Stream PDF
router.get('/drafts/:id/pdf', requireAuth, async (req, res) => {
  try {
    const pdfRes = await query(`SELECT pdf, elder_id FROM report_drafts WHERE id = $1`, [req.params.id]);
    if (pdfRes.rows.length === 0 || !pdfRes.rows[0].pdf) {
      return res.status(404).send('PDF not found');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report-${req.params.id}.pdf"`);
    return res.send(pdfRes.rows[0].pdf);
  } catch (err) {
    return res.status(500).send('Error loading PDF');
  }
});

// POST /api/reports/drafts/:id/send - Send report to caregivers
router.post('/drafts/:id/send', requireAuth, async (req, res) => {
  try {
    const draftRes = await query(
      `SELECT d.*, e.name as elder_name
       FROM report_drafts d
       JOIN elders e ON d.elder_id = e.id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (draftRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Report draft not found' });
    }
    const draft = draftRes.rows[0];

    // Find linked caregivers
    const caregiversRes = await query(
      `SELECT ec.caregiver_id, u.phone, ec.can_see_progress, ec.can_see_health
       FROM elder_caregivers ec
       JOIN users u ON ec.caregiver_id = u.id
       WHERE ec.elder_id = $1 AND ec.status = 'active'`,
      [draft.elder_id]
    );

    // If caregiver list is empty, deliver to current user
    const targetCaregivers = caregiversRes.rows.length > 0 ? caregiversRes.rows : [
      { caregiver_id: req.user.user_id, phone: req.user.phone, can_see_progress: true },
    ];

    const results = [];

    for (const cg of targetCaregivers) {
      // Generate 7-day revocable token
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const publicReportUrl = `${config.publicBaseUrl}/api/reports/public/${rawToken}`;
      const waLink = `https://wa.me/${cg.phone?.replace('+', '')}?text=${encodeURIComponent(
        `Smriti Saathi Cognitive Report for ${draft.elder_name}: ${publicReportUrl}`
      )}`;

      // 1. In-App Delivery
      await query(
        `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message, metadata)
         VALUES ($1, $2, 'report', $3, $4)`,
        [
          draft.elder_id,
          cg.caregiver_id,
          `New cognitive observation report available for ${draft.elder_name}`,
          JSON.stringify({ draftId: draft.id, publicReportUrl }),
        ]
      );

      const inAppDelivery = await query(
        `INSERT INTO report_deliveries (draft_id, caregiver_id, channel, status, access_token_hash, expires_at)
         VALUES ($1, $2, 'in_app', 'delivered', $3, $4)
         RETURNING id, channel, status`,
        [draft.id, cg.caregiver_id, tokenHash, expiresAt]
      );
      results.push(inAppDelivery.rows[0]);

      // 2. SMS Delivery via Twilio
      let smsStatus = 'skipped';
      let smsError = null;

      if (cg.phone) {
        const smsBody = `[Smriti Saathi] Cognitive observation report for ${draft.elder_name} is ready: ${publicReportUrl}`;
        const smsRes = await sendEmergencySms({ to: cg.phone, message: smsBody });

        if (smsRes.success) {
          smsStatus = 'sent';
        } else {
          smsStatus = 'failed';
          smsError = smsRes.error || 'Twilio delivery error';
        }

        const smsDelivery = await query(
          `INSERT INTO report_deliveries (draft_id, caregiver_id, channel, status, error, access_token_hash, expires_at)
           VALUES ($1, $2, 'sms', $3, $4, $5, $6)
           RETURNING id, channel, status, error`,
          [draft.id, cg.caregiver_id, smsStatus, smsError, tokenHash, expiresAt]
        );
        results.push(smsDelivery.rows[0]);
      }

      // 3. WhatsApp link record
      results.push({
        channel: 'whatsapp',
        status: 'ready',
        waLink,
        publicReportUrl,
      });

      // Audit log
      await query(
        `INSERT INTO audit_logs (user_id, elder_id, action, resource, details)
         VALUES ($1, $2, 'SEND_REPORT', 'report_deliveries', $3)`,
        [req.user.user_id, draft.elder_id, JSON.stringify({ draftId: draft.id, caregiverId: cg.caregiver_id })]
      );
    }

    // Mark draft as sent
    await query(`UPDATE report_drafts SET status = 'sent', updated_at = NOW() WHERE id = $1`, [draft.id]);

    return res.json({
      success: true,
      message: 'Report sent successfully to linked caregivers',
      deliveries: results,
    });
  } catch (err) {
    logServerError({
      message: `Error sending report: ${err.message}`,
      stack: err.stack,
      route: '/api/reports/drafts/send',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/public/:token - Public 7-day revocable token access without login
router.get('/public/:token', async (req, res) => {
  const token = req.params.token;
  if (!token) return res.status(400).send('Token required');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const deliveryRes = await query(
      `SELECT rd.id, rd.draft_id, rd.expires_at, d.pdf, d.elder_id
       FROM report_deliveries rd
       JOIN report_drafts d ON rd.draft_id = d.id
       WHERE rd.access_token_hash = $1 AND rd.expires_at > NOW()`,
      [tokenHash]
    );

    if (deliveryRes.rows.length === 0) {
      return res.status(403).send('This report link has expired or been revoked.');
    }

    const { pdf, elder_id } = deliveryRes.rows[0];

    // Audit log
    await query(
      `INSERT INTO audit_logs (elder_id, action, resource, ip_address, details)
       VALUES ($1, 'VIEW_PUBLIC_REPORT', 'report_pdf', $2, $3)`,
      [elder_id, req.ip, JSON.stringify({ tokenHash: tokenHash.substring(0, 10) })]
    ).catch(() => {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="elder-report.pdf"');
    return res.send(pdf);
  } catch (err) {
    return res.status(500).send('Error retrieving report');
  }
});

// GET /api/reports/settings - Get elder report settings
router.get('/settings', requireAuth, async (req, res) => {
  const elderId = req.query.elderId || req.elder?.id;
  if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

  const sRes = await query(`SELECT * FROM elder_report_settings WHERE elder_id = $1`, [elderId]);
  return res.json({
    settings: sRes.rows[0] || { send_weekly_sunday_1800: false, send_monthly: false },
  });
});

// POST /api/reports/settings - Save report settings
router.post('/settings', requireAuth, async (req, res) => {
  const elderId = req.body.elderId || req.elder?.id;
  const { sendWeeklySunday1800, sendMonthly } = req.body;
  if (!elderId) return res.status(400).json({ error: 'ELDER_REQUIRED' });

  const upsertRes = await query(
    `INSERT INTO elder_report_settings (elder_id, send_weekly_sunday_1800, send_monthly, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (elder_id) DO UPDATE
     SET send_weekly_sunday_1800 = EXCLUDED.send_weekly_sunday_1800,
         send_monthly = EXCLUDED.send_monthly,
         updated_at = NOW()
     RETURNING *`,
    [elderId, Boolean(sendWeeklySunday1800), Boolean(sendMonthly)]
  );

  return res.json({ success: true, settings: upsertRes.rows[0] });
});

// Helper to resolve elderId flexibly
async function resolveElderId(req) {
  if (req.body?.elderId) return req.body.elderId;
  if (req.query?.elderId) return req.query.elderId;
  if (req.elder?.id) return req.elder.id;
  if (req.user?.user_id) {
    const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
    if (res.rows[0]?.id) return res.rows[0].id;
  }
  const anyElder = await query('SELECT id FROM elders ORDER BY created_at ASC LIMIT 1');
  return anyElder.rows[0]?.id || null;
}

// GET /api/reports/daily - List daily cognitive reports
router.get('/daily', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const reportsRes = await query(
      `SELECT id, elder_id, report_type, period_start, period_end, summary_text,
              ai_observations, recommendations, stats_json, pdf_path, generated_at
       FROM cognitive_activity_reports
       WHERE elder_id = $1 AND report_type = 'daily_caretaker'
       ORDER BY generated_at DESC
       LIMIT 30`,
      [elderId]
    );

    return res.json({ success: true, reports: reportsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/weekly - List weekly cognitive reports
router.get('/weekly', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const reportsRes = await query(
      `SELECT id, elder_id, report_type, period_start, period_end, summary_text,
              ai_observations, recommendations, stats_json, pdf_path, generated_at
       FROM cognitive_activity_reports
       WHERE elder_id = $1 AND report_type = 'weekly_family'
       ORDER BY generated_at DESC
       LIMIT 30`,
      [elderId]
    );

    return res.json({ success: true, reports: reportsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reports/daily/generate - Trigger immediate daily report generation
router.post('/daily/generate', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const result = await generateDailyCaretakerReport(elderId);
    return res.json({ success: true, report: result.report });
  } catch (err) {
    logServerError({ message: `Daily report generation error: ${err.message}`, route: '/api/reports/daily/generate', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reports/weekly/generate - Trigger immediate weekly report generation
router.post('/weekly/generate', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const result = await generateWeeklyFamilyReport(elderId);
    return res.json({ success: true, report: result.report });
  } catch (err) {
    logServerError({ message: `Weekly report generation error: ${err.message}`, route: '/api/reports/weekly/generate', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reports/:id/pdf - Stream/download PDF file
router.get('/:id/pdf', async (req, res) => {
  try {
    const reportRes = await query(
      `SELECT id, elder_id, pdf_path, report_type FROM cognitive_activity_reports WHERE id = $1`,
      [req.params.id]
    );
    if (reportRes.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Report not found' });
    }

    const { pdf_path, report_type, id } = reportRes.rows[0];
    if (!pdf_path) {
      return res.status(404).json({ error: 'PDF_NOT_FOUND', message: 'PDF file not available' });
    }

    const absPath = path.resolve(__dirname, '../../', pdf_path.replace(/^\//, ''));
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'FILE_MISSING', message: 'PDF file does not exist on disk' });
    }

    const filename = path.basename(absPath) || `smriti-saathi-${report_type}-${id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
