-- Migration: Auto-update playoff wins when playoff_games change
-- This trigger automatically recalculates playoff picks wins whenever playoff_games are inserted/updated
-- Similar to how team_standings automatically updates for regular two-team contests

-- Create function to recalculate all playoff picks wins
CREATE OR REPLACE FUNCTION recalculate_playoff_picks_wins()
RETURNS TRIGGER AS $$
BEGIN
    -- Update all playoff picks to recalculate their total wins
    UPDATE playoff_picks pp
    SET total_playoff_wins = (
        SELECT COALESCE(SUM(
            CASE 
                WHEN pg.result = 'W' THEN 1 
                ELSE 0 
            END
        ), 0)
        FROM playoff_games pg
        JOIN nhl_teams nt ON pg.team_id = nt.team_id
        WHERE nt.nhl_api_id = ANY(pp.team_ids)
    ),
    updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires after INSERT or UPDATE on playoff_games
CREATE TRIGGER trigger_recalculate_playoff_wins
    AFTER INSERT OR UPDATE ON playoff_games
    FOR EACH STATEMENT
    EXECUTE FUNCTION recalculate_playoff_picks_wins();

COMMENT ON FUNCTION recalculate_playoff_picks_wins() IS 'Automatically recalculates playoff picks wins when playoff_games are added or updated';
COMMENT ON TRIGGER trigger_recalculate_playoff_wins ON playoff_games IS 'Automatically updates playoff picks total wins whenever playoff games change';
