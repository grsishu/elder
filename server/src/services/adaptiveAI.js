import { query } from '../db.js';

export const COGNITIVE_GAMES = [
  'memory_match',
  'memory_lane',
  'find_pair',
  'daily_routine',
  'word_wizard',
  'sort_it_out',
  'music_memories',
  'puzzle_time',
];

export const GAME_ALIASES = {
  picture_matching: 'find_pair',
  remember_objects: 'memory_match',
  name_face: 'memory_lane',
  whose_voice: 'music_memories',
  pattern_game: 'puzzle_time',
  find_object: 'word_wizard',
};

export const LEVELS = ['easy', 'medium', 'hard'];

export function canonicalGameType(gameType) {
  if (!gameType) return 'memory_match';
  const clean = gameType.toLowerCase().trim();
  return GAME_ALIASES[clean] || clean;
}

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
 * Record a game session and run the Adaptive Difficulty Engine
 */
export async function recordGameSession({
  elderId,
  clientSessionId,
  gameType: rawGameType,
  level: requestedLevel,
  score = 100,
  accuracy = 100,
  responseTimeMs = 0,
  errorsCount = 0,
  hintsCount = 0,
  attemptsCount = 1,
  totalQuestions = 4,
  correctAnswers = 4,
  incorrectAnswers = 0,
  completionStatus = 'completed',
  durationSeconds = 0,
  mood = null,
}) {
  const gameType = canonicalGameType(rawGameType);

  // 1. Idempotency check via clientSessionId
  if (clientSessionId) {
    const existing = await query(
      'SELECT id, score, accuracy, level FROM game_sessions WHERE client_session_id = $1',
      [clientSessionId]
    );
    if (existing.rows.length > 0) {
      return { session: existing.rows[0], alreadyRecorded: true };
    }
  }

  // 2. Fetch current difficulty rating for this specific game
  let ratingRes = await query(
    `SELECT * FROM elder_game_ratings WHERE elder_id = $1 AND game_type = $2`,
    [elderId, gameType]
  );

  let currentElo = 1000.0;
  let currentLevel = requestedLevel || 'easy';
  let sessionsCount = 0;

  if (ratingRes.rows.length > 0) {
    currentElo = parseFloat(ratingRes.rows[0].elo_rating) || 1000.0;
    currentLevel = ratingRes.rows[0].current_step || requestedLevel || 'easy';
    sessionsCount = parseInt(ratingRes.rows[0].sessions_count, 10) || 0;
  }

  // 3. Insert session record
  const sessionRes = await query(
    `INSERT INTO game_sessions (
       elder_id, client_session_id, game_type, level, step, score,
       accuracy, response_time_ms, errors_count, hints_count, duration_seconds,
       mood, total_questions, correct_answers, incorrect_answers, attempts_count, completion_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      elderId,
      clientSessionId || null,
      gameType,
      currentLevel,
      currentLevel, // step stores the level
      score,
      accuracy,
      responseTimeMs,
      errorsCount,
      hintsCount,
      durationSeconds,
      mood,
      totalQuestions,
      correctAnswers,
      incorrectAnswers,
      attemptsCount,
      completionStatus,
    ]
  );
  const session = sessionRes.rows[0];

  // 4. Compute updated Elo
  const newElo = calculateNewElo(currentElo, accuracy, currentLevel);

  // 5. Intelligent Adaptive Difficulty Decision
  // Fetch the last 3 sessions for this specific game
  const recentSessionsRes = await query(
    `SELECT accuracy, hints_count, attempts_count, completion_status, level
     FROM game_sessions
     WHERE elder_id = $1 AND game_type = $2
     ORDER BY created_at DESC LIMIT 3`,
    [elderId, gameType]
  );

  const recent = recentSessionsRes.rows;
  let nextLevel = currentLevel;
  let decisionReason = 'Maintaining current difficulty for stable, comfortable practice.';
  let difficultyChanged = false;

  if (recent.length >= 3) {
    const avgAccuracy = recent.reduce((sum, s) => sum + parseFloat(s.accuracy || 0), 0) / recent.length;
    const avgHints = recent.reduce((sum, s) => sum + parseInt(s.hints_count || 0, 10), 0) / recent.length;
    const allCompleted = recent.every((s) => s.completion_status !== 'incomplete');

    // Rule: Increase difficulty (>=85% across 3 sessions, low hints <= 1.5, completed)
    if (avgAccuracy >= 85 && avgHints <= 1.5 && allCompleted) {
      if (currentLevel === 'easy') {
        nextLevel = 'medium';
        difficultyChanged = true;
        decisionReason = `Elder achieved consistent high accuracy (${Math.round(avgAccuracy)}%) across 3 recent sessions with minimal assistance. Gently advancing from Easy to Medium.`;
      } else if (currentLevel === 'medium') {
        nextLevel = 'hard';
        difficultyChanged = true;
        decisionReason = `Elder demonstrated strong recall and mastery (${Math.round(avgAccuracy)}% accuracy) on Medium. Gently advancing to Hard.`;
      }
    }
    // Rule: Decrease difficulty (repeated <60% accuracy or multiple hints or repeated incompletion)
    else if (avgAccuracy < 60 || avgHints >= 3.0 || !allCompleted) {
      if (currentLevel === 'hard') {
        nextLevel = 'medium';
        difficultyChanged = true;
        decisionReason = `Elder encountered difficulty (${Math.round(avgAccuracy)}% accuracy, ${Math.round(avgHints)} hints/session). Easing difficulty from Hard to Medium for comfort.`;
      } else if (currentLevel === 'medium') {
        nextLevel = 'easy';
        difficultyChanged = true;
        decisionReason = `Recent sessions showed fatigue or repeated assistance needed. Easing difficulty from Medium to Easy to ensure encouragement and confidence.`;
      }
    }
  }

  // 6. Record difficulty change history if adjusted
  if (difficultyChanged) {
    await query(
      `INSERT INTO adaptive_difficulty_history (
         elder_id, game_type, old_level, new_level, reason, decided_by, session_id, metrics_snapshot
       ) VALUES ($1, $2, $3, $4, $5, 'ai', $6, $7)`,
      [
        elderId,
        gameType,
        currentLevel,
        nextLevel,
        decisionReason,
        session.id,
        JSON.stringify({
          sessionsEvaluated: recent.length,
          avgAccuracy: recent.reduce((s, r) => s + parseFloat(r.accuracy || 0), 0) / recent.length,
          lastAccuracy: accuracy,
        }),
      ]
    );
  }

  // 7. Update elder rating and current step in DB
  await query(
    `INSERT INTO elder_game_ratings (elder_id, game_type, elo_rating, current_step, sessions_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (elder_id, game_type) DO UPDATE
     SET elo_rating = EXCLUDED.elo_rating,
         current_step = EXCLUDED.current_step,
         sessions_count = elder_game_ratings.sessions_count + 1,
         updated_at = NOW()`,
    [elderId, gameType, newElo, nextLevel, sessionsCount + 1]
  );

  // 8. Fatigue detection (> 15 minutes = 900 seconds)
  const fatigueDetected = durationSeconds > 900;

  return {
    session,
    newElo,
    currentLevel: nextLevel,
    difficultyChanged,
    decisionReason,
    fatigueDetected,
  };
}

/**
 * Caretaker override for game difficulty
 */
export async function overrideGameDifficulty(elderId, gameTypeInput, newLevel, caretakerId = null, reason = 'Caretaker manual adjustment') {
  const gameType = canonicalGameType(gameTypeInput);
  if (!LEVELS.includes(newLevel)) {
    throw new Error(`Invalid level: ${newLevel}. Must be easy, medium, or hard.`);
  }

  const existingRes = await query(
    `SELECT current_step FROM elder_game_ratings WHERE elder_id = $1 AND game_type = $2`,
    [elderId, gameType]
  );
  const oldLevel = existingRes.rows[0]?.current_step || 'easy';

  await query(
    `INSERT INTO elder_game_ratings (elder_id, game_type, current_step, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (elder_id, game_type) DO UPDATE
     SET current_step = EXCLUDED.current_step,
         updated_at = NOW()`,
    [elderId, gameType, newLevel]
  );

  await query(
    `INSERT INTO adaptive_difficulty_history (
       elder_id, game_type, old_level, new_level, reason, decided_by
     ) VALUES ($1, $2, $3, $4, $5, 'caretaker')`,
    [elderId, gameType, oldLevel, newLevel, reason]
  );

  return {
    success: true,
    gameType,
    oldLevel,
    newLevel,
    decidedBy: 'caretaker',
    reason,
  };
}

/**
 * Fetches current difficulties and stats for all 8 cognitive games
 */
export async function getElderGamesStatus(elderId) {
  const ratingsRes = await query(
    `SELECT game_type, current_step as level, elo_rating, sessions_count, updated_at
     FROM elder_game_ratings WHERE elder_id = $1`,
    [elderId]
  );

  const ratingMap = {};
  for (const r of ratingsRes.rows) {
    ratingMap[r.game_type] = r;
  }

  return COGNITIVE_GAMES.map((gameType) => {
    const r = ratingMap[gameType];
    return {
      gameType,
      level: r?.level || 'easy',
      elo: r ? parseFloat(r.elo_rating) : 1000.0,
      sessionsCount: r ? parseInt(r.sessions_count, 10) : 0,
      lastPlayed: r ? r.updated_at : null,
    };
  });
}

/**
 * Get Today's 3 Brain Exercise Games based on spaced repetition & variety
 */
export async function getTodaysExercises(elderId) {
  const ratings = await getElderGamesStatus(elderId);

  // Prioritize games with fewer sessions, lower Elo, or not played recently
  const scored = ratings.map((g) => {
    const lastPlayed = g.lastPlayed ? new Date(g.lastPlayed).getTime() : 0;
    const hoursSinceLast = (Date.now() - lastPlayed) / (1000 * 60 * 60);
    return {
      ...g,
      priority: hoursSinceLast + (1200 - g.elo) * 0.1,
    };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, 3);
}

/**
 * Generates clear, non-clinical AI cognitive observations based on real history
 */
export async function generateCognitiveAnalysis(elderId, periodDays = 7) {
  const statsRes = await query(
    `SELECT 
       game_type,
       COUNT(*)::int as total_sessions,
       ROUND(AVG(accuracy), 1) as avg_accuracy,
       SUM(hints_count)::int as total_hints,
       SUM(errors_count)::int as total_errors,
       level
     FROM game_sessions
     WHERE elder_id = $1 AND created_at >= NOW() - $2::interval
     GROUP BY game_type, level`,
    [elderId, `${periodDays} days`]
  );

  const comfortable = [];
  const assistanceNeeded = [];
  const recommendedNext = [];

  const rows = statsRes.rows;
  if (rows.length === 0) {
    return {
      hasData: false,
      summary: 'No cognitive practice sessions recorded in this period.',
      comfortableActivities: [],
      assistanceNeededActivities: [],
      recommendedNext: ['Begin with gentle Memory Match and Daily Routine exercises at Easy level.'],
      disclaimer: 'This cognitive activity summary is for wellness observation and engagement only, not a clinical diagnosis.',
    };
  }

  rows.forEach((r) => {
    const acc = parseFloat(r.avg_accuracy || 0);
    const hints = parseInt(r.total_hints || 0, 10);
    const gameName = r.game_type.replace(/_/g, ' ');

    if (acc >= 80 && hints <= 2) {
      comfortable.push(`${gameName} (${r.level}) — ${acc}% accuracy`);
    } else if (acc < 65 || hints >= 4) {
      assistanceNeeded.push(`${gameName} (${r.level}) — required gentle guidance (${hints} hints)`);
    }
  });

  if (comfortable.length > 0) {
    recommendedNext.push(`Continue enjoyable engagement with ${comfortable[0].split('—')[0]}.`);
  }
  if (assistanceNeeded.length > 0) {
    recommendedNext.push(`Provide extra time and gentle hints during ${assistanceNeeded[0].split('—')[0]}.`);
  }
  if (recommendedNext.length === 0) {
    recommendedNext.push('Encourage daily routine and picture matching sessions at current comfortable levels.');
  }

  return {
    hasData: true,
    totalSessionsRecorded: rows.reduce((acc, r) => acc + r.total_sessions, 0),
    comfortableActivities: comfortable,
    assistanceNeededActivities: assistanceNeeded,
    recommendedNext,
    disclaimer: 'This cognitive activity summary is for wellness observation and engagement only, not a clinical diagnosis.',
  };
}
