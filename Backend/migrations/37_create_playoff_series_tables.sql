-- Migration 37: Create playoff series tracking and survivor tiebreaker tables
-- This supports the survivor playoff tiebreaker when multiple participants survive the regular season

-- =============================================================================
-- PLAYOFF SERIES TRACKING
-- =============================================================================

-- Table to track all playoff series
CREATE TABLE playoff_series (
    series_id VARCHAR(20) PRIMARY KEY,  -- e.g., "2024-R1-E", "2024-SCF-O"
    season INTEGER NOT NULL,             -- e.g., 20242025
    round INTEGER NOT NULL,              -- 1, 2, 3, 4 (where 4 = Stanley Cup Final)
    series_abbrev VARCHAR(10) NOT NULL,  -- "R1", "R2", "R3", "SCF"
    series_title VARCHAR(50) NOT NULL,   -- "1st Round", "Stanley Cup Final"
    series_letter VARCHAR(5) NOT NULL,   -- "A"-"H" for R1, fewer for later rounds
    
    -- Teams in the series
    top_seed_team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    top_seed_team_abbrev VARCHAR(10) NOT NULL,
    top_seed_wins INTEGER NOT NULL DEFAULT 0,
    
    bottom_seed_team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    bottom_seed_team_abbrev VARCHAR(10) NOT NULL,
    bottom_seed_wins INTEGER NOT NULL DEFAULT 0,
    
    -- Series status
    needed_to_win INTEGER NOT NULL DEFAULT 4,  -- Always 4 in NHL playoffs
    series_winner_id INTEGER REFERENCES nhl_teams(team_id),  -- NULL if series ongoing
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_series_round CHECK (round BETWEEN 1 AND 4),
    CONSTRAINT check_wins CHECK (top_seed_wins >= 0 AND bottom_seed_wins >= 0 AND 
                                  top_seed_wins <= 4 AND bottom_seed_wins <= 4)
);

-- Add series information to playoff_games
ALTER TABLE playoff_games 
    ADD COLUMN series_id VARCHAR(20) REFERENCES playoff_series(series_id),
    ADD COLUMN round INTEGER,
    ADD COLUMN game_number_in_series INTEGER;

-- Create indexes for playoff series
CREATE INDEX idx_playoff_series_season ON playoff_series(season);
CREATE INDEX idx_playoff_series_round ON playoff_series(round);
CREATE INDEX idx_playoff_series_teams ON playoff_series(top_seed_team_id, bottom_seed_team_id);
CREATE INDEX idx_playoff_series_winner ON playoff_series(series_winner_id);
CREATE INDEX idx_playoff_series_completed ON playoff_series(is_completed);

-- Create indexes for playoff_games series columns
CREATE INDEX idx_playoff_games_series ON playoff_games(series_id);
CREATE INDEX idx_playoff_games_round ON playoff_games(round);
CREATE INDEX idx_playoff_games_game_number ON playoff_games(game_number_in_series);

-- =============================================================================
-- SURVIVOR PLAYOFF TIEBREAKER SYSTEM
-- =============================================================================

-- Table to track which playoff round we're currently in for tiebreaker
CREATE TABLE survivor_playoff_tiebreaker_status (
    contest_id INTEGER PRIMARY KEY REFERENCES contests(contest_id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    current_round INTEGER NOT NULL DEFAULT 1,  -- Which playoff round we're in (1-4)
    current_game_number INTEGER NOT NULL DEFAULT 1,  -- Current game number (1-7)
    season INTEGER NOT NULL,
    
    -- Round 1-3: only pick for games 1-4
    -- Round 4 (SCF): pick for all games until decided
    max_game_number_for_round INTEGER NOT NULL DEFAULT 4,  -- 4 for R1-R3, 7 for SCF
    
    -- Track when round advances
    round_started_at TIMESTAMP,
    round_lock_time TIMESTAMP,  -- When picks lock for this game number
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_tiebreaker_round CHECK (current_round BETWEEN 1 AND 4),
    CONSTRAINT check_tiebreaker_game_number CHECK (current_game_number BETWEEN 1 AND 7)
);

-- Table to track which participants are in the tiebreaker
CREATE TABLE survivor_playoff_tiebreaker_participants (
    tiebreaker_participant_id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES survivor_participants(id) ON DELETE CASCADE,
    
    -- Status
    is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
    eliminated_at TIMESTAMP,
    eliminated_in_round INTEGER,
    eliminated_in_game_number INTEGER,
    
    -- If they win
    is_winner BOOLEAN NOT NULL DEFAULT FALSE,
    won_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(contest_id, user_id)
);

-- Table to track tiebreaker picks for each game
CREATE TABLE survivor_playoff_tiebreaker_picks (
    pick_id SERIAL PRIMARY KEY,
    tiebreaker_participant_id INTEGER NOT NULL REFERENCES survivor_playoff_tiebreaker_participants(tiebreaker_participant_id) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    
    -- Which game/round
    round INTEGER NOT NULL,
    game_number INTEGER NOT NULL,  -- Game number within the round (1-7)
    
    -- The pick
    series_id VARCHAR(20) NOT NULL REFERENCES playoff_series(series_id),
    picked_team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    picked_team_abbrev VARCHAR(10) NOT NULL,
    
    -- Result tracking
    game_id BIGINT,  -- The actual game that was played (may be NULL if not yet scheduled)
    is_correct BOOLEAN,  -- NULL if game not played yet, TRUE if team won, FALSE if team lost
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tiebreaker_participant_id, round, game_number),
    
    CONSTRAINT check_playoff_round CHECK (round BETWEEN 1 AND 4),
    CONSTRAINT check_playoff_game_number CHECK (game_number BETWEEN 1 AND 7)
);

