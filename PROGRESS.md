# Smriti Saathi (स्मृति साथी) - Project Progress Tracker

Platform: AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in North Eastern India.

---

## Strict Rules
- [ ] No fake core flows. Every button calls a real API and saves real data.
- [ ] Every server error is logged with a clear message.
- [ ] Mandatory disclaimer on all screens & reports: "This app supports memory practice and safety. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns."
- [ ] Zero secret leaks. All secrets in `.env` / environment variables.
- [ ] Real browser verification and DB verification for every single phase test.

---

## Phase 1: Foundation, OTP Login, Saving Data, Early Deploy
- [x] Initialize repository structure (`/server`, `/client`, migrations, scripts)
- [x] PostgreSQL connection & automatic migration runner (Dedicated PostgreSQL 16 cluster on port 5433 with `elder_db`)
- [x] Shared voice `speak()` module (slow 0.65 default, queue, speed controls, pre-recorded fallbacks)
- [x] Shared location `location.js` module (HTTPS/localhost check, retry, Permissions API, server geocoding/routing)
- [x] Complete i18n setup (`en`, `hi`, `as`, `bn`) with `npm run check:i18n` (193 keys matching with 0 errors)
- [x] Authentication system:
  - [x] E.164 phone formatting with libphonenumber-js
  - [x] Real Twilio Verify SMS / Voice call support
  - [x] Clear DEMO MODE fallback with yellow banner
  - [x] Rate limits (5/hr/phone/IP), 5-minute expiry, max 5 wrong tries, 30s resend timer
  - [x] httpOnly cookie session for 90 days
- [x] Onboarding profile flow:
  - [x] "Who are you?" (family helper, health worker, elder)
  - [x] "Who is this app for?" (elder name, age, language)
  - [x] Immediate DB save & dynamic greeting by saved name
- [x] Diagnostics page `/diagnostics` & `/api/health`:
  - [x] Database status, OTP provider status, Twilio voice, Location status, Voice synthesis test, Push status, Last 20 server errors, i18n check result, "Send test OTP" button
- [x] Phase 1 Tests & Proof:
  - [x] Test 1: Register a number, get OTP (or demo banner), verify, reach home (Automated Supertest + Vitest passing)
  - [x] Test 2: Save elder name ("Ramesh"), reload, reopen browser, name persists and DB row confirmed (Verified in DB table `elders` row `4c2a578e-f1ec-419e-9da5-b55c34a43898`, name='Ramesh', age=74, lang='hi')
  - [x] Test 3: 5 wrong codes lock out; expired code rejected (Verified via Supertest: attempts lock at 5, expired OTP rejected)
  - [x] Test 4: Logout and login again shows the same data (Verified via Supertest + DB query)
  - [x] Test 5: Switch to Hindi and every visible text updates; `npm run check:i18n` passes (Audit succeeded with 193/193 keys)
  - [x] Test 6: `/diagnostics` shows real status; "Send test OTP" works or shows provider error (Live `/api/diagnostics/status` verified: DB connected, mode DEMO, VAPID configured)

---

## Phase 2: Setup Wizard (Comprehensive Data Collection)
- [ ] Step-by-step wizard (spoken aloud, progress bar, auto-save per step, resume exactly where stopped, quick setup option)
- [ ] Step 1: Elder details (name, age, language, NE region, photo resized in browser, voice speed)
- [ ] Step 2: Elder's home address (geocoded, confirmed on Leaflet map with draggable pin, saved as "Home")
- [ ] Step 3: Family members (unlimited: name, relationship, phone, address with pin, photo, 30s voice recording in bytea)
- [ ] Step 4: Saved places review (Home + family addresses + temple, market, hospital)
- [ ] Step 5: Emergency contacts (photo cards, tap to select, ordered priority)
- [ ] Step 6: Auto and cab drivers (name, phone, type, area, note)
- [ ] Step 7: Medicines & Reminders:
  - [ ] Medicine name, dose, picture/chip, times (morning, afternoon, evening, night / custom picker), before/after food, days, start/end date, tablets remaining, notes
  - [ ] Water reminders (every 2h between 07:00 and 20:00)
  - [ ] Meal times (breakfast, lunch, dinner)
  - [ ] Doctor appointments
