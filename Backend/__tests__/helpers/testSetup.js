/**
 * Test setup — provides mock pool, JWT helpers, and common test utilities.
 *
 * Usage in tests:
 *   const { mockPool, makeToken, resetMocks } = require('../helpers/testSetup');
 */

// Mock the database pool BEFORE any model/service is required
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();

const mockClient = {
  query: jest.fn(),
  release: mockRelease,
};

mockConnect.mockResolvedValue(mockClient);

jest.mock('../../config/database', () => ({
  query: mockQuery,
  connect: mockConnect,
}));

// Mock jsonwebtoken
const jwt = require('jsonwebtoken');

/**
 * Create a signed JWT for testing protected routes.
 */
function makeToken(userId = 1, role = 'user') {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '15m' }
  );
}

function makeAdminToken(userId = 99) {
  return makeToken(userId, 'admin');
}

/**
 * Reset all mocks between tests.
 */
function resetMocks() {
  mockQuery.mockReset();
  mockClient.query.mockReset();
  mockConnect.mockClear();
  mockRelease.mockClear();
}

module.exports = {
  mockPool: { query: mockQuery, connect: mockConnect },
  mockClient,
  makeToken,
  makeAdminToken,
  resetMocks,
};
