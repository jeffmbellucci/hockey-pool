-- Create two-team picks table for the contest
CREATE TABLE IF NOT EXISTS two_team_picks (
    pick_id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL UNIQUE REFERENCES pool_participants (participant_id) ON DELETE CASCADE,
    team1_id INTEGER NOT NULL REFERENCES nhl_teams (team_id) ON DELETE RESTRICT,
    team2_id INTEGER REFERENCES nhl_teams (team_id) ON DELETE RESTRICT, -- NULL during Round 1, set in Round 2
    total_wins INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (team2_id IS NULL OR team1_id <> team2_id) -- Only check if both teams are picked
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_two_team_picks_participant ON two_team_picks(participant_id);
CREATE INDEX IF NOT EXISTS idx_two_team_picks_team1 ON two_team_picks(team1_id);
CREATE INDEX IF NOT EXISTS idx_two_team_picks_team2 ON two_team_picks(team2_id);

-- Create trigger to update the updated_at column
CREATE TRIGGER trigger_update_two_team_picks_updated_at
    BEFORE UPDATE ON two_team_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats_updated_at();

-- Create a view to easily see the leaderboard
-- Uses LEFT JOIN for team2 since it may be NULL during Round 1 of draft
CREATE OR REPLACE VIEW two_team_contest_leaderboard AS
SELECT 
    pp.participant_id,
    pp.participant_name,
    pp.draft_order,
    t1.team_name AS team1_name,
    t1.abbreviation AS team1_abbrev,
    t2.team_name AS team2_name,
    t2.abbreviation AS team2_abbrev,
    ttp.total_wins,
    ttp.created_at AS pick_date
FROM two_team_picks ttp
JOIN pool_participants pp ON ttp.participant_id = pp.participant_id
JOIN nhl_teams t1 ON ttp.team1_id = t1.team_id
LEFT JOIN nhl_teams t2 ON ttp.team2_id = t2.team_id  -- LEFT JOIN because team2 may be NULL during draft
WHERE pp.active = TRUE
ORDER BY ttp.total_wins DESC, pp.participant_name ASC;

