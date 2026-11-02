-- Preserve the team ID used by existing picks, assignments, and game records.
UPDATE nhl_teams
SET team_name = 'Utah Mammoth'
WHERE abbreviation = 'UTA';

REFRESH MATERIALIZED VIEW team_standings;
