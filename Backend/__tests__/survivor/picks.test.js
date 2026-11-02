const { mockPool, mockClient, resetMocks } = require('../helpers/testSetup');
const SurvivorService = require('../../services/survivorService');

const week = {
  week_number: 1, start_date: '2026-10-05', end_date: '2026-10-11',
  now: '2026-10-06T19:00:00Z', lock_time: '2026-10-06T20:00:00Z',
  is_locked: false, has_ended: false,
};
const contest = { contest_id: 10, current_week: 1, participant_id: 5, status: 'in_progress', phase: 'regular_season' };

beforeEach(() => {
  resetMocks();
  jest.spyOn(SurvivorService, 'refreshWeekSchedule').mockResolvedValue(week);
});
afterEach(() => jest.restoreAllMocks());

test.each([
  [null, false, false],
  [null, true, true],
  ['2026-10-06T20:00:00Z', false, false],
  ['2026-10-06T19:00:00Z', false, true],
  ['2026-10-06T18:00:00Z', false, true],
])('lock status uses database time and handles a missing deadline (%s, %s)', async (lock, manual, expected) => {
  mockPool.query.mockResolvedValueOnce({ rows: [{ ...week, lock_time: lock, is_locked: manual }] });
  const result = await SurvivorService.getWeekStatus(10, 1);
  expect(result.is_locked).toBe(expected);
  expect(mockPool.query.mock.calls[0][0]).toContain('clock_timestamp()');
});

test.each([false, true])('picks remain private before lock even if the viewer has picked: %s', async (picked) => {
  mockClient.query.mockResolvedValueOnce({ rows: [week] })
    .mockResolvedValueOnce({ rows: picked ? [{ team_id: 1 }] : [] });
  const result = await SurvivorService.getWeekPicks(10, 1, 7);
  expect(result.can_see_picks).toBe(false);
  expect(result.picks).toEqual([]);
  expect(mockClient.query).toHaveBeenCalledTimes(2);
});

test.each([false, true])('after lock only a viewer with a pick can see picks: %s', async (picked) => {
  mockClient.query.mockResolvedValueOnce({ rows: [{ ...week, is_locked: true }] })
    .mockResolvedValueOnce({ rows: picked ? [{ team_id: 1 }] : [] })
    .mockResolvedValueOnce({ rows: [{ team_id: 9 }] });
  const result = await SurvivorService.getWeekPicks(10, 1, 7);
  expect(result.can_see_picks).toBe(picked);
  expect(result.picks).toEqual(picked ? [{ team_id: 9 }] : []);
});

function mockPick({ weekData = {}, contestData = {}, usage = [], existing = [] } = {}) {
  mockClient.query.mockImplementation(async (sql) => {
    if (sql.includes('SELECT c.*')) return { rows: [{ ...contest, ...contestData }] };
    if (sql.includes('SELECT * FROM nhl_teams')) return { rows: [{ team_id: 1, abbreviation: 'TOR' }] };
    if (sql.includes('SELECT * FROM survivor_team_usage')) return { rows: usage };
    if (sql.includes('SELECT sw.*')) return { rows: [{ ...week, ...weekData }] };
    if (sql.includes('SELECT * FROM games')) return { rows: [
      { start_time_utc: '2026-10-06T19:00:00Z' },
      { start_time_utc: '2026-10-08T20:00:00Z' },
      { start_time_utc: '2026-10-09T20:00:00Z' },
      { start_time_utc: '2026-10-11T20:00:00Z' },
    ] };
    if (sql.includes('SELECT * FROM survivor_picks')) return { rows: existing };
    return { rows: [{ id: 20 }], rowCount: 1 };
  });
}

test('a late pick excludes an already-started game but still needs two wins from a four-game week', async () => {
  mockPick({ weekData: { lock_time: week.now } });
  const result = await SurvivorService.submitPick(10, 7, 1, 1);
  expect(result).toMatchObject({ is_late_pick: true, games_excluded: 1, games_needed: 2, remaining_games: 3 });
  expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
});

test('an incomplete schedule refresh blocks submission before opening a transaction', async () => {
  SurvivorService.refreshWeekSchedule.mockRejectedValue(new Error('NHL feed unavailable'));
  await expect(SurvivorService.submitPick(10, 7, 2, 1)).rejects.toThrow('NHL feed unavailable');
  expect(mockPool.connect).not.toHaveBeenCalled();
});

test('existing picks cannot be modified after lock', async () => {
  mockPick({ weekData: { lock_time: week.now }, existing: [{ id: 20 }] });
  await expect(SurvivorService.submitPick(10, 7, 1, 1)).rejects.toThrow('Cannot modify picks after lock time');
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});

test('an unlocked future pick can be edited and its own team is not considered already used', async () => {
  mockPick({ weekData: { lock_time: null }, usage: [{ used_in_week: 2 }], existing: [{ id: 20 }] });
  const result = await SurvivorService.submitPick(10, 7, 2, 1);
  expect(result.is_late_pick).toBe(false);
  expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
  expect(mockClient.query.mock.calls.find(([sql]) => sql.includes('SELECT c.*'))[0]).toContain('FOR UPDATE OF c, sp');
});

test('a team reserved in a different future week cannot be reused', async () => {
  mockPick({ usage: [{ used_in_week: 2 }] });
  await expect(SurvivorService.submitPick(10, 7, 1, 1)).rejects.toThrow('already used');
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});

test.each([
  [{ current_week: 2 }, {}, 'past or invalid week'],
  [{ status: 'cancelled' }, {}, 'not accepting'],
  [{ phase: 'playoffs' }, {}, 'not accepting'],
  [{}, { has_ended: true }, 'week has ended'],
])('rejects picks outside an open regular-season week', async (contestData, weekData, message) => {
  mockPick({ contestData, weekData });
  await expect(SurvivorService.submitPick(10, 7, 1, 1)).rejects.toThrow(message);
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});

test('a missing lock time does not block cancelling an unlocked future pick', async () => {
  mockPick({ weekData: { lock_time: null }, existing: [{ id: 20 }] });
  await SurvivorService.cancelPick(10, 7, 2);
  expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
});

test('a locked pick cannot be cancelled', async () => {
  mockPick({ weekData: { lock_time: week.now }, existing: [{ id: 20 }] });
  await expect(SurvivorService.cancelPick(10, 7, 1)).rejects.toThrow('after lock time');
  expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
});
