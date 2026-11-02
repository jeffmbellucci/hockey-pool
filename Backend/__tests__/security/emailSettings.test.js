const { mockPool, resetMocks } = require('../helpers/testSetup');
jest.mock('node-mailjet', () => ({ apiConnect: jest.fn() }));
jest.mock('../../services/notificationService', () => ({ rescheduleAllFutureNotifications: jest.fn().mockResolvedValue() }));
const mailjet = require('node-mailjet');
const email = require('../../services/emailService');
const controller = require('../../controllers/notificationController');
const saved = { enabled: false, mailjet_api_key: 'public-key-1234', mailjet_api_secret: 'private-secret-5678', from_email: 'sender@example.test', from_name: 'Pool' };
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
beforeEach(() => { resetMocks(); jest.clearAllMocks(); process.env.EMAIL_ENABLED = 'false'; });
afterEach(() => { delete process.env.EMAIL_ENABLED; });

test('saving twice preserves credentials and both responses mask keys', async () => {
  mockPool.query.mockResolvedValue({ rows: [saved] });
  const first = response();
  await controller.updateEmailSettings({ body: saved }, first);
  const settings = first.json.mock.calls[0][0].settings;
  expect(settings.mailjet_api_key).toBe('••••1234');
  expect(settings.mailjet_api_secret).toBe('••••5678');
  expect(settings.delivery_disabled).toBe(true);
  mockPool.query.mockClear();
  await controller.updateEmailSettings({ body: settings }, response());
  expect(mockPool.query.mock.calls[0][0]).not.toContain('mailjet_api');
  const get = response();
  await controller.getEmailSettings({}, get);
  expect(get.json.mock.calls[0][0].settings).toEqual(settings);
});

test('legacy masked secrets are preserved and invalid settings are rejected', async () => {
  mockPool.query.mockResolvedValue({ rows: [saved] });
  await controller.updateEmailSettings({ body: { from_name: 'Pool', mailjet_api_secret: '***********' } }, response());
  expect(mockPool.query.mock.calls[0][0]).not.toContain('mailjet_api_secret');
  mockPool.query.mockClear();
  for (const body of [{ enabled: 'false' }, { from_email: 'invalid' }, { app_url: 'javascript:alert(1)' }, { reminder_night_before_time: '25:00' }]) {
    const res = response();
    await controller.updateEmailSettings({ body }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(mockPool.query).not.toHaveBeenCalled();
});

test('configuration check uses Mailjet sandbox while delivery is disabled and does not enable sending', async () => {
  mockPool.query.mockResolvedValue({ rows: [{ ...saved, enabled: false }] });
  const request = jest.fn().mockResolvedValue({ body: { Messages: [{ Status: 'success' }] } });
  mailjet.apiConnect.mockReturnValue({ post: jest.fn(() => ({ request })) });
  await email.initialize();
  const res = response();
  await controller.sendTestEmail({ body: { email: 'recipient@example.test', sandbox: true } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ SandboxMode: true }));
  expect(email.isReady()).toBe(false);
  const blocked = response();
  await controller.sendTestEmail({ body: { email: 'recipient@example.test' } }, blocked);
  expect(blocked.status).toHaveBeenCalledWith(400);
  expect(request).toHaveBeenCalledTimes(1);
});

test('Mailjet message-level rejection is never reported as sent', async () => {
  const client = { post: () => ({ request: async () => ({ body: { Messages: [{ Status: 'error' }] } }) }) };
  await expect(email.sendMessage({ Subject: 'Test' }, client)).rejects.toThrow('Mailjet rejected');
  client.post = () => ({ request: async () => { throw new Error('provider-private-credential'); } });
  await expect(email.sendMessage({ Subject: 'Test' }, client)).rejects.toThrow('Mailjet request failed. Check your API keys, verified sender, and Mailjet account status.');
});

test('pausing with null or empty credentials succeeds without changing keys or contacting Mailjet', async () => {
  mockPool.query.mockResolvedValue({ rows: [{ ...saved, mailjet_api_key: null, mailjet_api_secret: null }] });
  for (const credential of [null, '', '   ']) {
    const res = response();
    await controller.updateEmailSettings({ body: { enabled: false, mailjet_api_key: credential, mailjet_api_secret: credential } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, settings: expect.objectContaining({ enabled: false, credentials_configured: false }) }));
  }
  expect(mockPool.query.mock.calls.every(([sql]) => !sql.includes('mailjet_api_key ='))).toBe(true);
  expect(mailjet.apiConnect).not.toHaveBeenCalled();
});

test.each([['Active', 'Inactive', true], ['Inactive', 'Active', true], ['Inactive', 'Inactive', false]])('connection checks support address and domain verification without sending (%s/%s)', async (addressStatus, domainStatus, verified) => {
  mockPool.query.mockResolvedValue({ rows: [saved] });
  const post = jest.fn();
  mailjet.apiConnect.mockReturnValue({ post, get: () => ({
    request: async () => ({ body: { Data: [] } }),
    id: address => ({ request: async () => ({ body: { Data: [{ Status: address.startsWith('*@') ? domainStatus : addressStatus }] } }) }),
  }) });
  const res = response();
  await controller.checkConnection({}, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ connection: expect.objectContaining({ connected: true, sender_verified: verified }) }));
  expect(post).not.toHaveBeenCalled();
});

test('connection errors cannot leak provider credentials and a missing sender stays unverified', async () => {
  mockPool.query.mockResolvedValue({ rows: [saved] });
  mailjet.apiConnect.mockReturnValue({ get: () => ({ request: async () => { throw new Error('private-secret-5678'); } }) });
  const res = response();
  await controller.checkConnection({}, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-secret');
  mailjet.apiConnect.mockReturnValue({ get: () => ({ request: async () => ({}),
    id: () => ({ request: async () => { throw { statusCode: 404 }; } }),
  }) });
  expect((await email.checkConnection()).sender_verified).toBe(false);
});

test('an explicit test sends while automation is paused without enabling the service', async () => {
  process.env.EMAIL_ENABLED = 'true';
  mockPool.query.mockResolvedValue({ rows: [saved] });
  await email.initialize();
  const request = jest.fn().mockResolvedValue({ body: { Messages: [{ Status: 'success' }] } });
  mailjet.apiConnect.mockReturnValue({ post: () => ({ request }) });
  await controller.sendTestEmail({ body: { email: 'recipient@example.test' } }, response());
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ SandboxMode: false }));
  expect(email.isReady()).toBe(false);
  expect(mockPool.query.mock.calls.every(([sql]) => !sql.includes('UPDATE'))).toBe(true);
});

test('enabling requires a verified sender and honors server delivery controls', async () => {
  const blocked = response();
  await controller.updateEmailSettings({ body: { enabled: true } }, blocked);
  expect(blocked.status).toHaveBeenCalledWith(400);
  expect(mockPool.query).not.toHaveBeenCalled();
  process.env.EMAIL_ENABLED = 'true';
  mockPool.query.mockResolvedValue({ rows: [saved] });
  const check = jest.spyOn(email, 'checkConnection').mockResolvedValue({ sender_verified: false });
  try {
    const invalid = response();
    await controller.updateEmailSettings({ body: { enabled: true } }, invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);
    expect(mockPool.query.mock.calls.every(([sql]) => !sql.includes('UPDATE'))).toBe(true);
    check.mockResolvedValue({ sender_verified: true });
    const ready = response();
    await controller.updateEmailSettings({ body: { enabled: true } }, ready);
    expect(ready.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  } finally { check.mockRestore(); }
});
