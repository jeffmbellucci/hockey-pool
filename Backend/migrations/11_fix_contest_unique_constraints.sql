-- Fix unique constraints to be contest-scoped instead of global

-- Drop the old global unique constraints
ALTER TABLE pool_participants 
DROP CONSTRAINT IF EXISTS pool_participants_draft_order_key;

ALTER TABLE pool_participants 
DROP CONSTRAINT IF EXISTS pool_participants_participant_name_key;

-- Add contest-scoped unique constraints
-- Draft order should be unique within a contest, but can repeat across contests
ALTER TABLE pool_participants 
ADD CONSTRAINT pool_participants_contest_draft_order_unique 
UNIQUE (contest_id, draft_order);

-- Participant name can be the same across contests (e.g., "John" in contest 1 and "John" in contest 2)
-- But should be unique within a contest
ALTER TABLE pool_participants 
ADD CONSTRAINT pool_participants_contest_name_unique 
UNIQUE (contest_id, participant_name);

-- Also update the CHECK constraint to allow flexible participant counts (2 to 32)
ALTER TABLE pool_participants 
DROP CONSTRAINT IF EXISTS pool_participants_draft_order_check;

ALTER TABLE pool_participants 
ADD CONSTRAINT pool_participants_draft_order_check 
CHECK (draft_order >= 1 AND draft_order <= 32);

-- Allow contests to have flexible max_participants (2 to 32)
COMMENT ON COLUMN pool_participants.draft_order 
IS 'Draft order position (1 to max_participants). Supports contests from 2 to 32 participants.';

-- Comment on the changes
COMMENT ON CONSTRAINT pool_participants_contest_draft_order_unique ON pool_participants 
IS 'Draft order must be unique within each contest, but can repeat across different contests';

COMMENT ON CONSTRAINT pool_participants_contest_name_unique ON pool_participants 
IS 'Participant name must be unique within each contest, but can repeat across different contests';

