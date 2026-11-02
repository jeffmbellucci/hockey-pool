-- Migration 41: Fix team_standings materialized view
-- 1. Filter out non-finished games (FUT/LIVE/PENDING) so games_played is accurate
-- 2. Filter to game_type = 2 only (regular season) since playoff games will now live in the same table
-- 3. Fix last_result subquery to also filter finished games

DROP MATERIALIZED VIEW IF EXISTS team_standings;

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
    -- Last result (only from finished games)
    (SELECT result FROM games 
     WHERE team_id = t.team_id AND game_state IN ('OFF', 'FINAL') AND game_type = 2
     ORDER BY game_date DESC LIMIT 1) as last_result
FROM nhl_teams t
LEFT JOIN games g ON t.team_id = g.team_id
    AND g.game_type = 2
    AND g.game_state IN ('OFF', 'FINAL')
GROUP BY t.team_id, t.team_name, t.abbreviation, t.nhl_api_id;

-- Recreate indexes on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_standings_team_id ON team_standings(team_id);
CREATE INDEX IF NOT EXISTS idx_team_standings_points ON team_standings(points DESC);
CREATE INDEX IF NOT EXISTS idx_team_standings_wins ON team_standings(wins DESC);
CREATE INDEX IF NOT EXISTS idx_team_standings_games ON team_standings(games_played);

COMMENT ON MATERIALIZED VIEW team_standings IS 'Aggregated team statistics from finished regular-season games only. Refresh after fetching new games.';
