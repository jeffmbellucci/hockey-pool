-- Create materialized view for team standings (replaces daily_stats)
-- This provides fast access to aggregated stats while keeping games as single source of truth

CREATE MATERIALIZED VIEW team_standings AS
SELECT 
    t.team_id,
    t.team_name,
    t.abbreviation,
    t.nhl_api_id,
    COUNT(g.game_id) as games_played,
    SUM(CASE WHEN g.result = 'W' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN g.result = 'L' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN g.result = 'OTL' THEN 1 ELSE 0 END) as overtime_losses,
    SUM(CASE WHEN g.result = 'SOL' THEN 1 ELSE 0 END) as shootout_losses,
    -- Points calculation: 2 for win, 1 for OTL/SOL, 0 for loss
    SUM(CASE 
        WHEN g.result = 'W' THEN 2 
        WHEN g.result IN ('OTL', 'SOL') THEN 1 
        ELSE 0 
    END) as points,
    -- Home/Away splits
    SUM(CASE WHEN g.is_home = true THEN 1 ELSE 0 END) as home_games,
    SUM(CASE WHEN g.is_home = true AND g.result = 'W' THEN 1 ELSE 0 END) as home_wins,
    SUM(CASE WHEN g.is_home = false THEN 1 ELSE 0 END) as away_games,
    SUM(CASE WHEN g.is_home = false AND g.result = 'W' THEN 1 ELSE 0 END) as away_wins,
    -- Goal stats
    SUM(g.team_score) as goals_for,
    SUM(g.opponent_score) as goals_against,
    SUM(g.team_score) - SUM(g.opponent_score) as goal_differential,
    -- Last game date
    MAX(g.game_date) as last_game_date,
    -- Streaks (simplified - just count last result type)
    (SELECT result FROM games WHERE team_id = t.team_id ORDER BY game_date DESC LIMIT 1) as last_result
FROM nhl_teams t
LEFT JOIN games g ON t.team_id = g.team_id
GROUP BY t.team_id, t.team_name, t.abbreviation, t.nhl_api_id;

-- Create indexes on materialized view for fast queries
CREATE UNIQUE INDEX idx_team_standings_team_id ON team_standings(team_id);
CREATE INDEX idx_team_standings_points ON team_standings(points DESC);
CREATE INDEX idx_team_standings_wins ON team_standings(wins DESC);
CREATE INDEX idx_team_standings_games ON team_standings(games_played);

-- Add comments
COMMENT ON MATERIALIZED VIEW team_standings IS 'Aggregated team statistics calculated from games table. Refresh after fetching new games.';

-- Example refresh command (run after fetching new games):
-- REFRESH MATERIALIZED VIEW team_standings;
