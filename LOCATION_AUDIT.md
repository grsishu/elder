# Location Monitoring Audit - Smriti Saathi (AI Elderly Guardian)

**Date**: 2026-10-30  
**Project**: AI Elderly Guardian (Smriti Saathi)  
**Author**: Antigravity Engineering  

---

## 1. Executive Summary

This audit inspects the existing architecture of Smriti Saathi to plan the integration of the unified **Location Monitoring Module**. In accordance with Rule 0, all new location functionality directly **extends** existing tables, services, routes, and UI components rather than creating parallel or duplicate systems.

---

## 2. Existing System Inventory

### 2.1 Authentication, Users & Roles
- **Database Tables**:
  - `users`: User identity with E.164 phone numbers (`+91...`), user roles (`elder`, `caregiver`, `health_worker`).
  - `user_sessions`: Persistent 90-day sessions with SHA-256 hashed tokens (`token_hash`, `expires_at`).
  - `otp_verifications`: Phone number verification codes, attempts counter, rate limiting.
- **Server Routes & Middleware**:
  - `server/src/routes/auth.js`: `/request-otp`, `/verify-otp`, `/session`, `/logout`. 5 requests/hour rate limit, 30s resend timer.
  - `server/src/middleware/auth.js`: `requireAuth` validates cookie `smriti_session` and sets `req.user`.
- **Client**:
  - `client/src/pages/Login.jsx`: Mobile-first OTP entry, demo mode toggle banner, language selector.

### 2.2 Elders & Caregiver Links
- **Database Tables**:
  - `elders`: Primary elder profile (`id`, `user_id`, `name`, `age`, `language`, `region`, `voice_speed` default 0.65, `photo`, `photo_mime`, `last_known_lat`, `last_known_lng`, `last_known_at`).
  - `elder_caregivers`: Many-to-many relationship linking caregivers to elders with granular permission flags:
    - `can_see_location` (BOOLEAN, default FALSE)
    - `can_see_progress` (BOOLEAN, default TRUE)
    - `can_see_health` (BOOLEAN, default FALSE)
    - `can_manage_reminders` (BOOLEAN, default TRUE)
    - `can_approve_rides` (BOOLEAN, default TRUE)
    - `status` ('active', 'pending')
  - `elder_consent`: Legacy consent table (`elder_id`, `share_location`, `share_health`, `share_progress`).
- **Server Routes**:
  - `server/src/routes/elder.js`: Full CRUD on elder profiles and caregiver assignments.

### 2.3 Saved Places & Physical Context
- **Database Tables**:
  - `saved_places`: Created during setup wizard (`id`, `elder_id`, `name`, `address`, `latitude`, `longitude`, `place_type` e.g., 'home', 'relative', 'temple', 'hospital', 'market').
  - `geo_cache`: Geocoding cache table caching Nominatim / OpenStreetMap reverse geocoding queries with timestamps.
- **Server Routes**:
  - `server/src/routes/geo.js`: Reverse geocoding and OSRM walking route calculation with custom User-Agent headers and caching.

### 2.4 Existing Location & Lost-Check Code
- **Database Tables (from Migrations 002 & 003)**:
  - `location_samples`: Created in Migration 003 (`id`, `elder_id`, `latitude`, `longitude`, `accuracy`, `speed`, `battery`, `source`, `unreliable_for_safety`, `recorded_at`, `created_at`).
  - `usual_places`: Created in Migration 003 (`id`, `elder_id`, `saved_place_id`, `latitude`, `longitude`, `radius_m`, `label`, `origin` ['saved', 'learned', 'approved'], `visits`, `last_visit`). Populated from `saved_places`.
  - `lost_checks`: Created in 002 & 003 (`id`, `elder_id`, `status` ['active', 'fine', 'take_home', 'alerted', 'acknowledged', 'expired', 'resolved'], `level`, `risk_score`, `reasons_json`, `nearest_place`, `distance_m`, `started_at`, `resolved_at`, `rule`, `cooldown_until`).
  - `lost_check_events`: Detailed audit log of every step in a safety check (`check_id`, `event_time`, `event_type`, `detail`, `metadata`).
  - `lost_settings` / `elder_safety_settings`: Thresholds for distance, night hours, quiet hours.
