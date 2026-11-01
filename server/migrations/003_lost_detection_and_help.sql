
-- Smriti Saathi Database Schema Migration 003
-- Comprehensive Lost Detection and Help System

-- 1. Location Samples Table (Keep 14 days of raw fixes)
CREATE TABLE IF NOT EXISTS location_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2) NOT NULL,
    speed NUMERIC(8, 2),
    battery INTEGER,
    source VARCHAR(32) DEFAULT 'gps', -- gps, wifi, cell, simulator
    unreliable_for_safety BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loc_samples_elder_recorded ON location_samples(elder_id, recorded_at DESC);

-- 2. Usual Places Table (Saved, Learned, and Caregiver-Approved places)
CREATE TABLE IF NOT EXISTS usual_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    saved_place_id UUID REFERENCES saved_places(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    radius_m INTEGER DEFAULT 150,
    label VARCHAR(128) NOT NULL,
    origin VARCHAR(32) NOT NULL DEFAULT 'saved', -- 'saved', 'learned', 'approved'
    visits INTEGER DEFAULT 1,
    last_visit TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usual_places_elder ON usual_places(elder_id);

-- 3. Update or Enhance lost_checks Table
CREATE TABLE IF NOT EXISTS lost_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, fine, take_home, alerted, acknowledged, expired, resolved
    level INTEGER DEFAULT 1, -- 1 = gentle check-in, 2 = help, 3 = family alert
    risk_score NUMERIC(5, 2) DEFAULT 0,
    reasons_json JSONB DEFAULT '[]'::jsonb,
    nearest_place VARCHAR(128),
    distance_m INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(64),
    cooldown_until TIMESTAMP WITH TIME ZONE,
    last_prompt_at TIMESTAMP WITH TIME ZONE,
    fine_lat NUMERIC(10, 7),
    fine_lng NUMERIC(10, 7),
    rule VARCHAR(64),
    score NUMERIC(5, 2) DEFAULT 0,
    score_details JSONB DEFAULT '{}'::jsonb,
    explanation TEXT,
    escalation_step INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lost_checks_elder_status ON lost_checks(elder_id, status);

-- Add any missing columns to existing lost_checks table if it was created in 002
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS reasons_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS nearest_place VARCHAR(128);
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS distance_m INTEGER;
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS resolution VARCHAR(64);
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS last_prompt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS fine_lat NUMERIC(10, 7);
ALTER TABLE lost_checks ADD COLUMN IF NOT EXISTS fine_lng NUMERIC(10, 7);

-- 4. Lost Check Events Table (Full audit timeline)
CREATE TABLE IF NOT EXISTS lost_check_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID REFERENCES lost_checks(id) ON DELETE CASCADE,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(64) NOT NULL, -- 'created', 'level_1_prompt', 'level_2_help', 'level_3_alert', 'fine_acknowledged', 'take_home_clicked', 'escalation_timeout'
    detail TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_lost_check_events_check ON lost_check_events(check_id, event_time ASC);

-- 5. Lost Settings Table
CREATE TABLE IF NOT EXISTS lost_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE REFERENCES elders(id) ON DELETE CASCADE,
    distance_threshold_m INTEGER DEFAULT 1000,
    night_start VARCHAR(8) DEFAULT '20:00',
    night_end VARCHAR(8) DEFAULT '05:00',
    quiet_hours_start VARCHAR(8) DEFAULT '22:00',
    quiet_hours_end VARCHAR(8) DEFAULT '06:00',
    auto_call_after_min INTEGER DEFAULT 5,
    alert_caregivers BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Populate usual_places from existing saved_places
INSERT INTO usual_places (elder_id, saved_place_id, latitude, longitude, radius_m, label, origin)
SELECT elder_id, id, latitude, longitude, 150, name, 'saved'
FROM saved_places
WHERE id NOT IN (SELECT saved_place_id FROM usual_places WHERE saved_place_id IS NOT NULL)
ON CONFLICT DO NOTHING;
