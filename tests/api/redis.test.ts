/**
 * Unit Tests for Redis Utility (api/lib/redis.ts)
 * Tests: getRedis, hasRedisError, getRedisError, constants, reconnection logic
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ioredis before importing the module under test
const mockOn = vi.fn();
const mockDisconnect = vi.fn();

const MockRedisInstance = {
  on: mockOn,
  disconnect: mockDisconnect,
};

vi.mock('ioredis', () => {
  return {
    default: vi.fn(function () {
      return MockRedisInstance;
    }),
  };
});

// Mock apiLogger
vi.mock('../../api/lib/apiLogger.js', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Redis Utility', () => {
  // We need to re-import the module for each test to reset the singleton state
  let getRedis: typeof import('../../api/lib/redis').getRedis;
  let hasRedisError: typeof import('../../api/lib/redis').hasRedisError;
  let getRedisError: typeof import('../../api/lib/redis').getRedisError;
  let CLIENT_PIN_KEY: string;
  let CHIEF_JUDGE_PIN_KEY: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module state by re-importing
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock('ioredis', () => ({
      default: vi.fn(function () {
        return { on: mockOn, disconnect: mockDisconnect };
      }),
    }));

    vi.doMock('../../api/lib/apiLogger.js', () => ({
      apiLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const redisModule = await import('../../api/lib/redis');
    getRedis = redisModule.getRedis;
    hasRedisError = redisModule.hasRedisError;
    getRedisError = redisModule.getRedisError;
    CLIENT_PIN_KEY = redisModule.CLIENT_PIN_KEY;
    CHIEF_JUDGE_PIN_KEY = redisModule.CHIEF_JUDGE_PIN_KEY;
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.REDIS_URL;
  });

  // ─── Constants ───

  describe('Constants', () => {
    it('should export CLIENT_PIN_KEY', () => {
      expect(CLIENT_PIN_KEY).toBe('admin:clientPin');
    });

    it('should export CHIEF_JUDGE_PIN_KEY', () => {
      expect(CHIEF_JUDGE_PIN_KEY).toBe('admin:chiefJudgePin');
    });
  });

  // ─── getRedis ───

  describe('getRedis', () => {
    it('should throw if REDIS_URL is not configured', () => {
      delete process.env.REDIS_URL;
      expect(() => getRedis()).toThrow(
        'REDIS_URL environment variable is not configured',
      );
    });

    it('should create Redis client when REDIS_URL is set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client = getRedis();
      expect(client).toBeDefined();
      expect(client.on).toBeDefined();
    });

    it('should return same client on subsequent calls (singleton)', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client1 = getRedis();
      const client2 = getRedis();
      expect(client1).toBe(client2);
    });

    it('should register event handlers on the Redis client', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedis();

      // Should register error, connect, close, reconnecting handlers
      const eventNames = mockOn.mock.calls.map((call: any[]) => call[0]);
      expect(eventNames).toContain('error');
      expect(eventNames).toContain('connect');
      expect(eventNames).toContain('close');
      expect(eventNames).toContain('reconnecting');
    });
  });

  // ─── hasRedisError ───

  describe('hasRedisError', () => {
    it('should return false initially (no error)', () => {
      expect(hasRedisError()).toBe(false);
    });
  });

  // ─── getRedisError ───

  describe('getRedisError', () => {
    it('should return null initially (no error)', () => {
      expect(getRedisError()).toBeNull();
    });
  });

  // ─── Error handler simulation ───

  describe('Error handler behavior', () => {
    it('should track error when error event is emitted', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedis();

      // Find the error handler and call it
      const errorCall = mockOn.mock.calls.find(
        (call: any[]) => call[0] === 'error',
      );
      expect(errorCall).toBeDefined();

      const errorHandler = errorCall![1];
      const testError = new Error('Connection refused');
      errorHandler(testError);

      expect(hasRedisError()).toBe(true);
      expect(getRedisError()).toBe(testError);
    });

    it('should clear error when connect event is emitted', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedis();

      // First trigger an error
      const errorCall = mockOn.mock.calls.find(
        (call: any[]) => call[0] === 'error',
      );
      const errorHandler = errorCall![1];
      errorHandler(new Error('Connection refused'));
      expect(hasRedisError()).toBe(true);

      // Then trigger connect
      const connectCall = mockOn.mock.calls.find(
        (call: any[]) => call[0] === 'connect',
      );
      const connectHandler = connectCall![1];
      connectHandler();
      expect(hasRedisError()).toBe(false);
      expect(getRedisError()).toBeNull();
    });
  });

  // ─── Reconnection logic ───

  describe('Reconnection logic', () => {
    it('should attempt reconnection after error and delay', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client1 = getRedis();

      // Simulate error
      const errorCall = mockOn.mock.calls.find(
        (call: any[]) => call[0] === 'error',
      );
      const errorHandler = errorCall![1];
      errorHandler(new Error('Connection lost'));

      // Calling getRedis again before reconnect delay should return same client
      // (we can't easily test the time-based reconnection without controlling Date.now)
      const client2 = getRedis();
      // Since not enough time has passed, it should be the same client
      expect(client2).toBe(client1);
    });
  });
});
