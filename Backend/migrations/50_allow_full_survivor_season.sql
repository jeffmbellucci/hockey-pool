ALTER TABLE survivor_participants DROP CONSTRAINT check_elimination_week;
ALTER TABLE survivor_participants ADD CONSTRAINT check_elimination_week CHECK (elimination_week >= 1);
ALTER TABLE survivor_picks DROP CONSTRAINT check_pick_week_number;
ALTER TABLE survivor_picks ADD CONSTRAINT check_pick_week_number CHECK (week_number >= 1);
ALTER TABLE survivor_team_usage DROP CONSTRAINT check_usage_week;
ALTER TABLE survivor_team_usage ADD CONSTRAINT check_usage_week CHECK (used_in_week >= 1);
