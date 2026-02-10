/**
 * Unit Tests for API Validation Utilities (api/lib/validation.ts)
 * Tests: isValidRaceId, checkRateLimit, constants
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidRaceId,
  checkRateLimit,
  MAX_RACE_ID_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
  VALID_FAULT_TYPES,
} from '../../api/lib/validation';
import type { RateLimitConfig } from '../../api/lib/validation';

describe('API Validation Utilities', () => {
  // ─── Constants ───

  describe('Constants', () => {
    it('should export MAX_RACE_ID_LENGTH as 50', () => {
      expect(MAX_RACE_ID_LENGTH).toBe(50);
    });

    it('should export MAX_DEVICE_NAME_LENGTH as 100', () => {
      expect(MAX_DEVICE_NAME_LENGTH).toBe(100);
    });

    it('should export VALID_FAULT_TYPES with MG, STR, BR', () => {
      expect(VALID_FAULT_TYPES).toEqual(['MG', 'STR', 'BR']);
    });

    it('should have 3 fault types defined', () => {
      expect(VALID_FAULT_TYPES).toHaveLength(3);
    });
  });

  // ─── isValidRaceId ───

  describe('isValidRaceId', () => {
    it('should accept valid alphanumeric race IDs', () => {
      expect(isValidRaceId('RACE001')).toBe(true);
      expect(isValidRaceId('my-race')).toBe(true);
      expect(isValidRaceId('race_2024')).toBe(true);
      expect(isValidRaceId('ABC123')).toBe(true);
      expect(isValidRaceId('a')).toBe(true);
    });

    it('should accept race IDs at max length', () => {
      expect(isValidRaceId('a'.repeat(50))).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidRaceId('')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidRaceId(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidRaceId(undefined)).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValidRaceId(123)).toBe(false);
      expect(isValidRaceId({})).toBe(false);
      expect(isValidRaceId([])).toBe(false);
      expect(isValidRaceId(true)).toBe(false);
    });

    it('should reject IDs longer than 50 chars', () => {
      expect(isValidRaceId('a'.repeat(51))).toBe(false);
    });

    it('should reject IDs with special characters', () => {
      expect(isValidRaceId('race 2024')).toBe(false);
      expect(isValidRaceId('race@2024')).toBe(false);
      expect(isValidRaceId('race/2024')).toBe(false);
      expect(isValidRaceId('race.2024')).toBe(false);
      expect(isValidRaceId('race+2024')).toBe(false);
      expect(isValidRaceId('race#2024')).toBe(false);
    });

    it('should accept IDs with hyphens and underscores', () => {
      expect(isValidRaceId('my-race-2024')).toBe(true);
      expect(isValidRaceId('my_race_2024')).toBe(true);
      expect(isValidRaceId('a-b_c')).toBe(true);
    });
  });

  // ─── checkRateLimit ───

  describe('checkRateLimit', () => {
    const defaultConfig: RateLimitConfig = {
      keyPrefix: 'test',
      window: 60,
      maxRequests: 100,
      maxPosts: 20,
    };

    // Create a mock Redis client
    function createMockRedis(execResult?: [Error | null, unknown][][]) {
      const multi = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(execResult || [[null, 1]]),
      };
      return {
        multi: vi.fn(() => multi),
        _multi: multi,
      };
    }

    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should allow request when count is within GET limit', async () => {
      const redis = createMockRedis([[null, 5]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(95); // 100 - 5
      expect(result.limit).toBe(100);
    });

    it('should allow request when count is within POST limit', async () => {
      const redis = createMockRedis([[null, 3]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'POST', defaultConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(17); // 20 - 3
      expect(result.limit).toBe(20);
    });

    it('should deny request when count exceeds GET limit', async () => {
      const redis = createMockRedis([[null, 101]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(100);
    });

    it('should deny request when count exceeds POST limit', async () => {
      const redis = createMockRedis([[null, 21]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'POST', defaultConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(20);
    });

    it('should allow request at exactly the limit', async () => {
      const redis = createMockRedis([[null, 100]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should call multi with incr and expire', async () => {
      const redis = createMockRedis([[null, 1]]);
      await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(redis.multi).toHaveBeenCalled();
      expect(redis._multi.incr).toHaveBeenCalledWith(expect.stringContaining('ratelimit:test:GET:127.0.0.1:'));
      expect(redis._multi.expire).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:test:GET:127.0.0.1:'),
        70, // window + 10
      );
    });

    it('should use correct key format with IP and window start', async () => {
      const redis = createMockRedis([[null, 1]]);
      await checkRateLimit(redis as any, '192.168.1.1', 'POST', defaultConfig);

      const incrCall = redis._multi.incr.mock.calls[0][0];
      expect(incrCall).toMatch(/^ratelimit:test:POST:192\.168\.1\.1:\d+$/);
    });

    it('should include reset timestamp in response', async () => {
      const redis = createMockRedis([[null, 1]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(typeof result.reset).toBe('number');
      expect(result.reset).toBeGreaterThan(0);
    });

    it('should fail closed on Redis error (deny request)', async () => {
      const multi = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Redis connection lost')),
      };
      const redis = { multi: vi.fn(() => multi) };

      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.error).toBe('Rate limiting unavailable');
    });

    it('should log error on Redis failure', async () => {
      const multi = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      const redis = { multi: vi.fn(() => multi) };

      await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      expect(parsed.level).toBe('error');
      expect(parsed.error).toBe('Connection timeout');
    });

    it('should handle non-Error objects in catch', async () => {
      const multi = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue('string error'),
      };
      const redis = { multi: vi.fn(() => multi) };

      const result = await checkRateLimit(redis as any, '127.0.0.1', 'GET', defaultConfig);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Rate limiting unavailable');
    });

    it('should use different limits for different HTTP methods', async () => {
      const redis1 = createMockRedis([[null, 50]]);
      const redis2 = createMockRedis([[null, 50]]);

      const getResult = await checkRateLimit(redis1 as any, '127.0.0.1', 'GET', defaultConfig);
      const postResult = await checkRateLimit(redis2 as any, '127.0.0.1', 'POST', defaultConfig);

      // GET limit 100, count 50 -> allowed
      expect(getResult.allowed).toBe(true);
      expect(getResult.limit).toBe(100);

      // POST limit 20, count 50 -> denied
      expect(postResult.allowed).toBe(false);
      expect(postResult.limit).toBe(20);
    });

    it('should use DELETE as GET limit (non-POST method)', async () => {
      const redis = createMockRedis([[null, 5]]);
      const result = await checkRateLimit(redis as any, '127.0.0.1', 'DELETE', defaultConfig);

      expect(result.limit).toBe(100); // maxRequests, not maxPosts
      expect(result.allowed).toBe(true);
    });
  });
});
