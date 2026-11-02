-- Migration 23: Create playoff_picks table for tiebreaker playoff draft
-- This table stores playoff team picks for tiebreaker contests

CREATE TABLE IF NOT EXISTS playoff_picks (
    playoff_pick_id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL REFERENCES pool_participants(participant_id) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    
    -- Playoff teams picked (can pick multiple teams)
    team_ids INTEGER[] NOT NULL DEFAULT '{}',
    
    -- Calculated playoff wins (sum of wins from playoff_games for picked teams)
    total_playoff_wins INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- One playoff pick record per participant per contest
    CONSTRAINT unique_playoff_pick_participant_contest UNIQUE (participant_id, contest_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_playoff_picks_participant ON playoff_picks(participant_id);
CREATE INDEX IF NOT EXISTS idx_playoff_picks_contest ON playoff_picks(contest_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_playoff_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_playoff_picks_updated_at
    BEFORE UPDATE ON playoff_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_playoff_picks_updated_at();

-- Comments
COMMENT ON TABLE playoff_picks IS 'Stores playoff team picks for tiebreaker contests';
COMMENT ON COLUMN playoff_picks.team_ids IS 'Array of team IDs picked by participant for playoff tiebreaker';
COMMENT ON COLUMN playoff_picks.total_playoff_wins IS 'Sum of playoff wins for all picked teams';
