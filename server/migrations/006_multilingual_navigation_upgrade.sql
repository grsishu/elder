-- Smriti Saathi Database Schema Migration 006
-- Multilingual Navigation Upgrade: Navigation Sessions, Navigation Events, Destination Categories & History

-- 1. Navigation Sessions Table
CREATE TABLE IF NOT EXISTS navigation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    destination_id UUID REFERENCES saved_places(id) ON DELETE SET NULL,
    destination_name VARCHAR(255) NOT NULL,
    destination_address TEXT,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    start_lat DOUBLE PRECISION NOT NULL,
    start_lng DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, completed, cancelled, rerouted
    current_step_index INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL DEFAULT 1,
    total_distance_m INTEGER NOT NULL DEFAULT 0,
    remaining_distance_m INTEGER NOT NULL DEFAULT 0,
    recalculations_count INTEGER NOT NULL DEFAULT 0,
    family_notified BOOLEAN NOT NULL DEFAULT FALSE,
    language VARCHAR(16) NOT NULL DEFAULT 'en',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nav_sessions_elder ON navigation_sessions(elder_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_sessions_status ON navigation_sessions(status);

-- 2. Navigation Audit & Interaction Events Table
CREATE TABLE IF NOT EXISTS navigation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES navigation_sessions(id) ON DELETE CASCADE,
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL, -- session_started, step_advanced, listen_again, route_recalculated, voice_command_recognized, arrival_confirmed, family_notified
    step_index INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nav_events_session ON navigation_events(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_nav_events_elder ON navigation_events(elder_id, created_at DESC);

-- 3. Enhance saved_places with category & relationship
ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'saved';
ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS relationship VARCHAR(64);

