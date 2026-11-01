# Smriti Saathi — Location Monitoring Setup & Verification Guide

This guide details configuration, architecture, phone testing procedures, native Android APK packaging, and real-world behavior for the **Location Monitoring Module**.

---

## 1. Important Infrastructure & Database Notice

> [!IMPORTANT]
> **Database Persistence in Production**
> - **SQLite (`server/data/elder.db`)**: Used by default in local offline development and test suites. On ephemeral cloud hosting providers (e.g. Render, Railway free tiers, Heroku), the local disk is erased on every restart or redeploy. All location samples, safe zones, and consent records will be wiped.
> - **PostgreSQL (Neon / Supabase / AWS RDS)**: Required for any live or staging production deployment. Configure `DATABASE_URL` in your `.env` file. The server automatically uses PostgreSQL when `DATABASE_URL` is configured and reachable.

---

## 2. Environment Variables Reference

Configure these in `server/.env` (or root `.env`):

| Variable | Description | Required in Prod | Default / Example |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes (for persistent DB) | `postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/elder_guardian?sslmode=require` |
| `USE_SQLITE` | Force SQLite engine even if PG is configured | No | `false` |
| `DEMO_MODE` | Allows simulated GPS injection on `/diagnostics` | No (Set `false` in prod) | `false` |
| `PORT` | Backend Express server port | No | `5000` |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | Yes (for push alerts) | Generated via `web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | Yes (for push alerts) | Generated via `web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Contact URI for push delivery | Yes | `mailto:support@smritisaathi.in` |
| `TWILIO_ACCOUNT_SID`| Twilio Account SID for urgent SMS alerts | Yes (for SMS alerts) | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes (for SMS alerts) | `your_twilio_auth_token` |
| `TWILIO_PHONE_NUMBER`| Registered Twilio Sender number | Yes (for SMS alerts) | `+18005550199` |

---

## 3. How to Manage Safe Zones and Approved Routes

### Safe Zones
Caregivers can manage safe zones from the **Live Location Tracking** page (`/location` or `/location/:elderId`):
1. **Add via Address / Geocoding**: Type an address (e.g. `Fancy Bazar, Guwahati`) in the safe zone modal. The backend geocodes using OpenStreetMap Nominatim with an identified User-Agent header and in-memory caching.
2. **Add by Tapping the Map**: Tap anywhere on the Leaflet map to drop a pin.
3. **Use Elder's Current Location**: Click the "Use Elder's Position" button to center a new zone directly on the elder's latest verified GPS fix.
4. **Configure Radius & Type**:
   - Types: `Home` (default radius 150m), `Relative` (150m), `Shop` (100m), `Hospital` (200m), `Temple` (100m), `Other` (150m).
   - Radius slider ranges from 50m to 2000m.
5. **Existing Addresses**: Any legacy addresses stored in `saved_places` automatically migrate to `safe_zones` on database startup.

### Approved Routes
Approved routes allow elders to walk routine corridors (e.g. from Home to the local Temple or grocery shop) without false alerts:
1. Select a **Departure Zone** and a **Destination Zone**.
2. Click **Generate Walking Route** to request a walking path from OSRM, or click points along streets to draw custom waypoints.
3. Specify the allowed **Corridor Width** (default: 100 meters).
4. Save and activate the route. When an elder departs toward that destination, the decision engine allows movement within that 100m corridor.

---

## 4. Testing on a Real Phone (Web PWA + Guardian Mode)

### Step 1: Open on Mobile Browser
1. Connect phone and development computer to the same Wi-Fi network (or deploy to HTTPS on your host).
2. Open `https://<your-host-or-ip>:5173` on Chrome (Android) or Safari (iOS).
   *(Note: Geolocation requires HTTPS or `localhost` as a Secure Context).*

### Step 2: Grant Plain-Words Consent
1. When prompted on the elder device, review the **Location Consent Screen**.
2. Tap **"Hear Aloud"** to verify the slow spoken audio (rate 0.65).
3. Tap **"Allow Location Sharing"**. The consent record is saved to `location_consents`.

### Step 3: Enable Guardian Mode
1. On the elder dashboard, toggle **Guardian Mode ON**.
2. Guardian mode requests the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) to prevent the phone display from sleeping while on outings.
3. The calm status bar at the top displays:
   > *"Location sharing is on, updated just now"*

