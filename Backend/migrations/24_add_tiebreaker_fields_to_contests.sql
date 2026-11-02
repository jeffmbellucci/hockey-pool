-- Migration 24: Add tiebreaker fields to contests table

ALTER TABLE contests
ADD COLUMN IF NOT EXISTS is_tiebreaker BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_contest_id INTEGER REFERENCES contests(contest_id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tiebreaker_type VARCHAR(20), -- '2_participant', '3_participant', '4_participant'
ADD COLUMN IF NOT EXISTS excluded_team_id INTEGER REFERENCES nhl_teams(team_id); -- For 3-participant tiebreaker

-- Index for finding tiebreaker contests
CREATE INDEX IF NOT EXISTS idx_contests_parent ON contests(parent_contest_id);
CREATE INDEX IF NOT EXISTS idx_contests_tiebreaker ON contests(is_tiebreaker);

-- Comments
COMMENT ON COLUMN contests.is_tiebreaker IS 'True if this contest is a playoff tiebreaker';
COMMENT ON COLUMN contests.parent_contest_id IS 'Reference to the original contest that created this tiebreaker';
COMMENT ON COLUMN contests.tiebreaker_type IS 'Type of tiebreaker: 2_participant, 3_participant, or 4_participant';
COMMENT ON COLUMN contests.excluded_team_id IS 'For 3-participant tiebreaker, the team that is excluded from draft';
