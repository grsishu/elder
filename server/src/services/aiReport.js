import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { config } from '../config.js';
import { logServerError } from '../errors.js';
import { COGNITIVE_GAMES, getElderGamesStatus, generateCognitiveAnalysis } from './adaptiveAI.js';
import { sendEmergencySms } from './twilio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.resolve(__dirname, '../../uploads/reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Banned words that imply medical diagnosis
const BANNED_DIAGNOSTIC_WORDS = [
  'diagnosis',
  'diagnose',
  'diagnosed',
  'dementia stage',
  'stage 1',
  'stage 2',
  'stage 3',
  'pathology',
  'clinical condition',
  'cure',
  'cure dementia',
  'disease progression',
  'निदान',
  'बीमारी का निदान',
  'रोग का निदान',
];

export function containsBannedWords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BANNED_DIAGNOSTIC_WORDS.some((word) => lower.includes(word));
}

/**
 * Backward-compatible helper to compute elder stats
 */
export async function computeElderStats(elderId, periodDays = 7) {
  const sessionsRes = await query(
    `SELECT COUNT(*)::int as total, ROUND(AVG(accuracy), 1) as avg_accuracy
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= NOW() - $2::interval`,
    [elderId, `${periodDays} days`]
  );
  const totalSessions = parseInt(sessionsRes.rows[0]?.total || 0, 10);
  const avgAccuracy = parseFloat(sessionsRes.rows[0]?.avg_accuracy || 0);

  const remRes = await query(
    `SELECT status, COUNT(*)::int as count
     FROM reminder_occurrences
     WHERE elder_id = $1 AND due_at >= NOW() - $2::interval
     GROUP BY status`,
    [elderId, `${periodDays} days`]
  );

  let confirmed = 0;
  let missed = 0;
  remRes.rows.forEach((r) => {
    if (r.status === 'done' || r.status === 'confirmed' || r.status === 'taken') confirmed += parseInt(r.count, 10);
    if (r.status === 'missed' || r.status === 'ignored') missed += parseInt(r.count, 10);
  });

  const gamesStatus = await getElderGamesStatus(elderId);
  const analysis = await generateCognitiveAnalysis(elderId, periodDays);

  return {
    totalSessions,
    avgAccuracy,
    medicines: { confirmed, missed },
    gamesStatus,
    analysis,
    periodDays,
  };
}

