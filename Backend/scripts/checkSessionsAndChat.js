// Invoked by checkContestIntegration against its isolated schema and fake account only.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const request = require('supertest');
const { io: connect } = require('../../Frontend/node_modules/socket.io-client');

module.exports = async function checkSessionsAndChat(pool, userId) {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  process.env.SCHEDULER_ENABLED = 'false';
  process.env.EMAIL_ENABLED = 'false';
  const password = 'LocalSessionTest123!';
  const { rows: [user] } = await pool.query('UPDATE users SET password = $1 WHERE id = $2 RETURNING email',
    [await require('bcrypt').hash(password, 8), userId]);
  const { httpServer, io } = require('../app');
  const sockets = [];
  const open = async token => {
    const socket = connect(`http://127.0.0.1:${httpServer.address().port}`, {
      auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect();
    });
    return socket;
  };
  const send = (socket, message) => new Promise((resolve, reject) => {
    socket.timeout(3000).emit('chat:message', { message }, (error, result) => error ? reject(error) : resolve(result));
  });
  try {
    await once(httpServer, 'listening', { signal: AbortSignal.timeout(10000) });
    const browser = request.agent(httpServer);
    const login = await browser.post('/api/auth/login').send({ email: user.email, password });
    assert.equal(login.status, 200);
    assert(login.headers['set-cookie'].some(cookie => cookie.includes('HttpOnly')));
    const originalCookie = login.headers['set-cookie'][0].split(';')[0];
    const renewed = await browser.post('/api/auth/refresh-token');
    assert.equal(renewed.status, 200);
    assert(renewed.body.accessToken);
    assert.equal((await request(httpServer).post('/api/auth/refresh-token').set('Cookie', originalCookie)).status, 401);
    assert.equal((await browser.get('/api/users/me').set('Authorization', `Bearer ${renewed.body.accessToken}`)).status, 200);

    const sender = await open(renewed.body.accessToken);
    const receiver = await open(renewed.body.accessToken);
    const delivered = once(receiver, 'chat:message', { signal: AbortSignal.timeout(3000) });
    assert.equal((await send(sender, 'Local delivery regression')).success, true);
    assert.equal((await delivered)[0].message, 'Local delivery regression');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM chat_messages WHERE message = 'Local delivery regression'")).rows[0].count, 1);
    assert.equal((await send(sender, 'x'.repeat(501))).success, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(sender, `Local rate check ${i}`)).success, true);
    assert.equal((await send(sender, 'Rejected rate check')).success, false);

    const expiresSoon = require('jsonwebtoken').sign({ userId }, require('../config/auth').accessToken.secret, { expiresIn: '2s' });
    const expired = await open(expiresSoon);
    await new Promise(resolve => setTimeout(resolve, 2100));
    const expiredResult = await send(expired, 'Expired session should not post');
    assert.equal(expiredResult.success, false);
    assert.match(expiredResult.message, /expired/i);
    const refreshedAgain = await browser.post('/api/auth/refresh-token');
    assert.equal(refreshedAgain.status, 200);
    const reconnected = await open(refreshedAgain.body.accessToken);
    assert.equal((await send(reconnected, 'Reconnected session')).success, true);

    await pool.query('UPDATE users SET active = FALSE WHERE id = $1', [userId]);
    const disabledResult = await send(reconnected, 'Inactive account should not post');
    assert.equal(disabledResult.success, false);
    assert.match(disabledResult.message, /inactive/i);
    assert.equal((await browser.post('/api/auth/refresh-token')).status, 401);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM chat_messages WHERE message LIKE '%should not post' OR message = 'Rejected rate check'")).rows[0].count, 0);
    console.log('PASS: real login/cookie rotation, WebSocket persistence/broadcast, delivery errors, expiry/reconnect, and account deactivation');
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    await pool.query('UPDATE users SET active = TRUE WHERE id = $1', [userId]);
  }
};