-- Table to track which teams each participant has used (for Round 3+ reset)
-- In Round 1-2: teams used are cumulative
-- In Round 3: fresh slate of all teams
-- In SCF: both teams available for every game
CREATE TABLE survivor_playoff_tiebreaker_team_usage (
    usage_id SERIAL PRIMARY KEY,
    tiebreaker_participant_id INTEGER NOT NULL REFERENCES survivor_playoff_tiebreaker_participants(tiebreaker_participant_id) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES nhl_teams(team_id),
    team_abbrev VARCHAR(10) NOT NULL,
    
    -- When was this team used
    used_in_round INTEGER NOT NULL,
    used_in_game_number INTEGER NOT NULL,
    pick_id INTEGER NOT NULL REFERENCES survivor_playoff_tiebreaker_picks(pick_id) ON DELETE CASCADE,
    
    -- Track if this counts against current pool
    -- TRUE for R1-R2, becomes FALSE when R3 starts (fresh slate)
    -- Always FALSE in SCF (both teams available every game)
    counts_as_used BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tiebreaker_participant_id, team_id, used_in_round, used_in_game_number)
);

-- Create indexes for tiebreaker tables
CREATE INDEX idx_tiebreaker_status_contest ON survivor_playoff_tiebreaker_status(contest_id);
CREATE INDEX idx_tiebreaker_status_active ON survivor_playoff_tiebreaker_status(is_active);

CREATE INDEX idx_tiebreaker_participants_contest ON survivor_playoff_tiebreaker_participants(contest_id);
CREATE INDEX idx_tiebreaker_participants_user ON survivor_playoff_tiebreaker_participants(user_id);
CREATE INDEX idx_tiebreaker_participants_eliminated ON survivor_playoff_tiebreaker_participants(is_eliminated);
CREATE INDEX idx_tiebreaker_participants_winner ON survivor_playoff_tiebreaker_participants(is_winner);

CREATE INDEX idx_tiebreaker_picks_participant ON survivor_playoff_tiebreaker_picks(tiebreaker_participant_id);
CREATE INDEX idx_tiebreaker_picks_contest ON survivor_playoff_tiebreaker_picks(contest_id);
CREATE INDEX idx_tiebreaker_picks_round ON survivor_playoff_tiebreaker_picks(round, game_number);
CREATE INDEX idx_tiebreaker_picks_series ON survivor_playoff_tiebreaker_picks(series_id);
CREATE INDEX idx_tiebreaker_picks_result ON survivor_playoff_tiebreaker_picks(is_correct);
CREATE INDEX idx_tiebreaker_picks_locked ON survivor_playoff_tiebreaker_picks(is_locked);

CREATE INDEX idx_tiebreaker_usage_participant ON survivor_playoff_tiebreaker_team_usage(tiebreaker_participant_id);
CREATE INDEX idx_tiebreaker_usage_team ON survivor_playoff_tiebreaker_team_usage(team_id);
CREATE INDEX idx_tiebreaker_usage_counts ON survivor_playoff_tiebreaker_team_usage(counts_as_used);

-- =============================================================================
-- TRIGGERS AND FUNCTIONS
-- =============================================================================

-- Function to update playoff_series updated_at
CREATE OR REPLACE FUNCTION update_playoff_series_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_playoff_series_updated_at
    BEFORE UPDATE ON playoff_series
    FOR EACH ROW
    EXECUTE FUNCTION update_playoff_series_updated_at();

-- Function to update tiebreaker status updated_at
CREATE OR REPLACE FUNCTION update_tiebreaker_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tiebreaker_status_updated_at
    BEFORE UPDATE ON survivor_playoff_tiebreaker_status
    FOR EACH ROW
    EXECUTE FUNCTION update_tiebreaker_status_updated_at();

-- Function to update tiebreaker participants updated_at
CREATE OR REPLACE FUNCTION update_tiebreaker_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tiebreaker_participants_updated_at
    BEFORE UPDATE ON survivor_playoff_tiebreaker_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_tiebreaker_participants_updated_at();

-- Function to update tiebreaker picks updated_at
CREATE OR REPLACE FUNCTION update_tiebreaker_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tiebreaker_picks_updated_at
    BEFORE UPDATE ON survivor_playoff_tiebreaker_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_tiebreaker_picks_updated_at();

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE playoff_series IS 'Tracks all NHL playoff series with game-by-game win counts';
COMMENT ON TABLE survivor_playoff_tiebreaker_status IS 'Tracks the current status of playoff tiebreaker for survivor contests';
COMMENT ON TABLE survivor_playoff_tiebreaker_participants IS 'Participants who survived the regular season and are competing in playoff tiebreaker';
COMMENT ON TABLE survivor_playoff_tiebreaker_picks IS 'Picks made by participants for each game in the playoff tiebreaker';
COMMENT ON TABLE survivor_playoff_tiebreaker_team_usage IS 'Tracks which teams have been used by each participant (resets in Round 3)';

COMMENT ON COLUMN playoff_series.series_id IS 'Unique identifier: season-round-letter (e.g., 2024-R1-E)';
COMMENT ON COLUMN survivor_playoff_tiebreaker_status.max_game_number_for_round IS '4 for Rounds 1-3 (only pick games 1-4), 7 for SCF (pick all games)';
COMMENT ON COLUMN survivor_playoff_tiebreaker_team_usage.counts_as_used IS 'FALSE when Round 3 starts (fresh slate) or in SCF (both teams always available)';

