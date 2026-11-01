import { query } from './db.js';
import { processLostCheckEscalations } from './services/locationAI.js';
import { evaluateElderLostState, clusterLearnedUsualPlaces } from './services/lostDetectionAI.js';
import { processSafetyCheckEscalations, checkStaleLocations, purgeOldLocationSamples } from './services/locationMonitoringService.js';
import { createReportDraft, generateDailyCaretakerReport, generateWeeklyFamilyReport } from './services/aiReport.js';
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
 * Evaluates location, risk scores, and staleness for all elders with location consent.
 */
export async function evaluateAllElders() {
  lastLocationCheckTime = new Date().toISOString();

  // 1. Process active lost check escalations (2-min unacknowledged alerts)
  const escalated = await processLostCheckEscalations();

  // 1B. Process Section 7 Safety Check escalations & stale location warnings
  await processSafetyCheckEscalations();
  await checkStaleLocations();
  await purgeOldLocationSamples(30);

  // 2. Evaluate elders with location consent
  const eldersRes = await query(
    `SELECT e.id, e.name, e.last_known_at
     FROM elders e
     JOIN elder_consent ec ON e.id = ec.elder_id
     WHERE ec.share_location = TRUE`
  );

  const evaluated = [];

  for (const elder of eldersRes.rows) {
    // Check stale location (no fix for 45 min during daytime in Asia/Kolkata)
    if (elder.last_known_at) {
      const minSinceLast = (Date.now() - new Date(elder.last_known_at).getTime()) / (1000 * 60);
      const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const currentHour = new Date(kolkataDateStr).getHours();
      const isDaytime = currentHour >= 8 && currentHour < 20;

      if (isDaytime && minSinceLast >= 45 && minSinceLast < 60) {
        const noteRes = await query(
          `SELECT id FROM caregiver_alerts
           WHERE elder_id = $1 AND alert_type = 'stale_location' AND created_at >= NOW() - INTERVAL '3 hours'`,
          [elder.id]
        );

        if (noteRes.rows.length === 0) {
          const timeStr = new Date(elder.last_known_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          });
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

    // Fetch latest reliable sample for AI evaluation
    const sampleRes = await query(
      `SELECT latitude, longitude, accuracy, battery, recorded_at
       FROM location_samples
       WHERE elder_id = $1 AND unreliable_for_safety = FALSE
       ORDER BY recorded_at DESC LIMIT 1`,
      [elder.id]
    );

    if (sampleRes.rows.length > 0) {
      const s = sampleRes.rows[0];
      const evalRes = await evaluateElderLostState(elder.id, {
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
        accuracy: parseFloat(s.accuracy),
        battery: s.battery,
        recordedAt: s.recorded_at,
      });
      evaluated.push({ elderId: elder.id, ...evalRes });
    }
  }

  return { escalatedCount: escalated.length, evaluatedCount: evaluated.length };
}

/**
 * Checks scheduled automated reports (e.g. Sunday 18:00 Asia/Kolkata)
 */
export async function checkAutomatedReports() {
  lastReportJobTime = new Date().toISOString();

  const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const kDate = new Date(kolkataDateStr);
  const currentHour = kDate.getHours();
  const currentDayOfWeek = kDate.getDay(); // 0 = Sunday
  const todayDateStr = kDate.toISOString().slice(0, 10);

  const reportsSent = [];

  // Fetch all active elders
  const eldersRes = await query('SELECT id, name FROM elders');

  for (const elder of eldersRes.rows) {
    try {
      // 1. Daily Caretaker Report at 8:00 PM IST (Hour 20)
      if (currentHour === 20) {
        const todayReportRes = await query(
          `SELECT id FROM cognitive_activity_reports
           WHERE elder_id = $1 AND report_type = 'daily_caretaker'
             AND generated_at >= $2`,
          [elder.id, `${todayDateStr}T00:00:00Z`]
        );

        if (todayReportRes.rows.length === 0) {
          const dailyResult = await generateDailyCaretakerReport(elder.id, kDate);

          // Record delivery in report_delivery_history
          await query(
            `INSERT INTO report_delivery_history (report_id, recipient_type, channel, status)
             VALUES ($1, 'caretaker', 'in_app', 'delivered')`,
            [dailyResult.report.id]
          );

          reportsSent.push({ type: 'daily_caretaker', elderId: elder.id, reportId: dailyResult.report.id });
        }
      }

      // 2. Weekly Family Report on Sunday at 7:00 PM IST (Sunday = 0, Hour 19)
      if (currentDayOfWeek === 0 && currentHour === 19) {
        const thisWeekReportRes = await query(
          `SELECT id FROM cognitive_activity_reports
           WHERE elder_id = $1 AND report_type = 'weekly_family'
             AND generated_at >= NOW() - INTERVAL '6 days'`,
          [elder.id]
        );

        if (thisWeekReportRes.rows.length === 0) {
          const weeklyResult = await generateWeeklyFamilyReport(elder.id, kDate);

          // Record delivery in report_delivery_history
          await query(
            `INSERT INTO report_delivery_history (report_id, recipient_type, channel, status)
             VALUES ($1, 'family', 'in_app', 'delivered')`,
            [weeklyResult.report.id]
          );

          reportsSent.push({ type: 'weekly_family', elderId: elder.id, reportId: weeklyResult.report.id });
        }
      }
    } catch (err) {
      console.error(`[Cron] Automated report error for elder ${elder.id}:`, err.message);
    }
  }

  // Also preserve legacy report_settings check for test suite
  const pendingEldersRes = await query(
    `SELECT rs.elder_id, rs.send_weekly_sunday_1800, e.name
     FROM elder_report_settings rs
     JOIN elders e ON rs.elder_id = e.id
     WHERE rs.send_weekly_sunday_1800 = TRUE
       AND (rs.last_report_job_at IS NULL OR rs.last_report_job_at <= NOW() - INTERVAL '6 days')
     FOR UPDATE SKIP LOCKED`
  );

  for (const row of pendingEldersRes.rows) {
    try {
      const draft = await createReportDraft(row.elder_id, 7);
      await query(`UPDATE report_drafts SET status = 'sent' WHERE id = $1`, [draft.id]);
      await query(`UPDATE elder_report_settings SET last_report_job_at = NOW() WHERE elder_id = $1`, [row.elder_id]);
      reportsSent.push({ elderId: row.elder_id, draftId: draft.id });
    } catch (err) {
      console.error(`[Cron] Legacy report error:`, err.message);
    }
  }

  return reportsSent;
}

/**
 * Expand and process reminder occurrences (Asia/Kolkata)
 */
export async function processRemindersAndSchedules() {
  const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const kDate = new Date(kolkataDateStr);
  const currentHour = kDate.getHours().toString().padStart(2, '0');
  const currentMin = kDate.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMin}`;
  const currentDayOfWeek = kDate.getDay();

  // 1. Expand matching schedules into occurrences for today
  const schedulesRes = await query(
    `SELECT * FROM reminder_schedules
     WHERE is_active = TRUE AND time_of_day = $1`,
    [currentTime]
  );

  for (const s of schedulesRes.rows) {
    const days = typeof s.days_of_week === 'string' ? JSON.parse(s.days_of_week) : s.days_of_week;
    if (Array.isArray(days) && days.includes(currentDayOfWeek)) {
      // Create occurrence if not already created today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const exists = await query(
        `SELECT id FROM reminder_occurrences
         WHERE schedule_id = $1 AND due_at >= $2`,
        [s.id, todayStart]
      );

      if (exists.rows.length === 0) {
        await query(
          `INSERT INTO reminder_occurrences (schedule_id, elder_id, reminder_type, title, due_at, status)
           VALUES ($1, $2, $3, $4, NOW(), 'scheduled')`,
          [s.id, s.elder_id, s.reminder_type, s.title]
        );
      }
    }
  }

  // 2. Claim and fire scheduled occurrences due now
  const dueOccurrences = await query(
    `SELECT o.id, o.elder_id, o.title, o.reminder_type, e.name as elder_name
     FROM reminder_occurrences o
     JOIN elders e ON e.id = o.elder_id
     WHERE o.status = 'scheduled' AND o.due_at <= NOW()
     FOR UPDATE SKIP LOCKED`
  );

  for (const occ of dueOccurrences.rows) {
    await query(
      `UPDATE reminder_occurrences SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [occ.id]
    );

    // Dispatch Web Push notification
    import('./services/push.js').then(({ sendWebPushNotification }) => {
      sendWebPushNotification({
        elderId: occ.elder_id,
        title: `स्मृति साथी: ${occ.title}`,
        body: `${occ.elder_name} जी, यह आपके लिए एक ज़रूरी स्मरण है।`,
        data: { occurrenceId: occ.id, tag: 'reminder-due' },
        actions: [
          { action: 'done', title: '✓ पूरा हुआ (Done)' },
          { action: 'snooze', title: '⏱ 10 मिनट बाद' },
        ],
      }).catch(() => {});
    });
  }

  // 3. Mark missed occurrences (> 20 min overdue) and escalate to family
  const missedOccurrences = await query(
    `UPDATE reminder_occurrences
     SET status = 'missed'
     WHERE status IN ('scheduled', 'sent')
       AND due_at <= NOW() - INTERVAL '20 minutes'
     RETURNING id, elder_id, title`
  );

  for (const missed of missedOccurrences.rows) {
    const caregivers = await query(
      `SELECT caregiver_id FROM elder_caregivers WHERE elder_id = $1`,
      [missed.elder_id]
    );
    for (const cg of caregivers.rows) {
      await query(
        `INSERT INTO caregiver_alerts (elder_id, caregiver_id, alert_type, message)
         VALUES ($1, $2, 'missed_reminder', $3)`,
        [missed.elder_id, cg.caregiver_id, `Reminder missed: "${missed.title}" was not taken after 20 minutes.`]
      );
    }
  }

  return {
    dueProcessed: dueOccurrences.rows.length,
    missedMarked: missedOccurrences.rows.length,
  };
}

/**
 * Main cron tick handler
 */
export async function executeCronTick() {
  const locResult = await evaluateAllElders();
  const reportResult = await checkAutomatedReports();
  const reminderResult = await processRemindersAndSchedules();

  return {
    timestamp: new Date().toISOString(),
    location: locResult,
    reports: reportResult,
    reminders: reminderResult,
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
