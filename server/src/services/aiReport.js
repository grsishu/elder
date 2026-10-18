import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { query } from '../db.js';
import { config } from '../config.js';
import { logServerError } from '../errors.js';

// Banned words that imply medical diagnosis or clinical classification
const BANNED_DIAGNOSTIC_WORDS = [
  'diagnosis',
  'diagnose',
  'diagnosed',
  'dementia stage',
  'stage 1',
  'stage 2',
  'stage 3',
  'disease',
  'alzheimer',
  'alzheimers',
  'alzheimer\'s',
  'pathology',
  'clinical',
  'निदान',
  'रोग',
  'बीमारी का चरण',
  'अल्जाइमर',
  'रोग का चरण',
];

export function containsBannedWords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BANNED_DIAGNOSTIC_WORDS.some(word => lower.includes(word));
}

/**
 * Computes anonymous statistics from real DB for the given period.
 */
export async function computeElderStats(elderId, periodDays = 7) {
  const periodInterval = `${periodDays} days`;

  // 1. Game practice statistics
  const gameStatsRes = await query(
    `SELECT 
        COUNT(*)::int as total_sessions,
        COUNT(DISTINCT DATE(created_at))::int as active_days,
        ROUND(AVG(accuracy), 1) as avg_accuracy,
        ROUND(AVG(score), 1) as avg_score,
        game_type,
        COUNT(*)::int as game_count
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= NOW() - $2::interval
     GROUP BY game_type`,
    [elderId, periodInterval]
  );

  // Overall totals
  let totalSessions = 0;
  let activeDays = 0;
  let totalAccuracySum = 0;
  const gamesBreakdown = {};

  for (const row of gameStatsRes.rows) {
    totalSessions += row.game_count;
    activeDays = Math.max(activeDays, row.active_days);
    totalAccuracySum += parseFloat(row.avg_accuracy || 0) * row.game_count;
    gamesBreakdown[row.game_type] = {
      count: row.game_count,
      avgAccuracy: parseFloat(row.avg_accuracy || 0),
      avgScore: parseFloat(row.avg_score || 0),
    };
  }
  const overallAvgAccuracy = totalSessions > 0 ? Math.round(totalAccuracySum / totalSessions) : 0;

  // 2. Medicine adherence
  const medRes = await query(
    `SELECT 
        status, 
        COUNT(*)::int as count 
     FROM reminder_occurrences 
     WHERE elder_id = $1 AND reminder_type = 'medicine' AND due_at >= NOW() - $2::interval
     GROUP BY status`,
    [elderId, periodInterval]
  );

  let medsDone = 0;
  let medsMissed = 0;
  let medsScheduled = 0;
  for (const r of medRes.rows) {
    if (r.status === 'done') medsDone = r.count;
    else if (r.status === 'missed') medsMissed = r.count;
    else medsScheduled += r.count;
  }
  const totalMeds = medsDone + medsMissed;
  const adherenceRate = totalMeds > 0 ? Math.round((medsDone / totalMeds) * 100) : 100;

  // 3. Safety & Silent Guardian Events
  const sosRes = await query(
    `SELECT COUNT(*)::int as count FROM sos_events WHERE elder_id = $1 AND triggered_at >= NOW() - $2::interval`,
    [elderId, periodInterval]
  );
  const lostRes = await query(
    `SELECT COUNT(*)::int as count FROM lost_checks WHERE elder_id = $1 AND started_at >= NOW() - $2::interval AND status != 'fine'`,
    [elderId, periodInterval]
  );
  const guardianRes = await query(
    `SELECT event_type, reason, created_at FROM silent_guardian_events WHERE elder_id = $1 AND created_at >= NOW() - $2::interval ORDER BY created_at DESC LIMIT 5`,
    [elderId, periodInterval]
  );

  return {
    periodDays,
    totalSessions,
    activeDays,
    overallAvgAccuracy,
    gamesBreakdown,
    medicines: {
      totalDue: totalMeds,
      confirmed: medsDone,
      missed: medsMissed,
      adherenceRate,
    },
    safety: {
      sosCount: sosRes.rows[0]?.count || 0,
      lostEventsCount: lostRes.rows[0]?.count || 0,
      guardianNotes: guardianRes.rows,
    },
  };
}

