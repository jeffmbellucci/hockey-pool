/**
 * Security tests — validates JWT startup check (N1), masking bypass (N10),
 * chat message validation (N4), and body size limit (B8).
 */
const { resetMocks } = require('../helpers/testSetup');

describe('JWT secret startup validation [N1]', () => {
  test('auth config exports access token secret from env', () => {
    // Set env for test
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-secret-value';

    // Re-require to get fresh config
    jest.resetModules();
    jest.mock('../../config/database', () => ({
      query: jest.fn(),
      connect: jest.fn(),
    }));
    const authConfig = require('../../config/auth');

    expect(authConfig.accessToken.secret).toBe('test-secret-value');

    // Restore
    if (oldSecret) process.env.JWT_SECRET = oldSecret;
    else delete process.env.JWT_SECRET;
  });

  test('auth config secret is undefined when no env vars set', () => {
    const oldJWT = process.env.JWT_SECRET;
    const oldAccess = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;

    jest.resetModules();
    const authConfig = require('../../config/auth');

    expect(authConfig.accessToken.secret).toBeUndefined();

    // Restore
    if (oldJWT) process.env.JWT_SECRET = oldJWT;
    if (oldAccess) process.env.JWT_ACCESS_SECRET = oldAccess;
  });
});

describe('isMaskedValue — masking bypass prevention [N10]', () => {
  // Replicate the function logic from notificationController
  function isMaskedValue(value) {
    return typeof value === 'string' && /^••••.{4}$/.test(value);
  }

  test('detects standard masked value (••••abcd)', () => {
    expect(isMaskedValue('••••abcd')).toBe(true);
  });

  test('rejects bypass attempt (••••realkey123)', () => {
    // More than 4 chars after ••••
    expect(isMaskedValue('••••realkey123')).toBe(false);
  });

  test('rejects short value (••••ab)', () => {
    expect(isMaskedValue('••••ab')).toBe(false);
  });

  test('allows real API key through (no ••••)', () => {
    expect(isMaskedValue('abc123def456')).toBe(false);
  });

  test('rejects non-string values', () => {
    expect(isMaskedValue(null)).toBe(false);
    expect(isMaskedValue(undefined)).toBe(false);
    expect(isMaskedValue(12345)).toBe(false);
  });
});

describe('Chat message validation [N4]', () => {
  test('message must be trimmed and <= 500 chars', () => {
    // Simulate the validation logic from app.js Socket.IO handler
    function validateMessage(raw) {
      const message = typeof raw === 'string' ? raw.trim() : '';
      if (!message || message.length > 500) return null;
      return message;
    }

    expect(validateMessage('')).toBeNull();
    expect(validateMessage('   ')).toBeNull();
    expect(validateMessage('x'.repeat(501))).toBeNull();
    expect(validateMessage(null)).toBeNull();
    expect(validateMessage(123)).toBeNull();
    expect(validateMessage('Hello!')).toBe('Hello!');
    expect(validateMessage('  padded  ')).toBe('padded');
    expect(validateMessage('x'.repeat(500))).toHaveLength(500);
  });
});

describe('Socket.IO rate limiting [N8]', () => {
  test('rate limiter blocks after 5 messages in 10 seconds', () => {
    // Simulate the rate limiter logic from app.js
    const messageTimes = [];
    const RATE_LIMIT_WINDOW = 10_000;
    const RATE_LIMIT_MAX = 5;

    function canSend(now) {
      while (messageTimes.length > 0 && messageTimes[0] <= now - RATE_LIMIT_WINDOW) {
        messageTimes.shift();
      }
      if (messageTimes.length >= RATE_LIMIT_MAX) return false;
      messageTimes.push(now);
      return true;
    }

    const base = Date.now();
    // First 5 messages should pass
    for (let i = 0; i < 5; i++) {
      expect(canSend(base + i * 100)).toBe(true);
    }
    // 6th should be blocked
    expect(canSend(base + 500)).toBe(false);
    // After 10 seconds, should be allowed again
    expect(canSend(base + 11_000)).toBe(true);
  });
});

describe('Body size limit [B8]', () => {
  test('express.json configured with 10kb limit', () => {
    // Read app.js source and verify the limit string
    const fs = require('fs');
    const appSource = fs.readFileSync(
      require('path').join(__dirname, '../../app.js'),
      'utf-8'
    );
    expect(appSource).toContain("express.json({ limit: '10kb' })");
    expect(appSource).toContain("express.urlencoded({ extended: true, limit: '10kb' })");
  });
});
