import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { recordGameSession, getTodaysExercises } from '../services/adaptiveAI.js';
import { logServerError } from '../errors.js';

const router = express.Router();

// Helper to get active elder
async function getElderId(req) {
  if (req.elder?.id) return req.elder.id;
  const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
  return res.rows[0]?.id || null;
}

// GET /api/games/today - Get 3 scheduled exercises for today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const exercises = await getTodaysExercises(elderId);
    return res.json({ success: true, exercises });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/games/ratings - Get elder's current ratings & levels for all games
router.get('/ratings', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const ratingsRes = await query(
      `SELECT game_type, elo_rating, current_step, sessions_count, updated_at
       FROM elder_game_ratings WHERE elder_id = $1`,
      [elderId]
    );

    return res.json({ success: true, ratings: ratingsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/games/session - Save session, calculate adaptive step & Elo
router.post('/session', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const {
      clientSessionId,
      gameType,
      level,
      step,
      score,
      accuracy,
      responseTimeMs,
      errorsCount,
      hintsCount,
      durationSeconds,
      mood,
    } = req.body;

    if (!gameType || accuracy === undefined || score === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'gameType, score, and accuracy required' });
    }

    const result = await recordGameSession({
      elderId,
      clientSessionId,
      gameType,
      level: level || 'easy',
      step: step || 'E1',
      score: parseFloat(score),
      accuracy: parseFloat(accuracy),
      responseTimeMs: parseInt(responseTimeMs || 0, 10),
      errorsCount: parseInt(errorsCount || 0, 10),
      hintsCount: parseInt(hintsCount || 0, 10),
      durationSeconds: parseInt(durationSeconds || 0, 10),
      mood,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    logServerError({ message: `Game session error: ${err.message}`, route: '/api/games/session', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/games/history - Get recent sessions
router.get('/history', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const limit = parseInt(req.query.limit || 50, 10);
    const sessions = await query(
      `SELECT * FROM game_sessions
       WHERE elder_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [elderId, limit]
    );

    return res.json({ success: true, sessions: sessions.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/games/family-cards - Fetch family members with photos for NameFace and WhoseVoice games
router.get('/family-cards', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const members = await query(
      `SELECT id, name, relationship, phone,
              (photo IS NOT NULL) as has_photo,
              (voice_audio IS NOT NULL) as has_voice
       FROM family_members
       WHERE elder_id = $1
       ORDER BY created_at ASC`,
      [elderId]
    );

    return res.json({ success: true, members: members.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
