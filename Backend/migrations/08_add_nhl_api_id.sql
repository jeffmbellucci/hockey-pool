-- Add NHL API ID column to existing nhl_teams table
ALTER TABLE nhl_teams ADD COLUMN IF NOT EXISTS nhl_api_id INTEGER UNIQUE;

-- Update with correct NHL API IDs based on abbreviation matching
UPDATE nhl_teams SET nhl_api_id = 12 WHERE abbreviation = 'CAR'; -- Carolina Hurricanes
UPDATE nhl_teams SET nhl_api_id = 29 WHERE abbreviation = 'CBJ'; -- Columbus Blue Jackets
UPDATE nhl_teams SET nhl_api_id = 1 WHERE abbreviation = 'NJD'; -- New Jersey Devils
UPDATE nhl_teams SET nhl_api_id = 2 WHERE abbreviation = 'NYI'; -- New York Islanders
UPDATE nhl_teams SET nhl_api_id = 3 WHERE abbreviation = 'NYR'; -- New York Rangers
UPDATE nhl_teams SET nhl_api_id = 4 WHERE abbreviation = 'PHI'; -- Philadelphia Flyers
UPDATE nhl_teams SET nhl_api_id = 5 WHERE abbreviation = 'PIT'; -- Pittsburgh Penguins
UPDATE nhl_teams SET nhl_api_id = 15 WHERE abbreviation = 'WSH'; -- Washington Capitals

-- Atlantic Division
UPDATE nhl_teams SET nhl_api_id = 6 WHERE abbreviation = 'BOS'; -- Boston Bruins
UPDATE nhl_teams SET nhl_api_id = 7 WHERE abbreviation = 'BUF'; -- Buffalo Sabres
UPDATE nhl_teams SET nhl_api_id = 17 WHERE abbreviation = 'DET'; -- Detroit Red Wings
UPDATE nhl_teams SET nhl_api_id = 13 WHERE abbreviation = 'FLA'; -- Florida Panthers
UPDATE nhl_teams SET nhl_api_id = 8 WHERE abbreviation = 'MTL'; -- Montréal Canadiens
UPDATE nhl_teams SET nhl_api_id = 9 WHERE abbreviation = 'OTT'; -- Ottawa Senators
UPDATE nhl_teams SET nhl_api_id = 14 WHERE abbreviation = 'TBL'; -- Tampa Bay Lightning
UPDATE nhl_teams SET nhl_api_id = 10 WHERE abbreviation = 'TOR'; -- Toronto Maple Leafs

-- Central Division
UPDATE nhl_teams SET nhl_api_id = 16 WHERE abbreviation = 'CHI'; -- Chicago Blackhawks
UPDATE nhl_teams SET nhl_api_id = 21 WHERE abbreviation = 'COL'; -- Colorado Avalanche
UPDATE nhl_teams SET nhl_api_id = 25 WHERE abbreviation = 'DAL'; -- Dallas Stars
UPDATE nhl_teams SET nhl_api_id = 30 WHERE abbreviation = 'MIN'; -- Minnesota Wild
UPDATE nhl_teams SET nhl_api_id = 18 WHERE abbreviation = 'NSH'; -- Nashville Predators
UPDATE nhl_teams SET nhl_api_id = 19 WHERE abbreviation = 'STL'; -- St. Louis Blues
UPDATE nhl_teams SET nhl_api_id = 59 WHERE abbreviation = 'UTA'; -- Utah Hockey Club
UPDATE nhl_teams SET nhl_api_id = 52 WHERE abbreviation = 'WPG'; -- Winnipeg Jets

-- Pacific Division
UPDATE nhl_teams SET nhl_api_id = 24 WHERE abbreviation = 'ANA'; -- Anaheim Ducks
UPDATE nhl_teams SET nhl_api_id = 20 WHERE abbreviation = 'CGY'; -- Calgary Flames
UPDATE nhl_teams SET nhl_api_id = 22 WHERE abbreviation = 'EDM'; -- Edmonton Oilers
UPDATE nhl_teams SET nhl_api_id = 26 WHERE abbreviation = 'LAK'; -- Los Angeles Kings
UPDATE nhl_teams SET nhl_api_id = 28 WHERE abbreviation = 'SJS'; -- San Jose Sharks
UPDATE nhl_teams SET nhl_api_id = 55 WHERE abbreviation = 'SEA'; -- Seattle Kraken
UPDATE nhl_teams SET nhl_api_id = 23 WHERE abbreviation = 'VAN'; -- Vancouver Canucks
UPDATE nhl_teams SET nhl_api_id = 54 WHERE abbreviation = 'VGK'; -- Vegas Golden Knights

-- Create index for faster lookups by NHL API ID
CREATE INDEX IF NOT EXISTS idx_nhl_teams_api_id ON nhl_teams(nhl_api_id);

-- Add comment explaining the column
COMMENT ON COLUMN nhl_teams.nhl_api_id IS 'NHL API team ID used by the official NHL API endpoints';

