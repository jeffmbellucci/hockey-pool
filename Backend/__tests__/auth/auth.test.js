/**
 * Auth & User model tests — validates auth flows and ALLOWED_FIELDS whitelist (B2, N2).
 */
const { mockPool, mockClient, makeToken, makeAdminToken, resetMocks } = require('../helpers/testSetup');

// Require AFTER mock is set up
const User = require('../../models/User');

describe('User.update() — field whitelist [B2]', () => {
  beforeEach(resetMocks);

  test('allows name, last_name, email, avatar_url', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', name: 'Updated', role: 'user' }],
    });

    await User.update(1, {
      name: 'Updated',
      last_name: 'User',
      email: 'test@test.com',
      avatar_url: 'https://img.example.com/pic.jpg',
    });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('name');
    expect(sql).toContain('email');
    expect(sql).not.toContain('password');
    // SET clause should not contain role (it appears in RETURNING which is fine)
    const setClause = sql.substring(sql.indexOf('SET'), sql.indexOf('WHERE'));
    expect(setClause).not.toContain('role');
  });

  test('rejects role field — cannot escalate privileges', async () => {
    // When only role is provided, no fields pass the whitelist → returns findById
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', role: 'user' }],
    });

    const result = await User.update(1, { role: 'admin' });

    // Should call findById instead of UPDATE (no valid fields to update)
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toContain('UPDATE');
    expect(result.role).toBe('user');
  });

  test('rejects password field', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', role: 'user' }],
    });

    await User.update(1, { password: 'hacked123' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toContain('UPDATE');
  });
});

describe('User.adminUpdate() — admin field whitelist [N2]', () => {
  beforeEach(resetMocks);

  test('allows role and active fields', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', role: 'admin', active: true }],
    });

    await User.adminUpdate(1, { role: 'admin', active: false });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('role');
  });

  test('still rejects password field (handled by updatePassword)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', role: 'user' }],
    });

    await User.adminUpdate(1, { password: 'test' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toContain('password');
  });
});

describe('User.updatePassword() [N2]', () => {
  beforeEach(resetMocks);

  test('updates password column directly', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', role: 'user' }],
    });

    await User.updatePassword(1, '$2b$12$hashvalue');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('password');
    expect(sql).toContain('UPDATE');
    expect(mockPool.query.mock.calls[0][1][0]).toBe('$2b$12$hashvalue');
  });
});
