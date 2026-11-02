-- Older picks may predate contest_id on the pick table. The participant is authoritative
-- only when the pick has no contest; conflicting links require administrator review.
UPDATE two_team_picks p SET contest_id = pp.contest_id
FROM pool_participants pp JOIN contests c ON c.contest_id = pp.contest_id AND c.contest_type = 'two_team'
WHERE pp.participant_id = p.participant_id AND p.contest_id IS NULL;

-- Derive scores from each contest's season, not the all-time team standings view.
CREATE VIEW contest_team_wins AS
SELECT c.contest_id, g.team_id, g.game_type, COUNT(*)::integer AS wins
FROM contests c
JOIN games g ON EXTRACT(YEAR FROM g.game_date - INTERVAL '6 months')::text = split_part(c.season_year, '-', 1)
WHERE g.game_state IN ('OFF', 'FINAL') AND g.result = 'W' AND g.game_type IN (2, 3)
GROUP BY c.contest_id, g.team_id, g.game_type;

CREATE VIEW two_team_pick_scores AS
SELECT p.pick_id,
  COALESCE(t1.wins, 0) AS team1_wins, COALESCE(t2.wins, 0) AS team2_wins,
  COALESCE(t1.wins, 0) + COALESCE(t2.wins, 0) AS total_wins
FROM two_team_picks p
LEFT JOIN contest_team_wins t1 ON t1.contest_id = p.contest_id AND t1.team_id = p.team1_id AND t1.game_type = 2
LEFT JOIN contest_team_wins t2 ON t2.contest_id = p.contest_id AND t2.team_id = p.team2_id AND t2.game_type = 2;

CREATE VIEW playoff_pick_scores AS
SELECT p.playoff_pick_id, COALESCE(SUM(w.wins), 0)::integer AS total_playoff_wins
FROM playoff_picks p
LEFT JOIN contest_team_wins w ON w.contest_id = p.contest_id AND w.team_id = ANY(p.team_ids) AND w.game_type = 3
GROUP BY p.playoff_pick_id;

UPDATE two_team_picks p SET total_wins = s.total_wins FROM two_team_pick_scores s WHERE s.pick_id = p.pick_id;
UPDATE playoff_picks p SET total_playoff_wins = s.total_playoff_wins FROM playoff_pick_scores s WHERE s.playoff_pick_id = p.playoff_pick_id;

-- Persist the complete tiebreaker sequence, including the separate final three-player draw.
ALTER TABLE contests ADD COLUMN tiebreaker_pick_order JSONB;
