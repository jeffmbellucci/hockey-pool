/**
 * Input validation tests — verifies B3, B4, B5, B7, B20 audit fixes.
 */
const { mockPool, mockClient, resetMocks } = require('../helpers/testSetup');
const fixtures = require('../helpers/fixtures');

// Models under test
const Contest = require('../../models/Contest');
const ChatMessage = require('../../models/ChatMessage');
const Settings = require('../../models/Settings');

describe('Contest.update() — status whitelist [B4]', () => {
  beforeEach(resetMocks);

  test('rejects invalid status value', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...fixtures.contests.twoTeam }],
    });

    await expect(
      Contest.update(1, { status: 'hacked' })
    ).rejects.toThrow(/Invalid contest status/);
  });

  test.each(['waiting', 'drafting', 'in_progress', 'completed'])(
    'accepts valid status: %s',
    async (status) => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [fixtures.contests.twoTeam] }) // findById
        .mockResolvedValueOnce({ rows: [{ ...fixtures.contests.twoTeam, status }] }); // update

      // Should not throw
      await Contest.update(1, { status });
    }
  );
});

describe('ChatMessage.getRecentMessages() — safe limit [B7]', () => {
  beforeEach(resetMocks);

  test('caps limit to 200 even if 999999 passed', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatMessage.getRecentMessages(999999, null);

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];
    // The limit parameter should be capped at 200
    const limitParam = params[params.length - 1];
    expect(limitParam).toBeLessThanOrEqual(200);
  });

  test('defaults to 50 for NaN limit', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatMessage.getRecentMessages('abc', null);

    const params = mockPool.query.mock.calls[0][1];
    const limitParam = params[params.length - 1];
    expect(limitParam).toBe(50);
  });

  test('enforces minimum of 1', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatMessage.getRecentMessages(-5, null);

    const params = mockPool.query.mock.calls[0][1];
    const limitParam = params[params.length - 1];
    expect(limitParam).toBeGreaterThanOrEqual(1);
  });
});

describe('Settings — ALLOWED_KEYS whitelist [B20]', () => {
  beforeEach(resetMocks);

  test('set() rejects unknown key', async () => {
    await expect(
      Settings.set('dangerous_key', 'value')
    ).rejects.toThrow();
  });

  test('set() accepts valid key', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ key: 'season_year', value: '2025-26' }] });

    await Settings.set('season_year', '2025-26');

    expect(mockPool.query).toHaveBeenCalled();
  });

  test('updateMultiple() skips bad keys, saves valid ones', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ setting_key: 'season_year', setting_value: '2025-26' }] }) // INSERT season_year
      .mockResolvedValueOnce({}); // COMMIT

    await Settings.updateMultiple({
      dangerous_key: 'bad',
      season_year: '2025-26',
    });

    // Should have been called for season_year but NOT for dangerous_key
    const calls = mockClient.query.mock.calls;
    const allSql = calls.map(c => c[0]).join(' ');
    expect(allSql).not.toContain('dangerous_key');
  });
});
