-- Allow team2_id to be NULL during Round 1 of the draft
-- Participants pick their first team in Round 1, then their second team in Round 2

ALTER TABLE two_team_picks 
ALTER COLUMN team2_id DROP NOT NULL;

-- Update the CHECK constraint to only validate when both teams are picked
ALTER TABLE two_team_picks 
DROP CONSTRAINT IF EXISTS two_team_picks_team1_id_team2_id_check;

ALTER TABLE two_team_picks 
ADD CONSTRAINT two_team_picks_different_teams_check 
CHECK (team2_id IS NULL OR team1_id <> team2_id);

-- Add comment explaining the draft process
COMMENT ON COLUMN two_team_picks.team1_id IS 'First team picked (Round 1). Always required.';
COMMENT ON COLUMN two_team_picks.team2_id IS 'Second team picked (Round 2). NULL until second pick is made.';
