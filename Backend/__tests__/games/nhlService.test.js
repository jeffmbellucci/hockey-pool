/**
 * NhlService tests — validates retry logic (B10), team ID guard (B11), batch fetch (B12).
 */
const { mockPool, resetMocks } = require('../helpers/testSetup');

// Mock axios before requiring NhlService
jest.mock('axios');
const axios = require('axios');

const nhlService = require('../../services/NhlService');

test('week schedule requests share a complete load, expire, and retry after failure', async () => {
  nhlService._scheduleLoads.clear();
  const fetch = jest.spyOn(nhlService, 'fetchAndStoreScheduledGames');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-09T18:00:00Z'));
  try {
    let finish;
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = nhlService.ensureScheduledGames('2026-10-12', '2026-10-18');
    const second = nhlService.ensureScheduledGames('2026-10-12', '2026-10-18');
    expect(fetch).toHaveBeenCalledTimes(1);
    finish({ games_stored: 40 });
    expect(await Promise.all([first, second])).toEqual([{ games_stored: 40 }, { games_stored: 40 }]);
    await nhlService.ensureScheduledGames('2026-10-12', '2026-10-18');
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-10-09T18:06:00Z'));
    fetch.mockRejectedValueOnce(new Error('one date failed')).mockResolvedValueOnce({ games_stored: 42 });
    await expect(nhlService.ensureScheduledGames('2026-10-12', '2026-10-18')).rejects.toThrow('one date failed');
    await expect(nhlService.ensureScheduledGames('2026-10-12', '2026-10-18')).resolves.toEqual({ games_stored: 42 });
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { fetch.mockRestore(); nhlService._scheduleLoads.clear(); jest.useRealTimers(); }
});

test('startup catch-up covers the season even when future schedules exist and counts partial failures', async () => {
  const start = jest.spyOn(nhlService, 'getSeasonStartDate').mockResolvedValue('2026-10-06');
  const fetch = jest.spyOn(nhlService, 'fetchAllDataForDate').mockImplementation(async date =>
    date === '2026-10-07' ? { games: { error: 'feed unavailable' } } : { games: { processed: 2 } });
  jest.useFakeTimers().setSystemTime(new Date('2026-10-08T18:00:00Z'));
  try {
    const result = await nhlService.fetchHistoricalData();
    expect(fetch.mock.calls.map(([date]) => date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(result).toEqual({ fetched: 2, errors: 1, daysProcessed: 3 });
  } finally { start.mockRestore(); fetch.mockRestore(); jest.useRealTimers(); }
});

test('malformed NHL responses are not cached as empty schedules', async () => {
  axios.get.mockReset();
  axios.get.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { games: [] } });
  await expect(nhlService.fetchGamesForDate('2039-01-01')).rejects.toThrow('Invalid NHL games response');
  await expect(nhlService.fetchGamesForDate('2039-01-01')).resolves.toEqual([]);
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('game start time retains its timezone when persisted', () => {
  expect(nhlService.parseStartTime('2030-10-07T19:00:00-04:00')).toBe('2030-10-07T23:00:00.000Z');
  expect(nhlService.parseStartTime('invalid')).toBeNull();
});

test('playoff qualifiers use division berths and wildcards, not conference rank alone', async () => {
  resetMocks();
  axios.get.mockReset();
  axios.get.mockResolvedValue({ data: { standings: [
    { teamAbbrev: { default: 'DIV' }, conferenceSequence: 9, divisionSequence: 3, wildcardSequence: 0 },
    { teamAbbrev: { default: 'WC' }, conferenceSequence: 8, divisionSequence: 5, wildcardSequence: 2 },
    { teamAbbrev: { default: 'OUT' }, conferenceSequence: 7, divisionSequence: 6, wildcardSequence: 3 },
  ] } });
  mockPool.query.mockResolvedValue({ rows: [{ nhl_api_id: 1 }] });
  const result = await nhlService.fetchAndStorePlayoffStandings('2035-04-18');
  expect(result.playoff_teams.map(t => t.team_abbrev)).toEqual(['DIV', 'WC']);
});

describe('NhlService.fetchFromNhl() — retry logic [B10]', () => {
  beforeEach(() => {
    resetMocks();
    axios.get.mockReset();
  });

  test('retries 3 times on 500 error then reports failure', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } });

    await expect(nhlService.fetchFromNhl('/test-endpoint')).rejects.toThrow('NHL feed unavailable');
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  test('succeeds on 2nd attempt after 1st fails', async () => {
    axios.get
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ data: { success: true } });

    const result = await nhlService.fetchFromNhl('/test-endpoint');

    expect(result).toEqual({ success: true });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('succeeds immediately on first try', async () => {
    axios.get.mockResolvedValueOnce({ data: { games: [] } });

    const result = await nhlService.fetchFromNhl('/test-endpoint');

    expect(result).toEqual({ games: [] });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

describe('NhlService — team ID guard [B11]', () => {
  beforeEach(() => {
    resetMocks();
    axios.get.mockReset();
  });

  test('processRegularSeasonGame returns null for missing awayTeam.id', () => {
    const game = {
      id: 2025020001,
      gameType: 2,
      gameState: 'OFF',
      gameDate: '2025-10-10',
      awayTeam: { abbrev: 'TOR', score: 3 }, // no id
      homeTeam: { id: 1, abbrev: 'MTL', score: 2 },
      gameOutcome: { lastPeriodType: 'REG' },
    };

    const result = nhlService.processRegularSeasonGame(game);
    expect(result).toBeNull();
  });

  test('processRegularSeasonGame returns null for missing homeTeam.id', () => {
    const game = {
      id: 2025020002,
      gameType: 2,
      gameState: 'OFF',
      gameDate: '2025-10-10',
      awayTeam: { id: 1, abbrev: 'TOR', score: 3 },
      homeTeam: { abbrev: 'MTL', score: 2 }, // no id
      gameOutcome: { lastPeriodType: 'REG' },
    };

    const result = nhlService.processRegularSeasonGame(game);
    expect(result).toBeNull();
  });
});

describe('NhlService — CONCURRENTLY refresh [N9]', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('refreshStandingsAndPicks uses CONCURRENTLY', async () => {
    mockPool.query
      .mockResolvedValueOnce({}) // REFRESH MATERIALIZED VIEW CONCURRENTLY
      .mockResolvedValue({ rows: [] }); // Update both contest score caches

    await nhlService.refreshStandingsAndPicks();

    expect(mockPool.query.mock.calls[0][0]).toContain('CONCURRENTLY');
    expect(mockPool.query.mock.calls[2][0]).toContain('UPDATE playoff_picks');
  });

  test('falls back to non-concurrent on error', async () => {
    mockPool.query
      .mockRejectedValueOnce(new Error('cannot refresh CONCURRENTLY'))
      .mockResolvedValueOnce({}) // fallback non-concurrent
      .mockResolvedValue({ rows: [] }); // Update both contest score caches

    await nhlService.refreshStandingsAndPicks();

    // Second call should be regular REFRESH without CONCURRENTLY
    expect(mockPool.query.mock.calls[1][0]).toContain('REFRESH MATERIALIZED VIEW team_standings');
    expect(mockPool.query.mock.calls[1][0]).not.toContain('CONCURRENTLY');
  });
});
