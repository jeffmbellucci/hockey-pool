-- Migration 28: Create survivor_weeks table and seed 26 weeks for 2025-25 season
-- This table tracks the 26 weeks of the regular season (excluding Olympic break)

CREATE TABLE IF NOT EXISTS survivor_weeks (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER REFERENCES contests(contest_id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    lock_time TIMESTAMP, -- Time of first game (when picks lock) - calculated dynamically
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_contest_week UNIQUE(contest_id, week_number)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_survivor_weeks_contest ON survivor_weeks(contest_id);
CREATE INDEX IF NOT EXISTS idx_survivor_weeks_dates ON survivor_weeks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_survivor_weeks_locked ON survivor_weeks(is_locked);

-- Add comments
COMMENT ON TABLE survivor_weeks IS 'Tracks weekly periods for survivor contests (26 weeks for 2025-25 season)';
COMMENT ON COLUMN survivor_weeks.week_number IS 'Week number (1-26) within the contest';
COMMENT ON COLUMN survivor_weeks.start_date IS 'Start date of the week (Monday)';
COMMENT ON COLUMN survivor_weeks.end_date IS 'End date of the week (Sunday)';
COMMENT ON COLUMN survivor_weeks.lock_time IS 'Timestamp when picks lock (first game of the week)';
COMMENT ON COLUMN survivor_weeks.is_locked IS 'Whether picks are currently locked for this week';

-- Seed the 26 weeks for the 2025-26 NHL season
-- NOTE: These dates will be associated with contests when they are created
-- This is a template that can be used when creating survivor contests

-- Week definitions for 2025-26 season (Olympic break: Feb 9-22)
-- Weeks are Sunday-Saturday format for NHL scheduling

INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked) VALUES
-- NOTE: contest_id will need to be set when contests are created
-- These are placeholder dates that follow the structure from SURVIVOR_CONTEST.md

-- October weeks
(NULL, 1, '2025-10-06', '2025-10-12', FALSE),  -- Week 1: October 6-12
(NULL, 2, '2025-10-13', '2025-10-19', FALSE),  -- Week 2: October 13-19
(NULL, 3, '2025-10-20', '2025-10-26', FALSE),  -- Week 3: October 20-26
(NULL, 4, '2025-10-27', '2025-11-02', FALSE),  -- Week 4: October 27-Nov 2

-- November weeks
(NULL, 5, '2025-11-03', '2025-11-09', FALSE),  -- Week 5: Nov 3-9
(NULL, 6, '2025-11-10', '2025-11-16', FALSE),  -- Week 6: Nov 10-16
(NULL, 7, '2025-11-17', '2025-11-23', FALSE),  -- Week 7: Nov 17-23
(NULL, 8, '2025-11-24', '2025-11-30', FALSE),  -- Week 8: Nov 24-30

-- December weeks
(NULL, 9, '2025-12-01', '2025-12-07', FALSE),  -- Week 9: Dec 1-7
(NULL, 10, '2025-12-08', '2025-12-14', FALSE), -- Week 10: Dec 8-14
(NULL, 11, '2025-12-15', '2025-12-21', FALSE), -- Week 11: Dec 15-21
(NULL, 12, '2025-12-22', '2025-12-28', FALSE), -- Week 12: Dec 22-28

-- January weeks (before Olympic break)
(NULL, 13, '2025-12-29', '2026-01-04', FALSE), -- Week 13: Dec 29-Jan 4
(NULL, 14, '2026-01-05', '2026-01-11', FALSE), -- Week 14: Jan 5-11
(NULL, 15, '2026-01-12', '2026-01-18', FALSE), -- Week 15: Jan 12-18
(NULL, 16, '2026-01-19', '2026-01-25', FALSE), -- Week 16: Jan 19-25
(NULL, 17, '2026-01-26', '2026-02-01', FALSE), -- Week 17: Jan 26-Feb 1
(NULL, 18, '2026-02-02', '2026-02-08', FALSE), -- Week 18: Feb 2-8

-- OLYMPIC BREAK: Feb 9-22 (no games)

-- Post-Olympic break weeks (February-April)
(NULL, 19, '2026-02-23', '2026-03-01', FALSE), -- Week 19: Feb 23-March 1
(NULL, 20, '2026-03-02', '2026-03-08', FALSE), -- Week 20: March 2-8
(NULL, 21, '2026-03-09', '2026-03-15', FALSE), -- Week 21: March 9-15
(NULL, 22, '2026-03-16', '2026-03-22', FALSE), -- Week 22: March 16-22
(NULL, 23, '2026-03-23', '2026-03-29', FALSE), -- Week 23: March 23-29
(NULL, 24, '2026-03-30', '2026-04-05', FALSE), -- Week 24: March 30-April 5
(NULL, 25, '2026-04-06', '2026-04-12', FALSE), -- Week 25: April 6-12
(NULL, 26, '2026-04-13', '2026-04-19', FALSE); -- Week 26: April 13-19

-- Note: These template weeks have NULL contest_id
-- When a survivor contest is created, the application should:
-- 1. Copy these week definitions with the contest_id
-- 2. Calculate lock_time based on first game of each week
-- 3. Update is_locked status as games progress
