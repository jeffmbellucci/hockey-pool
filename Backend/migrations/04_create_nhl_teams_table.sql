-- Create NHL teams table
CREATE TABLE IF NOT EXISTS nhl_teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(10) UNIQUE NOT NULL,
    division_id INTEGER NOT NULL REFERENCES divisions (division_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_name)
);

-- Metropolitan Division (division_id = 1)
INSERT INTO nhl_teams (team_name, abbreviation, division_id) VALUES
('Carolina Hurricanes', 'CAR', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('Columbus Blue Jackets', 'CBJ', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('New Jersey Devils', 'NJD', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('New York Islanders', 'NYI', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('New York Rangers', 'NYR', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('Philadelphia Flyers', 'PHI', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('Pittsburgh Penguins', 'PIT', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan')),
('Washington Capitals', 'WSH', (SELECT division_id FROM divisions WHERE division_name = 'Metropolitan'))
ON CONFLICT (abbreviation) DO NOTHING;

-- Atlantic Division (division_id = 2)
INSERT INTO nhl_teams (team_name, abbreviation, division_id) VALUES
('Boston Bruins', 'BOS', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Buffalo Sabres', 'BUF', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Detroit Red Wings', 'DET', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Florida Panthers', 'FLA', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Montréal Canadiens', 'MTL', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Ottawa Senators', 'OTT', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Tampa Bay Lightning', 'TBL', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic')),
('Toronto Maple Leafs', 'TOR', (SELECT division_id FROM divisions WHERE division_name = 'Atlantic'))
ON CONFLICT (abbreviation) DO NOTHING;

-- Central Division (division_id = 3)
INSERT INTO nhl_teams (team_name, abbreviation, division_id) VALUES
('Chicago Blackhawks', 'CHI', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Colorado Avalanche', 'COL', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Dallas Stars', 'DAL', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Minnesota Wild', 'MIN', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Nashville Predators', 'NSH', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('St. Louis Blues', 'STL', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Utah Hockey Club', 'UTA', (SELECT division_id FROM divisions WHERE division_name = 'Central')),
('Winnipeg Jets', 'WPG', (SELECT division_id FROM divisions WHERE division_name = 'Central'))
ON CONFLICT (abbreviation) DO NOTHING;

-- Pacific Division (division_id = 4)
INSERT INTO nhl_teams (team_name, abbreviation, division_id) VALUES
('Anaheim Ducks', 'ANA', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Calgary Flames', 'CGY', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Edmonton Oilers', 'EDM', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Los Angeles Kings', 'LAK', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('San Jose Sharks', 'SJS', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Seattle Kraken', 'SEA', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Vancouver Canucks', 'VAN', (SELECT division_id FROM divisions WHERE division_name = 'Pacific')),
('Vegas Golden Knights', 'VGK', (SELECT division_id FROM divisions WHERE division_name = 'Pacific'))
ON CONFLICT (abbreviation) DO NOTHING;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_nhl_teams_abbreviation ON nhl_teams(abbreviation);
CREATE INDEX IF NOT EXISTS idx_nhl_teams_division ON nhl_teams(division_id);

