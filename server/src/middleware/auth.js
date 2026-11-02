import crypto from 'crypto';
import { query } from '../db.js';

export async function authMiddleware(req, res, next) {
  const token = req.cookies?.smriti_session || req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) {
    req.user = null;
    return next();
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const sessionRes = await query(
      `SELECT s.id as session_id, s.user_id, u.phone, u.role, u.created_at
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    );

    if (sessionRes.rows.length === 0) {
      req.user = null;
      return next();
    }

    req.user = sessionRes.rows[0];

    // Also look up any elder profile linked directly or through elder_caregivers
    const elderRes = await query(
      `SELECT id, name, age, language, region, voice_speed, routine_drift_enabled,
              auto_lost_enabled, auto_lost_threshold_m, last_known_lat, last_known_lng,
              profile_completed
       FROM elders
       WHERE user_id = $1
       LIMIT 1`,
      [req.user.user_id]
    );

    if (elderRes.rows.length > 0) {
      req.elder = elderRes.rows[0];
    } else {
      // Check caregiver links
      const caregiverRes = await query(
        `SELECT e.id, e.name, e.age, e.language, e.region, e.voice_speed, e.profile_completed
         FROM elder_caregivers ec
         JOIN elders e ON ec.elder_id = e.id
         WHERE ec.caregiver_id = $1 AND ec.status = 'active'
         LIMIT 1`,
        [req.user.user_id]
      );
      req.elder = caregiverRes.rows[0] || null;
    }

    next();
  } catch (err) {
    console.error('[Auth Middleware] error:', err.message);
    req.user = null;
    next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Please log in with your phone number.',
    });
  }
  next();
}