function generateSimpleDraftPdf(elderName, summary) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.fontSize(18).text(`Smriti Saathi Report - ${elderName}`, { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(summary);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Backward-compatible helper to create draft report
 */
export async function createReportDraft(elderId, periodDays = 7) {
  const stats = await computeElderStats(elderId, periodDays);
  const elderRes = await query('SELECT name FROM elders WHERE id = $1', [elderId]);
  const elderName = elderRes.rows[0]?.name || 'Elder';
  const summary = `Cognitive wellness observation report for ${elderName}. Practice observed across cognitive games with ${stats.totalSessions} sessions completed.`;
  const pdfBuffer = await generateSimpleDraftPdf(elderName, summary);

  const insertRes = await query(
    `INSERT INTO report_drafts (elder_id, period, summary_text, suggested_next_steps, stats_json, status, pdf, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, NOW(), NOW())
     RETURNING *`,
    [
      elderId,
      `${periodDays} days`,
      summary,
      JSON.stringify(stats.analysis?.recommendedNext || ['Practice gentle daily memory routine']),
      JSON.stringify(stats),
      pdfBuffer,
    ]
  );
  return insertRes.rows[0];
}

const MANDATORY_DISCLAIMER =
  'IMPORTANT NOTICE: This report contains cognitive engagement and wellness observations only. It does not provide medical diagnosis, clinical evaluation, or disease staging. For all health and medical concerns, please consult a qualified healthcare professional.';

/**
 * Generate Daily Caretaker PDF Report (covers today from 00:00 to now)
 */
export async function generateDailyCaretakerReport(elderId, reportDate = new Date()) {
  const dateStr = reportDate.toISOString().slice(0, 10);
  const startOfDay = `${dateStr}T00:00:00Z`;
  const endOfDay = `${dateStr}T23:59:59Z`;

  const elderRes = await query('SELECT * FROM elders WHERE id = $1', [elderId]);
  const elder = elderRes.rows[0];
  if (!elder) throw new Error('Elder not found');

  // 1. Fetch today's game sessions
  const sessionsRes = await query(
    `SELECT game_type, level, score, accuracy, hints_count, attempts_count,
            duration_seconds, completion_status, correct_answers, incorrect_answers, total_questions, created_at
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`,
    [elderId, startOfDay, endOfDay]
  );
  const sessions = sessionsRes.rows;

  // 2. Fetch difficulty adjustments made today
  const diffHistRes = await query(
    `SELECT game_type, old_level, new_level, reason, decided_by, created_at
     FROM adaptive_difficulty_history
     WHERE elder_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`,
    [elderId, startOfDay, endOfDay]
  );
  const difficultyAdjustments = diffHistRes.rows;

  // 3. Current difficulty levels for all 8 games
  const gamesStatus = await getElderGamesStatus(elderId);

  // 4. Activity stats
  const totalPlayed = sessions.length;
  const totalCompleted = sessions.filter((s) => s.completion_status !== 'incomplete').length;
  const incompleteCount = totalPlayed - totalCompleted;
  const avgAccuracy = totalPlayed > 0
    ? Math.round(sessions.reduce((acc, s) => acc + parseFloat(s.accuracy || 0), 0) / totalPlayed)
    : 0;

  // 5. AI Observation summary
  const aiAnalysis = await generateCognitiveAnalysis(elderId, 1);
  const summaryText = totalPlayed === 0
    ? `No cognitive practice sessions were recorded for ${elder.name} on ${dateStr}. Daily gentle stimulation is recommended when comfortable.`
    : `${elder.name} engaged in ${totalPlayed} cognitive practice activities today with an overall accuracy of ${avgAccuracy}%. ${totalCompleted} session(s) completed comfortably.`;

  const stats = {
    date: dateStr,
    totalPlayed,
    totalCompleted,
    incompleteCount,
    avgAccuracy,
    sessions,
    difficultyAdjustments,
    gamesStatus,
  };

  // 6. Generate genuine PDF buffer
  const pdfBuffer = await generateDailyPdfBuffer({
    elderName: elder.name,
    elderId: elder.id,
    dateStr,
    stats,
    aiAnalysis,
    summaryText,
  });

  // Save PDF to persistent disk
  const filename = `daily_${elder.id}_${dateStr}.pdf`;
  const filePath = path.join(reportsDir, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  // 7. Store in cognitive_activity_reports table
  const insertRes = await query(
    `INSERT INTO cognitive_activity_reports (
       elder_id, report_type, period_start, period_end, summary_text,
       ai_observations, recommendations, stats_json, pdf_path, generated_at
     ) VALUES ($1, 'daily_caretaker', $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      elderId,
      startOfDay,
      endOfDay,
      summaryText,
      JSON.stringify(aiAnalysis.comfortableActivities.concat(aiAnalysis.assistanceNeededActivities)),
      JSON.stringify(aiAnalysis.recommendedNext),
      JSON.stringify(stats),
      `/uploads/reports/${filename}`,
    ]
  );

  return {
    report: insertRes.rows[0],
    pdfBuffer,
    filename,
  };
}

/**
 * Generate Weekly Family PDF Report (covers Monday through Sunday)
 */
export async function generateWeeklyFamilyReport(elderId, endDate = new Date()) {
  const endStr = endDate.toISOString().slice(0, 10);
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().slice(0, 10);

  const elderRes = await query('SELECT * FROM elders WHERE id = $1', [elderId]);
  const elder = elderRes.rows[0];
  if (!elder) throw new Error('Elder not found');

  // 1. Fetch weekly game sessions
  const sessionsRes = await query(
    `SELECT game_type, level, score, accuracy, hints_count, attempts_count,
            duration_seconds, completion_status, created_at
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`,
    [elderId, startStr, endStr]
  );
  const sessions = sessionsRes.rows;

  // Active days count
  const activeDaysRes = await query(
    `SELECT COUNT(DISTINCT DATE(created_at))::int as active_days
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [elderId, startStr, endStr]
  );
  const activeDays = activeDaysRes.rows[0]?.active_days || 0;

  // 2. Fetch difficulty adjustments made during the week
  const diffHistRes = await query(
    `SELECT game_type, old_level, new_level, reason, decided_by, created_at
     FROM adaptive_difficulty_history
     WHERE elder_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`,
    [elderId, startStr, endStr]
  );

  // 3. Current difficulty levels for all 8 games
  const gamesStatus = await getElderGamesStatus(elderId);

  // 4. Aggregate game-wise breakdown
  const gameStats = {};
  COGNITIVE_GAMES.forEach((g) => {
    const matching = sessions.filter((s) => s.game_type === g);
    gameStats[g] = {
      sessionsCount: matching.length,
      avgAccuracy: matching.length > 0
        ? Math.round(matching.reduce((acc, s) => acc + parseFloat(s.accuracy || 0), 0) / matching.length)
        : null,
      totalHints: matching.reduce((acc, s) => acc + parseInt(s.hints_count || 0, 10), 0),
    };
  });

  const totalPlayed = sessions.length;
  const avgAccuracy = totalPlayed > 0
    ? Math.round(sessions.reduce((acc, s) => acc + parseFloat(s.accuracy || 0), 0) / totalPlayed)
    : 0;

  // 5. AI Observation summary
  const aiAnalysis = await generateCognitiveAnalysis(elderId, 7);
  const summaryText = totalPlayed === 0
    ? `No cognitive practice activities were recorded for ${elder.name} during the week of ${startStr} to ${endStr}. Family members are encouraged to spend time trying Memory Lane or Picture Matching together.`
    : `During this week, ${elder.name} completed ${totalPlayed} cognitive practice sessions across ${activeDays} active day(s) with an average accuracy of ${avgAccuracy}%. Memory exercises and daily routines were practiced with high engagement.`;

  const familyRecommendations = [
    'Celebrate every gentle step: praise completion rather than perfection.',
    'Upload recent photos from family visits into Memory Lane so games feature beloved faces and places.',
    'Record a short voice greeting from grandchildren to bring comfort and joy during audio exercises.',
  ];

  const stats = {
    period: `${startStr} to ${endStr}`,
    activeDays,
    totalPlayed,
    avgAccuracy,
    gameStats,
    gamesStatus,
    difficultyAdjustments: diffHistRes.rows,
  };

  // 6. Generate genuine PDF buffer
  const pdfBuffer = await generateWeeklyPdfBuffer({
    elderName: elder.name,
    elderId: elder.id,
    periodStr: `${startStr} to ${endStr}`,
    stats,
    aiAnalysis,
    summaryText,
    familyRecommendations,
  });

  // Save PDF to persistent disk
  const filename = `weekly_${elder.id}_${endStr}.pdf`;
  const filePath = path.join(reportsDir, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  // 7. Store in cognitive_activity_reports table
  const insertRes = await query(
    `INSERT INTO cognitive_activity_reports (
       elder_id, report_type, period_start, period_end, summary_text,
       ai_observations, recommendations, stats_json, pdf_path, generated_at
     ) VALUES ($1, 'weekly_family', $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      elderId,
      startStr,
      endStr,
      summaryText,
      JSON.stringify(aiAnalysis.comfortableActivities.concat(aiAnalysis.assistanceNeededActivities)),
      JSON.stringify(familyRecommendations),
      JSON.stringify(stats),
      `/uploads/reports/${filename}`,
    ]
  );

  return {
    report: insertRes.rows[0],
    pdfBuffer,
    filename,
  };
}

/**
 * PDF generator for Daily Caretaker Report
 */
function generateDailyPdfBuffer({ elderName, elderId, dateStr, stats, aiAnalysis, summaryText }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: { Title: `Daily Caretaker Report - ${elderName}`, Author: 'Smriti Saathi Cognitive Platform' },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Top Header Banner
      doc.rect(40, 40, 515, 65).fill('#4338CA'); // Indigo-700
      doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('SMRITI SAATHI (स्मृति साथी)', 55, 52);
      doc.fontSize(10).font('Helvetica').text(`Daily Caretaker Cognitive & Wellness Report | Date: ${dateStr}`, 55, 78);

      // Metadata card
      doc.fillColor('#1E293B').fontSize(12).font('Helvetica-Bold').text(`Elder: ${elderName} (ID: ${elderId.slice(0, 8)}...)`, 40, 120);
      doc.fontSize(9).font('Helvetica').fillColor('#64748B').text(`Generated at: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`, 40, 136);

      // Section 1: Summary Box
      doc.rect(40, 155, 515, 75).fillAndStroke('#EEF2FF', '#C7D2FE');
      doc.fillColor('#3730A3').fontSize(11).font('Helvetica-Bold').text('Daily Observation Summary:', 52, 165);
      doc.fillColor('#1E293B').fontSize(9).font('Helvetica').text(summaryText, 52, 183, { width: 490, lineGap: 2 });

      // Section 2: Metric Boxes
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('Daily Activity Metrics', 40, 245);

      const metrics = [
        { label: 'Total Played', val: `${stats.totalPlayed}`, color: '#4338CA' },
        { label: 'Completed', val: `${stats.totalCompleted}`, color: '#059669' },
        { label: 'Incomplete / Rest', val: `${stats.incompleteCount}`, color: '#D97706' },
        { label: 'Avg Accuracy', val: `${stats.avgAccuracy}%`, color: '#2563EB' },
      ];

      metrics.forEach((m, idx) => {
        const x = 40 + idx * 132;
        doc.rect(x, 262, 120, 50).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.fillColor(m.color).fontSize(16).font('Helvetica-Bold').text(m.val, x + 5, 272, { width: 110, align: 'center' });
        doc.fillColor('#64748B').fontSize(8.5).font('Helvetica').text(m.label, x + 5, 294, { width: 110, align: 'center' });
      });

      // Section 3: Current Difficulty for All 8 Games
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('8 Cognitive Games – Current Adaptive Difficulty Levels', 40, 328);

      doc.rect(40, 344, 515, 20).fill('#E2E8F0');
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold')
        .text('Cognitive Game', 50, 350)
        .text('Level', 260, 350)
        .text('Total Sessions', 360, 350)
        .text('Status', 460, 350);

      stats.gamesStatus.forEach((g, idx) => {
        const y = 366 + idx * 20;
        doc.rect(40, y, 515, 20).fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');
        const gameTitle = g.gameType.replace(/_/g, ' ').toUpperCase();
        doc.fillColor('#1E293B').fontSize(8).font('Helvetica')
          .text(gameTitle, 50, y + 5)
          .font('Helvetica-Bold')
          .text(g.level.toUpperCase(), 260, y + 5)
          .font('Helvetica')
          .text(`${g.sessionsCount}`, 360, y + 5)
          .text(g.sessionsCount > 0 ? 'Active' : 'Unplayed', 460, y + 5);
      });

      // Section 4: AI Observations & Adaptive Decisions
      let currentY = 536;
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('AI Observational Analysis & Recommended Tomorrow Activities', 40, currentY);

      currentY += 16;
      const obsLines = [
        `• Comfortable Practice: ${aiAnalysis.comfortableActivities.join('; ') || 'All attempted sessions conducted at baseline.'}`,
        `• Support Observations: ${aiAnalysis.assistanceNeededActivities.join('; ') || 'No repeated difficulties detected today.'}`,
        `• Recommended for Tomorrow: ${aiAnalysis.recommendedNext.join('; ')}`,
      ];

      obsLines.forEach((line) => {
        doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(line, 45, currentY, { width: 505, lineGap: 2 });
        currentY += 24;
      });

      // Mandatory Disclaimer Box
      doc.rect(40, 740, 515, 42).fillAndStroke('#FEF3C7', '#FDE68A');
      doc.fillColor('#92400E').fontSize(7.5).font('Helvetica-Bold')
        .text(MANDATORY_DISCLAIMER, 48, 748, { width: 500, align: 'center', lineGap: 2 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * PDF generator for Weekly Family Report
 */
function generateWeeklyPdfBuffer({ elderName, elderId, periodStr, stats, aiAnalysis, summaryText, familyRecommendations }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: { Title: `Weekly Family Report - ${elderName}`, Author: 'Smriti Saathi Cognitive Platform' },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header Banner
      doc.rect(40, 40, 515, 65).fill('#059669'); // Emerald-600
      doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('SMRITI SAATHI (स्मृति साथी)', 55, 52);
      doc.fontSize(10).font('Helvetica').text(`Weekly Family Progress & Activity Report | Period: ${periodStr}`, 55, 78);

      // Metadata card
      doc.fillColor('#1E293B').fontSize(12).font('Helvetica-Bold').text(`Elder: ${elderName}`, 40, 120);
      doc.fontSize(9).font('Helvetica').fillColor('#64748B').text(`Generated: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 40, 136);

      // Section 1: Summary Box
      doc.rect(40, 155, 515, 70).fillAndStroke('#ECFDF5', '#A7F3D0');
      doc.fillColor('#065F46').fontSize(11).font('Helvetica-Bold').text('Weekly Activity Summary:', 52, 165);
      doc.fillColor('#1E293B').fontSize(9).font('Helvetica').text(summaryText, 52, 183, { width: 490, lineGap: 2 });

      // Section 2: Metric Boxes
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('Weekly Practice Totals', 40, 240);

      const metrics = [
        { label: 'Active Days', val: `${stats.activeDays} / 7`, color: '#059669' },
        { label: 'Total Sessions', val: `${stats.totalPlayed}`, color: '#4338CA' },
        { label: 'Average Accuracy', val: `${stats.avgAccuracy}%`, color: '#2563EB' },
        { label: 'Adaptive Adjustments', val: `${stats.difficultyAdjustments.length}`, color: '#D97706' },
      ];

      metrics.forEach((m, idx) => {
        const x = 40 + idx * 132;
        doc.rect(x, 256, 120, 50).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.fillColor(m.color).fontSize(16).font('Helvetica-Bold').text(m.val, x + 5, 266, { width: 110, align: 'center' });
        doc.fillColor('#64748B').fontSize(8.5).font('Helvetica').text(m.label, x + 5, 288, { width: 110, align: 'center' });
      });

      // Section 3: Game-Wise Weekly Analysis Table
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('8 Cognitive Games – Weekly Engagement Summary', 40, 322);

      doc.rect(40, 338, 515, 20).fill('#E2E8F0');
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold')
        .text('Cognitive Game', 50, 344)
        .text('Weekly Sessions', 230, 344)
        .text('Avg Accuracy', 340, 344)
        .text('Current Level', 450, 344);

      stats.gamesStatus.forEach((g, idx) => {
        const y = 360 + idx * 20;
        doc.rect(40, y, 515, 20).fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');
        const st = stats.gameStats[g.gameType] || { sessionsCount: 0, avgAccuracy: null };
        const gameTitle = g.gameType.replace(/_/g, ' ').toUpperCase();
        doc.fillColor('#1E293B').fontSize(8).font('Helvetica')
          .text(gameTitle, 50, y + 5)
          .text(`${st.sessionsCount} sessions`, 230, y + 5)
          .text(st.avgAccuracy !== null ? `${st.avgAccuracy}%` : '—', 340, y + 5)
          .font('Helvetica-Bold')
          .text(g.level.toUpperCase(), 450, y + 5);
      });

      // Section 4: Family Engagement Recommendations
      let currentY = 532;
      doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold').text('Suggestions for Family Members & Caregivers', 40, currentY);

      currentY += 16;
      familyRecommendations.forEach((rec) => {
        doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(`• ${rec}`, 45, currentY, { width: 505, lineGap: 2 });
        currentY += 20;
      });

      // Mandatory Disclaimer Box
      doc.rect(40, 740, 515, 42).fillAndStroke('#FEF3C7', '#FDE68A');
      doc.fillColor('#92400E').fontSize(7.5).font('Helvetica-Bold')
        .text(MANDATORY_DISCLAIMER, 48, 748, { width: 500, align: 'center', lineGap: 2 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
