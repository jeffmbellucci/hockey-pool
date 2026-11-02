// Local integration fixture. Mail delivery is replaced; no provider requests are made.
const assert = require('node:assert/strict');
module.exports = async (pool, app, token, userId) => {
  const request = require('supertest');
  const notifications = require('../services/notificationService');
  const email = require('../services/emailService');
  const paused = await request(app).put('/notifications/settings').set('Authorization', `Bearer ${token}`)
    .send({ enabled: false, mailjet_api_key: null, mailjet_api_secret: '' });
  assert.equal(paused.status, 200, paused.body.message);
  assert.equal(paused.body.settings.enabled, false);
  assert.equal(paused.body.settings.credentials_configured, false);
  const connection = await request(app).post('/notifications/connection').set('Authorization', `Bearer ${token}`);
  assert.equal(connection.status, 400);
  assert.match(connection.body.message, /Save your Mailjet/);

  const { rows: [contest] } = await pool.query(`INSERT INTO contests
    (contest_name, season_year, contest_type, status, phase, current_week)
    VALUES ('Email integration', '2036-37', 'survivor', 'in_progress', 'regular_season', 2) RETURNING contest_id`);
  const id = contest.contest_id;
  const originalReady = email.isReady;
  const originalSend = email.sendPickReminder;
  const originalSchedule = notifications.scheduleWeekNotifications;
  try {
    await pool.query(`INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, lock_time)
      VALUES ($1, 1, CURRENT_DATE - 7, CURRENT_DATE - 1, NOW() - INTERVAL '1 hour'),
             ($1, 2, CURRENT_DATE, CURRENT_DATE + 6, NOW() + INTERVAL '1 day')`, [id]);
    await pool.query(`INSERT INTO survivor_participants (contest_id, user_id, participant_name)
      VALUES ($1, $2, 'Trial participant')`, [id, userId]);
    await pool.query(`INSERT INTO survivor_notifications (contest_id, week_number, notification_type, scheduled_time, status)
      VALUES ($1, 1, 'two_hours_before', NOW() - INTERVAL '3 hours', 'pending'),
             ($1, 2, 'night_before', NOW() - INTERVAL '1 minute', 'pending')`, [id]);
    const sent = [];
    email.isReady = () => true;
    email.sendPickReminder = async (...args) => { sent.push(args); return true; };
    await notifications.processPendingNotifications();
    assert.equal(sent.length, 1);
    assert.equal(sent[0][1], 'Trial participant');
    assert.equal(sent[0][3], 2);
    const { rows } = await pool.query('SELECT week_number, status, recipients_count FROM survivor_notifications WHERE contest_id = $1 ORDER BY week_number', [id]);
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[1].status, 'sent');
    assert.equal(rows[1].recipients_count, 1);

    await pool.query("UPDATE survivor_notifications SET status = 'pending' WHERE contest_id = $1", [id]);
    await pool.query("UPDATE contests SET status = 'waiting' WHERE contest_id = $1", [id]);
    await notifications.processPendingNotifications();
    assert.equal(sent.length, 1, 'Waiting contests must not send reminders');
    await pool.query("UPDATE contests SET status = 'in_progress' WHERE contest_id = $1", [id]);
    const scheduled = [];
    notifications.scheduleWeekNotifications = async (...args) => scheduled.push(args);
    await notifications.rescheduleAllFutureNotifications();
    assert(scheduled.some(([contestId, week]) => contestId === id && week === 2));
    assert(!scheduled.some(([contestId, week]) => contestId === id && week === 1));
    console.log('PASS: null credentials can pause email; reminder recipients, expired deadlines, waiting contests, and resume scheduling');
  } finally {
    email.isReady = originalReady;
    email.sendPickReminder = originalSend;
    notifications.scheduleWeekNotifications = originalSchedule;
    await pool.query('DELETE FROM contests WHERE contest_id = $1', [id]);
  }
};
