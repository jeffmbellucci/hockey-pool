-- Migration 25: Add playoff_tiebreaker to contest_type constraint

-- Drop the existing constraint
ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_contest_type_check;

-- Add the updated constraint with playoff_tiebreaker included
ALTER TABLE contests 
ADD CONSTRAINT contests_contest_type_check 
CHECK (contest_type IN ('two_team', 'survivor', 'playoff_tiebreaker'));

-- Comment
COMMENT ON CONSTRAINT contests_contest_type_check ON contests IS 'Allowed contest types: two_team, survivor, playoff_tiebreaker';