/**
 * Builds safe template draft text without external AI.
 */
export function buildTemplateDraft(elderName, stats, lang = 'hi') {
  const { periodDays, activeDays, totalSessions, overallAvgAccuracy, medicines, safety } = stats;

  if (lang === 'hi') {
    let text = `पिछले ${periodDays} दिनों में, ${elderName} जी ने ${activeDays} दिन स्मृति अभ्यास किया और कुल ${totalSessions} खेल सत्र पूरे किए।\n`;
    text += `औसत सटीकता ${overallAvgAccuracy}% रही।\n`;
    text += `दवाओं का समय पर सेवन: ${medicines.confirmed} / ${medicines.totalDue || (medicines.confirmed + medicines.missed)} खुराक ली गईं (${medicines.adherenceRate}% समयबद्धता)।\n`;
    if (safety.sosCount === 0 && safety.lostEventsCount === 0) {
      text += `इस अवधि में कोई आपातकालीन अलार्म या भटकाव की घटना दर्ज नहीं हुई। सुरक्षा स्थिति सामान्य रही।`;
    } else {
      text += `सुरक्षा सूचना: ${safety.sosCount} आपातकालीन संकेत और ${safety.lostEventsCount} स्थान भटकाव जांच दर्ज की गई।`;
    }

    const nextSteps = `1. प्रतिदिन निर्धारित समय पर स्मृति अभ्यास जारी रखें।\n2. पानी और दवाओं की दैनिक समय सारिणी का पालन कराएं।\n3. यदि किसी खेल में लगातार कठिनाई दिखे, तो पारिवारिक बातचीत बढ़ाएं और आवश्यकता होने पर डॉक्टर से परामर्श लें।`;

    return { summaryText: text, suggestedNextSteps: nextSteps };
  } else {
    let text = `Over the last ${periodDays} days, ${elderName} engaged in cognitive practice on ${activeDays} days, completing ${totalSessions} sessions.\n`;
    text += `Overall average practice accuracy was ${overallAvgAccuracy}%.\n`;
    text += `Medicine adherence: ${medicines.confirmed} of ${medicines.totalDue || (medicines.confirmed + medicines.missed)} scheduled doses were confirmed (${medicines.adherenceRate}% adherence).\n`;
    if (safety.sosCount === 0 && safety.lostEventsCount === 0) {
      text += `No emergency SOS triggers or lost-wandering incidents occurred during this period. Safety routine remained stable.`;
    } else {
      text += `Safety Notice: ${safety.sosCount} SOS alert(s) and ${safety.lostEventsCount} wandering checks were recorded.`;
    }

    const nextSteps = `1. Maintain regular daily practice at comfortable times.\n2. Ensure routine hydration and medicine schedules are followed.\n3. Keep family photos and familiar voices updated in the app for positive engagement.`;

    return { summaryText: text, suggestedNextSteps: nextSteps };
  }
}

/**
 * Calls Gemini with ANONYMOUS numbers only, and validates banned words.
 */
