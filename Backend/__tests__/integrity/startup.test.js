require('../helpers/testSetup');
const mockListen = jest.fn((port, host, ready) => ready());
jest.mock('http', () => ({ ...jest.requireActual('http'), createServer: () => ({ listen: mockListen, close: jest.fn() }) }));
jest.mock('socket.io', () => ({ Server: jest.fn(() => ({ use: jest.fn(), on: jest.fn() })) }));
jest.mock('../../config/runMigrations', () => jest.fn());
jest.mock('../../services/schedulerService', () => ({ start: jest.fn(), stop: jest.fn() }));
const runMigrations = require('../../config/runMigrations');
const scheduler = require('../../services/schedulerService');

// Exercise the real application entry point without opening sockets or running jobs.
test.each([true, false])('startup waits for migrations and fails closed (success=%s)', async success => {
  process.env.JWT_ACCESS_SECRET = 'startup-test-access';
  process.env.JWT_REFRESH_SECRET = 'startup-test-refresh';
  let resolve, reject;
  runMigrations.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
  mockListen.mockClear(); scheduler.start.mockClear();
  const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
  const on = jest.spyOn(process, 'on').mockImplementation(() => process);
  try {
    jest.isolateModules(() => require('../../app'));
    expect(mockListen).not.toHaveBeenCalled();
    expect(scheduler.start).not.toHaveBeenCalled();
    if (success) resolve(); else reject(new Error('migration failed'));
    await new Promise(setImmediate);
    if (success) {
      expect(mockListen).toHaveBeenCalledTimes(1);
      expect(scheduler.start).toHaveBeenCalledTimes(1);
      expect(exit).not.toHaveBeenCalled();
    } else {
      expect(mockListen).not.toHaveBeenCalled();
      expect(scheduler.start).not.toHaveBeenCalled();
      expect(exit).toHaveBeenCalledWith(1);
    }
  } finally { exit.mockRestore(); on.mockRestore(); }
});
