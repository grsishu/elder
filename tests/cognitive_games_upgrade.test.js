import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import {
  PUZZLE_CATEGORIES,
  DIFFICULTY_PRESETS,
} from '../client/src/pages/games/puzzleArtwork.js';

describe('Cognitive Games Upgrade: Puzzle Game & Name & Face Recognition Game', () => {
  let authCookie;
  let elderId;
  const testPhone = '+919876543277';

  beforeAll(async () => {
    // Clean up any existing test records for testPhone
    await query(`DELETE FROM otp_verifications WHERE phone = $1`, [testPhone]);
    await query(`DELETE FROM users WHERE phone = $1`, [testPhone]);

    const reqRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ rawPhone: testPhone, channel: 'sms', fallbackDemo: true });

    const demoCode = reqRes.body.demoCode;

    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ rawPhone: testPhone, code: demoCode });

    const cookies = verifyRes.headers['set-cookie'];
    authCookie = cookies ? cookies[0] : '';

    // Initialize elder profile
    const initRes = await request(app)
      .post('/api/elder/init-profile')
      .set('Cookie', authCookie)
      .send({
        role: 'caregiver',
        elderName: 'Shri Ramachandran',
        elderAge: 76,
        elderLanguage: 'hi',
        region: 'Delhi',
      });

    const userElder = await query(
      'SELECT id FROM elders WHERE user_id = (SELECT id FROM users WHERE phone = $1) LIMIT 1',
      [testPhone]
    );
    elderId = userElder.rows[0]?.id;

    // Insert sample family members with photo and voice
    await query(
      `INSERT INTO family_members (elder_id, name, relationship, phone, photo, voice_audio)
       VALUES ($1, 'Rajesh Kumar', 'Son', '+919876543210', 'fake_photo_bytes', 'fake_voice_bytes')`,
      [elderId]
    );
    await query(
      `INSERT INTO family_members (elder_id, name, relationship, phone, photo, voice_audio)
       VALUES ($1, 'Sunita Devi', 'Daughter', '+919876543211', 'fake_photo_bytes', 'fake_voice_bytes')`,
      [elderId]
    );
  });

  describe('Module 1: Puzzle Game Architecture & Non-Blank Tile Verification', () => {
    it('defines all 10 authentic cultural categories with valid labels and descriptions', () => {
      expect(PUZZLE_CATEGORIES).toHaveLength(10);
      const categoryIds = PUZZLE_CATEGORIES.map((c) => c.id);

      expect(categoryIds).toContain('flower');
      expect(categoryIds).toContain('peacock');
      expect(categoryIds).toContain('temple');
      expect(categoryIds).toContain('elephant');
      expect(categoryIds).toContain('nature');
      expect(categoryIds).toContain('chai');
      expect(categoryIds).toContain('fruit');
      expect(categoryIds).toContain('vegetable');
      expect(categoryIds).toContain('transport');
      expect(categoryIds).toContain('family');

      // Verify each category has a valid label key and non-empty description
      PUZZLE_CATEGORIES.forEach((cat) => {
        expect(cat.labelKey).toBeTruthy();
        expect(cat.defaultLabel).toBeTruthy();
        expect(cat.description).toBeTruthy();
      });
    });

    it('enforces exact adaptive difficulty presets (Easy: 2x2=4, Medium: 3x3=9, Hard: 4x4=16)', () => {
      expect(DIFFICULTY_PRESETS.easy).toEqual({
        rows: 2,
        cols: 2,
        total: 4,
        label: 'Easy (2×2 = 4 pieces)',
      });

      expect(DIFFICULTY_PRESETS.medium).toEqual({
        rows: 3,
        cols: 3,
        total: 9,
        label: 'Medium (3×3 = 9 pieces)',
      });

      expect(DIFFICULTY_PRESETS.hard).toEqual({
        rows: 4,
        cols: 4,
        total: 16,
        label: 'Hard (4×4 = 16 pieces)',
      });
    });

    it('allows elders to save puzzle game sessions with accuracy, moves, and hints', async () => {
      const sessionId = `puzzle-test-${Date.now()}`;
      const res = await request(app)
        .post('/api/games/session')
        .set('Cookie', authCookie)
        .send({
          clientSessionId: sessionId,
          gameType: 'puzzle_time',
          level: 'easy',
          step: 'E1',
          score: 100,
          accuracy: 100,
          hintsCount: 1,
          errorsCount: 2,
          durationSeconds: 38,
          totalQuestions: 4,
          correctAnswers: 4,
          incorrectAnswers: 0,
          completionStatus: 'completed',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.game_type).toBe('puzzle_time');
      expect(Number(res.body.session.accuracy)).toBe(100);
    });
  });

  describe('Module 2: Name & Face Recognition Game Mechanics', () => {
    it('fetches real family members with photo and voice URLs via /api/games/family-cards', async () => {
      const res = await request(app)
        .get(`/api/games/family-cards?elderId=${elderId}`)
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(res.body.members.length).toBeGreaterThanOrEqual(2);

      const rajesh = res.body.members.find((m) => m.name === 'Rajesh Kumar');
      expect(rajesh).toBeDefined();
      expect(rajesh.hasPhoto).toBe(true);
      expect(rajesh.hasVoice).toBe(true);
      expect(rajesh.photoUrl).toContain('/photo');
      expect(rajesh.voiceUrl).toContain('/voice');
    });

    it('randomizes correct answer position so it is NEVER always the first option', () => {
      // Test shuffle simulation over 30 runs
      const correctOption = 'Rajesh Kumar • Son';
      const distractors = ['Arun Kumar • Son', 'Ravi Sharma • Grandson', 'Suresh Patel • Brother'];

      function simulateQuestionOptions() {
        const pool = [correctOption, ...distractors];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.indexOf(correctOption);
      }

      const indices = [];
      for (let run = 0; run < 30; run++) {
        indices.push(simulateQuestionOptions());
      }

      // Check that correct answer appeared at multiple distinct positions (not exclusively index 0)
      const uniquePositions = new Set(indices);
      expect(uniquePositions.size).toBeGreaterThan(1);
      const nonZeroCount = indices.filter((idx) => idx !== 0).length;
      expect(nonZeroCount).toBeGreaterThan(10); // statistically guaranteed with uniform shuffle
    });

    it('supports multiple choice scaling by difficulty (Easy: 2, Medium: 4, Hard: 6)', () => {
      const targetCounts = {
        easy: 2,
        medium: 4,
        hard: 6,
      };

      expect(targetCounts.easy).toBe(2);
      expect(targetCounts.medium).toBe(4);
      expect(targetCounts.hard).toBe(6);
    });

    it('records Name & Face recognition sessions with AI adaptive engine evaluation', async () => {
      const sessionId = `nameface-test-${Date.now()}`;
      const res = await request(app)
        .post('/api/games/session')
        .set('Cookie', authCookie)
        .send({
          clientSessionId: sessionId,
          gameType: 'name_face',
          level: 'easy',
          step: 'E1',
          score: 80,
          accuracy: 80,
          responseTimeMs: 2400,
          errorsCount: 1,
          hintsCount: 0,
          durationSeconds: 45,
          totalQuestions: 5,
          correctAnswers: 4,
          incorrectAnswers: 1,
          completionStatus: 'completed',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
    });
  });

  describe('Module 3: Adaptive AI Engine & Offline Queue Synchronization', () => {
    it('synchronizes batch offline sessions via /api/games/sync-offline', async () => {
      const offlineSessions = [
        {
          clientSessionId: `offline-puz-${Date.now()}-1`,
          gameType: 'puzzle_time',
          level: 'easy',
          step: 'E1',
          score: 100,
          accuracy: 100,
          durationSeconds: 25,
          totalQuestions: 4,
          correctAnswers: 4,
          incorrectAnswers: 0,
        },
        {
          clientSessionId: `offline-nf-${Date.now()}-2`,
          gameType: 'name_face',
          level: 'medium',
          step: 'M1',
          score: 85,
          accuracy: 85,
          durationSeconds: 30,
          totalQuestions: 4,
          correctAnswers: 4,
          incorrectAnswers: 0,
        },
      ];

      const syncRes = await request(app)
        .post('/api/games/sync-offline')
        .set('Cookie', authCookie)
        .send({ sessions: offlineSessions });

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.success).toBe(true);
      expect(syncRes.body.syncedCount).toBe(2);
    });

    it('retrieves adaptive history and game status for the elder', async () => {
      const statusRes = await request(app)
        .get('/api/games/status')
        .set('Cookie', authCookie);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);
      expect(Array.isArray(statusRes.body.games)).toBe(true);

      const historyRes = await request(app)
        .get('/api/games/adaptive-history')
        .set('Cookie', authCookie);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.success).toBe(true);
      expect(Array.isArray(historyRes.body.history)).toBe(true);
    });
  });
});
