-- Smriti Saathi Database Schema Migration 004
-- Complete Location Monitoring Module: Consents, Samples, Safe Zones, Routes, Familiar Cells, Settings, Safety Checks, Alerts

-- 1. Location Consents Table
CREATE TABLE IF NOT EXISTS location_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    scope VARCHAR(64) DEFAULT 'caregivers'
);
CREATE INDEX IF NOT EXISTS idx_loc_consents_elder ON location_consents(elder_id, revoked_at);

-- Migrate existing positive consents from elder_consent table
INSERT INTO location_consents (elder_id, granted_at, scope)
SELECT elder_id, NOW(), 'caregivers'
FROM elder_consent
WHERE share_location = TRUE
  AND elder_id NOT IN (SELECT elder_id FROM location_consents WHERE revoked_at IS NULL);

-- 2. Enhance location_samples with Section 1 specifications
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS client_id VARCHAR(128);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS accuracy_m NUMERIC(8, 2);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS speed_mps NUMERIC(8, 2);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS heading NUMERIC(6, 2);
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS battery_pct INTEGER;
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE location_samples ADD COLUMN IF NOT EXISTS flags TEXT DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loc_samples_client_id ON location_samples(client_id);
CREATE INDEX IF NOT EXISTS idx_loc_samples_elder_captured ON location_samples(elder_id, captured_at DESC);

-- 3. Safe Zones (Geofenced places: Home, Relative, Shop, Hospital, Temple, Other)
CREATE TABLE IF NOT EXISTS safe_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'other', -- home, relative, shop, hospital, temple, other
    lat NUMERIC(10, 7) NOT NULL,
    lng NUMERIC(10, 7) NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 150,
    address TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_safe_zones_elder ON safe_zones(elder_id, active);

-- Auto-migrate saved_places into safe_zones
INSERT INTO safe_zones (elder_id, name, type, lat, lng, radius_m, address, active)
SELECT elder_id, name,
  CASE
    WHEN place_type IN ('home', 'relative', 'shop', 'hospital', 'temple') THEN place_type
    ELSE 'other'
  END,
  latitude, longitude,
  CASE
    WHEN place_type = 'home' THEN 150
    WHEN place_type = 'relative' THEN 150
    WHEN place_type = 'shop' THEN 100
    WHEN place_type = 'hospital' THEN 200
    ELSE 150
  END,
  address, TRUE
FROM saved_places
WHERE name NOT IN (SELECT name FROM safe_zones WHERE safe_zones.elder_id = saved_places.elder_id);

-- 4. Approved Routes (Between zones, corridor_m, path_geojson)
CREATE TABLE IF NOT EXISTS approved_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    from_zone_id UUID REFERENCES safe_zones(id) ON DELETE SET NULL,
    to_zone_id UUID REFERENCES safe_zones(id) ON DELETE SET NULL,
    path_geojson JSONB NOT NULL DEFAULT '{}'::jsonb,
    corridor_m INTEGER NOT NULL DEFAULT 100,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approved_routes_elder ON approved_routes(elder_id, active);

-- 5. Familiar Cells (100 m grid cells visited in last 30 days)
CREATE TABLE IF NOT EXISTS familiar_cells (
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    cell_key VARCHAR(64) NOT NULL,
    visits INTEGER DEFAULT 1,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (elder_id, cell_key)
);
CREATE INDEX IF NOT EXISTS idx_familiar_cells_elder ON familiar_cells(elder_id, last_visit);

-- 6. Location Settings Table
CREATE TABLE IF NOT EXISTS location_settings (
    elder_id UUID PRIMARY KEY REFERENCES elders(id) ON DELETE CASCADE,
    interval_min INTEGER DEFAULT 5,
    accuracy_limit_m INTEGER DEFAULT 150,
    unfamiliar_distance_m INTEGER DEFAULT 1500,
    stationary_min INTEGER DEFAULT 10,
    confirm_samples INTEGER DEFAULT 2,
    night_start VARCHAR(8) DEFAULT '20:00',
    night_end VARCHAR(8) DEFAULT '05:00',
    quiet_hours VARCHAR(16) DEFAULT '22:00-06:00',
    ask_attempts INTEGER DEFAULT 3,
    ask_wait_sec INTEGER DEFAULT 90,
    cooldown_min INTEGER DEFAULT 30,
    alert_channels JSONB DEFAULT '["in_app","push","sms"]'::jsonb,
    stale_after_min INTEGER DEFAULT 15,
    outing_windows JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed location_settings from existing lost_settings or elders
INSERT INTO location_settings (elder_id, unfamiliar_distance_m, night_start, night_end)
SELECT id, 1500, '20:00', '05:00'
FROM elders
WHERE id NOT IN (SELECT elder_id FROM location_settings);

-- 7. Safety Checks & Prompts (Voice Safety Check state machine)
CREATE TABLE IF NOT EXISTS safety_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'asking', -- asking, resolved_ok, resolved_help, escalated, cancelled
    concern_json JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_safety_checks_elder_status ON safety_checks(elder_id, status);

CREATE TABLE IF NOT EXISTS safety_check_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID REFERENCES safety_checks(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL DEFAULT 1,
    asked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    answered_at TIMESTAMP WITH TIME ZONE,
    answer VARCHAR(16) DEFAULT 'none', -- ok, help, none
    method VARCHAR(16) DEFAULT 'voice' -- voice, button
);
CREATE INDEX IF NOT EXISTS idx_safety_check_prompts_check ON safety_check_prompts(check_id);

-- 8. Location Alerts Table
CREATE TABLE IF NOT EXISTS location_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    severity VARCHAR(16) NOT NULL DEFAULT 'attention', -- info, attention, urgent
    kind VARCHAR(64) NOT NULL, -- stale, concern_ok, concern_help, escalated, off_route, stationary, night, unfamiliar
    message TEXT NOT NULL,
    reason_json JSONB DEFAULT '{}'::jsonb,
    map_link TEXT,
    elder_responded VARCHAR(32) DEFAULT 'no_response',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_location_alerts_elder ON location_alerts(elder_id, created_at DESC);

