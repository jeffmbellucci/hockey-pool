-- Game start values come from the NHL API in UTC, and week locks copy those values.
-- Explicit timezones prevent node-postgres from interpreting them in the app host's local zone.
ALTER TABLE games
  ALTER COLUMN start_time_utc TYPE TIMESTAMPTZ USING start_time_utc AT TIME ZONE 'UTC';

ALTER TABLE survivor_weeks
  ALTER COLUMN lock_time TYPE TIMESTAMPTZ USING lock_time AT TIME ZONE 'UTC';

-- submitted_at was populated with database NOW(); preserve that database timezone
-- when converting historical rows. New submissions store an absolute instant.
ALTER TABLE survivor_picks
  ALTER COLUMN submitted_at TYPE TIMESTAMPTZ
    USING submitted_at AT TIME ZONE current_setting('TimeZone');
