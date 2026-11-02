-- Migration 27: Extend contests table with survivor-specific fields
-- This migration adds survivor contest fields to the existing contests table

-- Add survivor-specific columns to contests table
ALTER TABLE contests ADD COLUMN IF NOT EXISTS current_week INTEGER DEFAULT 1;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS phase VARCHAR(50) DEFAULT 'regular_season';
ALTER TABLE contests ADD COLUMN IF NOT EXISTS playoff_round INTEGER;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS playoff_game_number INTEGER;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS entry_fee DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS prize_pool DECIMAL(10, 2) DEFAULT 0;

-- Add comments to new columns
COMMENT ON COLUMN contests.current_week IS 'Current week number for survivor contests (1-26 for regular season)';
COMMENT ON COLUMN contests.phase IS 'Contest phase: regular_season, playoffs, completed';
COMMENT ON COLUMN contests.playoff_round IS 'Current playoff round (1-4) for survivor contests';
COMMENT ON COLUMN contests.playoff_game_number IS 'Current playoff game number (1-7) for survivor contests';
COMMENT ON COLUMN contests.entry_fee IS 'Entry fee for the contest in dollars';
COMMENT ON COLUMN contests.prize_pool IS 'Total prize pool for the contest';

-- Ensure contest_type supports 'survivor' (it should already support any VARCHAR value)
-- contest_type can be: 'two_team', 'playoff_tiebreaker', 'survivor'

-- Add validation constraints (using DO block to avoid errors if they already exist)

-- Validation: phase must be one of the valid values
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_phase') THEN
        ALTER TABLE contests ADD CONSTRAINT check_phase 
            CHECK (phase IN ('regular_season', 'playoffs', 'completed'));
    END IF;
END $$;

-- Validation: playoff_round must be 1-4 if set
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_playoff_round') THEN
        ALTER TABLE contests ADD CONSTRAINT check_playoff_round 
            CHECK (playoff_round IS NULL OR (playoff_round >= 1 AND playoff_round <= 4));
    END IF;
END $$;

-- Validation: playoff_game_number must be 1-7 if set
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_playoff_game_number') THEN
        ALTER TABLE contests ADD CONSTRAINT check_playoff_game_number 
            CHECK (playoff_game_number IS NULL OR (playoff_game_number >= 1 AND playoff_game_number <= 7));
    END IF;
END $$;

-- Validation: entry_fee must be non-negative
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_entry_fee') THEN
        ALTER TABLE contests ADD CONSTRAINT check_entry_fee 
            CHECK (entry_fee >= 0);
    END IF;
END $$;

-- Validation: prize_pool must be non-negative
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_prize_pool') THEN
        ALTER TABLE contests ADD CONSTRAINT check_prize_pool 
            CHECK (prize_pool >= 0);
    END IF;
END $$;

-- Create index on contest_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_contests_type ON contests(contest_type);
CREATE INDEX IF NOT EXISTS idx_contests_phase ON contests(phase);
