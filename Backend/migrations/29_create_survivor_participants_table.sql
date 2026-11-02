-- Migration 29: Create survivor_participants table
-- Separate table from pool_participants for cleaner separation of contest types

CREATE TABLE IF NOT EXISTS survivor_participants (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_name VARCHAR(100) NOT NULL,
    is_eliminated BOOLEAN DEFAULT FALSE,
    elimination_week INTEGER,
    elimination_round INTEGER,
    placement INTEGER,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_survivor_participant UNIQUE(contest_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_survivor_participants_contest ON survivor_participants(contest_id);
CREATE INDEX IF NOT EXISTS idx_survivor_participants_user ON survivor_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_survivor_participants_status ON survivor_participants(is_eliminated);
CREATE INDEX IF NOT EXISTS idx_survivor_participants_placement ON survivor_participants(placement);

-- Add comments
COMMENT ON TABLE survivor_participants IS 'Tracks participants in survivor contests (separate from pool_participants for two_team contests)';
COMMENT ON COLUMN survivor_participants.participant_name IS 'Display name for the participant in the contest';
COMMENT ON COLUMN survivor_participants.is_eliminated IS 'True if participant has been eliminated from the contest';
COMMENT ON COLUMN survivor_participants.elimination_week IS 'Week number when eliminated (regular season, 1-26)';
COMMENT ON COLUMN survivor_participants.elimination_round IS 'Playoff round when eliminated (1-4, if applicable)';
COMMENT ON COLUMN survivor_participants.placement IS 'Final placement: 1=champion, 2=runner-up, etc. Assigned when eliminated or at contest end';
COMMENT ON COLUMN survivor_participants.joined_at IS 'Timestamp when participant joined the contest';

-- Validation constraints (using DO blocks to avoid errors if they already exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_elimination_week' AND conrelid = 'survivor_participants'::regclass) THEN
        ALTER TABLE survivor_participants ADD CONSTRAINT check_elimination_week 
            CHECK (elimination_week IS NULL OR (elimination_week >= 1 AND elimination_week <= 26));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_elimination_round' AND conrelid = 'survivor_participants'::regclass) THEN
        ALTER TABLE survivor_participants ADD CONSTRAINT check_elimination_round 
            CHECK (elimination_round IS NULL OR (elimination_round >= 1 AND elimination_round <= 4));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_placement' AND conrelid = 'survivor_participants'::regclass) THEN
        ALTER TABLE survivor_participants ADD CONSTRAINT check_placement 
            CHECK (placement IS NULL OR placement >= 1);
    END IF;
END $$;

-- Note: participant_name could be different from user's actual name
-- This allows users to choose a nickname or alias for the contest
