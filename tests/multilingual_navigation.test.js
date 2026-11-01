import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import { formatManeuverInstruction } from '../server/src/services/multilingualRouting.js';
import { classifyVoiceIntent, ACTION_INTENTS } from '../client/src/utils/navigationVoiceAI.js';

const SUPPORTED_LANGUAGES = [
  'en', 'hi', 'ta', 'as', 'bn', 'te', 'ml', 'kn', 'mr', 'gu', 'or', 'pa', 'ur'
];

const REQUIRED_NAVIGATION_KEYS = [
  'title', 'where_to_go', 'destination_home', 'destination_hospital', 'destination_temple',
  'destination_market', 'destination_son', 'destination_daughter', 'calculating_route',
  'wrong_route_prompt', 'yes_show_route', 'no_i_am_fine', 'lost_prompt', 'yes_help_me',
  'offline_notice', 'call_family_shortcut', 'stop_navigation', 'take_me_home',
  'i_am_lost', 'are_you_lost', 'family_informed', 'choose_destination', 'home',
  'hospital', 'doctor_clinic', 'current_location', 'destination', 'shall_i_guide',
  'start_navigation', 'walk_straight', 'turn_left', 'turn_right', 'make_uturn',
  'keep_left', 'keep_right', 'arrived', 'listen_again', 'next_step', 'recalculate_route',
  'gps_unavailable', 'internet_unavailable', 'route_not_found', 'navigation_completed',
  'retry', 'cancel', 'yes', 'no', 'step_of', 'away', 'guided_view', 'map_view'
];

describe('Module 1: Comprehensive Multilingual Translation Coverage', () => {
  SUPPORTED_LANGUAGES.forEach((lang) => {
    it(`verifies locale file for ${lang} contains all required navigation keys`, () => {
      const localePath = path.resolve(process.cwd(), 'client', 'src', 'locales', `${lang}.json`);
      expect(fs.existsSync(localePath)).toBe(true);

      const raw = fs.readFileSync(localePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data).toHaveProperty('navigation');

      const nav = data.navigation;
      REQUIRED_NAVIGATION_KEYS.forEach((key) => {
        expect(nav[key], `Missing translation key: navigation.${key} in ${lang}.json`).toBeDefined();
        expect(typeof nav[key]).toBe('string');
        expect(nav[key].trim().length).toBeGreaterThan(0);
      });
    });
  });
});

describe('Module 2 & 7: Multilingual Speech Recognition & Intent Classification', () => {
  const SAMPLE_LOST_PHRASES = {
    en: 'I am lost help me find my way',
    hi: 'मुझे मदद चाहिए मैं रास्ता भटक गया हूँ',
    ta: 'நான் வழி தவறிவிட்டேன் உதவி செய்',
    as: 'মই হেৰাই গৈছোঁ মোক সহায় কৰক',
    bn: 'আমি হারিয়ে গেছি আমাকে সাহায্য করুন',
    te: 'నేను దారి తప్పాను సహాయం చేయండి',
    ml: 'എനിക്ക് വഴിതെറ്റിപ്പോയി സഹായിക്കൂ',
    kn: 'ನಾನು ದಾರಿ ತಪ್ಪಿದ್ದೇನೆ ಸಹಾಯ ಮಾಡಿ',
    mr: 'मी रस्ता चुकलो आहे मला मदत करा',
    gu: 'હું રસ્તો ભૂલી ગયો છું મદદ કરો',
    or: 'ମୁଁ ବାଟ ଭୁଲିଯାଇଛି ମୋତେ ସାହାଯ୍ୟ କରନ୍ତୁ',
    pa: 'ਮੈਂ ਰਸਤਾ ਭੁੱਲ ਗਿਆ ਹਾਂ ਮਦਦ ਕਰੋ',
    ur: 'میں راستہ بھول گیا ہوں میری مدد کرو',
  };

  SUPPORTED_LANGUAGES.forEach((lang) => {
    it(`accurately classifies LOST_REQUEST in ${lang}`, () => {
      const phrase = SAMPLE_LOST_PHRASES[lang];
      const intent = classifyVoiceIntent(phrase);
      expect(intent).toBe(ACTION_INTENTS.LOST_REQUEST);
    });
  });

  const SAMPLE_REPEAT_PHRASES = {
    en: 'please repeat',
    hi: 'फिर से बोलो',
    ta: 'மீண்டும் சொல்',
    as: 'পুনৰ কওক',
    bn: 'আবার বলুন',
    te: 'మళ్లీ చెప్పు',
    ml: 'വീണ്ടും പറയൂ',
    kn: 'ಮತ್ತೆ ಹೇಳಿ',
    mr: 'पुन्हा सांगा',
    gu: 'ફરીથી બોલો',
    or: 'ପୁଣି କୁହନ୍ତୁ',
    pa: 'ਦੁਬਾਰਾ ਬੋਲੋ',
    ur: 'دوبارہ بولو',
  };

  SUPPORTED_LANGUAGES.forEach((lang) => {
    it(`accurately classifies REPEAT_INSTRUCTION in ${lang}`, () => {
      const phrase = SAMPLE_REPEAT_PHRASES[lang];
      const intent = classifyVoiceIntent(phrase);
      expect(intent).toBe(ACTION_INTENTS.REPEAT_INSTRUCTION);
    });
  });

  const SAMPLE_NEXT_PHRASES = {
    en: 'go to next step',
    hi: 'अगला कदम बताओ',
    ta: 'அடுத்த படி காட்டு',
    as: 'পৰৱৰ্তী পদক্ষেপ',
    bn: 'পরের ধাপ',
    te: 'తదుపరి అడుగు',
    ml: 'അടുത്ത ഘട്ടം',
    kn: 'ಮುಂದಿನ ಹೆಜ್ಜೆ',
    mr: 'पुढचे पाऊल',
    gu: 'આગળનું પગલું',
    or: 'ପରବର୍ତ୍ତୀ ପାଦ',
    pa: 'ਅਗਲਾ ਕਦਮ',
    ur: 'اگلا قدم',
  };

  SUPPORTED_LANGUAGES.forEach((lang) => {
    it(`accurately classifies NEXT_INSTRUCTION in ${lang}`, () => {
      const phrase = SAMPLE_NEXT_PHRASES[lang];
      const intent = classifyVoiceIntent(phrase);
      expect(intent).toBe(ACTION_INTENTS.NEXT_INSTRUCTION);
    });
  });
});

