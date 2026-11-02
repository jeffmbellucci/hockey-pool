-- Migration 39: Add playoff_tiebreaker to phase constraint
-- Description: Updates the check_phase constraint to include 'playoff_tiebreaker' 
--              as a valid phase for survivor contests

-- Drop the existing constraint
ALTER TABLE contests DROP CONSTRAINT IF EXISTS check_phase;

-- Recreate it with the additional playoff_tiebreaker phase
ALTER TABLE contests ADD CONSTRAINT check_phase 
    CHECK (phase IN ('regular_season', 'playoffs', 'playoff_tiebreaker', 'completed'));

-- Update comment to reflect the new phase
COMMENT ON COLUMN contests.phase IS 'Contest phase: regular_season, playoffs, playoff_tiebreaker, completed';

