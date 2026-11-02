-- Migration 15: Create playoff_standings table
-- This table stores NHL playoff standings data for tiebreaker purposes in the Two Team Contest

CREATE TABLE IF NOT EXISTS playoff_standings (
    standings_id SERIAL PRIMARY KEY,
    standings_date DATE NOT NULL,
    team_abbrev VARCHAR(10) NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    nhl_api_id INTEGER NOT NULL,
    
    -- Conference information
    conference_name VARCHAR(50) NOT NULL,
    conference_abbrev VARCHAR(10) NOT NULL,
    conference_sequence INTEGER NOT NULL, -- Ranking within conference (1-16)
    
    -- Division information
    division_name VARCHAR(50) NOT NULL,
    division_abbrev VARCHAR(10) NOT NULL,
    division_sequence INTEGER NOT NULL, -- Ranking within division (1-8)
    
    -- Wildcard information
    wildcard_sequence INTEGER DEFAULT 0, -- 0 if not wildcard, 1-2 for wildcard teams
    
    -- Game statistics
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ot_losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    point_pctg DECIMAL(5,3) DEFAULT 0.000,
    regulation_wins INTEGER DEFAULT 0,
    
    -- Goal statistics
    goal_differential INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    
    -- Playoff team flag
    is_playoff_team BOOLEAN DEFAULT FALSE, -- True if in top 16 (top 8 per conference)
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint on date and team
    CONSTRAINT unique_standings_date_team UNIQUE (standings_date, nhl_api_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_playoff_standings_date ON playoff_standings(standings_date);
CREATE INDEX IF NOT EXISTS idx_playoff_standings_team ON playoff_standings(nhl_api_id);
CREATE INDEX IF NOT EXISTS idx_playoff_standings_is_playoff ON playoff_standings(standings_date, is_playoff_team);
CREATE INDEX IF NOT EXISTS idx_playoff_standings_conference ON playoff_standings(standings_date, conference_abbrev, conference_sequence);

-- Comments
COMMENT ON TABLE playoff_standings IS 'Stores NHL playoff standings data fetched from NHL API for determining playoff teams and tiebreakers';
COMMENT ON COLUMN playoff_standings.conference_sequence IS 'Team ranking within conference (1-16). Top 8 make playoffs.';
COMMENT ON COLUMN playoff_standings.division_sequence IS 'Team ranking within division (1-8). Top 3 from each division make playoffs.';
COMMENT ON COLUMN playoff_standings.wildcard_sequence IS '0 if not wildcard, 1-2 for wildcard teams in each conference';
COMMENT ON COLUMN playoff_standings.is_playoff_team IS 'True if team is in playoff position (top 8 in conference)';

