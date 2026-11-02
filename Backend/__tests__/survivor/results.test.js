const { mockPool, mockClient, resetMocks } = require('../helpers/testSetup');
const SurvivorService = require('../../services/survivorService');

const contest = { contest_id: 10, contest_type: 'survivor', status: 'in_progress', phase: 'regular_season', current_week: 1 };
const week = { week_number: 1, start_date: '2026-10-05', end_date: '2026-10-11', has_ended: true };
const players = [1, 2, 3].map(id => ({ participant_id: id, user_id: id, participant_name: `Player ${id}` }));
const picks = players.slice(0, 2).map(p => ({ ...p, id: p.user_id, team_id: p.user_id, team_abbr: 'TOR' }));

beforeEach(resetMocks);
afterEach(() => jest.restoreAllMocks());

function mockResults({ closed = true, finished = 4, submitted = picks, won = false, remaining = 2 } = {}) {
  mockClient.query.mockImplementation(async (sql) => {
    if (sql.includes('SELECT * FROM contests') || sql.includes('c.*')) return { rows: [contest] };
    if (sql.includes('SELECT sw.*')) return { rows: [{ ...week, has_ended: closed }] };
    if (sql.includes('FROM survivor_weeks')) return { rows: [week] };
    if (sql.includes('COUNT(DISTINCT game_id)')) return { rows: [{ total_games: '4', finished_games: String(finished), future_games: '0', live_games: '0' }] };
    if (sql.includes('sp.id as participant_id')) return { rows: players };
    if (sql.includes('FROM survivor_picks sp_pick')) return { rows: submitted };
    if (sql.includes('FROM games')) return { rows: [1, 2].flatMap(team => [
      { team_id: team, start_time_utc: '2026-10-06T20:00:00Z', game_state: 'FINAL', result: won ? 'W' : 'L' },
      { team_id: team, start_time_utc: '2026-10-08T20:00:00Z', game_state: 'OFF', result: 'L' },
    ]) };
    if (sql.includes('COUNT(*)')) return { rows: [{ count: String(remaining) }] };
    return { rows: [], rowCount: 1 };
  });
}

test('no-pick players are not eliminated while late picks are still allowed', async () => {
  mockResults({ closed: false });
  await expect(SurvivorService.processWeekResults(10, 1)).rejects.toThrow('before the week ends');
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes('UPDATE survivor_participants'))).toBe(false);
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});

test('unrecognized or postponed game states cannot be treated as finished', async () => {
  mockResults({ finished: 3 });
  const readiness = await SurvivorService.checkWeekReadiness(10, 1);
  expect(readiness).toMatchObject({ is_ready: false, pending_games: 1 });
  await expect(SurvivorService.advanceWeek(10)).rejects.toThrow('all scheduled games are finished');
  expect(mockClient.query.mock.calls.some(([sql]) => /^\s*UPDATE\b/.test(sql))).toBe(false);
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});

test('mass-failure protection saves submitted picks, but disqualifies the player with no pick', async () => {
  mockResults();
  const result = await SurvivorService.processWeekResults(10, 1);
  expect(result).toMatchObject({ survived: 2, eliminated: 1, no_pick: 1, mass_elimination_prevented: true, all_complete: true });
  const eliminations = mockClient.query.mock.calls.filter(([sql]) => sql.includes('SET is_eliminated = TRUE'));
  expect(eliminations.map(([, params]) => params)).toEqual([[1, 3]]);
});

test('no submitted picks means everyone is disqualified and the contest ends', async () => {
  mockResults({ submitted: [], remaining: 0 });
  const result = await SurvivorService.processWeekResults(10, 1);
  expect(result).toMatchObject({ eliminated: 3, no_pick: 3, mass_elimination_prevented: false, winner_determined: false });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("status = 'completed'"))).toBe(true);
});

test('late pick evaluation excludes a win at the exact submission time', async () => {
  mockResults({ submitted: [{ ...picks[0], is_late_pick: true, submitted_at: '2026-10-06T20:00:00Z' }], won: true, remaining: 1 });
  // Supply a winner row for the winner update.
  const query = mockClient.query.getMockImplementation();
  mockClient.query.mockImplementation(async (sql, params) => sql.includes('SET placement = 1')
    ? { rows: [players[0]] } : query(sql, params));
  const result = await SurvivorService.processWeekResults(10, 1);
  expect(result.results[0]).toMatchObject({ games_won: 0, eligible_games: 1, games_needed: 1 });
});

test('advancement passes its transaction into results processing and rolls back on failure', async () => {
  mockResults();
  const process = jest.spyOn(SurvivorService, 'processWeekResults').mockRejectedValue(new Error('processing failed'));
  await expect(SurvivorService.advanceWeek(10)).rejects.toThrow('processing failed');
  expect(process).toHaveBeenCalledWith(10, 1, mockClient);
  expect(mockPool.connect).toHaveBeenCalledTimes(1);
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
});
