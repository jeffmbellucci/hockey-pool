-- Migration 31: Create survivor_team_usage table
-- Tracks which teams each participant has already used (can only pick each team once)

CREATE TABLE IF NOT EXISTS survivor_team_usage (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    used_in_week INTEGER,
    used_in_playoff_round INTEGER,
    phase VARCHAR(50) NOT NULL DEFAULT 'regular_season',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_team_usage UNIQUE(contest_id, user_id, team_id, phase)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_survivor_team_usage_contest ON survivor_team_usage(contest_id);
CREATE INDEX IF NOT EXISTS idx_survivor_team_usage_user ON survivor_team_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_survivor_team_usage_team ON survivor_team_usage(team_id);
CREATE INDEX IF NOT EXISTS idx_survivor_team_usage_phase ON survivor_team_usage(phase);

-- Composite index for common query: "Has user used this team in this contest?"
CREATE INDEX IF NOT EXISTS idx_survivor_team_usage_lookup 
    ON survivor_team_usage(contest_id, user_id, team_id);

-- Add comments
COMMENT ON TABLE survivor_team_usage IS 'Tracks which teams each participant has used in survivor contests (one use per team per phase)';
COMMENT ON COLUMN survivor_team_usage.used_in_week IS 'Week number (1-26) when team was used in regular season';
COMMENT ON COLUMN survivor_team_usage.used_in_playoff_round IS 'Playoff round (1-4) when team was used in playoffs';
COMMENT ON COLUMN survivor_team_usage.phase IS 'Phase when team was used: regular_season or playoffs';

-- Validation constraints (using DO blocks to avoid errors if they already exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_usage_week' AND conrelid = 'survivor_team_usage'::regclass) THEN
        ALTER TABLE survivor_team_usage ADD CONSTRAINT check_usage_week 
            CHECK (used_in_week IS NULL OR (used_in_week >= 1 AND used_in_week <= 26));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_usage_playoff_round' AND conrelid = 'survivor_team_usage'::regclass) THEN
        ALTER TABLE survivor_team_usage ADD CONSTRAINT check_usage_playoff_round 
            CHECK (used_in_playoff_round IS NULL OR (used_in_playoff_round >= 1 AND used_in_playoff_round <= 4));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_usage_phase' AND conrelid = 'survivor_team_usage'::regclass) THEN
        ALTER TABLE survivor_team_usage ADD CONSTRAINT check_usage_phase 
            CHECK (phase IN ('regular_season', 'playoffs'));
    END IF;
END $$;

-- Ensure correct phase data: regular_season picks should have used_in_week, playoff picks should have used_in_playoff_round
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_usage_phase_consistency' AND conrelid = 'survivor_team_usage'::regclass) THEN
        ALTER TABLE survivor_team_usage ADD CONSTRAINT check_usage_phase_consistency 
            CHECK (
                (phase = 'regular_season' AND used_in_week IS NOT NULL AND used_in_playoff_round IS NULL) OR
                (phase = 'playoffs' AND used_in_playoff_round IS NOT NULL)
            );
    END IF;
END $$;

-- Note: This table is populated automatically when picks are submitted
-- It enables fast lookups to determine which teams are still available for a user to pick
