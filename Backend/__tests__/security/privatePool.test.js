const { mockPool, resetMocks } = require('../helpers/testSetup');
const express = require('express');
const request = require('supertest');
process.env.JWT_SECRET = 'private-pool-test-secret';
const { generateAccessToken } = require('../../services/tokenService');

const app = express();
app.use(express.json());
app.use('/auth', require('../../routes/authRoutes'));
app.use('/contest', require('../../routes/contestRoutes'));
app.use('/survivor', require('../../routes/survivorRoutes'));
app.use('/admin', require('../../routes/adminRoutes'));
app.use('/notifications', require('../../routes/notificationRoutes'));

beforeEach(resetMocks);

test('private contest data and registration require a login', async () => {
  for (const path of ['/contest/contests', '/contest/participants', '/contest/leaderboard', '/survivor/contests', '/survivor/contests/1/participants']) {
    expect((await request(app).get(path)).status).toBe(401);
  }
  expect((await request(app).post('/auth/register').send({ role: 'admin' })).status).toBe(401);
  expect(mockPool.query).not.toHaveBeenCalled();
});

test('players cannot register accounts or bypass the draft with direct picks', async () => {
  mockPool.query.mockResolvedValue({ rows: [{ id: 1, role: 'player', active: true }] });
  const token = generateAccessToken(1);
  for (const path of ['/auth/register', '/contest/picks', '/admin/survivor/contests/1/import', '/admin/survivor/contests/1/picks', '/notifications/connection', '/notifications/test-email']) {
    expect((await request(app).post(path).set('Authorization', `Bearer ${token}`).send({ role: 'admin', participant_id: 2 })).status).toBe(403);
  }
  expect(mockPool.query.mock.calls.every(([sql]) => !/INSERT|UPDATE/.test(sql))).toBe(true);
});

test('active players can read contests; inactive accounts cannot', async () => {
  const token = generateAccessToken(1);
  mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'player', active: true }] })
    .mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get('/contest/contests').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'player', active: false }] });
  expect((await request(app).get('/contest/contests').set('Authorization', `Bearer ${token}`)).status).toBe(401);
});


test('generic contest creation rejects modes that require initialization and impossible drafts', async () => {
  mockPool.query.mockResolvedValue({ rows: [{ id: 1, role: 'admin', active: true }] });
  const token = generateAccessToken(1);
  for (const body of [
    { contest_type: 'survivor' }, { contest_type: 'playoff_tiebreaker' },
    { max_participants: 32 }, { max_participants: 0 }, { max_participants: 2.5 },
  ]) {
    const response = await request(app).post('/contest/contests').set('Authorization', `Bearer ${token}`)
      .send({ contest_name: 'Test', season_year: '2026-27', ...body });
    expect(response.status).toBe(400);
  }
  expect(mockPool.query.mock.calls.every(([sql]) => !/INSERT/.test(sql))).toBe(true);
});

test('polling budgets are independent for authenticated players on the same IP', async () => {
  const limiter = require('../../middleware/contestRateLimiter');
  limiter.resetKey('1'); limiter.resetKey('2');
  mockPool.query.mockImplementation(async sql => ({ rows: sql.includes('FROM users') ? [{ id: 1, role: 'player', active: true }] : [] }));
  const first = await request(app).get('/contest/contests').set('Authorization', `Bearer ${generateAccessToken(1)}`);
  expect(first.headers['ratelimit-remaining']).toBe('1199');
  mockPool.query.mockImplementation(async sql => ({ rows: sql.includes('FROM users') ? [{ id: 2, role: 'player', active: true }] : [] }));
  const second = await request(app).get('/contest/contests').set('Authorization', `Bearer ${generateAccessToken(2)}`);
  expect(second.headers['ratelimit-remaining']).toBe('1199');
});
