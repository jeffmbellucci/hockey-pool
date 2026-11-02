-- Fix survivor weeks year mismatch
-- Games are in 2025 but survivor weeks were created with 2025 dates
-- This migration updates all survivor weeks to use 2025 dates

UPDATE survivor_weeks 
SET 
  start_date = start_date + INTERVAL '1 year',
  end_date = end_date + INTERVAL '1 year'
WHERE 
  EXTRACT(YEAR FROM start_date) = 2025
  AND contest_id IN (
    SELECT contest_id FROM contests WHERE contest_type = 'survivor'
  );

-- Add comment explaining the fix
COMMENT ON TABLE survivor_weeks IS 'Stores weekly date ranges for survivor contests. Week dates must match game dates in the games table.';

