const assert = require('node:assert/strict');

module.exports = async (pool, app, token, users, teams) => {
  const request = require('supertest');
  const { generateAccessToken } = require('../services/tokenService');
  const { rows: [contest] } = await pool.query(`INSERT INTO contests
    (contest_name, contest_type, status, phase, current_week, season_year)
    VALUES ('Admin email picks', 'survivor', 'in_progress', 'regular_season', 2, '2026-27') RETURNING contest_id`);
  const id = contest.contest_id;
  const route = `/admin/survivor/contests/${id}/picks`;
  const add = body => request(app).post(route).set('Authorization', `Bearer ${token}`).send(body);
  const { rows: [times] } = await pool.query(`SELECT NOW() - INTERVAL '3 hours' AS early,
    NOW() - INTERVAL '1 hour' AS late, NOW() + INTERVAL '1 hour' AS future`);
  const body = { user_id: users[0].id, week_number: 2, team_id: teams[0].team_id, submitted_at: times.early.toISOString() };
  try {
    await pool.query(`INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, lock_time)
      VALUES ($1, 2, CURRENT_DATE - 1, CURRENT_DATE + 5, NOW() - INTERVAL '2 hours'),
        ($1, 3, CURRENT_DATE + 6, CURRENT_DATE + 12, NOW() + INTERVAL '6 days')`, [id]);
    for (const user of users.slice(0, 4)) await pool.query(`INSERT INTO survivor_participants (contest_id, user_id, participant_name)
      VALUES ($1, $2, $3)`, [id, user.id, `Email player ${user.id}`]);
    await pool.query(`INSERT INTO games (game_id, game_date, game_type, game_state, team_id, team_abbrev,
      opponent_id, opponent_abbrev, is_home, start_time_utc, result)
      SELECT 999009900 + n, CURRENT_DATE + n - 1, 2, 'FUT', $1, $2, $3, $4, TRUE,
        CASE WHEN n = 1 THEN NOW() - INTERVAL '2 hours' ELSE NOW() + n * INTERVAL '1 day' END, 'PENDING'
      FROM generate_series(1, 4) n`, [teams[0].team_id, teams[0].abbreviation, teams[1].team_id, teams[1].abbreviation]);
    assert.equal((await request(app).post(route).send(body)).status, 401);
    assert.equal((await request(app).post(route).set('Authorization', `Bearer ${generateAccessToken(users[1].id)}`).send(body)).status, 403);
    const added = await add({ ...body, result: 'survived', games_won: 99 });
    assert.equal(added.status, 201, added.body.message);
    assert.equal(added.body.pick.submitted_at, body.submitted_at);
    assert.equal(added.body.pick.result, 'pending');
    assert.equal(added.body.pick.result_override, null);
    assert.equal(added.body.is_late_pick, false);
    assert.equal(added.body.games_excluded, 0);
    assert.equal(added.body.games_needed, 2);
    assert.equal((await add(body)).status, 400);
    assert.equal((await add({ ...body, week_number: 3 })).status, 400);
    assert.equal((await add({ ...body, user_id: users[4].id })).status, 400);
    const late = await add({ ...body, user_id: users[1].id, submitted_at: times.late.toISOString() });
    assert.equal(late.status, 201, late.body.message);
    assert.equal(late.body.is_late_pick, true);
    assert.equal(late.body.games_excluded, 1);
    for (const invalid of [undefined, 'invalid', '2026-10-12T12:00:00', times.future.toISOString()]) {
      assert.equal((await add({ ...body, user_id: users[2].id, submitted_at: invalid })).status, 400);
    }
    await pool.query('UPDATE survivor_participants SET is_eliminated = TRUE WHERE contest_id = $1 AND user_id = $2', [id, users[2].id]);
    assert.equal((await add({ ...body, user_id: users[2].id })).status, 400);
    await pool.query('UPDATE survivor_participants SET is_eliminated = FALSE WHERE contest_id = $1', [id]);
    // Player endpoints ignore any claimed admin time and use the actual submission time.
    const player = await request(app).post(`/survivor/contests/${id}/picks`)
      .set('Authorization', `Bearer ${generateAccessToken(users[2].id)}`).send({ ...body, adminRecord: { submittedAt: body.submitted_at } });
    assert.equal(player.status, 201, player.body.message);
    const playerPick = (await pool.query('SELECT is_late_pick, games_excluded FROM survivor_picks WHERE contest_id = $1 AND user_id = $2', [id, users[2].id])).rows[0];
    assert.deepEqual(playerPick, { is_late_pick: true, games_excluded: 1 });
    const missing = { ...body, user_id: users[3].id };
    assert.equal((await add({ ...missing, team_id: teams[1].team_id })).status, 400, 'A team with no games is not eligible');
    await pool.query('UPDATE users SET active = FALSE WHERE id = $1', [users[3].id]);
    assert.equal((await add(missing)).status, 400);
    await pool.query('UPDATE users SET active = TRUE WHERE id = $1', [users[3].id]);
    for (const status of ['waiting', 'completed', 'cancelled']) {
      await pool.query('UPDATE contests SET status = $1 WHERE contest_id = $2', [status, id]);
      assert.equal((await add(missing)).status, 400);
    }
    await pool.query("UPDATE contests SET status = 'in_progress', phase = 'playoff_tiebreaker' WHERE contest_id = $1", [id]);
    assert.equal((await add(missing)).status, 400);
    await pool.query("UPDATE contests SET phase = 'regular_season', current_week = 3 WHERE contest_id = $1", [id]);
    assert.equal((await add(missing)).status, 400, 'Cannot add to a past contest week');
    await pool.query('UPDATE contests SET current_week = 2 WHERE contest_id = $1', [id]);
    await pool.query('UPDATE survivor_weeks SET end_date = CURRENT_DATE - 1 WHERE contest_id = $1 AND week_number = 2', [id]);
    assert.equal((await add(missing)).status, 400, 'Cannot add after the calendar week ends');
    await pool.query('UPDATE survivor_weeks SET end_date = CURRENT_DATE + 5 WHERE contest_id = $1 AND week_number = 2', [id]);
    const attempts = await Promise.all([add(missing), add(missing)]);
    assert.deepEqual(attempts.map(response => response.status).sort(), [201, 400]);
    const counts = (await pool.query(`SELECT (SELECT COUNT(*)::int FROM survivor_picks WHERE contest_id = $1) AS picks,
      (SELECT COUNT(*)::int FROM survivor_team_usage WHERE contest_id = $1) AS usage`, [id])).rows[0];
    assert.deepEqual(counts, { picks: 4, usage: 4 });
    const stored = (await pool.query('SELECT submitted_at, team_id FROM survivor_picks WHERE contest_id = $1 AND user_id = $2', [id, users[0].id])).rows[0];
    assert.equal(stored.submitted_at.toISOString(), body.submitted_at);
    assert.equal(stored.team_id, body.team_id);
    console.log('PASS: admin email picks preserve submission time, reject duplicates/reuse, enforce access, and retain player late-pick rules');
  } finally {
    await pool.query('DELETE FROM contests WHERE contest_id = $1', [id]);
    await pool.query('DELETE FROM games WHERE game_id BETWEEN 999009901 AND 999009904');
  }
};
