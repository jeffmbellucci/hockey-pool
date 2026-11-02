const { mockClient, resetMocks } = require('../helpers/testSetup');
const runMigrations = require('../../config/runMigrations');

test('failed migration rolls back and releases the deployment lock and connection', async () => {
  resetMocks();
  const failure = new Error('migration fixture failed');
  mockClient.query.mockImplementation(async sql => {
    if (sql.includes('CREATE TABLE IF NOT EXISTS users')) throw failure;
    return { rows: [] };
  });
  await expect(runMigrations()).rejects.toThrow(failure);
  const queries = mockClient.query.mock.calls.map(([sql]) => sql);
  const rollback = queries.indexOf('ROLLBACK');
  expect(rollback).toBeGreaterThan(-1);
  expect(queries.findIndex(sql => sql.includes('pg_advisory_unlock'))).toBeGreaterThan(rollback);
  expect(queries.some(sql => sql.includes('INSERT INTO migrations'))).toBe(false);
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});
