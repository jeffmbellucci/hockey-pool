-- Allow negative draft orders temporarily during randomization
-- This enables the app to use negative values as temporary placeholders
-- to avoid unique constraint violations when shuffling draft orders

ALTER TABLE pool_participants 
DROP CONSTRAINT IF EXISTS pool_participants_draft_order_check;

ALTER TABLE pool_participants 
ADD CONSTRAINT pool_participants_draft_order_check 
CHECK (draft_order >= -32 AND draft_order <= 32 AND draft_order != 0);

COMMENT ON CONSTRAINT pool_participants_draft_order_check ON pool_participants 
IS 'Draft order must be between 1-32 for valid positions. Negative values (-1 to -32) are allowed temporarily during draft order shuffling to avoid unique constraint conflicts.';

