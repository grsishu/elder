-- Migration 007: Onboarding, Profile Completeness, and Family Memory Platform Upgrades

-- 1. Add profile_completed flag to elders table if not already present
ALTER TABLE elders ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- 2. Ensure family_members has all necessary columns for persistent photo & voice audio storage
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS photo BYTEA;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(64);
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS voice_audio BYTEA;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS voice_mime VARCHAR(64);
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS is_emergency_contact BOOLEAN DEFAULT FALSE;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS emergency_priority INTEGER DEFAULT 99;

-- 3. Index on family_members elder_id for fast game loading
CREATE INDEX IF NOT EXISTS idx_family_members_elder_lookup ON family_members(elder_id, created_at ASC);

