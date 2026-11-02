-- Migration 38: Add 2024-25 season survivor weeks template
-- Description: Adds template weeks for 2024-25 NHL season to support creating past contests
--              The 2024-25 season runs from October 2024 to March 2025

-- Insert 23 weeks for 2024-25 season template (contest_id = NULL)
INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked)
VALUES
-- October 2024 weeks
(NULL, 1, '2024-10-10', '2024-10-16', FALSE),  -- Week 1: Oct 10-16
(NULL, 2, '2024-10-17', '2024-10-23', FALSE),  -- Week 2: Oct 17-23
(NULL, 3, '2024-10-24', '2024-10-30', FALSE),  -- Week 3: Oct 24-30
(NULL, 4, '2024-10-31', '2024-11-06', FALSE),  -- Week 4: Oct 31-Nov 6

-- November 2024 weeks
(NULL, 5, '2024-11-07', '2024-11-13', FALSE),  -- Week 5: Nov 7-13
(NULL, 6, '2024-11-14', '2024-11-20', FALSE),  -- Week 6: Nov 14-20
(NULL, 7, '2024-11-21', '2024-11-27', FALSE),  -- Week 7: Nov 21-27
(NULL, 8, '2024-11-28', '2024-12-04', FALSE),  -- Week 8: Nov 28-Dec 4

-- December 2024 weeks
(NULL, 9, '2024-12-05', '2024-12-11', FALSE),  -- Week 9: Dec 5-11
(NULL, 10, '2024-12-12', '2024-12-18', FALSE), -- Week 10: Dec 12-18
(NULL, 11, '2024-12-19', '2024-12-25', FALSE), -- Week 11: Dec 19-25
(NULL, 12, '2024-12-26', '2025-01-01', FALSE), -- Week 12: Dec 26-Jan 1

-- January 2025 weeks
(NULL, 13, '2025-01-02', '2025-01-08', FALSE), -- Week 13: Jan 2-8
(NULL, 14, '2025-01-09', '2025-01-15', FALSE), -- Week 14: Jan 9-15
(NULL, 15, '2025-01-16', '2025-01-22', FALSE), -- Week 15: Jan 16-22
(NULL, 16, '2025-01-23', '2025-01-29', FALSE), -- Week 16: Jan 23-29

-- February 2025 weeks (Note: All-Star break around Feb 1-5, 2025)
(NULL, 17, '2025-02-06', '2025-02-12', FALSE), -- Week 17: Feb 6-12
(NULL, 18, '2025-02-13', '2025-02-19', FALSE), -- Week 18: Feb 13-19
(NULL, 19, '2025-02-20', '2025-02-26', FALSE), -- Week 19: Feb 20-26
(NULL, 20, '2025-02-27', '2025-03-05', FALSE), -- Week 20: Feb 27-Mar 5

-- March 2025 weeks
(NULL, 21, '2025-03-06', '2025-03-12', FALSE), -- Week 21: Mar 6-12
(NULL, 22, '2025-03-13', '2025-03-19', FALSE), -- Week 22: Mar 13-19
(NULL, 23, '2025-03-20', '2025-03-26', FALSE); -- Week 23: Mar 20-26

-- Note: These template weeks have NULL contest_id
-- They will be used as templates when creating a 2024-25 season survivor contest