- [ ] Step 8: Health details (encrypted blood group, allergies, conditions, doctor contact)
- [ ] Step 9: Consent screen (3 toggles default OFF) + "You are all set" checklist
- [ ] My Family page (photo cards, tap to hear voice message, green Call button)
- [ ] Family upload link (7-day revocable token for relatives to submit photos/voice with helper approval)
- [ ] Phase 2 Tests & Proof:
  - [ ] Test 1: Add elder and 3 family members (2 sons, 1 daughter) with photos, voices, addresses; reload shows photos and plays voice
  - [ ] Test 2: Saved places list Home + 3 family places with pins
  - [ ] Test 3: 2 emergency contacts ordered and persisted
  - [ ] Test 4: 2 drivers saved and displayed
  - [ ] Test 5: 2 medicines with different times saved and in DB
  - [ ] Test 6: Close browser mid-wizard and resume at exact step
  - [ ] Test 7: Mobile 360px layout verified
  - [ ] Test 8: Entire wizard in Hindi; `npm run check:i18n` passes

---

## Phase 3: Cognitive Games & Adaptive AI
- [ ] 6 Cognitive Games with Easy (E1-E3), Medium (M1-M3), Hard (H1-H3):
  - [ ] Game 1: Name and Face (family photos & relationships)
  - [ ] Game 2: Whose Voice (plays family voice audio, pick photo)
  - [ ] Game 3: Picture Matching (North East cultural items: 3, 6, 10 pairs; Hard with no preview)
  - [ ] Game 4: Pattern Game (Web Audio soft notes + colored pads: 3, 5, 8 lengths)
  - [ ] Game 5: Daily Routine Recall (order 3, 5, 7 activities from real medicines/meals)
  - [ ] Game 6: Voice Fluency (Web Speech API recognition + tap fallback, category naming, counts unique valid words)
- [ ] Adaptive AI Engine:
  - [ ] Elo-style rating per elder per game
  - [ ] 3-session rolling accuracy progression (>=80% up, <50% down, 3-mistake hint/easing)
  - [ ] Fatigue detection (accuracy/speed drop or >15 min -> "Let's rest")
  - [ ] 14-day baseline z-score drop detection (non-diagnostic wording)
  - [ ] "Today's Brain Exercise" (3 games, spaced repetition)
- [ ] Mood check-in (5 faces + calming exercises if sad/anxious)
- [ ] Family Dashboard (Recharts: sessions, streak, accuracy, mood, AI insights, seeded 6-week demo data)
- [ ] Phase 3 Tests & Proof:
  - [ ] Test 1: Play all 6 games at all levels in English & Hindi
  - [ ] Test 2: Adaptive step changes verified with unit tests
  - [ ] Test 3: Fluency game counts unique words & fallback works
  - [ ] Test 4: Dashboard displays sessions after reload
  - [ ] Test 5: Voice speed audible change verified
  - [ ] Test 6: `npm run check:i18n` passes

---

## Phase 4: Reminders That Fire On Time
- [ ] Server scheduler & cron tick endpoint:
  - [ ] Expand reminders into occurrences (Asia/Kolkata timezone)
  - [ ] `FOR UPDATE SKIP LOCKED` claim logic to prevent double firing
- [ ] Web Push with VAPID keys:
  - [ ] Service worker `/sw.js` registration
  - [ ] Push notifications in elder's language with action buttons
  - [ ] Sound, vibration, requireInteraction
- [ ] Talking alarm:
  - [ ] Medicine picture, name, dose, chime, voice repeat every 60s
  - [ ] Big Done, Remind me in 10 min, Skip
  - [ ] Screen WakeLock API
- [ ] Escalation logic:
  - [ ] Repeat push after 10 min
  - [ ] Mark missed at 20 min and alert family (push, SMS, in-app banner)
  - [ ] Tablet decrement & refill warning
- [ ] Push log table & Reminder Health Check page
- [ ] Phase 4 Tests & Proof:
  - [ ] Test 1: Add medicine 2 min ahead, receive push, talking alarm, Done, dashboard updates
  - [ ] Test 2: Ignore reminder: repeats at 10 min, family alerted at 20 min
  - [ ] Test 3: Server cron tick delivers exactly once
  - [ ] Test 4: Health check diagnoses push issues with 1-tap fix

