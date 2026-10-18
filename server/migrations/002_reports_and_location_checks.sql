-- Smriti Saathi Database Schema Migration 002
-- Part A: AI Report Drafting and Sending
-- Part B: Server-Side AI Location Checking

-- Report Drafts Table
CREATE TABLE IF NOT EXISTS report_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    period VARCHAR(32) NOT NULL DEFAULT '7_days',
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft, approved, sent, failed
    language VARCHAR(16) NOT NULL DEFAULT 'hi',
    summary_text TEXT NOT NULL,
    suggested_next_steps TEXT,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    pdf BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_drafts_elder ON report_drafts(elder_id, created_at DESC);

-- Report Deliveries Table
CREATE TABLE IF NOT EXISTS report_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID REFERENCES report_drafts(id) ON DELETE CASCADE,
    caregiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL, -- in_app, push, sms, whatsapp
    status VARCHAR(32) NOT NULL DEFAULT 'sent', -- delivered, sent, failed
    error TEXT,
    access_token_hash VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_deliv_token ON report_deliveries(access_token_hash);

-- Elder Report Settings Table
CREATE TABLE IF NOT EXISTS elder_report_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE REFERENCES elders(id) ON DELETE CASCADE,
    send_weekly_sunday_1800 BOOLEAN DEFAULT FALSE,
    send_monthly BOOLEAN DEFAULT FALSE,
    last_report_job_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations Table (Keep 7 days of location fixes)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2) NOT NULL,
    speed NUMERIC(8, 2),
    battery INTEGER,
    source VARCHAR(32) DEFAULT 'gps',
    unreliable_for_safety BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_locations_elder_recorded ON locations(elder_id, recorded_at DESC);

-- Lost Checks Table
CREATE TABLE IF NOT EXISTS lost_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, fine, take_home, alerted, acknowledged, expired
    rule VARCHAR(64) NOT NULL,
    nearest_place_name VARCHAR(128),
    distance_m INTEGER,
    score NUMERIC(5, 2) DEFAULT 0,
    score_details JSONB DEFAULT '{}'::jsonb,
    explanation TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    cooldown_until TIMESTAMP WITH TIME ZONE,
    escalation_step INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lost_checks_elder_status ON lost_checks(elder_id, status);

-- Caregiver In-App Alerts Table
CREATE TABLE IF NOT EXISTS caregiver_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    caregiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(64) NOT NULL, -- lost_check, routine_drift, stale_location, report
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caregiver_alerts_user ON caregiver_alerts(caregiver_id, created_at DESC);

-- Elder Safety Settings Table
CREATE TABLE IF NOT EXISTS elder_safety_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE REFERENCES elders(id) ON DELETE CASCADE,
    threshold_distance_m INTEGER DEFAULT 1000,
    night_rule_enabled BOOLEAN DEFAULT TRUE,
    auto_calls_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start VARCHAR(8) DEFAULT '22:00',
    quiet_hours_end VARCHAR(8) DEFAULT '06:00',
    stale_location_alerts_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
