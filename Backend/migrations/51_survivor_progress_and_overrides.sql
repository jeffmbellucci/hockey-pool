ALTER TABLE survivor_picks ADD COLUMN result_override varchar(50)
  CHECK (result_override IN ('survived', 'eliminated'));
ALTER TABLE survivor_picks ADD COLUMN games_won_override integer CHECK (games_won_override >= 0);
ALTER TABLE survivor_picks ADD COLUMN games_needed_override integer CHECK (games_needed_override IN (1, 2));
ALTER TABLE survivor_playoff_tiebreaker_picks ADD COLUMN is_correct_override boolean;

-- Progress is read from current game data; reading it never eliminates a player.
CREATE VIEW survivor_pick_progress AS
SELECT p.id,
  COUNT(g.game_id)::integer AS games_played,
  COALESCE(p.games_won_override, COUNT(g.game_id) FILTER (
    WHERE g.game_state IN ('OFF', 'FINAL') AND g.result = 'W'
      AND (NOT p.is_late_pick OR g.start_time_utc > p.submitted_at)))::integer AS games_won,
  COALESCE(p.games_needed_override, CASE WHEN COUNT(g.game_id) >= 4 THEN 2 ELSE 1 END) AS games_needed,
  COUNT(g.game_id) FILTER (WHERE g.game_state IN ('OFF', 'FINAL') AND g.result IN ('L', 'OTL', 'SOL')
    AND (NOT p.is_late_pick OR g.start_time_utc > p.submitted_at))::integer AS losses,
  COUNT(g.game_id) FILTER (WHERE p.is_late_pick AND (g.start_time_utc IS NULL OR g.start_time_utc <= p.submitted_at))::integer AS games_excluded
FROM survivor_picks p JOIN survivor_weeks w ON w.contest_id = p.contest_id AND w.week_number = p.week_number
LEFT JOIN games g ON g.team_id = p.team_id AND g.game_type = 2 AND g.game_date BETWEEN w.start_date AND w.end_date
GROUP BY p.id;
