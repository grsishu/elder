import express from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logServerError } from '../errors.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max for audio/photos
  storage: multer.memoryStorage(),
});

// POST /api/elder/init-profile
// Initial onboarding profile creation
router.post('/init-profile', requireAuth, async (req, res) => {
  try {
    const { role, elderName, elderAge, elderLanguage, region = 'Assam' } = req.body;

    if (!elderName || !elderName.trim()) {
      return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Elder name is required' });
    }

    // Update user role if provided
    if (role && ['caregiver', 'health_worker', 'elder'].includes(role)) {
      await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, req.user.user_id]);
    }

    // Check if elder already exists for this user
    let elderRes = await query(`SELECT id FROM elders WHERE user_id = $1`, [req.user.user_id]);
    let elderId;

    if (elderRes.rows.length > 0) {
      elderId = elderRes.rows[0].id;
      await query(
        `UPDATE elders
         SET name = $1, age = $2, language = $3, region = $4, updated_at = NOW()
         WHERE id = $5`,
        [elderName.trim(), elderAge ? parseInt(elderAge, 10) : null, elderLanguage || 'en', region, elderId]
      );
    } else {
      const insertRes = await query(
        `INSERT INTO elders (user_id, name, age, language, region)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [req.user.user_id, elderName.trim(), elderAge ? parseInt(elderAge, 10) : null, elderLanguage || 'en', region]
      );
      elderId = insertRes.rows[0].id;

      // Create default privacy consent record (off by default)
      await query(
        `INSERT INTO elder_consent (elder_id, share_location, share_health, share_progress)
         VALUES ($1, FALSE, FALSE, FALSE)
         ON CONFLICT (elder_id) DO NOTHING`,
        [elderId]
      );
    }

    const fetched = await query(
      `SELECT id, name, age, language, region, voice_speed FROM elders WHERE id = $1`,
      [elderId]
    );

    return res.json({
      success: true,
      elder: fetched.rows[0],
      message: 'Elder profile initialized successfully',
    });
  } catch (err) {
    logServerError({
      message: `Error in init-profile: ${err.message}`,
      stack: err.stack,
      route: '/api/elder/init-profile',
      statusCode: 500,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Could not save elder profile' });
  }
});

// GET /api/elder/current
router.get('/current', requireAuth, async (req, res) => {
  if (!req.elder) {
    return res.status(404).json({ error: 'NO_ELDER_PROFILE', message: 'No elder profile found' });
  }

  const elderData = await query(
    `SELECT id, name, age, language, region, voice_speed, routine_drift_enabled,
            auto_lost_enabled, auto_lost_threshold_m, last_known_lat, last_known_lng, last_known_at
     FROM elders WHERE id = $1`,
    [req.elder.id]
  );

  const places = await query(`SELECT * FROM saved_places WHERE elder_id = $1 ORDER BY created_at ASC`, [req.elder.id]);
  const family = await query(
    `SELECT id, name, relationship, phone, address, latitude, longitude,
            (photo IS NOT NULL) as has_photo, (voice_audio IS NOT NULL) as has_voice,
            is_emergency_contact, emergency_priority
     FROM family_members WHERE elder_id = $1 ORDER BY emergency_priority ASC, created_at ASC`,
    [req.elder.id]
  );
  const drivers = await query(`SELECT * FROM drivers WHERE elder_id = $1 ORDER BY created_at ASC`, [req.elder.id]);
  const medicines = await query(`SELECT * FROM medicines WHERE elder_id = $1 ORDER BY created_at ASC`, [req.elder.id]);
  const consent = await query(`SELECT * FROM elder_consent WHERE elder_id = $1`, [req.elder.id]);

  return res.json({
    elder: elderData.rows[0],
    places: places.rows,
    family: family.rows,
    drivers: drivers.rows,
    medicines: medicines.rows,
    consent: consent.rows[0] || { share_location: false, share_health: false, share_progress: false },
  });
});

// PATCH /api/elder/settings
router.patch('/settings', requireAuth, async (req, res) => {
  if (!req.elder) {
    return res.status(404).json({ error: 'NO_ELDER_PROFILE' });
  }

  const { language, voiceSpeed, routineDriftEnabled, autoLostEnabled, autoLostThresholdM } = req.body;
  try {
    const updates = [];
    const params = [req.elder.id];
    let idx = 2;

    if (language) {
      updates.push(`language = $${idx++}`);
      params.push(language);
    }
    if (voiceSpeed !== undefined) {
      updates.push(`voice_speed = $${idx++}`);
      params.push(parseFloat(voiceSpeed));
    }
    if (routineDriftEnabled !== undefined) {
      updates.push(`routine_drift_enabled = $${idx++}`);
      params.push(Boolean(routineDriftEnabled));
    }
    if (autoLostEnabled !== undefined) {
      updates.push(`auto_lost_enabled = $${idx++}`);
      params.push(Boolean(autoLostEnabled));
    }
    if (autoLostThresholdM !== undefined) {
      updates.push(`auto_lost_threshold_m = $${idx++}`);
      params.push(parseInt(autoLostThresholdM, 10));
    }

    if (updates.length > 0) {
      await query(`UPDATE elders SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
    }

    const updated = await query(`SELECT * FROM elders WHERE id = $1`, [req.elder.id]);
    return res.json({ success: true, elder: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/elder/:elderId/photo (Authenticated bytea photo endpoint)
router.get('/:elderId/photo', requireAuth, async (req, res) => {
  try {
    const photoRes = await query(`SELECT photo, photo_mime FROM elders WHERE id = $1`, [req.params.elderId]);
    if (photoRes.rows.length === 0 || !photoRes.rows[0].photo) {
      return res.status(404).send('Photo not found');
    }
    res.setHeader('Content-Type', photoRes.rows[0].photo_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(photoRes.rows[0].photo);
  } catch (err) {
    return res.status(500).send('Error retrieving photo');
  }
});

// GET /api/elder/:elderId/family/:memberId/photo (Authenticated bytea family photo)
router.get('/:elderId/family/:memberId/photo', requireAuth, async (req, res) => {
  try {
    const photoRes = await query(
      `SELECT photo, photo_mime FROM family_members WHERE id = $1 AND elder_id = $2`,
      [req.params.memberId, req.params.elderId]
    );
    if (photoRes.rows.length === 0 || !photoRes.rows[0].photo) {
      return res.status(404).send('Photo not found');
    }
    res.setHeader('Content-Type', photoRes.rows[0].photo_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(photoRes.rows[0].photo);
  } catch (err) {
    return res.status(500).send('Error retrieving photo');
  }
});

// GET /api/elder/:elderId/family/:memberId/voice (Authenticated bytea family voice message)
router.get('/:elderId/family/:memberId/voice', requireAuth, async (req, res) => {
  try {
    const voiceRes = await query(
      `SELECT voice_audio, voice_mime FROM family_members WHERE id = $1 AND elder_id = $2`,
      [req.params.memberId, req.params.elderId]
    );
    if (voiceRes.rows.length === 0 || !voiceRes.rows[0].voice_audio) {
      return res.status(404).send('Voice recording not found');
    }
    res.setHeader('Content-Type', voiceRes.rows[0].voice_mime || 'audio/webm');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(voiceRes.rows[0].voice_audio);
  } catch (err) {
    return res.status(500).send('Error retrieving voice recording');
  }
});

export default router;