---

## 5. Phone Test Checklist (30-Minute Walking Verification)

Use this checklist to perform a real-world validation:

- [ ] **1. Preparation**:
  - Open Smriti Saathi on the elder's smartphone.
  - Verify battery is above 20%.
  - Turn ON **Guardian Mode** (Wake Lock active).
  - Open caregiver dashboard on a second device / laptop (`/location`).

- [ ] **2. Safe Zone Baseline (Minute 0 - 5)**:
  - Stay inside Home zone.
  - Confirm caregiver map shows green "Safe Zone: Home" badge and 0 risk score.
  - Confirm GPS accuracy circle is within 15–30 meters.

- [ ] **3. Departure & Safe Vicinity (Minute 5 - 10)**:
  - Walk 200 meters away from Home down the street.
  - Confirm caregiver dashboard transitions status smoothly to `Away (Normal Routine)`.
  - Confirm NO false alarms or prompts occur (leaving home alone is NEVER a concern).

- [ ] **4. Extended Walk & Route Tracking (Minute 10 - 20)**:
  - Walk along an approved route toward a shop or park (~400m).
  - Confirm GPS samples arrive every 5 minutes in `location_samples`.
  - Confirm caregiver trail connects points chronologically with speed and battery indicators.

- [ ] **5. Screen Lock / Background Behavior Test (Minute 20 - 25)**:
  - Lock the phone screen for 6 minutes.
  - Turn screen back on and unlock phone.
  - Confirm the scheduler catches up immediately on `visibilitychange` / `focus` and flushes any queued fixes.

- [ ] **6. Unfamiliar / Stopped Outside Safety Check (Minute 25 - 30)**:
  - Stop at an unfamiliar spot > 150m from any zone for 10 minutes (or trigger diagnostic check).
  - Confirm the **Voice Safety Check Modal** appears full-screen with chime and vibration.
  - Listen to slow voice question: *"Hello! You seem to be somewhere unfamiliar. Are you okay? Would you like help?"*
  - Test speaking: *"Haan, theek hoon"* or tap **"I am okay"**.
  - Confirm check resolves as `resolved_ok` and initiates 30-minute cooldown.

---

## 6. Native Android Companion App (Capacitor)

### Architecture
For continuous background location recording when the browser screen is off and Guardian mode is inactive, Capacitor provides native background location with an Android Foreground Service and sticky persistent notification.

### Build Steps in Android Studio
1. **Initialize Capacitor**:
   ```bash
   cd client
   npx cap add android
   ```
2. **Sync Web Assets & Plugins**:
   ```bash
   npm run build
   npx cap sync
   ```
3. **Verify Permissions (`android/app/src/main/AndroidManifest.xml`)**:
   Ensure the following permissions are present:
   ```xml
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
   <uses-permission android:name="android.permission.WAKE_LOCK" />
   ```
4. **Run & Build in Android Studio**:
   ```bash
   npx cap open android
   ```
   In Android Studio:
   - Select **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - Deploy directly to connected Android hardware via USB debugging.

---

## 7. Honest Disclosures & Platform Limitations

> [!WARNING]
> **Web Browser vs. Native Companion App Disclosures**
> 1. **Web PWA Mode (Mobile Chrome / Safari)**:
>    - When the screen is active or **Guardian Mode** (Wake Lock) is enabled, GPS updates fire reliably every 5 minutes.
>    - When the user locks the phone screen or puts the browser completely into the background, modern mobile operating systems (iOS and Android) throttle JavaScript timers (`setInterval` / `setTimeout`). In web-only mode, updates pause while the phone is locked and execute an immediate **catch-up fix** the moment the screen wakes or app is reopened.
>    - Spoken voice questions require the app to be in the foreground. If the app is in the background, a high-priority Web Push notification is dispatched requesting the elder or helper to open the app.
> 2. **Native Companion App Mode**:
>    - The Capacitor native wrapper code and Android manifest templates are configured in `client/capacitor.config.json` and `client/android-template/AndroidManifest.xml`.
>    - Per project safety rules, the native background service is marked as **"UNTESTED until physically verified on a real hardware device"** because simulated background testing cannot guarantee aggressive vendor battery killers (e.g. Xiaomi MIUI / Samsung OneUI battery managers) will not kill background processes. Always verify on physical hardware before relying on native background tracking.

