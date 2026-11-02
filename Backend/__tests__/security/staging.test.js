const { mockPool, resetMocks } = require('../helpers/testSetup');
jest.mock('node-mailjet', () => ({ apiConnect: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
const email = require('../../services/emailService');
const scheduler = require('../../services/schedulerService');
const mailjet = require('node-mailjet');
const cron = require('node-cron');

beforeEach(() => { resetMocks(); jest.clearAllMocks(); });
afterEach(() => { delete process.env.EMAIL_ENABLED; delete process.env.SCHEDULER_ENABLED; });

test('staging switches prevent scheduled jobs and outbound email even with copied credentials', async () => {
  process.env.SCHEDULER_ENABLED = 'false';
  process.env.EMAIL_ENABLED = 'false';
  email.settings = { enabled: true }; email.mailjetClient = {};
  expect(email.isReady()).toBe(false);
  expect(await email.initialize()).toBe(false);
  await scheduler.start();
  expect(cron.schedule).not.toHaveBeenCalled();
  expect(mailjet.apiConnect).not.toHaveBeenCalled();
  expect(mockPool.query).not.toHaveBeenCalled();
  await expect(email.sendTestEmail('nobody@example.test', 'Test')).rejects.toThrow('not ready');
});

test('refreshing disabled or incomplete email settings clears the previous client', async () => {
  mockPool.query.mockResolvedValueOnce({ rows: [{ enabled: true, mailjet_api_key: 'fake', mailjet_api_secret: 'fake' }] });
  expect(await email.initialize()).toBe(true);
  expect(email.isReady()).toBe(true);
  mockPool.query.mockResolvedValueOnce({ rows: [{ enabled: true, mailjet_api_key: '', mailjet_api_secret: '' }] });
  expect(await email.initialize()).toBe(false);
  expect(email.isReady()).toBe(false);
});
