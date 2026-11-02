// Imports a few real NHL dates into the configured local test database and verifies repeat updates.
require('dotenv').config();
const assert = require('node:assert/strict');
assert(['localhost', '127.0.0.1'].includes(process.env.DB_HOST)
  && process.env.NODE_ENV !== 'production'
  && process.env.EMAIL_ENABLED === 'false' && process.env.SCHEDULER_ENABLED === 'false',
'Use a local test database with EMAIL_ENABLED=false and SCHEDULER_ENABLED=false');
const pool = require('../config/database');
const nhl = require('../services/NhlService');

async function main() {
  const dates = process.argv.slice(2);
  if (!dates.length) dates.push(new Date().toISOString().slice(0, 10), '2025-10-07', '2025-06-17');
  let checked = 0;
  for (const date of dates) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(date), 'Dates must use YYYY-MM-DD');
    const games = (await nhl.fetchGamesForDate(date)).filter(game => [2, 3].includes(game.gameType));
    for (let pass = 1; pass <= 2; pass++) {
      const result = await nhl.fetchAllDataForDate(date);
      for (const [part, summary] of Object.entries(result)) {
        assert(!summary.error && summary.success !== false, `${date} ${part}: ${JSON.stringify(summary)}`);
      }
      for (const game of games) {
        const { rows } = await pool.query('SELECT * FROM games WHERE game_id = $1 ORDER BY is_home', [game.id]);
        assert.equal(rows.length, 2, `Game ${game.id} must have exactly two perspectives`);
        for (const row of rows) {
          const team = row.is_home ? game.homeTeam : game.awayTeam;
          const opponent = row.is_home ? game.awayTeam : game.homeTeam;
          assert.equal(row.team_score, team.score ?? 0);
          assert.equal(row.opponent_score, opponent.score ?? 0);
          assert.equal(row.game_state, game.gameState);
          assert.equal(row.start_time_utc.toISOString(), new Date(game.startTimeUTC).toISOString());
          const final = ['OFF', 'FINAL'].includes(game.gameState);
          const loss = game.gameOutcome?.lastPeriodType === 'OT' ? 'OTL' : game.gameOutcome?.lastPeriodType === 'SO' ? 'SOL' : 'L';
          assert.equal(row.result, final ? (team.score > opponent.score ? 'W' : loss) : 'PENDING');
          if (game.gameType === 3 && game.seriesStatus) {
            assert.equal(row.round, game.seriesStatus.round);
            assert(row.series_id, 'Playoff games must link to a series');
            const series = await pool.query('SELECT * FROM playoff_series WHERE series_id = $1', [row.series_id]);
            assert.equal(series.rows.length, 1);
            if (Math.max(game.seriesStatus.topSeedWins, game.seriesStatus.bottomSeedWins) >= 4) {
              assert.equal(series.rows[0].is_completed, true);
              assert(series.rows[0].series_winner_id);
            }
          }
        }
      }
      console.log(`PASS ${date}, update ${pass}: ${games.length} games; scores, results, UTC starts and playoff links verified`);
    }
    checked += games.length;
  }
  assert(checked > 0, 'No games were available to validate');
  console.log(`PASS: ${checked} live-feed games imported and updated twice. No email sent.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
