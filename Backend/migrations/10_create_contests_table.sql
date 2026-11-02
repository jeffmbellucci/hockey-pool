-- Create contests table to manage contest instances
CREATE TABLE IF NOT EXISTS contests (
    contest_id SERIAL PRIMARY KEY,
    contest_name VARCHAR(255) NOT NULL,
    season_year VARCHAR(20) NOT NULL,
    contest_type VARCHAR(50) DEFAULT 'two_team' CHECK (contest_type IN ('two_team', 'survivor')),
    status VARCHAR(50) DEFAULT 'waiting' CHECK (status IN ('waiting', 'drafting', 'in_progress', 'completed', 'cancelled')),
    max_participants INTEGER DEFAULT 16,
    current_participants INTEGER DEFAULT 0,
    draft_order JSONB, -- Stores the randomized draft order array
    current_draft_pick INTEGER DEFAULT 0, -- Tracks which pick number we're on (0 = not started, 1-32)
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests(status);
CREATE INDEX IF NOT EXISTS idx_contests_season ON contests(season_year);
CREATE INDEX IF NOT EXISTS idx_contests_type ON contests(contest_type);

-- Add contest_id to pool_participants
ALTER TABLE pool_participants 
ADD COLUMN IF NOT EXISTS contest_id INTEGER REFERENCES contests(contest_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pool_participants_contest ON pool_participants(contest_id);

-- Add contest_id to two_team_picks
ALTER TABLE two_team_picks 
ADD COLUMN IF NOT EXISTS contest_id INTEGER REFERENCES contests(contest_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_two_team_picks_contest ON two_team_picks(contest_id);

-- Create trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_contests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contests_updated_at
    BEFORE UPDATE ON contests
    FOR EACH ROW
    EXECUTE FUNCTION update_contests_updated_at();

-- Insert a default contest for the current season
INSERT INTO contests (contest_name, season_year, contest_type, status) 
VALUES ('2025-26 Two Team Contest', '2025-26', 'two_team', 'waiting')
ON CONFLICT DO NOTHING;

-- Add comment to table
COMMENT ON TABLE contests IS 'Stores contest instances for different seasons and types';
COMMENT ON COLUMN contests.status IS 'Contest status: waiting (for players), drafting (in draft), in_progress (season active), completed, cancelled';
COMMENT ON COLUMN contests.draft_order IS 'JSON array storing the randomized draft order of participant IDs';
COMMENT ON COLUMN contests.current_draft_pick IS 'Current pick number in the draft (0 = not started, 1-32 for two_team)';

