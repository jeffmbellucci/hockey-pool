-- Create playoff_games table for tracking playoff game results (game_type = 3)
-- Exact same structure as games table, with game_type defaulting to 3
CREATE TABLE playoff_games (
    game_id BIGINT NOT NULL,  -- NHL API game ID
    game_date DATE NOT NULL,
    game_type INTEGER NOT NULL DEFAULT 3,  -- 1=Preseason, 2=Regular Season, 3=Playoffs, 4=All-Star
    game_state VARCHAR(20) NOT NULL,  -- FINAL, OFF, LIVE, etc.
    
    -- Team information (our team)
    team_id INTEGER NOT NULL REFERENCES nhl_teams (team_id) ON DELETE CASCADE,
    team_abbrev VARCHAR(10) NOT NULL,
    team_score INTEGER NOT NULL,
    is_home BOOLEAN NOT NULL,  -- true if team played at home
    
    -- Opponent information
    opponent_id INTEGER NOT NULL REFERENCES nhl_teams (team_id) ON DELETE CASCADE,
    opponent_abbrev VARCHAR(10) NOT NULL,
    opponent_score INTEGER NOT NULL,
    opponent_logo TEXT,  -- URL to opponent's logo
    
    -- Game result from team's perspective
    result VARCHAR(10) NOT NULL,  -- 'W' (Win), 'L' (Loss), 'OTL' (Overtime Loss), 'SOL' (Shootout Loss)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite PRIMARY KEY: each team can only have one record per game
    PRIMARY KEY (game_id, team_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_playoff_games_date ON playoff_games(game_date);
CREATE INDEX IF NOT EXISTS idx_playoff_games_team ON playoff_games(team_id);
CREATE INDEX IF NOT EXISTS idx_playoff_games_opponent ON playoff_games(opponent_id);
CREATE INDEX IF NOT EXISTS idx_playoff_games_team_date ON playoff_games(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_playoff_games_team_opponent ON playoff_games(team_id, opponent_id);
CREATE INDEX IF NOT EXISTS idx_playoff_games_result ON playoff_games(result);
CREATE INDEX IF NOT EXISTS idx_playoff_games_type ON playoff_games(game_type);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_playoff_games_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update the updated_at column
CREATE TRIGGER trigger_update_playoff_games_updated_at
    BEFORE UPDATE ON playoff_games
    FOR EACH ROW
    EXECUTE FUNCTION update_playoff_games_updated_at();

-- Comments for documentation
COMMENT ON TABLE playoff_games IS 'Stores playoff NHL game results (game_type = 3) with opponent tracking for efficient querying';
COMMENT ON COLUMN playoff_games.game_id IS 'NHL API game ID';
COMMENT ON COLUMN playoff_games.team_id IS 'The team from whose perspective this record is stored';
COMMENT ON COLUMN playoff_games.opponent_id IS 'The opposing team';
COMMENT ON COLUMN playoff_games.is_home IS 'Whether team played at home (true) or away (false)';
COMMENT ON COLUMN playoff_games.result IS 'Game result from team perspective: W, L, OTL, SOL';
COMMENT ON COLUMN playoff_games.opponent_logo IS 'URL to opponent team logo from NHL API';
