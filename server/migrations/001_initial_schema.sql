-- Smriti Saathi Database Schema Migration 001
-- Safe to execute multiple times (idempotent)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (phone login, roles: elder, caregiver, health_worker)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32) UNIQUE NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'caregiver',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions (90-day persistent sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);

-- OTP Verifications
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    channel VARCHAR(16) NOT NULL DEFAULT 'sms',
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);

-- Elders Profile
CREATE TABLE IF NOT EXISTS elders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(128) NOT NULL,
    age INTEGER,
    language VARCHAR(16) NOT NULL DEFAULT 'en',
    region VARCHAR(64) DEFAULT 'Assam',
    voice_speed NUMERIC(3, 2) DEFAULT 0.65,
    photo BYTEA,
    photo_mime VARCHAR(64),
    routine_drift_enabled BOOLEAN DEFAULT TRUE,
    auto_lost_enabled BOOLEAN DEFAULT TRUE,
    auto_lost_threshold_m INTEGER DEFAULT 1000,
    last_known_lat NUMERIC(10, 7),
    last_known_lng NUMERIC(10, 7),
    last_known_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elders_user_id ON elders(user_id);

-- Elder Caregivers & Permissions
CREATE TABLE IF NOT EXISTS elder_caregivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    caregiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invite_code VARCHAR(16),
    status VARCHAR(32) DEFAULT 'active',
    can_see_location BOOLEAN DEFAULT FALSE,
    can_see_progress BOOLEAN DEFAULT TRUE,
    can_see_health BOOLEAN DEFAULT FALSE,
    can_manage_reminders BOOLEAN DEFAULT TRUE,
    can_approve_rides BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(elder_id, caregiver_id)
);

-- Elder Consent (Off by default per privacy requirements)
CREATE TABLE IF NOT EXISTS elder_consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE REFERENCES elders(id) ON DELETE CASCADE,
    share_location BOOLEAN DEFAULT FALSE,
    share_health BOOLEAN DEFAULT FALSE,
    share_progress BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved Places (Home, relatives, temple, hospital, etc.)
CREATE TABLE IF NOT EXISTS saved_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    place_type VARCHAR(64) DEFAULT 'other',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_places_elder ON saved_places(elder_id);

-- Family Members (photos and voices stored securely in bytea)
CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    address TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    photo BYTEA,
    photo_mime VARCHAR(64),
    voice_audio BYTEA,
    voice_mime VARCHAR(64),
    is_emergency_contact BOOLEAN DEFAULT FALSE,
    emergency_priority INTEGER DEFAULT 99,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_members_elder ON family_members(elder_id);

-- Family Upload Links (7-day revocable invite)
CREATE TABLE IF NOT EXISTS family_upload_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    uploaded_name VARCHAR(128),
    uploaded_relationship VARCHAR(64),
    uploaded_phone VARCHAR(32),
    photo BYTEA,
    photo_mime VARCHAR(64),
    voice_audio BYTEA,
    voice_mime VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drivers (Auto / Cab)
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    vehicle_type VARCHAR(32) NOT NULL DEFAULT 'auto',
    area VARCHAR(128),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Medicines
CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    dose VARCHAR(64) NOT NULL,
    shape_color VARCHAR(64) DEFAULT 'round-white',
    times_per_day JSONB NOT NULL DEFAULT '["08:00"]',
    before_after_food VARCHAR(32) DEFAULT 'after',
    days_of_week JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    tablets_remaining INTEGER DEFAULT 30,
    refill_threshold INTEGER DEFAULT 5,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reminders (Generic & System Schedules)
CREATE TABLE IF NOT EXISTS reminder_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    reminder_type VARCHAR(32) NOT NULL, -- medicine, water, meal, appointment, activity
    title VARCHAR(256) NOT NULL,
    description TEXT,
    time_of_day VARCHAR(8) NOT NULL, -- HH:MM
    days_of_week JSONB DEFAULT '[0,1,2,3,4,5,6]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reminder Occurrences (Claimed and sent via cron / worker)
CREATE TABLE IF NOT EXISTS reminder_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES reminder_schedules(id) ON DELETE CASCADE,
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    reminder_type VARCHAR(32) NOT NULL,
    title VARCHAR(256) NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) DEFAULT 'scheduled', -- scheduled, sent, done, missed, cancelled
    sent_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    ack_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminder_due_status ON reminder_occurrences(status, due_at);

-- Health details (encrypted with AES-256-GCM)
CREATE TABLE IF NOT EXISTS elder_health_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE REFERENCES elders(id) ON DELETE CASCADE,
    encrypted_blood_group TEXT,
    encrypted_allergies TEXT,
    encrypted_doctor_name TEXT,
    encrypted_doctor_phone TEXT,
    encrypted_conditions TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cognitive Game Sessions
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    client_session_id VARCHAR(64) UNIQUE,
    game_type VARCHAR(64) NOT NULL,
    level VARCHAR(16) NOT NULL, -- easy, medium, hard
    step VARCHAR(8) NOT NULL, -- E1-E3, M1-M3, H1-H3
    score NUMERIC(6, 2) NOT NULL,
    accuracy NUMERIC(5, 2) NOT NULL,
    response_time_ms INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    hints_count INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    mood VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_elder ON game_sessions(elder_id, created_at);

-- Adaptive Ratings & Step Tracker per game
CREATE TABLE IF NOT EXISTS elder_game_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    game_type VARCHAR(64) NOT NULL,
    elo_rating NUMERIC(7, 2) DEFAULT 1000.0,
    current_step VARCHAR(8) DEFAULT 'E1',
    sessions_count INTEGER DEFAULT 0,
    baseline_score NUMERIC(6, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(elder_id, game_type)
);

-- SOS Events
CREATE TABLE IF NOT EXISTS sos_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status VARCHAR(32) DEFAULT 'active', -- active, acknowledged, resolved, cancelled, failed
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    ack_contact_name VARCHAR(128),
    current_step INTEGER DEFAULT 0,
    escalation_log JSONB DEFAULT '[]'::jsonb
);

-- Rides
CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    vehicle_type VARCHAR(32) DEFAULT 'auto',
    pickup_address TEXT NOT NULL,
    pickup_lat NUMERIC(10, 7),
    pickup_lng NUMERIC(10, 7),
    dest_address TEXT NOT NULL,
    dest_lat NUMERIC(10, 7),
    dest_lng NUMERIC(10, 7),
    estimated_fare NUMERIC(8, 2),
    status VARCHAR(32) DEFAULT 'requested', -- requested, approved, driver_contacted, driver_confirmed, completed, cancelled
    driver_name VARCHAR(128),
    vehicle_number VARCHAR(64),
    eta_minutes INTEGER,
    rating INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Silent Guardian Events (Auto-lost checkins, routine drifts, fluency dips)
CREATE TABLE IF NOT EXISTS silent_guardian_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL, -- auto_lost, routine_drift, fluency_drop
    reason TEXT NOT NULL,
    severity VARCHAR(16) DEFAULT 'info',
    details JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Web Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    keys JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Push Logs
CREATE TABLE IF NOT EXISTS push_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Geocoding Cache (to respect Nominatim 1 req/sec and cache queries)
CREATE TABLE IF NOT EXISTS geo_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT UNIQUE NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    display_name TEXT NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Logs (Tracks every access to location, health, or media)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Server Error Logs (For /diagnostics last 20 errors)
CREATE TABLE IF NOT EXISTS server_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    stack TEXT,
    route VARCHAR(256),
    status_code INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_server_errors_created ON server_error_logs(created_at DESC);
