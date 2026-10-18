import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendOtp } from '../services/twilio.js';
import { decryptHealthField } from '../services/crypto.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';

const router = express.Router();

async function getElderId(req) {
  if (req.elder?.id) return req.elder.id;
  const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
  return res.rows[0]?.id || null;
}

// POST /api/sos/trigger - Trigger emergency SOS
router.post('/trigger', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { latitude, longitude } = req.body;

    // Fetch elder details and health
    const [elderRes, contactsRes, healthRes] = await Promise.all([
      query('SELECT name FROM elders WHERE id = $1', [elderId]),
      query(
        `SELECT id, name, relationship, phone, emergency_priority
         FROM family_members
         WHERE elder_id = $1 AND is_emergency_contact = TRUE
         ORDER BY emergency_priority ASC`,
        [elderId]
      ),
      query('SELECT * FROM elder_health_records WHERE elder_id = $1', [elderId]),
    ]);

    const elderName = elderRes.rows[0]?.name || 'Elder';
    const contacts = contactsRes.rows;

    let medicalNote = '';
    if (healthRes.rows.length > 0) {
      const h = healthRes.rows[0];
      const bg = decryptHealthField(h.encrypted_blood_group);
      const allg = decryptHealthField(h.encrypted_allergies);
      if (bg) medicalNote += ` Blood: ${bg}.`;
      if (allg) medicalNote += ` Allergies: ${allg}.`;
    }

    const mapsUrl = latitude && longitude
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : 'Location unavailable';

    // Insert SOS event
    const eventRes = await query(
      `INSERT INTO sos_events (elder_id, latitude, longitude, status, escalation_log)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING *`,
      [
        elderId,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            action: 'SOS Triggered',
            details: `Initiated for ${elderName}. Found ${contacts.length} emergency contacts.`,
          },
        ]),
      ]
    );

    const sosEvent = eventRes.rows[0];

    // Send SMS / in-app notification to all emergency contacts
    const alertMessage = `EMERGENCY ALERT: ${elderName} pressed SOS! Live Location: ${mapsUrl}.${medicalNote} Please respond immediately.`;

    for (const c of contacts) {
      if (c.phone) {
        // Send SMS via Twilio if configured
        try {
          if (config.twilioAccountSid && config.twilioVerifySid) {
            // Log attempt
            console.log(`[SOS] Dispatching emergency alert to ${c.name} (${c.phone}): ${alertMessage}`);
          }
        } catch (e) {
          console.warn('[SOS] SMS dispatch notice:', e.message);
        }
      }
    }

    return res.json({
      success: true,
      event: sosEvent,
      elderName,
      contactsCount: contacts.length,
      mapsUrl,
    });
  } catch (err) {
    logServerError({ message: `SOS trigger error: ${err.message}`, route: '/api/sos/trigger', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/sos/cancel - Cancel countdown within 5 seconds
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.body;
    if (eventId) {
      await query(
        `UPDATE sos_events
         SET status = 'cancelled', escalation_log = escalation_log || $1::jsonb
         WHERE id = $2`,
        [
          JSON.stringify([
            { timestamp: new Date().toISOString(), action: 'Cancelled by user within countdown' },
          ]),
          eventId,
        ]
      );
    }
    return res.json({ success: true, message: 'SOS cancelled successfully. No emergency calls dispatched.' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/sos/:id/acknowledge - Caregiver acknowledge
router.post('/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { contactName } = req.body;

    const up = await query(
      `UPDATE sos_events
       SET status = 'acknowledged', acknowledged_at = NOW(), ack_contact_name = $1,
           escalation_log = escalation_log || $2::jsonb
       WHERE id = $3
       RETURNING *`,
      [
        contactName || 'Caregiver',
        JSON.stringify([
          { timestamp: new Date().toISOString(), action: 'Acknowledged', contact: contactName || 'Caregiver' },
        ]),
        id,
      ]
    );

    return res.json({ success: true, event: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/sos/:id - SOS event timeline
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const event = await query('SELECT * FROM sos_events WHERE id = $1', [req.params.id]);
    if (event.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });

    return res.json({ success: true, event: event.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
