-- Migration 30: Create survivor_picks table with comprehensive indexes
-- This table stores all picks made by participants throughout the contest

CREATE TABLE IF NOT EXISTS survivor_picks (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES survivor_participants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_number INTEGER,
    team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    pick_type VARCHAR(50) DEFAULT 'regular_season',
    playoff_round INTEGER,
    playoff_game_number INTEGER,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_needed INTEGER,
    result VARCHAR(50) DEFAULT 'pending',
    is_late_pick BOOLEAN DEFAULT FALSE,
    games_excluded INTEGER DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_survivor_pick UNIQUE(contest_id, user_id, week_number)
);

-- Create comprehensive indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_survivor_picks_contest ON survivor_picks(contest_id);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_participant ON survivor_picks(participant_id);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_user ON survivor_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_team ON survivor_picks(team_id);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_week ON survivor_picks(contest_id, week_number);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_result ON survivor_picks(result);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_type ON survivor_picks(pick_type);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_late ON survivor_picks(is_late_pick);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_survivor_picks_contest_week_result 
    ON survivor_picks(contest_id, week_number, result);
CREATE INDEX IF NOT EXISTS idx_survivor_picks_user_contest 
    ON survivor_picks(user_id, contest_id, week_number);

-- Add comments
COMMENT ON TABLE survivor_picks IS 'Stores all picks made by participants in survivor contests';
COMMENT ON COLUMN survivor_picks.week_number IS 'Week number (1-26) for regular season picks';
COMMENT ON COLUMN survivor_picks.team_id IS 'References nhl_teams table - the team picked';
COMMENT ON COLUMN survivor_picks.pick_type IS 'Type of pick: regular_season or playoffs';
COMMENT ON COLUMN survivor_picks.playoff_round IS 'Playoff round (1-4) if pick_type is playoffs';
COMMENT ON COLUMN survivor_picks.playoff_game_number IS 'Playoff game number (1-7) if pick_type is playoffs';
COMMENT ON COLUMN survivor_picks.games_played IS 'Total games played by the team during the week';
COMMENT ON COLUMN survivor_picks.games_won IS 'Number of games won by the team (counts only eligible games for late picks)';
COMMENT ON COLUMN survivor_picks.games_needed IS 'Required wins: 1 if team plays <=3 games, 2 if >=4 games';
COMMENT ON COLUMN survivor_picks.result IS 'Pick result: pending, survived, eliminated';
COMMENT ON COLUMN survivor_picks.is_late_pick IS 'True if pick was submitted after lock time (first game started)';
COMMENT ON COLUMN survivor_picks.games_excluded IS 'Number of games excluded from counting (for late picks)';
COMMENT ON COLUMN survivor_picks.submitted_at IS 'Timestamp when pick was submitted';
COMMENT ON COLUMN survivor_picks.locked_at IS 'Timestamp when the pick was locked (week first game time)';

-- Validation constraints (using DO blocks to avoid errors if they already exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_week_number' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_week_number 
            CHECK (week_number IS NULL OR (week_number >= 1 AND week_number <= 26));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_playoff_round' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_playoff_round 
            CHECK (playoff_round IS NULL OR (playoff_round >= 1 AND playoff_round <= 4));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_playoff_game_number' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_playoff_game_number 
            CHECK (playoff_game_number IS NULL OR (playoff_game_number >= 1 AND playoff_game_number <= 7));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_games_played' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_games_played 
            CHECK (games_played >= 0);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_games_won' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_games_won 
            CHECK (games_won >= 0 AND games_won <= games_played);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_games_excluded' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_games_excluded 
            CHECK (games_excluded >= 0 AND games_excluded <= games_played);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_type' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_type 
            CHECK (pick_type IN ('regular_season', 'playoffs'));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_pick_result' AND conrelid = 'survivor_picks'::regclass) THEN
        ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_result 
            CHECK (result IN ('pending', 'survived', 'eliminated'));
    END IF;
END $$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_survivor_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_survivor_picks_updated_at
    BEFORE UPDATE ON survivor_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_survivor_picks_updated_at();
