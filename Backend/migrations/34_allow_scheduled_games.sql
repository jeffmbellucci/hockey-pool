-- Migration 34: Allow scheduled games (FUT state) in games table
-- This enables storing future/scheduled games for survivor contest week scheduling

-- Modify games table to allow NULL scores and results for scheduled games
ALTER TABLE games 
  ALTER COLUMN team_score DROP NOT NULL,
  ALTER COLUMN opponent_score DROP NOT NULL,
  ALTER COLUMN result DROP NOT NULL;

-- Add default values for scheduled games
ALTER TABLE games 
  ALTER COLUMN team_score SET DEFAULT 0,
  ALTER COLUMN opponent_score SET DEFAULT 0,
  ALTER COLUMN result SET DEFAULT 'PENDING';

-- Add a column to track the game start time (useful for lock time calculations)
ALTER TABLE games 
  ADD COLUMN IF NOT EXISTS start_time_utc TIMESTAMP;

-- Create index for game_state to efficiently query scheduled vs completed games
CREATE INDEX IF NOT EXISTS idx_games_state ON games(game_state);

-- Create index for start time to efficiently calculate lock times
CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time_utc);

-- Create composite index for week-based queries (date range + game type + state)
CREATE INDEX IF NOT EXISTS idx_games_week_query ON games(game_date, game_type, game_state);

-- Add comment
COMMENT ON COLUMN games.game_state IS 'Game state: FUT (scheduled), LIVE (in progress), FINAL (completed), OFF (completed)';
COMMENT ON COLUMN games.result IS 'Game result: W (win), L (loss), OTL (OT loss), SOL (SO loss), PENDING (scheduled)';
COMMENT ON COLUMN games.start_time_utc IS 'Game start time in UTC for lock time calculations';