---

## Phase 5: Safety: SOS Calls, "I Am Lost", Silent Guardian
- [ ] 5A. Emergency SOS:
  - [ ] Big red SOS button (1.5s hold or double tap, 5s countdown)
  - [ ] Twilio Voice escalation worker (TwiML gather '1', next contact after 30s)
  - [ ] SMS with Google Maps link, in-app family alert with medical details
  - [ ] SOS timeline `/sos/:id`
- [ ] 5B. "I Am Lost" / Take Me Home:
  - [ ] Server-routed walking directions with OSRM (fallback to compass/straight line)
  - [ ] Giant text one step at a time + slow spoken directions + Leaflet route
  - [ ] Automatic family alert + live map `/live/:elderId` (30s polling)
- [ ] 5C. Silent Guardian AI:
  - [ ] Auto-lost check-in (threshold distance or after 20:00, 2-min countdown, family alert)
  - [ ] Routine drift (median of last 14 days + 90 min / 2 spreads trigger gentle note)
  - [ ] Silent Guardian cards on family dashboard
- [ ] Phase 5 Tests & Proof:
  - [ ] Test 1: SOS escalation through contacts with TwiML acknowledgement
  - [ ] Test 2: Countdown cancellation makes no call
  - [ ] Test 3: Escalation worker survives server restart
  - [ ] Test 4: "I Am Lost" routing to Home and family addresses
  - [ ] Test 5: Live family tracking view updates
  - [ ] Test 6: Auto-lost check-in trigger, timeout escalation, cooldown
  - [ ] Test 7: Routine drift note generated after skipped routine
  - [ ] Test 8: Hindi verified for all safety features

---

## Phase 6: EasyRide with Family's Driver Numbers
- [ ] Elder ride request interface (Auto / Cab, saved destination cards, GPS pickup, fare estimate)
- [ ] Family ride approval flow
- [ ] Driver dispatch: Call (tel:), WhatsApp (wa.me with prefilled maps links), SMS, Twilio Voice dispatch
- [ ] Rides table & real-time trip status tracking
- [ ] Trip completion & 3-face rating
- [ ] Phase 6 Tests & Proof:
  - [ ] Test 1: Request ride, open WhatsApp prefilled link, call driver
  - [ ] Test 2: Family approval updates elder screen
  - [ ] Test 3: Family-entered driver details persist after reload
  - [ ] Test 4: Ride history & rating
  - [ ] Test 5: Fallback when no drivers saved
  - [ ] Test 6: Hindi localization verified

---

## Phase 7: Dashboards & AI-Written PDF Report
- [ ] Family & Health Worker dashboards with role permissions & audit log
- [ ] PDF Report generator with `pdfkit`:
  - [ ] 7, 30, 90 day periods
  - [ ] Elder summary, sessions, streak, game accuracy charts, voice fluency, mood, medicine adherence
  - [ ] Safety events log (SOS, Lost, Rides, Silent Guardian)
  - [ ] AI plain-language summary & next steps (Gemini / rule-based templates)
  - [ ] Embedded Noto Sans fonts for Hindi / Bengali / Assamese
  - [ ] Non-diagnosis legal disclaimer on every page
  - [ ] Privacy consent enforcement
- [ ] Phase 7 Tests & Proof:
  - [ ] Test 1: PDF generation in English and Hindi verified with visual inspection
  - [ ] Test 2: Consent toggles omit restricted sections
  - [ ] Test 3: Audit log records export
  - [ ] Test 4: Dashboard stats match database records

---

## Phase 8: Offline, Install & Final QA
- [ ] PWA manifest, service worker cache for offline games & i18n packs
- [ ] IndexedDB offline game session queue & idempotent sync
- [ ] Offline status indicator & cold start warming screen
- [ ] End-to-end full journey testing (360px viewport, English & Hindi)
- [ ] Automated Vitest & Supertest test suite
- [ ] Deployment & Live URL verification
- [ ] Documentation: QR Code, README, Phone test checklist, Honest limits disclosure
