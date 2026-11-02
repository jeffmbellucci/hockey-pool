// Read-only audit of existing contest data. Reports identifiers only, never changes picks.
const pool = require('../config/database');

async function checkReleaseData() {
  const { rows } = await pool.query(`
    SELECT 'survivor_missing_current_week' AS issue, c.contest_id, c.contest_id AS record_id
    FROM contests c WHERE c.contest_type = 'survivor' AND c.status IN ('waiting', 'in_progress')
      AND NOT EXISTS (SELECT 1 FROM survivor_weeks w WHERE w.contest_id = c.contest_id
        AND w.week_number = COALESCE(c.current_week, 1))
    UNION ALL
    SELECT 'invalid_two_team_capacity', contest_id, contest_id FROM contests
      WHERE contest_type = 'two_team' AND status IN ('waiting', 'drafting', 'in_progress')
        AND (max_participants IS NULL OR max_participants < 2 OR max_participants > 16)
    UNION ALL
    SELECT 'pick_contest_link', pp.contest_id, p.pick_id FROM two_team_picks p
      JOIN pool_participants pp USING (participant_id)
      LEFT JOIN contests c ON c.contest_id = pp.contest_id
      WHERE p.contest_id IS DISTINCT FROM pp.contest_id OR pp.contest_id IS NULL OR c.contest_type <> 'two_team'
    UNION ALL
    SELECT 'duplicate_team', pp.contest_id, team.team_id FROM two_team_picks p
      JOIN pool_participants pp USING (participant_id)
      CROSS JOIN LATERAL (VALUES (p.team1_id), (p.team2_id)) AS team(team_id)
      WHERE team.team_id IS NOT NULL
      GROUP BY pp.contest_id, team.team_id HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'invalid_week_dates', contest_id, id FROM survivor_weeks WHERE end_date < start_date
    UNION ALL
    SELECT 'overlapping_weeks', a.contest_id, a.id FROM survivor_weeks a
      WHERE EXISTS (SELECT 1 FROM survivor_weeks b WHERE b.contest_id = a.contest_id AND b.week_number > a.week_number
        AND b.start_date <= a.end_date AND a.start_date <= b.end_date)
    ORDER BY issue, contest_id, record_id
  `);
  return rows;
}

if (require.main === module) {
  checkReleaseData().then(issues => {
    if (issues.length) {
      console.table(issues);
      console.error('Release data needs review. No records were changed.');
      process.exitCode = 1;
    } else console.log('PASS: contest data checks');
  }).catch(error => {
    console.error('Release data check failed:', error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = checkReleaseData;
