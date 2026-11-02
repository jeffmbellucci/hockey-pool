-- Migration: Fix Survivor Weeks Template Dates
-- Description: Updates the template weeks (contest_id IS NULL) to have correct dates
--              and ensures year values are correct for 2025-2026 season

-- Delete existing incorrectly dated weeks and re-insert with correct dates
DELETE FROM survivor_weeks WHERE contest_id IS NULL;

-- Re-insert all 26 weeks with correct dates in YYYY-MM-DD format
INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked)
VALUES
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

-- January weeks (before Olympic break) - Year 2026
(NULL, 13, '2025-12-29', '2026-01-04', FALSE), -- Week 13: Dec 29-Jan 4
(NULL, 14, '2026-01-05', '2026-01-11', FALSE), -- Week 14: Jan 5-11
(NULL, 15, '2026-01-12', '2026-01-18', FALSE), -- Week 15: Jan 12-18
(NULL, 16, '2026-01-19', '2026-01-25', FALSE), -- Week 16: Jan 19-25
(NULL, 17, '2026-01-26', '2026-02-01', FALSE), -- Week 17: Jan 26-Feb 1
(NULL, 18, '2026-02-02', '2026-02-08', FALSE), -- Week 18: Feb 2-8

-- OLYMPIC BREAK: Feb 9-22 (no games)

-- Post-Olympic break weeks (February-April) - Year 2026
(NULL, 19, '2026-02-23', '2026-03-01', FALSE), -- Week 19: Feb 23-March 1
(NULL, 20, '2026-03-02', '2026-03-08', FALSE), -- Week 20: March 2-8
(NULL, 21, '2026-03-09', '2026-03-15', FALSE), -- Week 21: March 9-15
(NULL, 22, '2026-03-16', '2026-03-22', FALSE), -- Week 22: March 16-22
(NULL, 23, '2026-03-23', '2026-03-29', FALSE), -- Week 23: March 23-29
(NULL, 24, '2026-03-30', '2026-04-05', FALSE), -- Week 24: March 30-April 5
(NULL, 25, '2026-04-06', '2026-04-12', FALSE), -- Week 25: April 6-12
(NULL, 26, '2026-04-13', '2026-04-19', FALSE); -- Week 26: April 13-19

