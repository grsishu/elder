-- Smriti Saathi Database Schema Migration 005
-- Complete Cognitive Platform Upgrade: Family Photos, Voice Recordings, Adaptive Difficulty History,
-- Cognitive Activity Reports, Report Deliveries, Personalization Preferences, Offline Sync.

-- 1. Family Photographs Table
CREATE TABLE IF NOT EXISTS family_photographs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    member_name VARCHAR(128) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    description TEXT,
    file_path TEXT,
    photo_data TEXT,
    consent_given BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_photos_elder ON family_photographs(elder_id, created_at DESC);

-- 2. Family Voice Recordings Table
CREATE TABLE IF NOT EXISTS family_voice_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    member_name VARCHAR(128) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    file_path TEXT,
    audio_data TEXT,
    language VARCHAR(16) DEFAULT 'en',
    consent_given BOOLEAN DEFAULT TRUE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_voices_elder ON family_voice_recordings(elder_id, created_at DESC);

-- 3. Adaptive Difficulty Decisions & History
CREATE TABLE IF NOT EXISTS adaptive_difficulty_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    game_type VARCHAR(64) NOT NULL,
    old_level VARCHAR(16) NOT NULL,
    new_level VARCHAR(16) NOT NULL,
    reason TEXT NOT NULL,
    decided_by VARCHAR(32) DEFAULT 'ai', -- 'ai' or 'caretaker'
    session_id VARCHAR(64),
    metrics_snapshot TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_difficulty_hist_elder ON adaptive_difficulty_history(elder_id, game_type, created_at DESC);

-- 4. Cognitive Activity Reports (Daily Caretaker & Weekly Family Reports)
CREATE TABLE IF NOT EXISTS cognitive_activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID REFERENCES elders(id) ON DELETE CASCADE,
    report_type VARCHAR(32) NOT NULL, -- 'daily_caretaker' or 'weekly_family'
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    summary_text TEXT NOT NULL,
    ai_observations TEXT,
    recommendations TEXT,
    stats_json TEXT NOT NULL,
    pdf_path TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_elder_type ON cognitive_activity_reports(elder_id, report_type, generated_at DESC);

-- 5. Report Delivery History Table
CREATE TABLE IF NOT EXISTS report_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES cognitive_activity_reports(id) ON DELETE CASCADE,
    recipient_type VARCHAR(32) NOT NULL, -- 'caretaker' or 'family'
    recipient_name VARCHAR(128),
    recipient_email VARCHAR(128),
    recipient_phone VARCHAR(32),
    channel VARCHAR(32) NOT NULL, -- 'email', 'in_app', 'sms', 'whatsapp'
    status VARCHAR(32) NOT NULL, -- 'delivered', 'sent', 'pending', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_report_delivery_report ON report_delivery_history(report_id, sent_at DESC);

-- 6. Add columns to elders table for Personalization, Caretaker & Audio Preferences
ALTER TABLE elders ADD COLUMN IF NOT EXISTS personalization_pref VARCHAR(32) DEFAULT 'both';
ALTER TABLE elders ADD COLUMN IF NOT EXISTS caretaker_name VARCHAR(128);
ALTER TABLE elders ADD COLUMN IF NOT EXISTS caretaker_phone VARCHAR(32);
ALTER TABLE elders ADD COLUMN IF NOT EXISTS caretaker_email VARCHAR(128);
ALTER TABLE elders ADD COLUMN IF NOT EXISTS voice_volume NUMERIC(3, 2) DEFAULT 1.0;

-- 7. Add columns to game_sessions table for Granular Cognitive Performance Monitoring
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS correct_answers INTEGER DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS incorrect_answers INTEGER DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS hints_used INTEGER DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS attempts_count INTEGER DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS completion_status VARCHAR(32) DEFAULT 'completed';

