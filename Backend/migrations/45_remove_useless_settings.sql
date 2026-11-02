-- Remove settings that were purely cosmetic / redundant
-- pick_deadline_day/time: only produced a display string, never enforced deadlines
-- current_week: redundant with per-contest current_week column, now auto-calculated from season_start_date
DELETE FROM settings WHERE setting_key IN ('pick_deadline_day', 'pick_deadline_time', 'current_week');
