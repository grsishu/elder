import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendWebPushNotification } from '../services/push.js';
import { logServerError } from '../errors.js';

const router = express.Router();

async function getElderId(req) {
  if (req.elder?.id) return req.elder.id;
  const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
  return res.rows[0]?.id || null;
}

// GET /api/reminders/schedules - All schedules for elder
router.get('/schedules', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const schedules = await query(
      `SELECT * FROM reminder_schedules WHERE elder_id = $1 ORDER BY time_of_day ASC`,
      [elderId]
    );
    const medicines = await query(
      `SELECT * FROM medicines WHERE elder_id = $1 ORDER BY created_at ASC`,
      [elderId]
    );

    return res.json({ success: true, schedules: schedules.rows, medicines: medicines.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/schedules - Create schedule
router.post('/schedules', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { reminderType, title, description, timeOfDay, daysOfWeek = [0, 1, 2, 3, 4, 5, 6], metadata = {} } = req.body;

    if (!title || !timeOfDay) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Title and time are required' });
    }

    const ins = await query(
      `INSERT INTO reminder_schedules (elder_id, reminder_type, title, description, time_of_day, days_of_week, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [elderId, reminderType || 'activity', title.trim(), description || '', timeOfDay, JSON.stringify(daysOfWeek), JSON.stringify(metadata)]
    );

    return res.json({ success: true, schedule: ins.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reminders/active - Currently active or due occurrences for Talking Alarm
router.get('/active', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    // Find occurrences due within the last 30 minutes that are still 'scheduled' or 'sent'
    const occurrences = await query(
      `SELECT o.*, s.metadata, s.description as schedule_description
       FROM reminder_occurrences o
       LEFT JOIN reminder_schedules s ON s.id = o.schedule_id
       WHERE o.elder_id = $1 AND o.status IN ('scheduled', 'sent')
         AND o.due_at <= NOW() + INTERVAL '2 minutes'
         AND o.due_at >= NOW() - INTERVAL '45 minutes'
       ORDER BY o.due_at ASC`,
      [elderId]
    );

    return res.json({ success: true, occurrences: occurrences.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/:id/done - Mark occurrence completed
router.post('/:id/done', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const occRes = await query(
      `UPDATE reminder_occurrences
       SET status = 'done', completed_at = NOW(), ack_by_user_id = $1
       WHERE id = $2
       RETURNING *`,
      [req.user.user_id, id]
    );

    if (occRes.rows.length === 0) {
      return res.status(404).json({ error: 'OCCURRENCE_NOT_FOUND' });
    }

    const occ = occRes.rows[0];

    // If it's a medicine, decrement tablets_remaining and check refill
    let refillWarning = null;
    if (occ.reminder_type === 'medicine') {
      const sched = await query('SELECT metadata FROM reminder_schedules WHERE id = $1', [occ.schedule_id]);
      const medId = sched.rows[0]?.metadata?.medicine_id;
      if (medId) {
        const medUp = await query(
          `UPDATE medicines
           SET tablets_remaining = GREATEST(0, tablets_remaining - 1)
           WHERE id = $1
           RETURNING id, name, tablets_remaining, refill_threshold`,
          [medId]
        );
        if (medUp.rows.length > 0) {
          const med = medUp.rows[0];
          if (med.tablets_remaining <= med.refill_threshold) {
            refillWarning = {
              medicine: med.name,
              remaining: med.tablets_remaining,
              threshold: med.refill_threshold,
            };
          }
        }
      }
    }

    return res.json({ success: true, occurrence: occ, refillWarning });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/:id/snooze - Snooze by 10 minutes
router.post('/:id/snooze', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const occRes = await query(
      `UPDATE reminder_occurrences
       SET due_at = NOW() + INTERVAL '10 minutes', status = 'scheduled'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({ success: true, occurrence: occRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/:id/skip - Skip reminder
router.post('/:id/skip', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const occRes = await query(
      `UPDATE reminder_occurrences
       SET status = 'missed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({ success: true, occurrence: occRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/reminders/health - Diagnostics for reminders & push
router.get('/health', requireAuth, async (req, res) => {
  try {
    const [subCount, pushLogs, missedCount] = await Promise.all([
      query('SELECT COUNT(*)::int as c FROM push_subscriptions'),
      query('SELECT * FROM push_logs ORDER BY created_at DESC LIMIT 15'),
      query("SELECT COUNT(*)::int as c FROM reminder_occurrences WHERE status = 'missed' AND created_at >= NOW() - INTERVAL '7 days'"),
    ]);

    return res.json({
      success: true,
      subscriptionsCount: subCount.rows[0]?.c || 0,
      recentLogs: pushLogs.rows,
      missedReminders7d: missedCount.rows[0]?.c || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/push/subscribe - Register push subscription
router.post('/push/subscribe', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });
    }

    await query(
      `INSERT INTO push_subscriptions (user_id, elder_id, endpoint, keys, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (endpoint) DO UPDATE
       SET keys = EXCLUDED.keys, updated_at = NOW()`,
      [req.user.user_id, elderId, subscription.endpoint, JSON.stringify(subscription.keys)]
    );

    return res.json({ success: true, message: 'Push subscription saved' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/reminders/push/test - Test push
router.post('/push/test', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    const result = await sendWebPushNotification({
      userId: req.user.user_id,
      elderId,
      title: 'स्मृति साथी टेस्ट रिमाइंडर (Smriti Saathi)',
      body: 'यह एक परीक्षण सूचना है। आपकी सूचना प्रणाली चालू है।',
      data: { tag: 'test-push', timestamp: Date.now() },
    });

    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