export async function polishDraftWithGemini(anonymousStats, lang = 'hi') {
  if (!config.geminiApiKey) {
    return null;
  }

  const prompt = `You are a respectful, empathetic health assistant writing an observation summary for a family caregiver of an elder in North East India.
Here are the anonymous statistics for the last ${anonymousStats.periodDays} days:
- Active Practice Days: ${anonymousStats.activeDays} of ${anonymousStats.periodDays} days
- Total Brain Exercise Sessions: ${anonymousStats.totalSessions}
- Average Practice Accuracy: ${anonymousStats.overallAvgAccuracy}%
- Medicine Doses Confirmed: ${anonymousStats.medicines.confirmed} out of ${anonymousStats.medicines.totalDue} (${anonymousStats.medicines.adherenceRate}%)
- Emergency SOS Triggers: ${anonymousStats.safety.sosCount}
- Lost/Wandering Checks: ${anonymousStats.safety.lostEventsCount}

INSTRUCTIONS:
1. Write in plain, encouraging words in ${lang === 'hi' ? 'Hindi' : 'English'}.
2. CRITICAL RULE: NEVER use diagnostic words or clinical stage labels (DO NOT mention diagnosis, dementia stage, disease, Alzheimer's, or clinical prognosis).
3. Do not include any personal names or phone numbers.
4. Provide two sections: "Summary" and "Suggested Next Steps".
Output format:
SUMMARY: <text>
NEXT_STEPS: <text>`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiApiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn('[Gemini] Request failed with status:', resp.status);
      return null;
    }

    const json = await resp.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    // Reject if model generated any banned diagnostic term
    if (containsBannedWords(rawText)) {
      console.warn('[Gemini] Output rejected due to banned diagnostic wording.');
      return null;
    }

    let summaryText = rawText;
    let suggestedNextSteps = '';

    if (rawText.includes('SUMMARY:') && rawText.includes('NEXT_STEPS:')) {
      const parts = rawText.split('NEXT_STEPS:');
      summaryText = parts[0].replace('SUMMARY:', '').trim();
      suggestedNextSteps = parts[1].trim();
    }

    return {
      summaryText,
      suggestedNextSteps: suggestedNextSteps || '1. Continue daily cognitive practice.\n2. Stay connected with family.',
    };
  } catch (err) {
    console.warn('[Gemini] API error:', err.message);
    return null;
  }
}

/**
 * Creates and saves report draft in report_drafts table.
 */
export async function createReportDraft(elderId, periodDays = 7) {
  const elderRes = await query(`SELECT name, language, photo, photo_mime FROM elders WHERE id = $1`, [elderId]);
  if (elderRes.rows.length === 0) throw new Error('Elder not found');
  const elder = elderRes.rows[0];

  const stats = await computeElderStats(elderId, periodDays);

  // 1. Build template draft
  const template = buildTemplateDraft(elder.name, stats, elder.language || 'hi');
  let finalSummary = template.summaryText;
  let finalNextSteps = template.suggestedNextSteps;
  let aiPolished = false;

  // 2. Try polishing with Gemini (anonymous only)
  try {
    const aiResult = await polishDraftWithGemini(stats, elder.language || 'hi');
    if (aiResult && aiResult.summaryText) {
      finalSummary = aiResult.summaryText;
      if (aiResult.suggestedNextSteps) finalNextSteps = aiResult.suggestedNextSteps;
      aiPolished = true;
    }
  } catch (err) {
    console.warn('[Report] Fallback to template draft:', err.message);
  }

  // 3. Generate PDF Buffer with pdfkit
  const pdfBuffer = await generateReportPdf({
    elderName: elder.name,
    elderPhoto: elder.photo,
    periodDays,
    summaryText: finalSummary,
    suggestedNextSteps: finalNextSteps,
    stats,
    language: elder.language || 'hi',
  });

  // 4. Save to report_drafts table
  const insertRes = await query(
    `INSERT INTO report_drafts (elder_id, period, status, language, summary_text, suggested_next_steps, stats_json, pdf)
     VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7)
     RETURNING id, elder_id, period, status, language, summary_text, suggested_next_steps, stats_json, created_at`,
    [
      elderId,
      `${periodDays}_days`,
      elder.language || 'hi',
      finalSummary,
      finalNextSteps,
      JSON.stringify(stats),
      pdfBuffer,
    ]
  );

  return {
    ...insertRes.rows[0],
    aiPolished,
  };
}

/**
 * Draws charts and generates PDF with pdfkit.
 */
