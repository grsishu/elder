import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logServerError } from '../errors.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const photosDir = path.resolve(__dirname, '../../uploads/photos');
const audioDir = path.resolve(__dirname, '../../uploads/audio');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

const uploadStorage = multer.memoryStorage();
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

async function resolveElderId(req) {
  if (req.elder?.id) return req.elder.id;
  if (req.user?.user_id) {
    const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
    if (res.rows.length > 0) return res.rows[0].id;
  }
  const first = await query('SELECT id FROM elders ORDER BY created_at ASC LIMIT 1');
  return first.rows[0]?.id || null;
}

// ----------------------------------------------------
// 1. FAMILY PHOTOGRAPHS
// ----------------------------------------------------

// POST /api/family/photos - Upload family photograph
router.post('/photos', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    let { memberName, relationship, description = '', photoData, consentGiven = true } = req.body;

    if (!memberName || !relationship) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Member name and relationship are required' });
    }

    const photoId = crypto.randomUUID();
    let filePath = null;
    let savedPhotoData = photoData || null;

    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `photo_${photoId}${ext}`;
      filePath = path.join(photosDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);
      savedPhotoData = `data:${req.file.mimetype || 'image/jpeg'};base64,${req.file.buffer.toString('base64')}`;
    } else if (photoData && photoData.startsWith('data:image')) {
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
      const filename = `photo_${photoId}.jpg`;
      filePath = path.join(photosDir, filename);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }

    const relativePath = filePath ? `/uploads/photos/${path.basename(filePath)}` : null;

    const insertRes = await query(
      `INSERT INTO family_photographs (
         id, elder_id, member_name, relationship, description, file_path, photo_data, consent_given, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, elder_id, member_name, relationship, description, file_path, consent_given, created_at`,
      [
        photoId,
        elderId,
        memberName.trim(),
        relationship.trim(),
        description.trim(),
        relativePath,
        savedPhotoData,
        Boolean(consentGiven),
      ]
    );

    // Also sync to family_members table for emergency / calling
    const existingMember = await query(
      `SELECT id FROM family_members WHERE elder_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [elderId, memberName.trim()]
    );
    if (existingMember.rows.length === 0) {
      await query(
        `INSERT INTO family_members (elder_id, name, relationship, phone, is_emergency_contact)
         VALUES ($1, $2, $3, '+91 98765 00000', FALSE)`,
        [elderId, memberName.trim(), relationship.trim()]
      );
    }

    return res.json({
      success: true,
      message: 'Family photograph added successfully',
      photo: {
        ...insertRes.rows[0],
        photoUrl: relativePath || savedPhotoData,
      },
    });
  } catch (err) {
    logServerError({ message: `Upload photo error: ${err.message}`, route: '/api/family/photos', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/family/photos - List family photographs
router.get('/photos', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const photosRes = await query(
      `SELECT id, elder_id, member_name, relationship, description, file_path, photo_data, consent_given, created_at
       FROM family_photographs
       WHERE elder_id = $1
       ORDER BY created_at DESC`,
      [elderId]
    );

    const formatted = photosRes.rows.map((p) => ({
      id: p.id,
      memberName: p.member_name,
      relationship: p.relationship,
      description: p.description,
      photoUrl: p.file_path ? `/api/family/photos/${p.id}/file` : p.photo_data,
      consentGiven: p.consent_given,
      createdAt: p.created_at,
    }));

    return res.json({ success: true, photos: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/family/photos/:id/file - Stream photograph file
router.get('/photos/:id/file', async (req, res) => {
  try {
    const photoRes = await query(
      `SELECT file_path, photo_data FROM family_photographs WHERE id = $1`,
      [req.params.id]
    );
    if (photoRes.rows.length === 0) {
      return res.status(404).send('Photo not found');
    }

    const { file_path, photo_data } = photoRes.rows[0];
    if (file_path) {
      const absPath = path.resolve(__dirname, '../..', file_path.replace(/^\//, ''));
      if (fs.existsSync(absPath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(absPath);
      }
    }

    if (photo_data && photo_data.startsWith('data:image')) {
      const parts = photo_data.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const buf = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mime);
      return res.send(buf);
    }

    return res.status(404).send('Photo asset missing');
  } catch (err) {
    return res.status(500).send('Error streaming photo');
  }
});

// DELETE /api/family/photos/:id - Delete family photograph
router.delete('/photos/:id', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    const existing = await query(
      `SELECT file_path FROM family_photographs WHERE id = $1 AND elder_id = $2`,
      [req.params.id, elderId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    }

    const { file_path } = existing.rows[0];
    if (file_path) {
      const absPath = path.resolve(__dirname, '../..', file_path.replace(/^\//, ''));
      if (fs.existsSync(absPath)) {
        try { fs.unlinkSync(absPath); } catch {}
      }
    }

    await query(`DELETE FROM family_photographs WHERE id = $1 AND elder_id = $2`, [req.params.id, elderId]);
    return res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ----------------------------------------------------
// 2. FAMILY VOICE RECORDINGS
// ----------------------------------------------------

// POST /api/family/voice - Upload or record voice message
router.post('/voice', requireAuth, upload.single('voice'), async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    let { memberName, relationship, language = 'en', audioData, consentGiven = true } = req.body;

    if (!memberName || !relationship) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Member name and relationship are required' });
    }

    const voiceId = crypto.randomUUID();
    let filePath = null;
    let savedAudioData = audioData || null;

    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.webm';
      const filename = `voice_${voiceId}${ext}`;
      filePath = path.join(audioDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);
      savedAudioData = `data:${req.file.mimetype || 'audio/webm'};base64,${req.file.buffer.toString('base64')}`;
    } else if (audioData && audioData.startsWith('data:audio')) {
      const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, '');
      const filename = `voice_${voiceId}.webm`;
      filePath = path.join(audioDir, filename);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }

    const relativePath = filePath ? `/uploads/audio/${path.basename(filePath)}` : null;

    const insertRes = await query(
      `INSERT INTO family_voice_recordings (
         id, elder_id, member_name, relationship, file_path, audio_data, language, consent_given, recorded_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, elder_id, member_name, relationship, file_path, language, consent_given, recorded_at`,
      [
        voiceId,
        elderId,
        memberName.trim(),
        relationship.trim(),
        relativePath,
        savedAudioData,
        language,
        Boolean(consentGiven),
      ]
    );

    return res.json({
      success: true,
      message: 'Family voice recording saved successfully',
      voice: {
        ...insertRes.rows[0],
        audioUrl: relativePath || savedAudioData,
      },
    });
  } catch (err) {
    logServerError({ message: `Upload voice error: ${err.message}`, route: '/api/family/voice', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/family/voice - List voice recordings
router.get('/voice', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const voicesRes = await query(
      `SELECT id, elder_id, member_name, relationship, file_path, audio_data, language, consent_given, recorded_at
       FROM family_voice_recordings
       WHERE elder_id = $1
       ORDER BY recorded_at DESC`,
      [elderId]
    );

    const formatted = voicesRes.rows.map((v) => ({
      id: v.id,
      memberName: v.member_name,
      relationship: v.relationship,
      language: v.language,
      audioUrl: v.file_path ? `/api/family/voice/${v.id}/file` : v.audio_data,
      consentGiven: v.consent_given,
      recordedAt: v.recorded_at,
    }));

    return res.json({ success: true, voices: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/family/voice/:id/file - Stream audio file
router.get('/voice/:id/file', async (req, res) => {
  try {
    const voiceRes = await query(
      `SELECT file_path, audio_data FROM family_voice_recordings WHERE id = $1`,
      [req.params.id]
    );
    if (voiceRes.rows.length === 0) {
      return res.status(404).send('Voice recording not found');
    }

    const { file_path, audio_data } = voiceRes.rows[0];
    if (file_path) {
      const absPath = path.resolve(__dirname, '../..', file_path.replace(/^\//, ''));
      if (fs.existsSync(absPath)) {
        res.setHeader('Content-Type', 'audio/webm');
        return res.sendFile(absPath);
      }
    }

    if (audio_data && audio_data.startsWith('data:audio')) {
      const parts = audio_data.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'audio/webm';
      const buf = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mime);
      return res.send(buf);
    }

    return res.status(404).send('Audio asset missing');
  } catch (err) {
    return res.status(500).send('Error streaming audio');
  }
});

// DELETE /api/family/voice/:id - Delete voice recording
router.delete('/voice/:id', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    const existing = await query(
      `SELECT file_path FROM family_voice_recordings WHERE id = $1 AND elder_id = $2`,
      [req.params.id, elderId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'VOICE_NOT_FOUND' });
    }

    const { file_path } = existing.rows[0];
    if (file_path) {
      const absPath = path.resolve(__dirname, '../..', file_path.replace(/^\//, ''));
      if (fs.existsSync(absPath)) {
        try { fs.unlinkSync(absPath); } catch {}
      }
    }

    await query(`DELETE FROM family_voice_recordings WHERE id = $1 AND elder_id = $2`, [req.params.id, elderId]);
    return res.json({ success: true, message: 'Voice recording deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ----------------------------------------------------
// 3. PERSONALIZATION PREFERENCES
// ----------------------------------------------------

// GET /api/family/personalization - Get preference and asset counts
router.get('/personalization', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const elderRes = await query('SELECT personalization_pref, caretaker_name, caretaker_email, caretaker_phone FROM elders WHERE id = $1', [elderId]);
    const photoCountRes = await query('SELECT COUNT(*)::int as count FROM family_photographs WHERE elder_id = $1', [elderId]);
    const voiceCountRes = await query('SELECT COUNT(*)::int as count FROM family_voice_recordings WHERE elder_id = $1', [elderId]);

    const elder = elderRes.rows[0] || {};
    return res.json({
      success: true,
      personalizationPref: elder.personalization_pref || 'both',
      caretakerName: elder.caretaker_name,
      caretakerEmail: elder.caretaker_email,
      caretakerPhone: elder.caretaker_phone,
      totalPhotos: photoCountRes.rows[0]?.count || 0,
      totalVoices: voiceCountRes.rows[0]?.count || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/family/personalization - Update personalization preference
router.patch('/personalization', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const { personalizationPref, caretakerName, caretakerEmail, caretakerPhone } = req.body;

    const allowed = ['both', 'photos_only', 'voices_only', 'normal'];
    const pref = allowed.includes(personalizationPref) ? personalizationPref : 'both';

    await query(
      `UPDATE elders
       SET personalization_pref = COALESCE($1, personalization_pref),
           caretaker_name = COALESCE($2, caretaker_name),
           caretaker_email = COALESCE($3, caretaker_email),
           caretaker_phone = COALESCE($4, caretaker_phone),
           updated_at = NOW()
       WHERE id = $5`,
      [pref, caretakerName || null, caretakerEmail || null, caretakerPhone || null, elderId]
    );

    return res.json({
      success: true,
      personalizationPref: pref,
      message: 'Personalization preference saved successfully',
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ----------------------------------------------------
// 4. UNIFIED FAMILY MEMBERS CRUD WITH PERSISTENT PHOTO & VOICE
// ----------------------------------------------------

// GET /api/family/members - List all family members with photo and voice metadata
router.get('/members', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND', members: [] });

    const membersRes = await query(
      `SELECT id, elder_id, name, relationship, phone, address, latitude, longitude,
              (photo IS NOT NULL) as has_photo,
              (voice_audio IS NOT NULL) as has_voice,
              is_emergency_contact, emergency_priority, created_at
       FROM family_members
       WHERE elder_id = $1
       ORDER BY emergency_priority ASC, created_at ASC`,
      [elderId]
    );

    const members = membersRes.rows.map((m) => ({
      id: m.id,
      name: m.name,
      relationship: m.relationship,
      phone: m.phone,
      address: m.address,
      latitude: m.latitude,
      longitude: m.longitude,
      hasPhoto: Boolean(m.has_photo),
      photoUrl: m.has_photo ? `/api/family/members/${m.id}/photo` : null,
      hasVoice: Boolean(m.has_voice),
      voiceUrl: m.has_voice ? `/api/family/members/${m.id}/voice` : null,
      isEmergencyContact: Boolean(m.is_emergency_contact),
      emergencyPriority: m.emergency_priority || 99,
      createdAt: m.created_at,
    }));

    return res.json({ success: true, members });
  } catch (err) {
    logServerError({ message: `Get family members error: ${err.message}`, route: '/api/family/members', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message, members: [] });
  }
});

// POST /api/family/members - Create or update family member with persistent photo and voice
router.post(
  '/members',
  requireAuth,
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'voice', maxCount: 1 }]),
  async (req, res) => {
    try {
      const elderId = await resolveElderId(req);
      if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

      const {
        id,
        name,
        relationship,
        phone,
        address = '',
        latitude = null,
        longitude = null,
        isEmergencyContact = true,
        emergencyPriority = 1,
        photoBase64 = null,
        voiceBase64 = null,
      } = req.body;

      if (!name || !relationship) {
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Name and relationship are required' });
      }

      let photoBuffer = null;
      let photoMime = null;
      if (req.files?.photo?.[0]) {
        photoBuffer = req.files.photo[0].buffer;
        photoMime = req.files.photo[0].mimetype;
      } else if (photoBase64 && photoBase64.includes('base64,')) {
        const parts = photoBase64.split('base64,');
        photoMime = parts[0].replace('data:', '').replace(';', '') || 'image/jpeg';
        photoBuffer = Buffer.from(parts[1], 'base64');
      }

      let voiceBuffer = null;
      let voiceMime = null;
      if (req.files?.voice?.[0]) {
        voiceBuffer = req.files.voice[0].buffer;
        voiceMime = req.files.voice[0].mimetype;
      } else if (voiceBase64 && voiceBase64.includes('base64,')) {
        const parts = voiceBase64.split('base64,');
        voiceMime = parts[0].replace('data:', '').replace(';', '') || 'audio/webm';
        voiceBuffer = Buffer.from(parts[1], 'base64');
      }

      let member;
      if (id) {
        // Update existing member
        const updates = [
          'name = $1',
          'relationship = $2',
          'phone = $3',
          'address = $4',
          'latitude = $5',
          'longitude = $6',
          'is_emergency_contact = $7',
          'emergency_priority = $8'
        ];
        const params = [
          name.trim(),
          relationship.trim().toLowerCase(),
          (phone || '+91 98765 00000').trim(),
          address || '',
          latitude ? parseFloat(latitude) : null,
          longitude ? parseFloat(longitude) : null,
          Boolean(isEmergencyContact === 'true' || isEmergencyContact === true),
          emergencyPriority ? parseInt(emergencyPriority, 10) : 99,
        ];

        let pIdx = 9;
        if (photoBuffer) {
          updates.push(`photo = $${pIdx++}`, `photo_mime = $${pIdx++}`);
          params.push(photoBuffer, photoMime);
        }
        if (voiceBuffer) {
          updates.push(`voice_audio = $${pIdx++}`, `voice_mime = $${pIdx++}`);
          params.push(voiceBuffer, voiceMime);
        }

        params.push(id, elderId);
        const queryStr = `
          UPDATE family_members
          SET ${updates.join(', ')}
          WHERE id = $${pIdx++} AND elder_id = $${pIdx++}
          RETURNING id, name, relationship, phone, address, latitude, longitude,
                    (photo IS NOT NULL) as has_photo, (voice_audio IS NOT NULL) as has_voice,
                    is_emergency_contact, emergency_priority
        `;
        const upRes = await query(queryStr, params);
        member = upRes.rows[0];
      } else {
        // Insert new member
        const insRes = await query(
          `INSERT INTO family_members (
             elder_id, name, relationship, phone, address, latitude, longitude,
             photo, photo_mime, voice_audio, voice_mime, is_emergency_contact, emergency_priority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, name, relationship, phone, address, latitude, longitude,
                     (photo IS NOT NULL) as has_photo, (voice_audio IS NOT NULL) as has_voice,
                     is_emergency_contact, emergency_priority`,
          [
            elderId,
            name.trim(),
            relationship.trim().toLowerCase(),
            (phone || '+91 98765 00000').trim(),
            address || '',
            latitude ? parseFloat(latitude) : null,
            longitude ? parseFloat(longitude) : null,
            photoBuffer,
            photoMime,
            voiceBuffer,
            voiceMime,
            Boolean(isEmergencyContact === 'true' || isEmergencyContact === true),
            emergencyPriority ? parseInt(emergencyPriority, 10) : 99,
          ]
        );
        member = insRes.rows[0];
      }

      if (!member) {
        return res.status(404).json({ error: 'MEMBER_NOT_FOUND', message: 'Could not save member' });
      }

      // Also persist to family_photographs and family_voice_recordings if provided
      if (photoBuffer) {
        const photoId = crypto.randomUUID();
        const base64Data = `data:${photoMime || 'image/jpeg'};base64,${photoBuffer.toString('base64')}`;
        await query(
          `INSERT INTO family_photographs (id, elder_id, member_name, relationship, photo_data, consent_given, created_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
           ON CONFLICT DO NOTHING`,
          [photoId, elderId, name.trim(), relationship.trim().toLowerCase(), base64Data]
        ).catch(() => {});
      }

      if (voiceBuffer) {
        const voiceId = crypto.randomUUID();
        const base64Audio = `data:${voiceMime || 'audio/webm'};base64,${voiceBuffer.toString('base64')}`;
        await query(
          `INSERT INTO family_voice_recordings (id, elder_id, member_name, relationship, audio_data, consent_given, recorded_at, created_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [voiceId, elderId, name.trim(), relationship.trim().toLowerCase(), base64Audio]
        ).catch(() => {});
      }

      return res.json({
        success: true,
        member: {
          ...member,
          hasPhoto: Boolean(member.has_photo),
          photoUrl: member.has_photo ? `/api/family/members/${member.id}/photo` : null,
          hasVoice: Boolean(member.has_voice),
          voiceUrl: member.has_voice ? `/api/family/members/${member.id}/voice` : null,
        },
      });
    } catch (err) {
      logServerError({ message: `Save family member error: ${err.message}`, route: '/api/family/members', statusCode: 500 });
      return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/family/members/:id/photo - Stream persistent photo from PostgreSQL bytea
router.get('/members/:id/photo', async (req, res) => {
  try {
    const photoRes = await query(
      `SELECT photo, photo_mime FROM family_members WHERE id = $1`,
      [req.params.id]
    );

    if (photoRes.rows.length > 0 && photoRes.rows[0].photo) {
      res.setHeader('Content-Type', photoRes.rows[0].photo_mime || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(photoRes.rows[0].photo);
    }

    // Fallback: check family_photographs by id
    const photoAlt = await query(
      `SELECT file_path, photo_data FROM family_photographs WHERE id = $1`,
      [req.params.id]
    );
    if (photoAlt.rows.length > 0) {
      const { photo_data } = photoAlt.rows[0];
      if (photo_data && photo_data.startsWith('data:image')) {
        const parts = photo_data.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const buf = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    }

    return res.status(404).send('Photo not found');
  } catch (err) {
    return res.status(500).send('Error retrieving photo');
  }
});

// GET /api/family/members/:id/voice - Stream persistent voice from PostgreSQL bytea
router.get('/members/:id/voice', async (req, res) => {
  try {
    const voiceRes = await query(
      `SELECT voice_audio, voice_mime FROM family_members WHERE id = $1`,
      [req.params.id]
    );

    if (voiceRes.rows.length > 0 && voiceRes.rows[0].voice_audio) {
      res.setHeader('Content-Type', voiceRes.rows[0].voice_mime || 'audio/webm');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(voiceRes.rows[0].voice_audio);
    }

    // Fallback: check family_voice_recordings by id
    const voiceAlt = await query(
      `SELECT audio_data FROM family_voice_recordings WHERE id = $1`,
      [req.params.id]
    );
    if (voiceAlt.rows.length > 0) {
      const { audio_data } = voiceAlt.rows[0];
      if (audio_data && audio_data.startsWith('data:audio')) {
        const parts = audio_data.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'audio/webm';
        const buf = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    }

    return res.status(404).send('Voice recording not found');
  } catch (err) {
    return res.status(500).send('Error retrieving voice recording');
  }
});

// DELETE /api/family/members/:id/photo - Remove only photo
router.delete('/members/:id/photo', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    await query(
      `UPDATE family_members SET photo = NULL, photo_mime = NULL WHERE id = $1 AND elder_id = $2`,
      [req.params.id, elderId]
    );
    return res.json({ success: true, message: 'Photo removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/family/members/:id/voice - Remove only voice
router.delete('/members/:id/voice', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    await query(
      `UPDATE family_members SET voice_audio = NULL, voice_mime = NULL WHERE id = $1 AND elder_id = $2`,
      [req.params.id, elderId]
    );
    return res.json({ success: true, message: 'Voice recording removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/family/members/:id - Delete family member
router.delete('/members/:id', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    await query(`DELETE FROM family_members WHERE id = $1 AND elder_id = $2`, [req.params.id, elderId]);
    return res.json({ success: true, message: 'Member deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/family/complete-onboarding - Mark setup wizard complete
router.post('/complete-onboarding', requireAuth, async (req, res) => {
  try {
    const elderId = await resolveElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    await query(
      `UPDATE elders SET profile_completed = TRUE, updated_at = NOW() WHERE id = $1`,
      [elderId]
    );

    return res.json({ success: true, profile_completed: true, message: 'Setup completed successfully!' });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;

