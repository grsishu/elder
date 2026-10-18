import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptHealthField, decryptHealthField } from '../services/crypto.js';
import { logServerError } from '../errors.js';
import { config } from '../config.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  storage: multer.memoryStorage(),
});

// Helper to ensure elder exists for the requesting user
async function getOrCreateElder(userId) {
  let res = await query('SELECT * FROM elders WHERE user_id = $1 LIMIT 1', [userId]);
  if (res.rows.length > 0) return res.rows[0];

  const insert = await query(
    `INSERT INTO elders (user_id, name, age, language, region)
     VALUES ($1, 'Ramesh', 74, 'hi', 'Assam')
     RETURNING *`,
    [userId]
  );
  return insert.rows[0];
}

// GET /api/wizard/state - Full wizard state for resume
router.get('/state', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const elderId = elder.id;

    const [placesRes, familyRes, driversRes, medicinesRes, healthRes, consentRes] = await Promise.all([
      query('SELECT * FROM saved_places WHERE elder_id = $1 ORDER BY created_at ASC', [elderId]),
      query(
        `SELECT id, elder_id, name, relationship, phone, address, latitude, longitude,
                (photo IS NOT NULL) as has_photo,
                (voice_audio IS NOT NULL) as has_voice,
                is_emergency_contact, emergency_priority, created_at
         FROM family_members WHERE elder_id = $1 ORDER BY emergency_priority ASC, created_at ASC`,
        [elderId]
      ),
      query('SELECT * FROM drivers WHERE elder_id = $1 ORDER BY created_at ASC', [elderId]),
      query('SELECT * FROM medicines WHERE elder_id = $1 ORDER BY created_at ASC', [elderId]),
      query('SELECT * FROM elder_health_records WHERE elder_id = $1 LIMIT 1', [elderId]),
      query('SELECT * FROM elder_consent WHERE elder_id = $1 LIMIT 1', [elderId]),
    ]);

    let healthDecrypted = {
      bloodGroup: '',
      allergies: '',
      doctorName: '',
      doctorPhone: '',
      conditions: '',
    };

    if (healthRes.rows.length > 0) {
      const h = healthRes.rows[0];
      healthDecrypted = {
        bloodGroup: decryptHealthField(h.encrypted_blood_group) || '',
        allergies: decryptHealthField(h.encrypted_allergies) || '',
        doctorName: decryptHealthField(h.encrypted_doctor_name) || '',
        doctorPhone: decryptHealthField(h.encrypted_doctor_phone) || '',
        conditions: decryptHealthField(h.encrypted_conditions) || '',
      };
    }

    return res.json({
      success: true,
      elder,
      places: placesRes.rows,
      family: familyRes.rows,
      drivers: driversRes.rows,
      medicines: medicinesRes.rows,
      health: healthDecrypted,
      consent: consentRes.rows[0] || { share_location: false, share_health: false, share_progress: false },
    });
  } catch (err) {
    logServerError({ message: `Wizard state error: ${err.message}`, route: '/api/wizard/state', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-1 - Elder Details
router.post('/step-1', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { name, age, language, region, voiceSpeed, photoBase64 } = req.body;

    let photoBuffer = null;
    let photoMime = null;
    if (req.file) {
      photoBuffer = req.file.buffer;
      photoMime = req.file.mimetype;
    } else if (photoBase64 && photoBase64.includes('base64,')) {
      const parts = photoBase64.split('base64,');
      photoMime = parts[0].replace('data:', '').replace(';', '');
      photoBuffer = Buffer.from(parts[1], 'base64');
    }

    const updates = [];
    const params = [elder.id];
    let idx = 2;

    if (name) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (age) { updates.push(`age = $${idx++}`); params.push(parseInt(age, 10)); }
    if (language) { updates.push(`language = $${idx++}`); params.push(language); }
    if (region) { updates.push(`region = $${idx++}`); params.push(region); }
    if (voiceSpeed) { updates.push(`voice_speed = $${idx++}`); params.push(parseFloat(voiceSpeed)); }
    if (photoBuffer) {
      updates.push(`photo = $${idx++}`); params.push(photoBuffer);
      updates.push(`photo_mime = $${idx++}`); params.push(photoMime);
    }

    if (updates.length > 0) {
      await query(`UPDATE elders SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
    }

    const updated = await query('SELECT id, name, age, language, region, voice_speed FROM elders WHERE id = $1', [elder.id]);
    return res.json({ success: true, elder: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-2 - Home Address
router.post('/step-2', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { address, latitude, longitude, name = 'Home' } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'LOCATION_REQUIRED', message: 'Latitude and Longitude are required' });
    }

    // Upsert Home in saved_places
    const existing = await query(
      "SELECT id FROM saved_places WHERE elder_id = $1 AND place_type = 'home' LIMIT 1",
      [elder.id]
    );

    let savedPlace;
    if (existing.rows.length > 0) {
      const up = await query(
        `UPDATE saved_places
         SET name = $1, address = $2, latitude = $3, longitude = $4
         WHERE id = $5 RETURNING *`,
        [name, address || 'Home', parseFloat(latitude), parseFloat(longitude), existing.rows[0].id]
      );
      savedPlace = up.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type)
         VALUES ($1, $2, $3, $4, $5, 'home')
         RETURNING *`,
        [elder.id, name, address || 'Home', parseFloat(latitude), parseFloat(longitude)]
      );
      savedPlace = ins.rows[0];
    }

    // Also update elder last_known position if null
    await query(
      `UPDATE elders
       SET last_known_lat = COALESCE(last_known_lat, $1),
           last_known_lng = COALESCE(last_known_lng, $2),
           last_known_at = COALESCE(last_known_at, NOW())
       WHERE id = $3`,
      [parseFloat(latitude), parseFloat(longitude), elder.id]
    );

    return res.json({ success: true, place: savedPlace });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-3/family - Add / Update Family Member with Photo & Voice
router.post(
  '/step-3/family',
  requireAuth,
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'voice', maxCount: 1 }]),
  async (req, res) => {
    try {
      const elder = await getOrCreateElder(req.user.user_id);
      const {
        id,
        name,
        relationship,
        phone,
        address,
        latitude,
        longitude,
        isEmergencyContact,
        emergencyPriority,
        photoBase64,
        voiceBase64,
      } = req.body;

      if (!name || !relationship || !phone) {
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name, relationship, and phone are required' });
      }

      let photoBuffer = null;
      let photoMime = null;
      if (req.files && req.files.photo) {
        photoBuffer = req.files.photo[0].buffer;
        photoMime = req.files.photo[0].mimetype;
      } else if (photoBase64 && photoBase64.includes('base64,')) {
        const parts = photoBase64.split('base64,');
        photoMime = parts[0].replace('data:', '').replace(';', '');
        photoBuffer = Buffer.from(parts[1], 'base64');
      }

      let voiceBuffer = null;
      let voiceMime = null;
      if (req.files && req.files.voice) {
        voiceBuffer = req.files.voice[0].buffer;
        voiceMime = req.files.voice[0].mimetype;
      } else if (voiceBase64 && voiceBase64.includes('base64,')) {
        const parts = voiceBase64.split('base64,');
        voiceMime = parts[0].replace('data:', '').replace(';', '');
        voiceBuffer = Buffer.from(parts[1], 'base64');
      }

      let member;
      if (id) {
        const updates = [
          'name = $1', 'relationship = $2', 'phone = $3', 'address = $4',
          'latitude = $5', 'longitude = $6', 'is_emergency_contact = $7', 'emergency_priority = $8'
        ];
        const params = [
          name.trim(), relationship.trim(), phone.trim(), address || '',
          latitude ? parseFloat(latitude) : null,
          longitude ? parseFloat(longitude) : null,
          Boolean(isEmergencyContact === 'true' || isEmergencyContact === true),
          emergencyPriority ? parseInt(emergencyPriority, 10) : 99,
          id, elder.id
        ];
        let idx = 11;
        if (photoBuffer) {
          updates.push(`photo = $9, photo_mime = $10`);
          params.splice(8, 0, photoBuffer, photoMime);
        }
        if (voiceBuffer) {
          updates.push(`voice_audio = $${idx++}, voice_mime = $${idx++}`);
          params.push(voiceBuffer, voiceMime);
        }

        const up = await query(
          `UPDATE family_members
           SET ${updates.join(', ')}
           WHERE id = $${params.length - (voiceBuffer ? 3 : 1)} AND elder_id = $${params.length - (voiceBuffer ? 2 : 0)}
           RETURNING id, name, relationship, phone, address, latitude, longitude,
                     (photo IS NOT NULL) as has_photo, (voice_audio IS NOT NULL) as has_voice,
                     is_emergency_contact, emergency_priority`,
          params
        );
        member = up.rows[0];
      } else {
        const ins = await query(
          `INSERT INTO family_members (
             elder_id, name, relationship, phone, address, latitude, longitude,
             photo, photo_mime, voice_audio, voice_mime, is_emergency_contact, emergency_priority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, name, relationship, phone, address, latitude, longitude,
                     (photo IS NOT NULL) as has_photo, (voice_audio IS NOT NULL) as has_voice,
                     is_emergency_contact, emergency_priority`,
          [
            elder.id, name.trim(), relationship.trim(), phone.trim(), address || '',
            latitude ? parseFloat(latitude) : null,
            longitude ? parseFloat(longitude) : null,
            photoBuffer, photoMime, voiceBuffer, voiceMime,
            Boolean(isEmergencyContact === 'true' || isEmergencyContact === true),
            emergencyPriority ? parseInt(emergencyPriority, 10) : 99,
          ]
        );
        member = ins.rows[0];
      }

      // If family member has a pin and address, auto-save to saved_places if not already there
      if (address && latitude && longitude) {
        await query(
          `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type)
           VALUES ($1, $2, $3, $4, $5, 'family')
           ON CONFLICT DO NOTHING`,
          [elder.id, `${name}'s House (${relationship})`, address, parseFloat(latitude), parseFloat(longitude)]
        );
      }

      return res.json({ success: true, member });
    } catch (err) {
      logServerError({ message: `Family save error: ${err.message}`, route: '/api/wizard/step-3/family', statusCode: 500 });
      return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// DELETE /api/wizard/family/:id
router.delete('/family/:id', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    await query('DELETE FROM family_members WHERE id = $1 AND elder_id = $2', [req.params.id, elder.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-4/places - Add / Update Saved Place
router.post('/step-4/places', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { id, name, address, latitude, longitude, placeType = 'other' } = req.body;

    if (!name || !latitude || !longitude) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name, latitude, and longitude are required' });
    }

    let place;
    if (id) {
      const up = await query(
        `UPDATE saved_places
         SET name = $1, address = $2, latitude = $3, longitude = $4, place_type = $5
         WHERE id = $6 AND elder_id = $7 RETURNING *`,
        [name.trim(), address || '', parseFloat(latitude), parseFloat(longitude), placeType, id, elder.id]
      );
      place = up.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [elder.id, name.trim(), address || '', parseFloat(latitude), parseFloat(longitude), placeType]
      );
      place = ins.rows[0];
    }

    return res.json({ success: true, place });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/wizard/places/:id
router.delete('/places/:id', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    await query('DELETE FROM saved_places WHERE id = $1 AND elder_id = $2', [req.params.id, elder.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-5/emergency - Update Emergency Priority Ordering
router.post('/step-5/emergency', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { contacts } = req.body; // Array of { id, emergencyPriority, isEmergencyContact }

    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        await query(
          `UPDATE family_members
           SET is_emergency_contact = $1, emergency_priority = $2
           WHERE id = $3 AND elder_id = $4`,
          [Boolean(c.isEmergencyContact), parseInt(c.emergencyPriority || 99, 10), c.id, elder.id]
        );
      }
    }

    const updated = await query(
      `SELECT id, name, relationship, phone, is_emergency_contact, emergency_priority
       FROM family_members WHERE elder_id = $1 ORDER BY emergency_priority ASC`,
      [elder.id]
    );

    return res.json({ success: true, contacts: updated.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-6/drivers - Add / Update Driver
router.post('/step-6/drivers', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { id, name, phone, vehicleType = 'auto', area = '', notes = '' } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name and phone are required' });
    }

    let driver;
    if (id) {
      const up = await query(
        `UPDATE drivers
         SET name = $1, phone = $2, vehicle_type = $3, area = $4, notes = $5
         WHERE id = $6 AND elder_id = $7 RETURNING *`,
        [name.trim(), phone.trim(), vehicleType, area.trim(), notes.trim(), id, elder.id]
      );
      driver = up.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO drivers (elder_id, name, phone, vehicle_type, area, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [elder.id, name.trim(), phone.trim(), vehicleType, area.trim(), notes.trim()]
      );
      driver = ins.rows[0];
    }

    return res.json({ success: true, driver });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/wizard/drivers/:id
router.delete('/drivers/:id', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    await query('DELETE FROM drivers WHERE id = $1 AND elder_id = $2', [req.params.id, elder.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-7/medicines - Add / Update Medicine
router.post('/step-7/medicines', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const {
      id,
      name,
      dose,
      shapeColor = 'round-white',
      timesPerDay = ['08:00'],
      beforeAfterFood = 'after',
      daysOfWeek = [0, 1, 2, 3, 4, 5, 6],
      tabletsRemaining = 30,
      refillThreshold = 5,
      notes = '',
    } = req.body;

    if (!name || !dose) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Medicine name and dose are required' });
    }

    let med;
    if (id) {
      const up = await query(
        `UPDATE medicines
         SET name = $1, dose = $2, shape_color = $3, times_per_day = $4,
             before_after_food = $5, days_of_week = $6, tablets_remaining = $7,
             refill_threshold = $8, notes = $9
         WHERE id = $10 AND elder_id = $11 RETURNING *`,
        [
          name.trim(), dose.trim(), shapeColor,
          JSON.stringify(timesPerDay), beforeAfterFood,
          JSON.stringify(daysOfWeek),
          parseInt(tabletsRemaining || 30, 10),
          parseInt(refillThreshold || 5, 10),
          notes.trim(), id, elder.id
        ]
      );
      med = up.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO medicines (
           elder_id, name, dose, shape_color, times_per_day, before_after_food,
           days_of_week, tablets_remaining, refill_threshold, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          elder.id, name.trim(), dose.trim(), shapeColor,
          JSON.stringify(timesPerDay), beforeAfterFood,
          JSON.stringify(daysOfWeek),
          parseInt(tabletsRemaining || 30, 10),
          parseInt(refillThreshold || 5, 10),
          notes.trim()
        ]
      );
      med = ins.rows[0];
    }

    // Auto-create reminder schedule records for this medicine
    const times = Array.isArray(timesPerDay) ? timesPerDay : ['08:00'];
    for (const t of times) {
      await query(
        `INSERT INTO reminder_schedules (elder_id, reminder_type, title, description, time_of_day, days_of_week, metadata)
         VALUES ($1, 'medicine', $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          elder.id,
          `${name} (${dose})`,
          `${beforeAfterFood === 'before' ? 'Before Food' : 'After Food'}. Notes: ${notes || 'Take with warm water'}`,
          t,
          JSON.stringify(daysOfWeek),
          JSON.stringify({ medicine_id: med.id, shape_color: shapeColor }),
        ]
      );
    }

    return res.json({ success: true, medicine: med });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/wizard/medicines/:id
router.delete('/medicines/:id', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    await query('DELETE FROM medicines WHERE id = $1 AND elder_id = $2', [req.params.id, elder.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-8/health - Encrypted Health Details
router.post('/step-8/health', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { bloodGroup, allergies, doctorName, doctorPhone, conditions } = req.body;

    const encBlood = encryptHealthField(bloodGroup);
    const encAllergies = encryptHealthField(allergies);
    const encDocName = encryptHealthField(doctorName);
    const encDocPhone = encryptHealthField(doctorPhone);
    const encConditions = encryptHealthField(conditions);

    await query(
      `INSERT INTO elder_health_records (
         elder_id, encrypted_blood_group, encrypted_allergies,
         encrypted_doctor_name, encrypted_doctor_phone, encrypted_conditions, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (elder_id) DO UPDATE
       SET encrypted_blood_group = EXCLUDED.encrypted_blood_group,
           encrypted_allergies = EXCLUDED.encrypted_allergies,
           encrypted_doctor_name = EXCLUDED.encrypted_doctor_name,
           encrypted_doctor_phone = EXCLUDED.encrypted_doctor_phone,
           encrypted_conditions = EXCLUDED.encrypted_conditions,
           updated_at = NOW()`,
      [elder.id, encBlood, encAllergies, encDocName, encDocPhone, encConditions]
    );

    return res.json({
      success: true,
      message: 'Health record encrypted and saved securely with AES-256-GCM',
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/step-9/consent - Privacy Consent
router.post('/step-9/consent', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const { shareLocation, shareHealth, shareProgress } = req.body;

    const up = await query(
      `INSERT INTO elder_consent (elder_id, share_location, share_health, share_progress, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (elder_id) DO UPDATE
       SET share_location = EXCLUDED.share_location,
           share_health = EXCLUDED.share_health,
           share_progress = EXCLUDED.share_progress,
           updated_at = NOW()
       RETURNING *`,
      [elder.id, Boolean(shareLocation), Boolean(shareHealth), Boolean(shareProgress)]
    );

    return res.json({ success: true, consent: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/family/generate-token - 7-day revocable upload link
router.post('/family/generate-token', requireAuth, async (req, res) => {
  try {
    const elder = await getOrCreateElder(req.user.user_id);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO family_upload_tokens (elder_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [elder.id, token, expiresAt]
    );

    const fullUrl = `${config.publicBaseUrl}/family/upload/${token}`;
    return res.json({ success: true, token, expiresAt, url: fullUrl });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/wizard/family/upload/:token - Public check for upload token
router.get('/family/upload/:token', async (req, res) => {
  try {
    const tokenRes = await query(
      `SELECT t.id, t.elder_id, t.expires_at, t.status, e.name as elder_name
       FROM family_upload_tokens t
       JOIN elders e ON e.id = t.elder_id
       WHERE t.token = $1 AND t.expires_at > NOW()`,
      [req.params.token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(404).json({ error: 'TOKEN_INVALID_OR_EXPIRED', message: 'This upload link is invalid or has expired (7-day limit).' });
    }

    return res.json({ success: true, tokenInfo: tokenRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/wizard/family/upload/:token - Public submission by relative
router.post(
  '/family/upload/:token',
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'voice', maxCount: 1 }]),
  async (req, res) => {
    try {
      const tokenRes = await query(
        `SELECT id, elder_id FROM family_upload_tokens
         WHERE token = $1 AND expires_at > NOW() AND status = 'pending'`,
        [req.params.token]
      );

      if (tokenRes.rows.length === 0) {
        return res.status(400).json({ error: 'TOKEN_EXPIRED_OR_USED', message: 'Upload link is invalid or already used.' });
      }

      const { name, relationship, phone } = req.body;
      const elderId = tokenRes.rows[0].elder_id;

      let photoBuffer = req.files?.photo?.[0]?.buffer || null;
      let photoMime = req.files?.photo?.[0]?.mimetype || null;
      let voiceBuffer = req.files?.voice?.[0]?.buffer || null;
      let voiceMime = req.files?.voice?.[0]?.mimetype || null;

      // Insert directly into family_members
      const member = await query(
        `INSERT INTO family_members (
           elder_id, name, relationship, phone, photo, photo_mime, voice_audio, voice_mime
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, relationship, phone`,
        [elderId, name.trim(), relationship.trim(), phone.trim(), photoBuffer, photoMime, voiceBuffer, voiceMime]
      );

      // Mark token submitted
      await query(
        `UPDATE family_upload_tokens
         SET status = 'completed', uploaded_name = $1, uploaded_relationship = $2, uploaded_phone = $3
         WHERE id = $4`,
        [name, relationship, phone, tokenRes.rows[0].id]
      );

      return res.json({
        success: true,
        message: 'Family photo and voice message saved successfully!',
        member: member.rows[0],
      });
    } catch (err) {
      return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

export default router;
