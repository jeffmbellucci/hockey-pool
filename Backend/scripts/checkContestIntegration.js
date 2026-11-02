// Runs real migrations and contest flows in an isolated schema on a local TEST database.
// Usage: CONTEST_TEST_DATABASE_URL=postgres://.../contest_integration_test node scripts/checkContestIntegration.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const url = new URL(process.env.CONTEST_TEST_DATABASE_URL || 'http://missing');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/contest_integration_test',
  'Set CONTEST_TEST_DATABASE_URL to a local database named contest_integration_test');
const schema = `contest_check_${Date.now()}`;
const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema} -c timezone=UTC -c statement_timeout=5000 -c lock_timeout=2000` });
process.env.JWT_SECRET = 'local-contest-integration-only';
process.env.JWT_REFRESH_SECRET = 'local-contest-refresh-only';
process.env.COOKIE_SECURE = 'false';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.SCHEDULER_ENABLED = 'false';
require.cache[require.resolve('../config/database')] = { exports: pool };
const SurvivorService = require('../services/survivorService');
const nhlService = require('../services/NhlService');
// Integration scenarios supply their own NHL fixtures, including schedule reads.
nhlService.fetchGamesForDate = async () => [];
const Contest = require('../models/Contest');
const TwoTeamPick = require('../models/TwoTeamPick');
const PlayoffPick = require('../models/PlayoffPick');

async function main() {
  await pool.query(`CREATE SCHEMA ${schema}`);
  try {
    const migrationFiles = fs.readdirSync(path.join(__dirname, '../migrations')).filter(file => file.endsWith('.sql'));
    // Rehearse an upgrade from the last released schema with real pre-existing picks.
    await pool.query('CREATE TABLE migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    for (const file of migrationFiles.filter(file => parseInt(file, 10) <= 46).sort()) {
      await pool.query(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
      await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
    }
    const { rows: legacyTeams } = await pool.query('SELECT team_id, abbreviation FROM nhl_teams ORDER BY team_id LIMIT 2');
    await pool.query(`
      INSERT INTO users (id, name, last_name, email, password) VALUES (-9001, 'Legacy', 'Player', 'legacy@example.test', 'unused');
      INSERT INTO contests (contest_id, contest_name, season_year, contest_type, status, current_week, max_participants) VALUES
        (-9001, 'Legacy draft', '2025-26', 'two_team', 'in_progress', 1, 16),
        (-9002, 'Legacy Survivor', '2025-26', 'survivor', 'in_progress', 1, 16),
        (-9003, 'Bad capacity', '2025-26', 'two_team', 'waiting', 1, 32),
        (-9004, 'Missing weeks', '2025-26', 'survivor', 'waiting', 1, 16);
      INSERT INTO pool_participants (participant_id, contest_id, participant_name, draft_order, user_id) VALUES
        (-9001, -9001, 'Legacy player', 1, -9001), (-9002, -9001, 'Duplicate fixture', 2, NULL);
      INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, lock_time)
        VALUES (-9002, 1, '2025-10-06', '2025-10-12', '2025-10-07 23:00:00');
      INSERT INTO survivor_participants (id, contest_id, user_id, participant_name)
        VALUES (-9001, -9002, -9001, 'Legacy player');
    `);
    await pool.query(`INSERT INTO two_team_picks (pick_id, participant_id, team1_id, team2_id, total_wins) VALUES
      (-9001, -9001, $1, $2, 999), (-9002, -9002, $1, NULL, 0)`, [legacyTeams[0].team_id, legacyTeams[1].team_id]);
    await pool.query(`INSERT INTO games (game_id, game_date, game_type, game_state, team_id, team_abbrev,
      opponent_id, opponent_abbrev, is_home, start_time_utc, result)
      VALUES (900000001, '2025-10-07', 2, 'OFF', $1, $2, $3, $4, TRUE, '2025-10-07 23:00:00', 'W')`,
      [legacyTeams[0].team_id, legacyTeams[0].abbreviation, legacyTeams[1].team_id, legacyTeams[1].abbreviation]);
    await pool.query(`INSERT INTO survivor_picks (id, contest_id, participant_id, user_id, week_number, team_id, result, submitted_at)
      VALUES (-9001, -9002, -9001, -9001, 1, $1, 'survived', '2025-10-07 18:00:00')`, [legacyTeams[0].team_id]);
    const checkReleaseData = require('./checkReleaseData');
    const problems = await checkReleaseData();
    for (const issue of ['pick_contest_link', 'duplicate_team', 'survivor_missing_current_week', 'invalid_two_team_capacity']) {
      assert(problems.some(problem => problem.issue === issue), `Expected release check to identify ${issue}`);
    }
    // Remove deliberately invalid fixtures; retain the legacy NULL link for the upgrade to repair.
    await pool.query('DELETE FROM pool_participants WHERE participant_id = -9002');
    await pool.query('DELETE FROM contests WHERE contest_id IN (-9003, -9004)');
    const runMigrations = require('../config/runMigrations');
    await Promise.all([runMigrations(), runMigrations()]);
    assert.deepEqual(await checkReleaseData(), []);
    const upgradedPick = (await pool.query('SELECT contest_id, total_wins FROM two_team_picks WHERE pick_id = -9001')).rows[0];
    assert.deepEqual(upgradedPick, { contest_id: -9001, total_wins: 1 });
    const legacyGame = (await pool.query('SELECT start_time_utc FROM games WHERE game_id = 900000001')).rows[0];
    assert.equal(legacyGame.start_time_utc.toISOString(), '2025-10-07T23:00:00.000Z');
    const legacyWeek = (await pool.query('SELECT lock_time FROM survivor_weeks WHERE contest_id = -9002')).rows[0];
    assert.equal(legacyWeek.lock_time.toISOString(), '2025-10-07T23:00:00.000Z');
    const legacyPick = (await pool.query('SELECT submitted_at, result FROM survivor_picks WHERE id = -9001')).rows[0];
    assert.equal(legacyPick.submitted_at.toISOString(), '2025-10-07T18:00:00.000Z');
    assert.equal(legacyPick.result, 'survived');
    await pool.query('DELETE FROM contests WHERE contest_id IN (-9001, -9002)');
    await pool.query('DELETE FROM users WHERE id = -9001');
    await pool.query('DELETE FROM games WHERE game_id = 900000001');
    console.log('PASS: release audit detects legacy faults; concurrent upgrade preserves picks/timestamps and restores season scores');
    const ledger = (await pool.query('SELECT name, executed_at FROM migrations ORDER BY name')).rows;
    assert.equal(ledger.length, migrationFiles.length);
    await runMigrations();
    assert.deepEqual((await pool.query('SELECT name, executed_at FROM migrations ORDER BY name')).rows, ledger);
    console.log('PASS: production migration runner applies pending migrations once and restart preserves its ledger');

    const timezoneClient = await pool.connect();
    try {
      await timezoneClient.query("SET TIME ZONE 'America/Caracas'");
      const { rows } = await timezoneClient.query('SELECT $1::timestamptz AS start', [nhlService.parseStartTime('2030-10-07T23:00:00Z')]);
      assert.equal(rows[0].start.toISOString(), '2030-10-07T23:00:00.000Z');
    } finally {
      await timezoneClient.query("SET TIME ZONE 'UTC'");
      timezoneClient.release();
    }
    console.log('PASS: NHL start timestamps survive a non-UTC database session');

    const contest = await SurvivorService.createContest({
      contest_name: 'Integration survivor', season_year: '2030-31', season_start_date: '2030-10-07', season_end_date: '2031-04-17',
    });
    const weeks = await SurvivorService.getWeeks(contest.contest_id);
    assert.equal(weeks.length, 28);
    assert.equal(weeks[0].week_number, 1);
    assert.equal(weeks[27].week_number, 28);
    console.log('PASS: new season contest persists all generated weeks');

    const { rows: users } = await pool.query(`
      INSERT INTO users (name, last_name, email, password)
      SELECT 'Player', n::text, 'player' || n || '@example.test', 'unused'
      FROM generate_series(1, 3) n RETURNING id
    `);
    for (const user of users) await SurvivorService.joinContest(contest.contest_id, user.id, `Player ${user.id}`);
    const { rows: teams } = await pool.query('SELECT team_id, abbreviation FROM nhl_teams ORDER BY team_id LIMIT 2');

    const futureContest = await SurvivorService.createContest({ contest_name: 'Future schedule counts', season_year: '2036-37',
      season_start_date: '2036-09-29', season_end_date: '2036-10-12', max_participants: 2 });
    await SurvivorService.joinContest(futureContest.contest_id, users[0].id, 'Future picker');
    const { rows: feedTeams } = await pool.query('SELECT team_id, nhl_api_id, abbreviation FROM nhl_teams ORDER BY team_id LIMIT 2');
    const feedDates = ['2036-10-06', '2036-10-08', '2036-10-10', '2036-10-12'];
    const emptyFeed = nhlService.fetchGamesForDate;
    const fetchedDates = [];
    nhlService.fetchGamesForDate = async date => {
      fetchedDates.push(date);
      return feedDates.includes(date) ? [{ id: 2036020001 + feedDates.indexOf(date), gameDate: date,
        gameType: 2, gameState: 'FUT', startTimeUTC: `${date}T23:00:00Z`,
        awayTeam: { id: feedTeams[0].nhl_api_id, abbrev: feedTeams[0].abbreviation },
        homeTeam: { id: feedTeams[1].nhl_api_id, abbrev: feedTeams[1].abbreviation } }] : [];
    };
    try {
      await nhlService.fetchAndStoreScheduledGames(feedDates[0], feedDates[0]);
      fetchedDates.length = 0;
      const [options, schedule] = await Promise.all([
        SurvivorService.getAvailableTeams(futureContest.contest_id, users[0].id, 2),
        SurvivorService.getWeeklySchedule(futureContest.contest_id, 2),
      ]);
      assert.equal(options.all_teams.find(t => t.team_id === feedTeams[0].team_id).games_this_week, 4);
      assert.equal(schedule.teams.find(t => t.team_id === feedTeams[0].team_id).games.length, 4);
      assert.equal(fetchedDates.length, 7);
      assert.equal(new Set(fetchedDates).size, 7);
      assert.equal(fetchedDates[6], '2036-10-12');
      const earlyPick = await SurvivorService.submitPick(futureContest.contest_id, users[0].id, 2, feedTeams[0].team_id);
      assert.equal(earlyPick.games_needed, 2);
      assert.equal(fetchedDates.length, 7);
      assert.equal(new Date((await SurvivorService.getWeekStatus(futureContest.contest_id, 2)).lock_time).toISOString(), '2036-10-06T23:00:00.000Z');
    } finally {
      nhlService.fetchGamesForDate = emptyFeed;
      await pool.query('DELETE FROM contests WHERE contest_id = $1', [futureContest.contest_id]);
      await pool.query('DELETE FROM games WHERE game_id BETWEEN 2036020001 AND 2036020004');
      nhlService._scheduleLoads.clear();
    }
    console.log('PASS: partially loaded future weeks fetch all seven days once; dropdown, schedule, deadline and two-win requirement agree');

    const importedContest = await SurvivorService.createContest({ contest_name: 'Imported Survivor', season_year: '2025-26',
      season_start_date: '2025-10-06', season_end_date: '2026-04-17', max_participants: 3 });
    const importedId = importedContest.contest_id;
    const historical = { user_id: users[0].id, week_number: 1, team_id: teams[0].team_id,
      submitted_at: '2025-10-06T18:00:00-04:00', result: 'survived' };
    const imported = await SurvivorService.importHistoricalPick(importedId, historical);
    assert.equal(imported.pick.submitted_at.toISOString(), '2025-10-06T22:00:00.000Z');
    assert.equal(imported.pick.result_override, 'survived');
    await assert.rejects(SurvivorService.importHistoricalPick(importedId, historical), /already exists/);
    await assert.rejects(SurvivorService.importHistoricalPick(importedId, { ...historical, week_number: 2 }), /already used/);
    await assert.rejects(SurvivorService.importHistoricalPick(importedId, { ...historical, user_id: users[1].id, submitted_at: '2025-10-14T18:00:00Z' }), /before that week ended/);
    await SurvivorService.importHistoricalPick(importedId, { ...historical, week_number: 2, team_id: teams[1].team_id,
      submitted_at: '2025-10-13T20:00:00Z', result: 'pending' });
    await SurvivorService.importHistoricalPick(importedId, { ...historical, user_id: users[1].id, result: 'pending' });
    await assert.rejects(SurvivorService.startContest(importedId, 2), /earlier-week results/);
    assert.equal((await Contest.findById(importedId)).status, 'waiting');
    await pool.query("UPDATE survivor_picks SET result = 'survived', result_override = 'survived' WHERE contest_id = $1 AND user_id = $2", [importedId, users[1].id]);
    await SurvivorService.importHistoricalPick(importedId, { user_id: users[2].id, week_number: 1, result: 'no_pick' });
    await assert.rejects(SurvivorService.importHistoricalPick(importedId, { ...historical, user_id: users[2].id, week_number: 2 }), /after this participant was eliminated/);
    const usage = await pool.query('SELECT COUNT(*)::int AS count FROM survivor_team_usage WHERE contest_id = $1 AND user_id = $2', [importedId, users[0].id]);
    assert.equal(usage.rows[0].count, 2);
    const originalSetup = SurvivorService.setupWeekSchedule;
    let setupWeek;
    SurvivorService.setupWeekSchedule = async (id, week) => { setupWeek = week; return { success: true }; };
    try {
      const resumed = await SurvivorService.startContest(importedId, 2);
      assert.equal(resumed.current_week, 2);
      assert.equal(resumed.status, 'in_progress');
      assert.equal(setupWeek, 2);
    } finally { SurvivorService.setupWeekSchedule = originalSetup; }
    await assert.rejects(SurvivorService.importHistoricalPick(importedId, { ...historical, week_number: 3 }), /waiting/);
    const importStatus = await pool.query('SELECT is_eliminated, elimination_week FROM survivor_participants WHERE contest_id = $1 AND user_id = $2', [importedId, users[2].id]);
    assert.deepEqual(importStatus.rows[0], { is_eliminated: true, elimination_week: 1 });
    await pool.query('DELETE FROM contests WHERE contest_id = $1', [importedId]);
    console.log('PASS: Survivor historical imports preserve times/results/used teams, reject duplicates and incomplete history, retain no-pick eliminations, and start safely at Week 2');

    await pool.query(`INSERT INTO games (game_id, game_date, game_type, game_state, team_id, team_abbrev,
      opponent_id, opponent_abbrev, is_home, start_time_utc)
      VALUES (2030020001, '2030-10-07', 2, 'FUT', $1, $2, $3, $4, TRUE, '2030-10-07 23:00:00'),
             (2030020001, '2030-10-07', 2, 'FUT', $3, $4, $1, $2, FALSE, '2030-10-07 23:00:00')`,
    [teams[0].team_id, teams[0].abbreviation, teams[1].team_id, teams[1].abbreviation]);
    const lock = await SurvivorService.getLockStatus(contest.contest_id, 1);
    assert.equal(lock.lock_time.toISOString(), '2030-10-07T23:00:00.000Z');
    assert.equal(lock.is_locked, false);
    await SurvivorService.submitPick(contest.contest_id, users[0].id, 1, teams[0].team_id);
    await SurvivorService.submitPick(contest.contest_id, users[0].id, 1, teams[0].team_id);
    await SurvivorService.submitPick(contest.contest_id, users[1].id, 1, teams[0].team_id);
    assert.equal((await SurvivorService.getWeekPicks(contest.contest_id, 1, users[0].id)).can_see_picks, false);
    console.log('PASS: picks can be edited before lock; different players can choose the same team; picks stay private');

    await pool.query("UPDATE contests SET status = 'in_progress' WHERE contest_id = $1", [contest.contest_id]);
    await assert.rejects(SurvivorService.advanceWeek(contest.contest_id), /before the week ends/);
    await pool.query(`UPDATE survivor_weeks SET start_date = CURRENT_DATE - 8, end_date = CURRENT_DATE - 2,
      lock_time = CURRENT_TIMESTAMP - INTERVAL '8 days' WHERE contest_id = $1 AND week_number = 1`, [contest.contest_id]);
    await pool.query("UPDATE games SET game_date = CURRENT_DATE - 8, game_state = 'OFF', result = 'L'");
    const final = await SurvivorService.processWeekResults(contest.contest_id, 1);
    assert.equal(final.survived, 2);
    assert.equal(final.eliminated, 1);
    assert.equal(final.mass_elimination_prevented, true);
    const { rows: participants } = await pool.query('SELECT user_id, is_eliminated FROM survivor_participants WHERE contest_id = $1 ORDER BY user_id', [contest.contest_id]);
    assert.deepEqual(participants.map(p => p.is_eliminated), [false, false, true]);
    console.log('PASS: mass-failure protection excludes no-pick players and persists correct eliminations');

    const draft = await Contest.create('Integration snake draft', '2030-31');
    const { rows: draftUsers } = await pool.query(`INSERT INTO users (name, last_name, email, password)
      SELECT 'Draft', n::text, 'draft' || n || '@example.test', 'unused' FROM generate_series(1, 16) n RETURNING id`);
    for (let i = 0; i < draftUsers.length; i++) {
      await pool.query('INSERT INTO pool_participants (contest_id, participant_name, draft_order, user_id) VALUES ($1, $2, $3, $4)',
        [draft.contest_id, `Drafter ${i + 1}`, i + 1, draftUsers[i].id]);
    }
    const started = await Contest.startDrafting(draft.contest_id);
    const sequence = [...started.draft_order, ...started.draft_order.slice().reverse()];
    const first = await Contest.getCurrentDraftPick(draft.contest_id);
    const choices = await TwoTeamPick.getAvailableTeams(draft.contest_id);
    const concurrent = await Promise.allSettled([
      Contest.makeDraftPick(draft.contest_id, first.participant.user_id, choices[0].team_id),
      Contest.makeDraftPick(draft.contest_id, first.participant.user_id, choices[1].team_id),
    ]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1,
      concurrent.filter(r => r.status === 'rejected').map(r => r.reason.stack).join('\n'));
    assert.equal(concurrent.filter(r => r.status === 'rejected').length, 1);
    const firstTeam = concurrent.find(r => r.status === 'fulfilled').value.pick.team1_id;
    const second = await Contest.getCurrentDraftPick(draft.contest_id);
    await assert.rejects(Contest.makeDraftPick(draft.contest_id, second.participant.user_id, firstTeam), /already picked/);
    for (let n = 2; n <= 32; n++) {
      const current = await Contest.getCurrentDraftPick(draft.contest_id);
      assert.equal(current.participant.participant_id, sequence[n - 1]);
      const available = await TwoTeamPick.getAvailableTeams(draft.contest_id);
      await Contest.makeDraftPick(draft.contest_id, current.participant.user_id, available[0].team_id);
    }
    assert.equal((await Contest.findById(draft.contest_id)).status, 'in_progress');
    assert.equal(await Contest.getCurrentDraftPick(draft.contest_id), null);
    const drafted = await TwoTeamPick.findAll(draft.contest_id);
    assert.equal(drafted.length, 16);
    assert.equal(new Set(drafted.flatMap(p => [p.team1_id, p.team2_id])).size, 32);
    console.log('PASS: all 32 snake-draft turns, duplicate-team rejection, concurrent requests, and automatic start');

    const chosen = drafted[0];
    const { rows: chosenTeams } = await pool.query('SELECT team_id, abbreviation FROM nhl_teams WHERE team_id = ANY($1)', [[chosen.team1_id, chosen.team2_id]]);
    const team = chosenTeams[0];
    const opponent = chosenTeams[1];
    for (const [id, date, type, state] of [
      [2030020091, '2030-10-09', 2, 'FINAL'],
      [2029020091, '2029-10-09', 2, 'OFF'],
      [2030010091, '2030-09-09', 1, 'OFF'],
      [2030030091, '2031-04-19', 3, 'OFF'],
      [2030020092, '2030-10-10', 2, 'LIVE'],
    ]) {
      await nhlService.upsertGameRow('games', {
        gameId: id, gameDate: date, gameType: type, gameState: state, teamId: team.team_id,
        teamAbbrev: team.abbreviation, opponentId: opponent.team_id, opponentAbbrev: opponent.abbreviation,
        teamScore: 2, opponentScore: 1, isHome: true, result: 'W', startTimeUtc: `${date}T23:00:00Z`,
      });
    }
    assert.equal((await TwoTeamPick.calculateAndUpdateWins(chosen.participant_id)).total_wins, 1);
    await TwoTeamPick.calculateAndUpdateAllWins();
    const board = await TwoTeamPick.getLeaderboard(draft.contest_id);
    assert.equal(board.find(p => p.participant_id === chosen.participant_id).total_wins, 1);
    const playoff = await Contest.create('Playoff scoring', '2030-31', 'playoff_tiebreaker', 2);
    const { rows: playoffPlayers } = await pool.query('INSERT INTO pool_participants (contest_id, participant_name, draft_order, user_id) VALUES ($1, $2, 1, $3) RETURNING participant_id', [playoff.contest_id, 'Playoff player', draftUsers[0].id]);
    const playoffParticipant = playoffPlayers[0].participant_id;
    await PlayoffPick.create(playoffParticipant, playoff.contest_id, [team.team_id]);
    await pool.query("UPDATE games SET game_type = 3 WHERE game_id = 2029020091");
    assert.equal((await PlayoffPick.calculateAndUpdateWins(playoffParticipant)).total_playoff_wins, 1);
    await PlayoffPick.calculateAndUpdateAllWins();
    assert.equal((await PlayoffPick.getLeaderboard(playoff.contest_id))[0].total_playoff_wins, 1);
    console.log('PASS: regular and playoff totals exclude other seasons, preseason, live games, and the wrong game type');

    // Historical snapshots must not make extra teams eligible for this season's draft.
    await pool.query(`INSERT INTO playoff_standings (standings_date, team_abbrev, team_name, nhl_api_id,
      conference_name, conference_abbrev, conference_sequence, division_name, division_abbrev, division_sequence, is_playoff_team)
      SELECT dates.day, t.abbreviation, t.team_name, t.nhl_api_id, d.conference_name, 'C', 1, d.division_name, 'D', 1,
        CASE WHEN dates.day = DATE '2031-04-18' THEN t.team_id IN (SELECT team_id FROM nhl_teams ORDER BY team_id LIMIT 16) ELSE TRUE END
      FROM nhl_teams t JOIN divisions d USING (division_id)
      CROSS JOIN (VALUES (DATE '2030-04-18'), (DATE '2031-04-17'), (DATE '2031-04-18')) dates(day)`);
    const patterns = {
      2: [1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1],
      3: [1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1],
      4: [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1],
    };
    for (const count of [2, 3, 4]) {
      const parent = await Contest.create(`${count}-way tie`, '2030-31');
      const tied = draftUsers.slice(0, count).map((user, i) => ({ user_id: user.id, participant_name: `Tied ${i}` }));
      const tiebreaker = await Contest.createTiebreakerContest(parent.contest_id, tied);
      assert.equal((await Contest.createTiebreakerContest(parent.contest_id, tied)).contest_id, tiebreaker.contest_id);
      const order = Contest.getDraftSequence(tiebreaker);
      const positions = order.map(id => tiebreaker.draft_order.indexOf(id) + 1);
      assert.deepEqual(positions.slice(0, patterns[count].length), patterns[count]);
      if (count === 3) assert.deepEqual(positions.slice(12).sort(), [1, 2, 3]);
      assert.equal((await PlayoffPick.getAvailableTeams(tiebreaker.contest_id)).length, 16);
      for (const participantId of order) {
        const current = await Contest.getCurrentDraftPick(tiebreaker.contest_id);
        assert.equal(current.participant.participant_id, participantId);
        const available = await PlayoffPick.getAvailableTeams(tiebreaker.contest_id);
        await Contest.makeDraftPick(tiebreaker.contest_id, current.participant.user_id, available[0].team_id);
      }
      const picks = await PlayoffPick.findByContestId(tiebreaker.contest_id);
      assert(picks.every(p => p.team_ids.length === Math.floor(16 / count)));
      assert.equal(new Set(picks.flatMap(p => p.team_ids)).size, count === 3 ? 15 : 16);
      assert.equal((await Contest.findById(tiebreaker.contest_id)).status, 'in_progress');
    }
    console.log('PASS: complete 2-, 3-, and 4-way playoff drafts, saved random final turns, eligible teams, and duplicate-completion protection');

    const survivorPlayoff = await SurvivorService.createContest({ contest_name: 'Survivor playoffs', season_year: '2030-31', season_start_date: '2030-10-07', season_end_date: '2031-04-17' });
    const spId = survivorPlayoff.contest_id;
    for (const user of draftUsers.slice(0, 3)) await SurvivorService.joinContest(spId, user.id, `Survivor ${user.id}`);
    await pool.query("UPDATE contests SET status = 'in_progress', phase = 'playoff_tiebreaker' WHERE contest_id = $1", [spId]);
    await SurvivorService.initializeTiebreaker(spId);
    const { rows: allTeams } = await pool.query('SELECT * FROM nhl_teams ORDER BY team_id');
    for (let round = 1; round <= 4; round++) {
      for (let i = 0; i < 2 ** (4 - round); i++) {
        const a = allTeams[i * 2], b = allTeams[i * 2 + 1];
        const seriesId = `2030-R${round}-${i}`;
        await pool.query(`INSERT INTO playoff_series (series_id, season, round, series_abbrev, series_title, series_letter,
          top_seed_team_id, top_seed_team_abbrev, bottom_seed_team_id, bottom_seed_team_abbrev)
          VALUES ($1, 20302031, $2, $3, $3, $4, $5, $6, $7, $8)`,
        [seriesId, round, `R${round}`, String(i), a.team_id, a.abbreviation, b.team_id, b.abbreviation]);
        for (let game = 1; game <= (round === 4 ? 7 : 4); game++) {
          for (const [home, away] of [[a, b], [b, a]]) {
            await nhlService.upsertGameRow('games', { gameId: 2030031000 + round * 100 + i * 10 + game,
              gameDate: '2031-04-20', gameType: 3, gameState: 'FUT', teamId: home.team_id, teamAbbrev: home.abbreviation,
              opponentId: away.team_id, opponentAbbrev: away.abbreviation, teamScore: 0, opponentScore: 0,
              isHome: home === a, result: null, startTimeUtc: '2031-04-20T23:00:00Z', seriesId, round, gameNumberInSeries: game });
          }
        }
      }
    }
    const [p1, p2, p3] = draftUsers.slice(0, 3).map(u => u.id);
    assert.equal((await SurvivorService.processTiebreakerGameResults(spId)).status, 'pending');
    await assert.rejects(SurvivorService.advanceTiebreakerGame(spId), /must finish/);
    await assert.rejects(SurvivorService.submitTiebreakerPick(spId, p1, '2030-R2-0', allTeams[0].team_id), /current playoff round/);
    for (const user of [p1, p2]) await SurvivorService.submitTiebreakerPick(spId, user, '2030-R1-0', allTeams[0].team_id);
    await SurvivorService.submitTiebreakerPick(spId, p1, '2030-R1-0', allTeams[0].team_id); // idempotent pre-lock edit
    assert.equal((await SurvivorService.getTiebreakerPicks(spId, 1, 1, p1)).can_see_picks, false);
    await pool.query("UPDATE games SET start_time_utc = NOW() - INTERVAL '1 day', game_state = 'FINAL', result = 'L' WHERE series_id LIKE '2030-R1-%' AND game_number_in_series = 1");
    await assert.rejects(SurvivorService.submitTiebreakerPick(spId, p3, '2030-R1-0', allTeams[0].team_id), /already started/);
    assert.equal((await SurvivorService.getTiebreakerPicks(spId, 1, 1, p3)).can_see_picks, false);
    assert.equal((await SurvivorService.getTiebreakerPicks(spId, 1, 1, p1)).can_see_picks, true);
    const result = await SurvivorService.processTiebreakerGameResults(spId);
    assert.equal(result.mass_protection, true);
    assert.equal(result.eliminated, 1);
    assert.equal(result.remaining, 2);
    assert.equal((await SurvivorService.getUserStatus(spId, p3)).is_eliminated, true);
    await SurvivorService.advanceTiebreakerGame(spId);
    await assert.rejects(SurvivorService.submitTiebreakerPick(spId, p1, '2030-R1-0', allTeams[0].team_id), /already used/);

    for (let round = 1; round <= 3; round++) {
      for (let game = round === 1 ? 2 : 1; game <= 4; game++) {
        const teams = (await SurvivorService.getAvailableTeamsForTiebreaker(spId, p1)).teams;
        assert.equal(new Set(teams.map(t => t.team_id)).size, teams.length);
        if (round === 3 && game === 1) assert(teams.every(t => t.is_available));
        const pick = teams.find(t => t.is_available);
        assert(pick, `Round ${round}, game ${game} has an available team`);
        for (const user of [p1, p2]) await SurvivorService.submitTiebreakerPick(spId, user, pick.series_id, pick.team_id);
        await pool.query("UPDATE games SET start_time_utc = NOW() - INTERVAL '1 day', game_state = 'FINAL', result = 'W' WHERE round = $1 AND game_number_in_series = $2", [round, game]);
        await SurvivorService.advanceTiebreakerGame(spId);
      }
    }
    for (let game = 1; game <= 4; game++) {
      const teams = (await SurvivorService.getAvailableTeamsForTiebreaker(spId, p1)).teams;
      assert.equal(teams.length, 2);
      assert(teams.every(t => t.is_available));
      for (const user of [p1, p2]) await SurvivorService.submitTiebreakerPick(spId, user, teams[0].series_id, teams[0].team_id);
      await pool.query("UPDATE games SET start_time_utc = NOW() - INTERVAL '1 day', game_state = 'FINAL', result = 'W' WHERE round = 4 AND game_number_in_series = $1", [game]);
      if (game === 4) await pool.query('UPDATE playoff_series SET is_completed = TRUE, top_seed_wins = 4 WHERE round = 4');
      const advanced = await SurvivorService.advanceTiebreakerGame(spId);
      if (game === 4) assert.equal(advanced.action, 'split_prize');
    }
    const { rows: winners } = await pool.query('SELECT user_id FROM survivor_playoff_tiebreaker_participants WHERE contest_id = $1 AND is_winner = TRUE ORDER BY user_id', [spId]);
    assert.deepEqual(winners.map(p => p.user_id), [p1, p2]);
    assert.equal((await Contest.findById(spId)).status, 'completed');
    console.log('PASS: survivor playoff deadlines, privacy, no-pick elimination, all rounds, fresh slate, SCF reuse, and shared winners after a sweep');

    const originalFetch = nhlService.fetchGamesForDate;
    const apiGame = { id: 2031039999, season: 20312032, gameDate: '2032-04-20', gameType: 3, gameState: 'FUT',
      startTimeUTC: '2032-04-20T23:00:00Z',
      awayTeam: { id: allTeams[0].nhl_api_id, abbrev: allTeams[0].abbreviation, score: 2 },
      homeTeam: { id: allTeams[1].nhl_api_id, abbrev: allTeams[1].abbreviation, score: 1 },
      seriesStatus: { round: 1, seriesLetter: 'A', gameNumberOfSeries: 1,
        topSeedTeamAbbrev: allTeams[0].abbreviation, bottomSeedTeamAbbrev: allTeams[1].abbreviation } };
    try {
      nhlService.fetchGamesForDate = async () => [apiGame];
      await nhlService.processPlayoffGamesForDate(apiGame.gameDate);
      const { rows: scheduled } = await pool.query('SELECT * FROM games WHERE game_id = $1', [apiGame.id]);
      assert.equal(scheduled.length, 2);
      assert(scheduled.every(g => g.result === 'PENDING' && g.series_id === '2031-R1-A'));
      apiGame.gameState = 'LIVE';
      await nhlService.processPlayoffGamesForDate(apiGame.gameDate);
      apiGame.gameState = 'FINAL';
      await nhlService.processPlayoffGamesForDate(apiGame.gameDate);
      const { rows: finished } = await pool.query('SELECT result FROM games WHERE game_id = $1 ORDER BY team_id', [apiGame.id]);
      assert.deepEqual(finished.map(g => g.result), ['W', 'L']);
    } finally { nhlService.fetchGamesForDate = originalFetch; }
    console.log('PASS: upcoming playoff games create their series first, remain pending while live, and receive final scores');

    const express = require('express');
    const request = require('supertest');
    const app = express();
    app.use(express.json());
    app.use('/admin', require('../routes/adminRoutes'));
    app.use('/games', require('../routes/gamesRoutes'));
    app.use('/playoff-games', require('../routes/playoffGamesRoutes'));
    app.use('/contest', require('../routes/contestRoutes'));
    app.use('/notifications', require('../routes/notificationRoutes'));
    app.use('/survivor', require('../routes/survivorRoutes'));
    app.use(require('../middleware/errorMiddleware').errorHandler);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [p1]);
    const token = require('../services/tokenService').generateAccessToken(p1);
    await require('./checkEmailSetup')(pool, app, token, p1);
    await require('./checkAdminSurvivorPick')(pool, app, token, draftUsers.slice(0, 5), allTeams);

    const sameNames = await Contest.create('Same-name imports', '2030-31', 'two_team', 16);
    const importPlayer = (userId, teamOffset) => request(app)
      .post(`/contest/contests/${sameNames.contest_id}/admin/add-participant`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: userId, team1_id: allTeams[teamOffset].team_id, team2_id: allTeams[teamOffset + 1].team_id });
    const firstImport = await importPlayer(draftUsers[0].id, 0);
    const secondImport = await importPlayer(draftUsers[1].id, 2);
    assert.equal(firstImport.status, 201, firstImport.body.message);
    assert.equal(secondImport.status, 201, secondImport.body.message);
    assert.equal(firstImport.body.participant.participant_name, secondImport.body.participant.participant_name);
    assert.notEqual(firstImport.body.participant.participant_id, secondImport.body.participant.participant_id);
    const duplicateAccount = await importPlayer(draftUsers[0].id, 4);
    assert.equal(duplicateAccount.status, 400);
    assert.match(duplicateAccount.body.message, /already joined/);
    const assignedTeams = await pool.query('SELECT participant_id, team1_id, team2_id FROM two_team_picks WHERE contest_id = $1 ORDER BY participant_id', [sameNames.contest_id]);
    assert.deepEqual(assignedTeams.rows, [firstImport.body, secondImport.body].map(({ participant, pick }) => ({
      participant_id: participant.participant_id, team1_id: pick.team1_id, team2_id: pick.team2_id,
    })));
    assert.equal((await Contest.findById(sameNames.contest_id)).current_participants, 2);
    console.log('PASS: same-name accounts import separately with intact picks; duplicate accounts remain blocked');
    const stateResponse = await request(app).patch(`/admin/survivor/contests/${spId}/state`)
      .set('Authorization', `Bearer ${token}`).send({ phase: 'playoff_tiebreaker', status: 'in_progress', playoff_round: 3, playoff_game_number: 1 });
    assert.equal(stateResponse.status, 200, stateResponse.body.message);
    const state = await SurvivorService.getTiebreakerStatus(spId);
    assert.equal(state.current_round, 3);
    assert.equal(state.current_game_number, 1);
    assert.equal(state.is_active, true);
    const { rows: skippedPlayer } = await pool.query('SELECT id FROM survivor_participants WHERE contest_id = $1 AND user_id = $2', [spId, p3]);
    const reinstated = await request(app).patch(`/admin/survivor/contests/${spId}/participants/${skippedPlayer[0].id}`)
      .set('Authorization', `Bearer ${token}`).send({ is_eliminated: false });
    assert.equal(reinstated.status, 200, reinstated.body.message);
    const { rows: restored } = await pool.query('SELECT is_eliminated FROM survivor_playoff_tiebreaker_participants WHERE contest_id = $1 AND user_id = $2', [spId, p3]);
    assert.equal(restored[0].is_eliminated, false);
    console.log('PASS: administrator phase/round overrides and participant reinstatement synchronize playoff state');

    const regularPick = (await SurvivorService.getMyPicks(contest.contest_id, users[0].id))[0];
    assert.equal(regularPick.wins, 0);
    assert.equal(regularPick.losses, 1);
    await pool.query("UPDATE games SET result = 'W' WHERE game_id = 2030020001 AND team_id = $1", [teams[0].team_id]);
    assert.equal((await SurvivorService.getMyPicks(contest.contest_id, users[0].id))[0].wins, 1);
    await pool.query("UPDATE games SET result = 'L' WHERE game_id = 2030020001 AND team_id = $1", [teams[0].team_id]);
    const manual = await request(app).put(`/admin/survivor/contests/${contest.contest_id}/picks/${regularPick.id}`)
      .set('Authorization', `Bearer ${token}`).send({ result: 'survived', games_won: 1 });
    assert.equal(manual.status, 200, manual.body.message);
    await SurvivorService.processWeekResults(contest.contest_id, 1);
    const scored = (await SurvivorService.getMyPicks(contest.contest_id, users[0].id))[0];
    assert.equal(scored.result, 'survived');
    assert.equal(scored.wins, 1);
    const cleared = await request(app).put(`/admin/survivor/contests/${contest.contest_id}/picks/${regularPick.id}`)
      .set('Authorization', `Bearer ${token}`).send({ result: 'pending', games_won: null, games_needed: null });
    assert.equal(cleared.status, 200, cleared.body.message);
    assert.equal((await SurvivorService.getMyPicks(contest.contest_id, users[0].id))[0].wins, 0);

    const { rows: playoffPick } = await pool.query('SELECT pick_id FROM survivor_playoff_tiebreaker_picks JOIN survivor_playoff_tiebreaker_participants USING (tiebreaker_participant_id, contest_id) WHERE contest_id = $1 AND user_id = $2 AND round = 1 AND game_number = 1', [spId, p1]);
    const moved = await request(app).put(`/admin/survivor/contests/${spId}/tiebreaker/picks/${playoffPick[0].pick_id}`)
      .set('Authorization', `Bearer ${token}`).send({ picked_team_id: allTeams[15].team_id, eliminate_participant: true });
    assert.equal(moved.status, 200, moved.body.message);
    assert.equal(moved.body.pick.series_id, '2030-R1-7');
    assert.equal((await SurvivorService.getUserStatus(spId, p1)).is_eliminated, true);
    const restoredPick = await request(app).put(`/admin/survivor/contests/${spId}/tiebreaker/picks/${playoffPick[0].pick_id}`)
      .set('Authorization', `Bearer ${token}`).send({ reinstate_participant: true });
    assert.equal(restoredPick.status, 200, restoredPick.body.message);
    const { rows: currentPick } = await pool.query('SELECT pick_id FROM survivor_playoff_tiebreaker_picks JOIN survivor_playoff_tiebreaker_participants USING (tiebreaker_participant_id, contest_id) WHERE contest_id = $1 AND user_id = $2 AND round = 3 AND game_number = 1', [spId, p1]);
    const override = await request(app).put(`/admin/survivor/contests/${spId}/tiebreaker/picks/${currentPick[0].pick_id}`)
      .set('Authorization', `Bearer ${token}`).send({ is_correct: false });
    assert.equal(override.status, 200, override.body.message);
    await SurvivorService.processTiebreakerGameResults(spId);
    assert.equal((await SurvivorService.getUserStatus(spId, p1)).is_eliminated, true);
    console.log('PASS: live win totals, durable/clearable regular overrides, playoff team changes, and durable playoff overrides');

    const scoreEdit = await request(app).put(`/playoff-games/${apiGame.id}/${allTeams[0].team_id}`)
      .set('Authorization', `Bearer ${token}`).send({ team_score: 0, opponent_score: 1, result: 'L' });
    assert.equal(scoreEdit.status, 200, scoreEdit.body.message);
    const scoreOnly = await request(app).put(`/games/${apiGame.id}/${allTeams[0].team_id}`)
      .set('Authorization', `Bearer ${token}`).send({ opponent_score: 2 });
    assert.equal(scoreOnly.status, 200, scoreOnly.body.message);
    try {
      nhlService.fetchGamesForDate = async () => [apiGame];
      await nhlService.processPlayoffGamesForDate(apiGame.gameDate);
    } finally { nhlService.fetchGamesForDate = originalFetch; }
    const { rows: correctedScores } = await pool.query('SELECT team_score, opponent_score, result FROM games WHERE game_id = $1 ORDER BY team_id', [apiGame.id]);
    assert.deepEqual(correctedScores, [
      { team_score: 0, opponent_score: 2, result: 'L' },
      { team_score: 2, opponent_score: 0, result: 'W' },
    ]);
    console.log('PASS: score corrections update both perspectives and survive NHL refreshes');

    const adminPicks = await request(app).get(`/admin/survivor/contests/${spId}/picks?round=3&game=1`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(adminPicks.status, 200, adminPicks.body.message);
    assert.equal(adminPicks.body.picks.length, 2);
    assert(adminPicks.body.picks.every(p => p.participant_name && p.id && p.team_id));
    const forbiddenPicks = await request(app).get(`/admin/survivor/contests/${spId}/picks?round=3&game=1`)
      .set('Authorization', `Bearer ${require('../services/tokenService').generateAccessToken(p2)}`);
    assert.equal(forbiddenPicks.status, 403);

    const membership = await Contest.create('Membership and manual picks', '2030-31');
    const join = async userId => {
      const response = await request(app).post(`/contest/contests/${membership.contest_id}/join`)
        .set('Authorization', `Bearer ${require('../services/tokenService').generateAccessToken(userId)}`).send({ participant_name: 'Drafter' });
      assert.equal(response.status, 201, response.body.message);
      return response.body.participant;
    };
    const assigned = await join(draftUsers[0].id);
    await join(draftUsers[1].id);
    await join(draftUsers[2].id);
    await TwoTeamPick.create(assigned.participant_id, allTeams[0].team_id, allTeams[1].team_id, membership.contest_id);
    const leave = await request(app).delete(`/contest/contests/${membership.contest_id}/leave`)
      .set('Authorization', `Bearer ${require('../services/tokenService').generateAccessToken(draftUsers[1].id)}`);
    assert.equal(leave.status, 200, leave.body.message);
    for (const user of draftUsers.slice(3)) await join(user.id);
    await join(draftUsers[1].id);
    let turn = await Contest.getCurrentDraftPick(membership.contest_id);
    let nextTeam = 2;
    while (turn) {
      assert.notEqual(turn.participant.participant_id, assigned.participant_id);
      const picked = await Contest.makeDraftPick(membership.contest_id, turn.participant.user_id, allTeams[nextTeam++].team_id);
      turn = picked.next_pick;
    }
    assert.equal(nextTeam, 32);
    assert.equal((await Contest.findById(membership.contest_id)).status, 'in_progress');
    console.log('PASS: admin-only playoff pick review, leaving/rejoining without draft-order collisions, and drafting around manual assignments');

    for (const body of [{ contest_type: 'survivor' }, { contest_type: 'playoff_tiebreaker' }, { max_participants: 32 }]) {
      const invalid = await request(app).post('/contest/contests').set('Authorization', `Bearer ${token}`)
        .send({ contest_name: 'Invalid generic contest', season_year: '2030-31', ...body });
      assert.equal(invalid.status, 400, invalid.body.message);
    }
    await pool.query("UPDATE contests SET status = 'completed' WHERE contest_type = 'survivor' AND contest_id <> $1", [spId]);
    await pool.query("UPDATE contests SET status = 'in_progress' WHERE contest_id = $1", [spId]);
    const analytics = await request(app).get('/contest/analytics').set('Authorization', `Bearer ${token}`);
    assert.equal(analytics.status, 200, analytics.body.message);
    assert.equal(analytics.body.data.seasonYear, '2030-31');
    assert.equal(analytics.body.data.phase, 'playoff_tiebreaker');
    assert.equal(analytics.body.data.totalParticipants, 3);
    assert(analytics.body.data.playoffRound);
    console.log('PASS: incomplete contests rejected and dashboard reflects the active Survivor season/phase');

    await require('./checkSessionsAndChat')(pool, users[0].id);

    if (process.argv.includes('--serve')) {
      await SurvivorService.createContest({ contest_name: 'History Import Preview', season_year: '2025-26', season_start_date: '2025-10-06', season_end_date: '2026-04-17' });
      // Optional browser QA uses only this disposable schema and fake local accounts.
      await pool.query("UPDATE contests SET status = 'completed' WHERE contest_type = 'survivor' AND contest_name <> 'History Import Preview'");
      await pool.query("UPDATE contests SET status = 'in_progress', phase = 'playoff_tiebreaker', playoff_round = 1, playoff_game_number = 1 WHERE contest_id = $1", [spId]);
      await pool.query('UPDATE survivor_playoff_tiebreaker_status SET is_active = TRUE, current_round = 1, current_game_number = 1 WHERE contest_id = $1', [spId]);
      await pool.query('DELETE FROM survivor_playoff_tiebreaker_picks WHERE contest_id = $1', [spId]);
      await pool.query('UPDATE survivor_playoff_tiebreaker_participants SET is_eliminated = FALSE, is_winner = FALSE WHERE contest_id = $1', [spId]);
      await pool.query('UPDATE survivor_participants SET is_eliminated = FALSE, placement = NULL WHERE contest_id = $1', [spId]);
      await pool.query("UPDATE games SET start_time_utc = NOW() + INTERVAL '1 day', game_state = 'FUT', result = 'PENDING' WHERE series_id LIKE '2030-%'");
      await pool.query('UPDATE playoff_series SET is_completed = FALSE WHERE season = 20302031');
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [await require('bcrypt').hash('Preview123!', 8), p1]);
      const preview = express();
      preview.use(require('cors')({ origin: 'http://127.0.0.1:4173', credentials: true }));
      preview.use(express.json());
      preview.use(require('cookie-parser')());
      for (const [path, module] of [['auth', 'authRoutes'], ['users', 'userRoutes'], ['contest', 'contestRoutes'], ['survivor', 'survivorRoutes'], ['admin', 'adminRoutes'], ['notifications', 'notificationRoutes'], ['playoff-standings', 'playoffStandingsRoutes'], ['games', 'gamesRoutes'], ['playoff-games', 'playoffGamesRoutes'], ['chat', 'chatRoutes']]) {
        preview.use(`/api/${path}`, require(`../routes/${module}`));
      }
      preview.use(require('../middleware/errorMiddleware').errorHandler);
      await new Promise((resolve, reject) => {
        const server = preview.listen(4174, '127.0.0.1', () => console.log('LOCAL QA: API 127.0.0.1:4174; login draft1@example.test / Preview123!'));
        server.on('error', reject);
        preview.post('/__stop', (req, res) => { res.end('Stopped'); server.close(resolve); });
      });
    }
  } finally {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
