import { query } from './db.js';
import { processLostCheckEscalations, evaluateElderLocation } from './services/locationAI.js';
import { createReportDraft } from './services/aiReport.js';
import { sendEmergencySms } from './services/twilio.js';
import { config } from './config.js';
import crypto from 'crypto';

let lastLocationCheckTime = null;
let lastReportJobTime = null;

export function getCronDiagnostics() {
  return {
    lastLocationCheckTime,
    lastReportJobTime,
  };
}

/**
 * Evaluates location and staleness for all elders with location consent.
 */
export async function evaluateAllElders() {
  lastLocationCheckTime = new Date().toISOString();

  // 1. Process active lost check escalations (2-min unacknowledged alerts)
  const escalated = await processLostCheckEscalations();

  // 2. Evaluate elders with location consent
  const eldersRes = await query(
    `SELECT e.id, e.name, e.last_known_at
     FROM elders e
     JOIN elder_consent ec ON e.id = ec.elder_id
     WHERE ec.share_location = TRUE`
  );

  const evaluated = [];

  for (const elder of eldersRes.rows) {
    // Check stale location (no fix for 45 min during daytime)
    if (elder.last_known_at) {
      const minSinceLast = (Date.now() - new Date(elder.last_known_at).getTime()) / (1000 * 60);

      // Local hour in Asia/Kolkata
      const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const currentHour = new Date(kolkataDateStr).getHours();
      const isDaytime = currentHour >= 8 && currentHour < 20;

      if (isDaytime && minSinceLast >= 45 && minSinceLast < 60) {
        // Send calm stale location note (not lost)
        const noteRes = await query(
          `SELECT id FROM caregiver_alerts
           WHERE elder_id = $1 AND alert_type = 'stale_location' AND created_at >= NOW() - INTERVAL '3 hours'`,
          [elder.id]
        );

        if (noteRes.rows.length === 0) {
          const timeStr = new Date(elder.last_known_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
          const staleMsg = `We have not received ${elder.name}'s location since ${timeStr}. The phone may be off, out of coverage, or the app closed.`;

          const caregiversRes = await query(
            `SELECT caregiver_id FROM elder_caregivers WHERE elder_id = $1 AND can_see_location = TRUE`,
            [elder.id]
          );

          for (const cg of caregiversRes.rows) {
            await query(
              `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message)
               VALUES ($1, $2, 'stale_location', $3)`,
              [elder.id, cg.caregiver_id, staleMsg]
            );
          }
        }
      }
    }

    const evalRes = await evaluateElderLocation(elder.id);
    evaluated.push({ elderId: elder.id, ...evalRes });
  }

  return { escalatedCount: escalated.length, evaluatedCount: evaluated.length };
}

/**
 * Checks scheduled automated reports (e.g. Sunday 18:00 Asia/Kolkata)
 */
export async function checkAutomatedReports() {
  lastReportJobTime = new Date().toISOString();

  // Find elders with automated reports enabled that haven't had a report created in the last 6 days
  const pendingEldersRes = await query(
    `SELECT rs.elder_id, rs.send_weekly_sunday_1800, e.name
     FROM elder_report_settings rs
     JOIN elders e ON rs.elder_id = e.id
     WHERE rs.send_weekly_sunday_1800 = TRUE
       AND (rs.last_report_job_at IS NULL OR rs.last_report_job_at <= NOW() - INTERVAL '6 days')
     FOR UPDATE SKIP LOCKED`
  );

  const reportsSent = [];

  for (const row of pendingEldersRes.rows) {
    try {
      // Create draft
      const draft = await createReportDraft(row.elder_id, 7);

      // Fetch linked caregivers
      const caregiversRes = await query(
        `SELECT ec.caregiver_id, u.phone
         FROM elder_caregivers ec
         JOIN users u ON ec.caregiver_id = u.id
         WHERE ec.elder_id = $1 AND ec.status = 'active'`,
        [row.elder_id]
      );

      for (const cg of caregiversRes.rows) {
        const rawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const publicReportUrl = `${config.publicBaseUrl}/api/reports/public/${rawToken}`;

        // In-app alert
        await query(
          `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message, metadata)
           VALUES ($1, $2, 'report', $3, $4)`,
          [
            row.elder_id,
            cg.caregiver_id,
            `Weekly cognitive observation report for ${row.name} is ready`,
            JSON.stringify({ draftId: draft.id, publicReportUrl }),
          ]
        );

        // Record delivery
        await query(
          `INSERT INTO report_deliveries (draft_id, caregiver_id, channel, status, access_token_hash, expires_at)
           VALUES ($1, $2, 'in_app', 'delivered', $3, $4)`,
          [draft.id, cg.caregiver_id, tokenHash, expiresAt]
        );

        // SMS if phone exists
        if (cg.phone) {
          await sendEmergencySms({
            to: cg.phone,
            message: `[Smriti Saathi] Weekly report for ${row.name}: ${publicReportUrl}`,
          }).catch(() => {});
        }
      }

      // Mark report draft sent & update last_report_job_at
      await query(`UPDATE report_drafts SET status = 'sent' WHERE id = $1`, [draft.id]);
      await query(`UPDATE elder_report_settings SET last_report_job_at = NOW() WHERE elder_id = $1`, [row.elder_id]);

      reportsSent.push({ elderId: row.elder_id, draftId: draft.id });
    } catch (err) {
      console.error(`[Cron] Automated report failed for elder ${row.elder_id}:`, err.message);
    }
  }

  return reportsSent;
}

/**
 * Main cron tick handler
 */
export async function executeCronTick() {
  const locResult = await evaluateAllElders();
  const reportResult = await checkAutomatedReports();

  return {
    timestamp: new Date().toISOString(),
    location: locResult,
    reports: reportResult,
  };
}

// Internal interval worker running every 30 seconds
let workerInterval = null;
export function startCronWorker() {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = setInterval(() => {
    executeCronTick().catch(err => {
      console.warn('[CronWorker] Error in background execution:', err.message);
    });
  }, 30000);
}
