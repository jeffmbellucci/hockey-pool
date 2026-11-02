-- Migration 44: Remove redundant indexes
-- idx_games_team(team_id) is redundant because idx_games_team_date(team_id, game_date)
-- covers all team_id lookups. Same for opponent index.

DROP INDEX IF EXISTS idx_games_team;
DROP INDEX IF EXISTS idx_games_opponent;