- **Server Services & Routes**:
  - `server/src/services/lostDetectionAI.js`:
    - `haversineDistanceM(lat1, lon1, lat2, lon2)`
    - `computeLostRiskScore()`: Calculates risk score (0–100) using 6 components: Distance from places, Night rule (+15), Unfamiliar place (+20), Circling/Wandering patterns, Low battery, and Cooldown suppression.
    - `evaluateElderLostState()`: Manages safety escalation steps.
    - `clusterLearnedUsualPlaces()`: Clusters location history over 14 days to discover recurring unmapped safe spots.
  - `server/src/routes/location.js`:
    - `POST /api/location`: Ingests single sample.
    - `GET /api/location/checkin/active`: Polls active check-in modal.
    - `POST /api/location/checkin/respond`: Responds "fine" or "take_home".
    - `GET /api/location/live/:elderId`: Caregiver live tracking feed.
    - `GET /api/location/usual-places` and `POST /api/location/usual-places/:id/approve`.
- **Client Components**:
  - `client/src/utils/location.js`: High-accuracy location fetching, low-accuracy fallback on timeout, Permissions API check, secure context validation, watchPosition throttling, and local simulation storage.
  - `client/src/components/LostCheckinModal.jsx`: Full-screen modal with speech announcement, countdown timer, "I am fine" (cooldown), and "Take Me Home" buttons.
  - `client/src/pages/LiveLocation.jsx`: Leaflet map with elder pin, accuracy circle, usual places, risk score meter, and factor breakdown.
  - `client/src/pages/TakeMeHome.jsx`: Step-by-step walking guidance to Home with OSRM routing.

### 2.5 Notifications & Communication (Web Push & Twilio)
- **Web Push**:
  - `server/src/services/push.js`: Uses `web-push` library with VAPID keys, stores subscriptions in `push_subscriptions`, logs to `push_logs`.
- **Twilio**:
  - `server/src/services/twilio.js`: Real SMS & Voice verification via Twilio Verify API, and `sendEmergencySms` for SOS and high-urgency alerts with Google Maps links.
  - Respects `DEMO_MODE=true` when Twilio credentials are not set or in test mode.

### 2.6 Localization (i18n) & Spoken Voice
- **i18n**:
  - `client/src/locales/`: Complete JSON catalogs for `en` (English) and `hi` (Hindi) with 226 matching keys verified by `scripts/check-i18n.js` (100% parity, 0 missing keys).
- **Voice**:
  - `client/src/utils/voice.js`: Web SpeechSynthesis engine locked to slow rate (`0.65` default), queueing, clean phrase segmentation, and pre-recorded audio fallbacks for elder comfort.

### 2.7 Database Driver & Storage Architecture
- **Current DB Driver**:
  - `server/src/db.js` uses `pg` (node-postgres) pointing to `DATABASE_URL` (`postgres://postgres@localhost:5433/elder_db`).
  - Currently, when offline or in sandboxed environments without a PostgreSQL daemon, TCP connection fails (`ECONNREFUSED` / `EACCES`).
  - **Required Action**: Integrate a unified data-access layer in `server/src/db.js` that supports both **PostgreSQL** and **SQLite** (`sqlite3`). All queries and schema migrations must use portable SQL (TEXT primary keys, ISO timestamps, standard SQL without Postgres-only dialect lock-in).
  - **Notice**: SQLite on ephemeral free hosts (e.g. Render, Railway free tier) is erased on redeploy; production deployments require PostgreSQL (Neon) or a persistent disk.

---

## 3. Migration & Extension Strategy

To avoid duplicate systems or abandoned tables, we will extend the existing schema seamlessly via Migration `004_location_monitoring_system.sql`:

