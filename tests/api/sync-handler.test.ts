/**
 * API Tests - Sync Endpoint (api/v1/sync.ts)
 *
 * Tests GET (fetch entries), POST (submit entry), DELETE (remove entry).
 * Covers: race ID validation, auth, entry validation, tombstone detection,
 * pagination, device heartbeat, error paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================
// Mock Dependencies
// ============================================

const mockMultiResult = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([[null, 1]]),
};

const mockRedisClient = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hset: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  hdel: vi.fn().mockResolvedValue(1),
  smembers: vi.fn().mockResolvedValue([]),
  sadd: vi.fn().mockResolvedValue(1),
  multi: vi.fn(() => mockMultiResult),
  watch: vi.fn().mockResolvedValue('OK'),
  unwatch: vi.fn().mockResolvedValue('OK'),
  expire: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
};

vi.mock('../../api/lib/redis.js', () => ({
  getRedis: vi.fn(() => mockRedisClient),
  hasRedisError: vi.fn(() => false),
  CLIENT_PIN_KEY: 'admin:clientPin',
}));

vi.mock('../../api/lib/jwt.js', () => ({
  validateAuth: vi
    .fn()
    .mockResolvedValue({
      valid: true,
      method: 'jwt',
      payload: { role: 'timer' },
    }),
}));

vi.mock('../../api/lib/validation.js', () => ({
  isValidRaceId: vi.fn(
    (id: string) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 50,
  ),
  isValidEntry: vi.fn((entry: any) => {
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.id !== 'string' && typeof entry.id !== 'number')
      return false;
    if (typeof entry.id === 'string' && entry.id.length === 0) return false;
    if (typeof entry.id === 'number' && entry.id <= 0) return false;
    if (!['S', 'F'].includes(entry.point)) return false;
    if (!entry.timestamp || isNaN(Date.parse(entry.timestamp))) return false;
    if (
      entry.status &&
      !['ok', 'dns', 'dnf', 'dsq', 'flt'].includes(entry.status)
    )
      return false;
    return true;
  }),
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({
      allowed: true,
      remaining: 99,
      reset: 9999,
      limit: 100,
    }),
  MAX_DEVICE_NAME_LENGTH: 100,
  VALID_FAULT_TYPES: ['MG', 'STR', 'BR'],
}));

vi.mock('../../api/lib/atomicOps.js', () => ({
  atomicUpdate: vi.fn(
    async (
      _client: any,
      _key: any,
      defaultData: any,
      updateFn: any,
      _name: string,
    ) => {
      const outcome = updateFn(JSON.parse(JSON.stringify(defaultData)));
      if (outcome.abort) return outcome.result;
      return outcome.result;
    },
  ),
  CACHE_EXPIRY_SECONDS: 86400,
  MAX_ATOMIC_RETRIES: 5,
}));

// Response mock: simple vi.fn() stubs. The handler's return value is void,
// so these just need to be callable without error.
vi.mock('../../api/lib/response.js', () => ({
  handlePreflight: vi.fn((req: any, res: any) => {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return true;
    }
    return false;
  }),
  sendSuccess: vi.fn(),
  sendError: vi.fn(),
  sendBadRequest: vi.fn(),
  sendMethodNotAllowed: vi.fn(),
  sendServiceUnavailable: vi.fn(),
  sendRateLimitExceeded: vi.fn(),
  sendAuthRequired: vi.fn(),
  setRateLimitHeaders: vi.fn(),
  getClientIP: vi.fn(() => '127.0.0.1'),
  sanitizeString: vi.fn((str: unknown, maxLen: number) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .slice(0, maxLen)
      .replace(/[<>&]/g, '')
      .replace(/[\x00-\x1f\x7f]/g, '');
  }),
  safeJsonParse: vi.fn((str: string | null, defaultValue: any) => {
    if (str === null || str === undefined || str === '') return defaultValue;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }),
  generateETag: vi.fn(() => '"mock-etag"'),
  checkIfNoneMatch: vi.fn(() => false),
}));

vi.mock('../../api/lib/apiLogger.js', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withRequestId: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  getRequestId: vi.fn(() => 'test-req-id'),
}));

import { validateAuth } from '../../api/lib/jwt.js';
import { getRedis, hasRedisError } from '../../api/lib/redis.js';
import {
  safeJsonParse,
  sendAuthRequired,
  sendBadRequest,
  sendError,
  sendMethodNotAllowed,
  sendRateLimitExceeded,
  sendServiceUnavailable,
  sendSuccess,
} from '../../api/lib/response.js';
import { checkRateLimit } from '../../api/lib/validation.js';
import handler from '../../api/v1/sync';

// ============================================
// Helpers
// ============================================

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

function makeReq(
  method: string,
  query: Record<string, any> = {},
  body: any = null,
  headers: Record<string, string> = {},
) {
  return { method, query, body, headers } as any;
}

function validEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'entry-1',
    bib: '001',
    point: 'S',
    timestamp: new Date().toISOString(),
    status: 'ok',
    run: 1,
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('API: /api/v1/sync', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = createMockRes();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.hgetall.mockResolvedValue({});
    mockRedisClient.smembers.mockResolvedValue([]);
    mockRedisClient.sadd.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(1);
    mockRedisClient.hset.mockResolvedValue(1);
    mockMultiResult.exec.mockResolvedValue([[null, 1]]);
    vi.mocked(validateAuth).mockResolvedValue({
      valid: true,
      method: 'jwt',
      payload: { role: 'timer' },
    });
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 99,
      reset: 9999,
      limit: 100,
    });
  });

  // ─── CORS Preflight ───

  describe('OPTIONS', () => {
    it('should handle preflight', async () => {
      await handler(makeReq('OPTIONS', { raceId: 'test' }), mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ─── Race ID Validation ───

  describe('Race ID Validation', () => {
    it('should return 400 when raceId is missing', async () => {
      await handler(makeReq('GET', {}), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'raceId is required',
      );
    });

    it('should return 400 for invalid raceId format', async () => {
      const { isValidRaceId } = await import('../../api/lib/validation.js');
      vi.mocked(isValidRaceId).mockReturnValueOnce(false);
      await handler(
        makeReq('GET', { raceId: 'invalid race!' }),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Invalid raceId'),
      );
    });
  });

  // ─── Redis Errors ───

  describe('Redis Errors', () => {
    it('should return 503 when Redis init fails', async () => {
      vi.mocked(getRedis).mockImplementationOnce(() => {
        throw new Error('No Redis');
      });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database service unavailable',
      );
    });

    it('should return 503 when Redis has recent error', async () => {
      vi.mocked(hasRedisError).mockReturnValueOnce(true);
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database connection issue. Please try again.',
      );
    });
  });

  // ─── Rate Limiting ───

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        reset: 9999,
        limit: 100,
      });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendRateLimitExceeded).toHaveBeenCalled();
    });
  });

  // ─── Auth ───

  describe('Authentication', () => {
    it('should return 401 when auth fails', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({
        valid: false,
        error: 'Auth required',
        expired: false,
      });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendAuthRequired).toHaveBeenCalledWith(
        expect.anything(),
        'Auth required',
        false,
      );
    });

    it('should pass expired flag', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({
        valid: false,
        error: 'Token expired',
        expired: true,
      });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendAuthRequired).toHaveBeenCalledWith(
        expect.anything(),
        'Token expired',
        true,
      );
    });
  });

  // ─── GET ───

  describe('GET /api/v1/sync', () => {
    it('should return entries via sendSuccess', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entries: [],
          lastUpdated: null,
          total: 0,
          deviceCount: 0,
          highestBib: 0,
        }),
      );
    });

    it('should detect tombstone (deleted race)', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.includes(':deleted'))
          return Promise.resolve(
            JSON.stringify({ deletedAt: 999, message: 'Race deleted' }),
          );
        return Promise.resolve(null);
      });
      vi.mocked(safeJsonParse).mockReturnValueOnce({
        deletedAt: 999,
        message: 'Race deleted',
      });

      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          deleted: true,
        }),
      );
    });

    it('should handle checkOnly query', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      vi.mocked(safeJsonParse)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null);

      await handler(
        makeReq('GET', { raceId: 'test', checkOnly: 'true' }),
        mockRes as any,
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          exists: false,
          entryCount: 0,
        }),
      );
    });

    it('should return entries from Redis data', async () => {
      const raceData = {
        entries: [
          {
            id: '1',
            bib: '001',
            point: 'S',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
        lastUpdated: 12345,
      };
      // Redis returns null for tombstone key, and JSON for race key
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.includes(':deleted')) return Promise.resolve(null);
        if (key === 'race:test')
          return Promise.resolve(JSON.stringify(raceData));
        return Promise.resolve(null);
      });

      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          total: 1,
          lastUpdated: 12345,
        }),
      );
    });
  });

  // ─── POST ───

  describe('POST /api/v1/sync', () => {
    it('should return 400 when entry is missing', async () => {
      // tombstone check must return falsy
      vi.mocked(safeJsonParse).mockReturnValueOnce(null);
      await handler(
        makeReq('POST', { raceId: 'test' }, { deviceId: 'd1' }),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'entry is required',
      );
    });

    it('should return 400 for invalid entry format', async () => {
      vi.mocked(safeJsonParse).mockReturnValueOnce(null);
      const invalidEntry = { id: '', point: 'X', timestamp: 'invalid' };
      await handler(
        makeReq(
          'POST',
          { raceId: 'test' },
          { entry: invalidEntry, deviceId: 'd1' },
        ),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Invalid entry'),
      );
    });

    it('should accept valid entry and return success', async () => {
      vi.mocked(safeJsonParse).mockReturnValueOnce(null); // tombstone
      const entry = validEntry();
      await handler(
        makeReq(
          'POST',
          { raceId: 'test' },
          { entry, deviceId: 'dev1', deviceName: 'Test Device' },
        ),
        mockRes as any,
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it('should detect tombstone on POST', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.includes(':deleted'))
          return Promise.resolve(JSON.stringify({ deletedAt: 999 }));
        return Promise.resolve(null);
      });
      vi.mocked(safeJsonParse).mockReturnValueOnce({ deletedAt: 999 });

      const entry = validEntry();
      await handler(
        makeReq('POST', { raceId: 'test' }, { entry }),
        mockRes as any,
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          deleted: true,
        }),
      );
    });

    it('should validate entry ID is present', async () => {
      vi.mocked(safeJsonParse).mockReturnValueOnce(null);
      const entry = {
        bib: '001',
        point: 'S',
        timestamp: new Date().toISOString(),
      };
      await handler(
        makeReq('POST', { raceId: 'test' }, { entry }),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Invalid entry'),
      );
    });

    it('should validate entry point is S or F', async () => {
      vi.mocked(safeJsonParse).mockReturnValueOnce(null);
      const entry = {
        id: '1',
        bib: '001',
        point: 'X',
        timestamp: new Date().toISOString(),
      };
      await handler(
        makeReq('POST', { raceId: 'test' }, { entry }),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Invalid entry'),
      );
    });
  });

  // ─── DELETE ───

  describe('DELETE /api/v1/sync', () => {
    it('should return 400 when entryId is missing', async () => {
      await handler(makeReq('DELETE', { raceId: 'test' }, {}), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'entryId is required',
      );
    });

    it('should return 400 when body is null', async () => {
      await handler(
        makeReq('DELETE', { raceId: 'test' }, null),
        mockRes as any,
      );
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'entryId is required',
      );
    });

    it('should delete entry and return success', async () => {
      await handler(
        makeReq(
          'DELETE',
          { raceId: 'test' },
          { entryId: 'entry-1', deviceId: 'dev1' },
        ),
        mockRes as any,
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
          entryId: 'entry-1',
        }),
      );
    });

    it('should track deleted entry in Redis set', async () => {
      await handler(
        makeReq(
          'DELETE',
          { raceId: 'test' },
          { entryId: 'entry-1', deviceId: 'dev1' },
        ),
        mockRes as any,
      );
      expect(mockRedisClient.sadd).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });
  });

  // ─── Unsupported Methods ───

  describe('Unsupported Methods', () => {
    it('should return 405 for PUT', async () => {
      await handler(makeReq('PUT', { raceId: 'test' }), mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });

    it('should return 405 for PATCH', async () => {
      await handler(makeReq('PATCH', { raceId: 'test' }), mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Unexpected failure'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        'Internal server error',
        500,
      );
    });

    it('should return 503 on ECONNREFUSED', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database connection failed. Please try again.',
      );
    });

    it('should return 503 on ETIMEDOUT', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('ETIMEDOUT'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database connection failed. Please try again.',
      );
    });
  });

  // ─── Race ID Normalization ───

  describe('Race ID Normalization', () => {
    it('should normalize race ID to lowercase', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await handler(makeReq('GET', { raceId: 'MY-RACE' }), mockRes as any);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('my-race'),
      );
    });
  });
});
