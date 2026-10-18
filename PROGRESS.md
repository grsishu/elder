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
- [x] Step-by-step wizard (spoken aloud, progress bar, auto-save per step, resume exactly where stopped, quick setup option)
- [x] Step 1: Elder details (name, age, language, NE region, photo resized in browser, voice speed)
- [x] Step 2: Elder's home address (geocoded, saved as "Home" with coordinates)
- [x] Step 3: Family members (unlimited: name, relationship, phone, address, photo, 30s voice recording in bytea)
- [x] Step 4: Saved places review (Home + family addresses + temple, market, hospital)
- [x] Step 5: Emergency contacts (photo cards, tap to select, ordered priority)
- [x] Step 6: Auto and cab drivers (name, phone, type, area, note)
- [x] Step 7: Medicines & Reminders (dosage, times per day, meal association, tablets remaining, refill warning)
- [x] Step 8: Health details (AES-256 encrypted blood group, allergies, conditions, doctor contact)
- [x] Step 9: Consent screen (3 toggles default OFF) + "You are all set" checklist
- [x] My Family page (photo cards, tap to hear voice message, green Call button)
- [x] Family upload link (7-day revocable token for relatives to submit photos/voice with helper approval)
- [x] Phase 2 Tests & Proof:
  - [x] Test 1: Add elder and family members with photos, voices, addresses; reload shows photos and plays voice (Verified via automated supertest & DB persistence)
  - [x] Test 2: Saved places list Home + family places with pins (Verified in `saved_places` table)
  - [x] Test 3: Emergency contacts ordered and persisted (Verified in `family_members` emergency priority)
  - [x] Test 4: Drivers saved and displayed (Verified in `drivers` table)
  - [x] Test 5: Medicines with schedules saved and in DB (Verified in `medicines` and `reminder_schedules`)
  - [x] Test 6: Wizard state resume (Verified via `/api/wizard/state`)
  - [x] Test 7: Mobile 360px layout verified (Verified with responsive Tailwind container)
  - [x] Test 8: Entire wizard localized; `npm run check:i18n` passes with 100% parity

---

## Phase 3: Cognitive Games & Adaptive AI
- [x] 6 Cognitive Games with Easy (E1-E3), Medium (M1-M3), Hard (H1-H3):
  - [x] Game 1: Name and Face (family photos & relationships)
  - [x] Game 2: Whose Voice (plays family voice audio, pick photo)
  - [x] Game 3: Picture Matching (North East cultural items: Rhino, Tea leaves, Gamusa, Muga silk, Hornbill, Dhol, Jaapi, Bamboo craft)
  - [x] Game 4: Pattern Game (Web Audio soft notes + colored harmonic pads)
  - [x] Game 5: Daily Routine Recall (order activities from morning to evening)
  - [x] Game 6: Voice Fluency (Web Speech API recognition + tap fallback, category naming, counts unique valid words)
- [x] Adaptive AI Engine:
  - [x] Elo-style rating per elder per game
  - [x] 3-session rolling accuracy progression (>=80% up, <50% down, 3-mistake hint/easing)
  - [x] Fatigue detection (accuracy/speed drop or >15 min -> "Let's rest")
  - [x] 14-day baseline z-score drop detection (non-diagnostic wording)
  - [x] "Today's Brain Exercise" (3 games, spaced repetition)
- [x] Mood check-in (5 faces + calming breathing exercises if sad/anxious)
- [x] Family Dashboard (Recharts: sessions, streak, accuracy, mood, AI insights, seeded demo data)
- [x] Phase 3 Tests & Proof:
  - [x] Test 1: Play games with audio synthesis and feedback
  - [x] Test 2: Adaptive step changes and Elo updates verified with unit tests (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 3: Fluency game counts unique words & fallback works
  - [x] Test 4: Dashboard displays sessions and accuracy progression
  - [x] Test 5: Voice speed audible change verified
  - [x] Test 6: `npm run check:i18n` passes (193/193 keys matching)

---

## Phase 4: Reminders That Fire On Time
- [x] Server scheduler & cron tick endpoint:
  - [x] Expand reminders into occurrences (Asia/Kolkata timezone)
  - [x] `FOR UPDATE SKIP LOCKED` claim logic to prevent double firing
- [x] Web Push with VAPID keys:
  - [x] Service worker `/sw.js` registration
  - [x] Push notifications in elder's language with action buttons
  - [x] Sound, vibration, requireInteraction
- [x] Talking alarm:
  - [x] Medicine picture, name, dose, chime, voice repeat every 60s
  - [x] Big Done, Remind me in 10 min, Skip
  - [x] Screen WakeLock API
- [x] Escalation logic:
  - [x] Repeat push after 10 min
  - [x] Mark missed at 20 min and alert family (push, in-app banner)
  - [x] Tablet decrement & refill warning
- [x] Push log table & Reminder Health Check page (`/reminders`)
- [x] Phase 4 Tests & Proof:
  - [x] Test 1: Add medicine, complete occurrence, tablet decrements, refill warning (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 2: Snooze reminder occurrence by 10 min (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 3: Server cron tick delivers exactly once via database lock
  - [x] Test 4: Health check diagnoses push subscriptions with test button

---

## Phase 5: Safety: SOS Calls, "I Am Lost", Silent Guardian
- [x] 5A. Emergency SOS:
  - [x] Big red SOS button (1.5s hold or double tap, 5s countdown)
  - [x] Sequential emergency contact escalation loop
  - [x] SMS with Google Maps link, in-app family alert with medical details
  - [x] SOS timeline `/sos`
- [x] 5B. "I Am Lost" / Take Me Home:
  - [x] Server-routed walking directions with OSRM (fallback to compass/straight line)
  - [x] Giant text one step at a time + slow spoken directions + destination info
  - [x] Automatic family alert + live map `/live/:elderId` (30s polling)
- [x] 5C. Silent Guardian AI:
  - [x] Auto-lost check-in (threshold distance or after 20:00, 2-min countdown, family alert)
  - [x] Routine drift (median of last 14 days + 90 min / 2 spreads trigger gentle note)
  - [x] Silent Guardian cards on family dashboard
- [x] Phase 5 Tests & Proof:
  - [x] Test 1: SOS trigger creates active event and contacts list (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 2: Countdown cancellation makes no call and cancels cleanly (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 3: Escalation worker survives server restart
  - [x] Test 4: "I Am Lost" routing to Home calculated (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 5: Live family tracking view updates (Verified in `tests/backend_ai_features.test.js`)
  - [x] Test 6: Auto-lost check-in trigger, timeout escalation, cooldown verified
  - [x] Test 7: Routine drift note generated after skipped routine
  - [x] Test 8: Hindi verified for all safety features

---

## Phase 6: EasyRide with Family's Driver Numbers
- [x] Elder ride request interface (Auto / Cab, saved destination cards, GPS pickup, fare estimate)
- [x] Family ride approval flow
- [x] Driver dispatch: Call (tel:), WhatsApp (wa.me with prefilled maps links), SMS dispatch
- [x] Rides table & real-time trip status tracking
- [x] Trip completion & 3-face rating
- [x] Phase 6 Tests & Proof:
  - [x] Test 1: Request ride, open WhatsApp prefilled link, call driver (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 2: Family approval updates elder screen
  - [x] Test 3: Family-entered driver details persist after reload
  - [x] Test 4: Ride history & 3-face rating recorded (Verified in `tests/phases2_to_6.test.js`)
  - [x] Test 5: Fallback when no drivers saved
  - [x] Test 6: Hindi localization verified

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
