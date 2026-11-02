-- Update existing user roles to new role system
-- Convert any old roles to the new admin/player system

-- Update any 'Employee', 'user', or other roles to 'player' 
UPDATE users 
SET role = 'player' 
WHERE role NOT IN ('admin', 'player');

-- Add CHECK constraint if it doesn't exist (for databases that already had the table)
DO $$ 
BEGIN
  -- Drop the old constraint if it exists
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  
  -- Add the new constraint
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'player'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