describe('Module 4: Multilingual Walking Maneuver Instructions Generator', () => {
  SUPPORTED_LANGUAGES.forEach((lang) => {
    it(`formats turn_left instruction properly in ${lang}`, () => {
      const instruction = formatManeuverInstruction({
        maneuverType: 'turn',
        modifier: 'left',
        distanceM: 45,
        streetName: 'Main Road',
        lang,
      });
      expect(typeof instruction).toBe('string');
      expect(instruction.length).toBeGreaterThan(0);
    });

    it(`formats arrive instruction properly in ${lang}`, () => {
      const instruction = formatManeuverInstruction({
        maneuverType: 'arrive',
        destinationName: 'Home',
        lang,
      });
      expect(typeof instruction).toBe('string');
      expect(instruction.length).toBeGreaterThan(0);
    });
  });
});

describe('Module 5, 10 & 13: Navigation Sessions and Family Notification APIs', () => {
  let authCookie;
  let testUser;
  let elderId;
  let testPlaceId;
  let activeSessionId;

  beforeAll(async () => {
    // 1. Create test user and session for auth
    const testPhone = '+919876543200';
    await query('DELETE FROM users WHERE phone = $1', [testPhone]);

    const uRes = await query(
      `INSERT INTO users (phone, role) VALUES ($1, 'elder') RETURNING id, phone, role`,
      [testPhone]
    );
    testUser = uRes.rows[0];

    const token = 'test-token-nav-' + Date.now();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
      [testUser.id, tokenHash]
    );
    authCookie = `smriti_session=${token}; Path=/; HttpOnly`;

    // 2. Ensure elder exists
    const eRes = await query(
      `INSERT INTO elders (user_id, name, age, language, region)
       VALUES ($1, 'Kalyani Devi', 74, 'ta', 'Tamil Nadu')
       RETURNING id`,
      [testUser.id]
    );
    elderId = eRes.rows[0].id;

    // 3. Ensure saved place exists
    const placeRes = await query(
      `INSERT INTO saved_places (elder_id, name, address, latitude, longitude, place_type, category)
       VALUES ($1, 'Daughter House', 'Dispur, Guwahati', 26.145, 91.790, 'relative', 'family')
       RETURNING id`,
      [elderId]
    );
    testPlaceId = placeRes.rows[0].id;
  });

  afterAll(async () => {
    if (testPlaceId) {
      await query('DELETE FROM saved_places WHERE id = $1', [testPlaceId]);
    }
    if (activeSessionId) {
      await query('DELETE FROM navigation_sessions WHERE id = $1', [activeSessionId]);
    }
    if (testUser) {
      await query('DELETE FROM users WHERE id = $1', [testUser.id]);
    }
  });

  it('calculates walking route in Tamil via POST /api/navigation/route', async () => {
    const res = await request(app)
      .post('/api/navigation/route')
      .set('Cookie', authCookie)
      .send({
        elderId,
        latitude: 26.150,
        longitude: 91.785,
        destinationPlaceId: testPlaceId,
        lang: 'ta',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.destination).toBeDefined();
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(res.body.steps.length).toBeGreaterThan(0);
    expect(res.body.steps[0].instruction).toBeDefined();
  });

  it('creates active navigation session via POST /api/navigation/session', async () => {
    const res = await request(app)
      .post('/api/navigation/session')
      .set('Cookie', authCookie)
      .send({
        elderId,
        destinationId: testPlaceId,
        destinationName: 'Daughter House',
        startLat: 26.150,
        startLng: 91.785,
        destinationLat: 26.145,
        destinationLng: 91.790,
        totalSteps: 5,
        totalDistanceM: 520,
        language: 'ta',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.status).toBe('active');
    activeSessionId = res.body.session.id;
  });

  it('records step progress via PUT /api/navigation/session/:id/progress', async () => {
    const res = await request(app)
      .put(`/api/navigation/session/${activeSessionId}/progress`)
      .set('Cookie', authCookie)
      .send({
        stepIndex: 1,
        remainingDistanceM: 380,
        eventType: 'step_advanced',
        latitude: 26.148,
        longitude: 91.787,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.current_step_index).toBe(1);
    expect(res.body.session.remaining_distance_m).toBe(380);
  });

  it('triggers truthful family notification via POST /api/navigation/notify-family', async () => {
    const res = await request(app)
      .post('/api/navigation/notify-family')
      .set('Cookie', authCookie)
      .send({
        elderId,
        sessionId: activeSessionId,
        destinationName: 'Daughter House',
        latitude: 26.150,
        longitude: 91.785,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.familyInformed).toBe(true);
  });

  it('completes navigation session via POST /api/navigation/session/:id/complete', async () => {
    const res = await request(app)
      .post(`/api/navigation/session/${activeSessionId}/complete`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.status).toBe('completed');
    expect(res.body.session.remaining_distance_m).toBe(0);
  });
});
