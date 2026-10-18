import { query } from '../db.js';

const STEPS = ['E1', 'E2', 'E3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3'];

const STEP_LEVEL_MAP = {
  E1: 'easy', E2: 'easy', E3: 'easy',
  M1: 'medium', M2: 'medium', M3: 'medium',
  H1: 'hard', H2: 'hard', H3: 'hard'
};

const ALL_GAMES = [
  'name_face',
  'whose_voice',
  'picture_matching',
  'pattern_game',
  'daily_routine',
  'voice_fluency'
];

/**
 * Calculates updated Elo rating based on game performance
 */
export function calculateNewElo(currentRating, accuracy, level) {
  const K = 32;
  const targetAccuracy = level === 'hard' ? 0.70 : level === 'medium' ? 0.75 : 0.80;
  const actualScore = Math.min(1.0, Math.max(0.0, accuracy / 100));
  const change = K * (actualScore - targetAccuracy);
  return Math.round((currentRating + change) * 100) / 100;
}

/**
 * Record a game session and update adaptive difficulty & Elo
 */
export async function recordGameSession({
  elderId,
  clientSessionId,
  gameType,
  level,
  step,
  score,
  accuracy,
  responseTimeMs = 0,
  errorsCount = 0,
  hintsCount = 0,
  durationSeconds = 0,
  mood = null,
}) {
  // Check if session already recorded (idempotency via clientSessionId)
  if (clientSessionId) {
    const existing = await query(
      'SELECT id, score, accuracy FROM game_sessions WHERE client_session_id = $1',
      [clientSessionId]
    );
    if (existing.rows.length > 0) {
      return { session: existing.rows[0], alreadyRecorded: true };
    }
  }

  // 1. Insert session record
  const sessionRes = await query(
    `INSERT INTO game_sessions (
       elder_id, client_session_id, game_type, level, step, score,
       accuracy, response_time_ms, errors_count, hints_count, duration_seconds, mood
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      elderId,
      clientSessionId || null,
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
    ]
  );
  const session = sessionRes.rows[0];

  // 2. Fetch or initialize elder game rating
  let ratingRes = await query(
    `SELECT * FROM elder_game_ratings WHERE elder_id = $1 AND game_type = $2`,
    [elderId, gameType]
  );

  let currentElo = 1000.0;
  let currentStep = step || 'E1';
  let sessionsCount = 0;

  if (ratingRes.rows.length > 0) {
    currentElo = parseFloat(ratingRes.rows[0].elo_rating);
    currentStep = ratingRes.rows[0].current_step;
    sessionsCount = ratingRes.rows[0].sessions_count;
  }

  // 3. Compute new Elo
  const newElo = calculateNewElo(currentElo, accuracy, level);

  // 4. Check 3-session rolling accuracy for step progression
  const recentSessions = await query(
    `SELECT accuracy FROM game_sessions
     WHERE elder_id = $1 AND game_type = $2
     ORDER BY created_at DESC LIMIT 3`,
    [elderId, gameType]
  );

  let nextStep = currentStep;
  if (recentSessions.rows.length >= 3) {
    const avgAccuracy =
      recentSessions.rows.reduce((acc, r) => acc + parseFloat(r.accuracy), 0) /
      recentSessions.rows.length;

    const currIdx = STEPS.indexOf(currentStep);
    if (avgAccuracy >= 80 && currIdx < STEPS.length - 1) {
      nextStep = STEPS[currIdx + 1];
    } else if (avgAccuracy < 50 && currIdx > 0) {
      nextStep = STEPS[currIdx - 1];
    }
  }

  // 5. Update elder rating and step
  await query(
    `INSERT INTO elder_game_ratings (elder_id, game_type, elo_rating, current_step, sessions_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (elder_id, game_type) DO UPDATE
     SET elo_rating = EXCLUDED.elo_rating,
         current_step = EXCLUDED.current_step,
         sessions_count = elder_game_ratings.sessions_count + 1,
         updated_at = NOW()`,
    [elderId, gameType, newElo, nextStep, sessionsCount + 1]
  );

  // 6. Fatigue detection: > 15 min session
  const fatigueDetected = durationSeconds > 900;

  // 7. 14-day baseline drop detection (strictly non-diagnostic)
  await checkBaselineDrift(elderId, gameType);

  return {
    session,
    newElo,
    currentStep: nextStep,
    nextLevel: STEP_LEVEL_MAP[nextStep] || 'easy',
    fatigueDetected,
  };
}

/**
 * Checks for 14-day performance variance and logs gentle notes
 */
async function checkBaselineDrift(elderId, gameType) {
  try {
    const baselineRes = await query(
      `SELECT AVG(accuracy)::numeric(5,2) as mean,
              STDDEV(accuracy)::numeric(5,2) as stddev,
              COUNT(*)::int as count
       FROM game_sessions
       WHERE elder_id = $1 AND game_type = $2
         AND created_at >= NOW() - INTERVAL '14 days'
         AND created_at < NOW() - INTERVAL '3 days'`,
      [elderId, gameType]
    );

    const { mean, stddev, count } = baselineRes.rows[0] || {};
    if (!count || count < 5 || !stddev || parseFloat(stddev) === 0) return;

    const recentRes = await query(
      `SELECT AVG(accuracy)::numeric(5,2) as recent_mean
       FROM game_sessions
       WHERE elder_id = $1 AND game_type = $2
         AND created_at >= NOW() - INTERVAL '3 days'`,
      [elderId, gameType]
    );

    const recentMean = parseFloat(recentRes.rows[0]?.recent_mean);
    if (!isNaN(recentMean)) {
      const zScore = (recentMean - parseFloat(mean)) / parseFloat(stddev);
      if (zScore <= -2.0) {
        // Log gentle, non-diagnostic caregiver note
        await query(
          `INSERT INTO silent_guardian_events (elder_id, event_type, reason, severity, details)
           VALUES ($1, 'fluency_drop', $2, 'info', $3)
           ON CONFLICT DO NOTHING`,
          [
            elderId,
            'Gentle practice notice: Ramesh had a slightly slower response pace on games this week. Encouraging relaxed sessions is suggested.',
            JSON.stringify({ gameType, zScore: zScore.toFixed(2), baselineMean: mean, recentMean }),
          ]
        );
      }
    }
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Get Today's 3 Brain Exercise Games based on spaced repetition & variety
 */
export async function getTodaysExercises(elderId) {
  const ratingsRes = await query(
    `SELECT game_type, current_step, elo_rating, updated_at
     FROM elder_game_ratings WHERE elder_id = $1`,
    [elderId]
  );

  const ratingMap = {};
  for (const r of ratingsRes.rows) {
    ratingMap[r.game_type] = r;
  }

  // Score each game: prioritize games not played today, lower Elo, or never played
  const scoredGames = ALL_GAMES.map((gameType) => {
    const r = ratingMap[gameType];
    const step = r ? r.current_step : 'E1';
    const level = STEP_LEVEL_MAP[step] || 'easy';
    const elo = r ? parseFloat(r.elo_rating) : 1000;
    const lastPlayed = r ? new Date(r.updated_at).getTime() : 0;
    const hoursSinceLast = (Date.now() - lastPlayed) / (1000 * 60 * 60);

    return {
      gameType,
      step,
      level,
      elo,
      priority: hoursSinceLast + (1200 - elo) * 0.1,
    };
  });

  scoredGames.sort((a, b) => b.priority - a.priority);
  return scoredGames.slice(0, 3);
}