export function generateReportPdf({
  elderName,
  periodDays,
  summaryText,
  suggestedNextSteps,
  stats,
  language = 'hi',
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Smriti Saathi Report - ${elderName}`,
          Author: 'Smriti Saathi Cognitive Guardian',
        },
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Primary header
      doc.rect(50, 50, 495, 75).fill('#78350F');
      doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('SMRITI SAATHI (स्मृति साथी)', 70, 65);
      doc.fontSize(11).font('Helvetica').text(`Elder Observation Report | Period: Last ${periodDays} Days`, 70, 95);

      // Metadata card
      doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text(`Elder: ${elderName}`, 50, 145);
      doc.fontSize(10).font('Helvetica').fillColor('#64748B').text(`Generated: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 50, 165);

      // Section 1: Summary Box
      doc.rect(50, 190, 495, 110).fillAndStroke('#FEF3C7', '#F59E0B');
      doc.fillColor('#92400E').fontSize(12).font('Helvetica-Bold').text('Observation Summary:', 65, 202);
      doc.fillColor('#1E293B').fontSize(10).font('Helvetica').text(summaryText, 65, 222, { width: 465, lineGap: 3 });

      // Section 2: Visual Statistics (Drawn with pdfkit vector primitives)
      doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Key Practice Metrics', 50, 320);

      // Metric Boxes
      const metrics = [
        { label: 'Active Days', val: `${stats.activeDays} / ${periodDays}`, color: '#2563EB' },
        { label: 'Total Sessions', val: `${stats.totalSessions}`, color: '#7C3AED' },
        { label: 'Avg Accuracy', val: `${stats.overallAvgAccuracy}%`, color: '#059669' },
        { label: 'Medicine Adherence', val: `${stats.medicines.adherenceRate}%`, color: '#D97706' },
      ];

      metrics.forEach((m, idx) => {
        const x = 50 + idx * 128;
        doc.rect(x, 345, 115, 60).fillAndStroke('#F8FAFC', '#CBD5E1');
        doc.fillColor(m.color).fontSize(16).font('Helvetica-Bold').text(m.val, x + 10, 360, { width: 95, align: 'center' });
        doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(m.label, x + 10, 385, { width: 95, align: 'center' });
      });

      // Section 3: Medicine & Safety Breakdown Table
      doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Safety & Adherence Log', 50, 435);

      doc.rect(50, 455, 495, 24).fill('#E2E8F0');
      doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold')
        .text('Metric Item', 60, 462)
        .text('Record Status', 320, 462)
        .text('Evaluation', 440, 462);

      const tableRows = [
        ['Prescribed Medicine Doses', `${stats.medicines.confirmed} Confirmed / ${stats.medicines.missed} Missed`, stats.medicines.adherenceRate >= 80 ? 'Good' : 'Needs Support'],
        ['Emergency SOS Signals', `${stats.safety.sosCount} Recorded`, stats.safety.sosCount === 0 ? 'Clear' : 'Attention'],
        ['Location Wandering Checks', `${stats.safety.lostEventsCount} Recorded`, stats.safety.lostEventsCount === 0 ? 'Clear' : 'Attention'],
      ];

      tableRows.forEach((r, idx) => {
        const y = 485 + idx * 26;
        doc.rect(50, y, 495, 26).fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');
        doc.fillColor('#1E293B').fontSize(9).font('Helvetica')
          .text(r[0], 60, y + 8)
          .text(r[1], 320, y + 8)
          .font('Helvetica-Bold')
          .text(r[2], 440, y + 8);
      });

      // Section 4: Suggested Next Steps
      if (suggestedNextSteps) {
        doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('Suggested Next Steps:', 50, 580);
        doc.fillColor('#334155').fontSize(9.5).font('Helvetica').text(suggestedNextSteps, 50, 600, { width: 495, lineGap: 3 });
      }

      // Mandatory Footer on Every Page
      const disclaimer = 'This report contains observations only. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns.';
      doc.rect(50, 730, 495, 40).fillAndStroke('#FFFBEB', '#FDE68A');
      doc.fillColor('#B45309').fontSize(8.5).font('Helvetica-Bold').text(disclaimer, 60, 742, { width: 475, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
