-- Create daily stats table for tracking team wins
CREATE TABLE IF NOT EXISTS daily_stats (
    stat_id SERIAL PRIMARY KEY,
    stat_date DATE NOT NULL,
    team_id INTEGER NOT NULL REFERENCES nhl_teams (team_id) ON DELETE CASCADE,
    regular_season_wins INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    losses INTEGER DEFAULT 0,
    overtime_losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stat_date, team_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_team ON daily_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date_team ON daily_stats(stat_date, team_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_daily_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update the updated_at column
CREATE TRIGGER trigger_update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats_updated_at();

