-- Drop daily_stats table (replaced by games table + team_standings materialized view)
-- The games table is now the single source of truth
-- The team_standings materialized view provides fast aggregated stats

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_daily_stats_updated_at ON daily_stats;

-- Drop indexes (they'll be dropped with the table anyway, but being explicit)
DROP INDEX IF EXISTS idx_daily_stats_date;
DROP INDEX IF EXISTS idx_daily_stats_team;
DROP INDEX IF EXISTS idx_daily_stats_date_team;

-- Drop the table
DROP TABLE IF EXISTS daily_stats CASCADE;

-- NOTE: We do NOT drop update_daily_stats_updated_at() function because
-- other tables (pool_participants, two_team_picks) still use it.
-- This is fine - the function is generic and can be reused.

-- Add comment documenting the change
COMMENT ON MATERIALIZED VIEW team_standings IS 
'Replaces daily_stats table. Provides aggregated team statistics from games table. Refresh using: REFRESH MATERIALIZED VIEW team_standings;';