1. **`location_consents`**:
   - Create table `location_consents(id, elder_id, granted_by, granted_at, revoked_at, scope)` to record formal consents with exact grant/revocation timestamps and scope.
   - Migrate existing `elder_consent.share_location = TRUE` records into `location_consents`.

2. **`location_samples`**:
   - Alter existing table to add: `client_id` (TEXT UNIQUE), `lat` (NUMERIC), `lng` (NUMERIC), `accuracy_m` (NUMERIC), `speed_mps` (NUMERIC), `heading` (NUMERIC), `battery_pct` (INTEGER), `source` (VARCHAR: 'gps'|'network'|'native'|'simulated'), `captured_at` (TIMESTAMP), `received_at` (TIMESTAMP), `flags` (TEXT/JSON).
   - Ensure backward compatibility: keep existing `latitude`, `longitude`, `accuracy`, `speed`, `battery`, `recorded_at` synchronized or aliased so existing queries continue working.

3. **`safe_zones`**:
   - Create `safe_zones(id, elder_id, name, type, lat, lng, radius_m, address, active, created_by, created_at)`.
   - Types: `home`, `relative`, `shop`, `hospital`, `temple`, `other`.
   - Seed automatically from `usual_places` and `saved_places`.

4. **`approved_routes`**:
   - Create `approved_routes(id, elder_id, name, from_zone_id, to_zone_id, path_geojson, corridor_m DEFAULT 100, active)`.

5. **`familiar_cells`**:
   - Create `familiar_cells(elder_id, cell_key, visits, last_visit)` tracking 100-meter grid cells learned from the last 30 days of high-accuracy fixes.

6. **`location_settings`**:
   - Extend/create `location_settings(elder_id, interval_min DEFAULT 5, accuracy_limit_m DEFAULT 150, unfamiliar_distance_m DEFAULT 1500, stationary_min DEFAULT 10, confirm_samples DEFAULT 2, night_start, night_end, quiet_hours, ask_attempts DEFAULT 3, ask_wait_sec DEFAULT 90, cooldown_min DEFAULT 30, alert_channels, stale_after_min DEFAULT 15)`.
   - Seed defaults from existing `lost_settings`.

7. **`safety_checks` & `safety_check_prompts`**:
   - Create `safety_checks(id, elder_id, status, concern_json, started_at, resolved_at)`.
   - Create `safety_check_prompts(id, check_id, attempt, asked_at, answered_at, answer, method)`.

8. **`location_alerts`**:
   - Create `location_alerts(id, elder_id, severity, kind, message, reason_json, map_link, elder_responded, created_at, acknowledged_by, acknowledged_at)`.

9. **`audit_logs`**:
   - Leverage existing `audit_logs` table (`user_id`, `elder_id`, `action`, `resource`, `ip_address`, `details`, `created_at`) and write an audit row every time location data is read by a caregiver.

---

## 4. Next Implementation Steps

- [x] Complete Audit (`/LOCATION_AUDIT.md`)
- [ ] Implement Unified Data Access Layer in `server/src/db.js` (PostgreSQL + SQLite)
- [ ] Create and run migration `004_location_monitoring_system.sql`
- [ ] Implement pure Decision Engine `server/src/services/decisionEngine.js` (`evaluate()`)
- [ ] Update server ingest (`POST /api/location/batch`) with Zod validation, consent checks, rate limiting, and familiar cells updating
- [ ] Build Caregiver Safe Zones & Approved Routes API and UI
- [ ] Build Client 5-minute Scheduler with IndexedDB offline queue, Wake Lock, and catch-up on visibility change
- [ ] Build Voice Safety Check State Machine (SpeechRecognition + Big Buttons, calm voice rate 0.65)
- [ ] Implement Caregiver Alerts, SSE live updates, and enhanced Location Dashboard
- [ ] Set up Capacitor wrapper and `NativeLocationProvider` with honest background execution disclosures
- [ ] Run full automated test suite (Vitest + Supertest) and write `/LOCATION_SETUP.md` with phone checklist

