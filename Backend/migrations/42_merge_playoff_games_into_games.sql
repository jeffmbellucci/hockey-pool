-- Migration 42: Merge playoff_games into games table
-- The playoff_games table is an exact copy of games. Since games already has game_type column,
-- we can store everything in one table and filter by game_type.

-- Step 1: Add playoff-specific columns to games table (from migration 37)
ALTER TABLE games 
  ADD COLUMN IF NOT EXISTS series_id VARCHAR(20) REFERENCES playoff_series(series_id),
  ADD COLUMN IF NOT EXISTS round INTEGER,
  ADD COLUMN IF NOT EXISTS game_number_in_series INTEGER;

-- Step 2: Copy all playoff_games data into games (skip duplicates)
INSERT INTO games (
  game_id, game_date, game_type, game_state,
  team_id, team_abbrev, team_score, is_home,
  opponent_id, opponent_abbrev, opponent_score, opponent_logo,
  result, created_at, updated_at
)
SELECT 
  game_id, game_date, game_type, game_state,
  team_id, team_abbrev, team_score, is_home,
  opponent_id, opponent_abbrev, opponent_score, opponent_logo,
  result, created_at, updated_at
FROM playoff_games
ON CONFLICT (game_id, team_id) DO UPDATE SET
  game_type = EXCLUDED.game_type,
  game_state = EXCLUDED.game_state,
  team_score = EXCLUDED.team_score,
  opponent_score = EXCLUDED.opponent_score,
  result = EXCLUDED.result,
  updated_at = EXCLUDED.updated_at;

-- Step 3: Copy series_id/round/game_number from playoff_games to games rows
UPDATE games g
SET 
  series_id = pg.series_id,
  round = pg.round,
  game_number_in_series = pg.game_number_in_series
FROM playoff_games pg
WHERE g.game_id = pg.game_id AND g.team_id = pg.team_id
  AND pg.series_id IS NOT NULL;

-- Step 4: Drop old trigger on playoff_games
DROP TRIGGER IF EXISTS trigger_recalculate_playoff_wins ON playoff_games;
DROP TRIGGER IF EXISTS trigger_update_playoff_games_updated_at ON playoff_games;

-- Step 5: Drop playoff_games table
DROP TABLE IF EXISTS playoff_games CASCADE;

-- Step 6: Create new ROW-level trigger on games for playoff picks recalculation
CREATE OR REPLACE FUNCTION recalculate_playoff_picks_wins()
RETURNS TRIGGER AS $$
BEGIN
    -- Only recalculate when a playoff game changes
    UPDATE playoff_picks pp
    SET total_playoff_wins = (
        SELECT COALESCE(SUM(
            CASE WHEN g.result = 'W' THEN 1 ELSE 0 END
        ), 0)
        FROM games g
        WHERE g.team_id = ANY(pp.team_ids)
          AND g.game_type = 3
    ),
    updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_playoff_wins
    AFTER INSERT OR UPDATE ON games
    FOR EACH ROW
    WHEN (NEW.game_type = 3)
    EXECUTE FUNCTION recalculate_playoff_picks_wins();

-- Step 7: Add indexes for playoff queries on games table
CREATE INDEX IF NOT EXISTS idx_games_series_id ON games(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_round ON games(round) WHERE round IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_game_number ON games(game_number_in_series) WHERE game_number_in_series IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);

-- Step 8: Drop functions that were specific to playoff_games
DROP FUNCTION IF EXISTS update_playoff_games_updated_at() CASCADE;

COMMENT ON TRIGGER trigger_recalculate_playoff_wins ON games IS 'Auto-updates playoff picks total wins when playoff games (game_type=3) change';
