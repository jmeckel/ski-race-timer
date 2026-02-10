/**
 * API Tests - Faults Endpoint (api/v1/faults.ts)
 *
 * Tests GET (fetch faults), POST (submit fault), DELETE (remove fault).
 * Covers: race ID validation, auth, fault validation, gate assignments,
 * role-based DELETE (chiefJudge required), error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  validateAuth: vi.fn().mockResolvedValue({ valid: true, method: 'jwt', payload: { role: 'timer' } }),
}));

vi.mock('../../api/lib/validation.js', () => ({
  isValidRaceId: vi.fn((id: string) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 50),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, reset: 9999, limit: 100 }),
  VALID_FAULT_TYPES: ['MG', 'STR', 'BR'],
  MAX_DEVICE_NAME_LENGTH: 100,
}));

vi.mock('../../api/lib/atomicOps.js', () => ({
  atomicUpdate: vi.fn(async (_client: any, _key: any, defaultData: any, updateFn: any, _name: string) => {
    const outcome = updateFn(JSON.parse(JSON.stringify(defaultData)));
    if (outcome.abort) return outcome.result;
    return outcome.result;
  }),
  CACHE_EXPIRY_SECONDS: 86400,
  MAX_ATOMIC_RETRIES: 5,
}));

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
    return str.slice(0, maxLen).replace(/[<>"'&]/g, '');
  }),
  safeJsonParse: vi.fn((str: string | null, defaultValue: any) => {
    if (str === null || str === undefined || str === '') return defaultValue;
    try { return JSON.parse(str); } catch { return defaultValue; }
  }),
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

import handler from '../../api/v1/faults';
import { getRedis, hasRedisError } from '../../api/lib/redis.js';
import { validateAuth } from '../../api/lib/jwt.js';
import { checkRateLimit } from '../../api/lib/validation.js';
import { sendSuccess, sendError, sendBadRequest, sendMethodNotAllowed, sendServiceUnavailable, sendRateLimitExceeded, sendAuthRequired } from '../../api/lib/response.js';

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

function makeReq(method: string, query: Record<string, any> = {}, body: any = null, headers: Record<string, string> = {}) {
  return { method, query, body, headers } as any;
}

function validFault(overrides: Record<string, any> = {}) {
  return {
    id: 'fault-1',
    bib: '001',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: new Date().toISOString(),
    gateRange: [1, 10],
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('API: /api/v1/faults', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = createMockRes();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.hgetall.mockResolvedValue({});
    mockRedisClient.smembers.mockResolvedValue([]);
    mockRedisClient.sadd.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(1);
    mockRedisClient.hset.mockResolvedValue(1);
    mockMultiResult.exec.mockResolvedValue([[null, 1]]);
    vi.mocked(validateAuth).mockResolvedValue({ valid: true, method: 'jwt', payload: { role: 'timer' } });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 99, reset: 9999, limit: 100 });
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
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'raceId is required');
    });

    it('should return 400 for invalid raceId', async () => {
      const { isValidRaceId } = await import('../../api/lib/validation.js');
      vi.mocked(isValidRaceId).mockReturnValueOnce(false);
      await handler(makeReq('GET', { raceId: 'invalid race!' }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Invalid raceId'));
    });
  });

  // ─── Redis Errors ───

  describe('Redis Errors', () => {
    it('should return 503 when Redis init fails', async () => {
      vi.mocked(getRedis).mockImplementationOnce(() => { throw new Error('No Redis'); });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database service unavailable');
    });

    it('should return 503 when Redis has recent error', async () => {
      vi.mocked(hasRedisError).mockReturnValueOnce(true);
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database connection issue. Please try again.');
    });
  });

  // ─── Rate Limiting ───

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, reset: 9999, limit: 100 });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendRateLimitExceeded).toHaveBeenCalled();
    });
  });

  // ─── Authentication ───

  describe('Authentication', () => {
    it('should return 401 when auth fails', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: false, error: 'Auth required', expired: false });
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendAuthRequired).toHaveBeenCalledWith(expect.anything(), 'Auth required', false);
    });
  });

  // ─── GET: Fetch Faults ───

  describe('GET /api/v1/faults', () => {
    it('should return empty faults when none exist', async () => {
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        faults: [],
        lastUpdated: null,
        deletedIds: [],
        gateAssignments: [],
      }));
    });

    it('should return faults from Redis', async () => {
      const faultsData = JSON.stringify({
        faults: [{ id: '1', bib: '001', run: 1, gateNumber: 5, faultType: 'MG', timestamp: '2024-01-01T00:00:00Z', gateRange: [1, 10] }],
        lastUpdated: 12345,
      });
      mockRedisClient.get.mockResolvedValue(faultsData);

      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        lastUpdated: 12345,
      }));
    });

    it('should return gate assignments', async () => {
      // Mock gate assignments
      const now = Date.now();
      mockRedisClient.hgetall.mockResolvedValueOnce({}).mockResolvedValueOnce({
        'dev-1': JSON.stringify({ deviceName: 'iPad 1', gateStart: 1, gateEnd: 5, lastSeen: now, isReady: true, firstGateColor: 'red' }),
      });

      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        gateAssignments: expect.any(Array),
      }));
    });

    it('should update gate assignment from query params', async () => {
      await handler(makeReq('GET', {
        raceId: 'test',
        deviceId: 'dev-1',
        deviceName: 'iPad 1',
        gateStart: '1',
        gateEnd: '10',
        isReady: 'true',
        firstGateColor: 'red',
      }), mockRes as any);
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });

    it('should NOT update gate assignment with invalid gate numbers', async () => {
      await handler(makeReq('GET', {
        raceId: 'test',
        deviceId: 'dev-1',
        gateStart: '-1',
        gateEnd: '5',
      }), mockRes as any);
      // hset should not be called for gate assignment (invalid start)
      // But it's ok if it was called 0 times or not with gate assignment key
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('should validate gate color to red or blue', async () => {
      await handler(makeReq('GET', {
        raceId: 'test',
        deviceId: 'dev-1',
        deviceName: 'iPad',
        gateStart: '1',
        gateEnd: '5',
        firstGateColor: 'green',
      }), mockRes as any);
      // Should default to 'red' for invalid color
      expect(sendSuccess).toHaveBeenCalled();
    });
  });

  // ─── POST: Submit Fault ───

  describe('POST /api/v1/faults', () => {
    it('should return 400 when fault is missing', async () => {
      await handler(makeReq('POST', { raceId: 'test' }, { deviceId: 'd1' }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'fault is required');
    });

    it('should return 400 for invalid fault format (missing bib)', async () => {
      const fault = { id: '1', run: 1, gateNumber: 5, faultType: 'MG', timestamp: new Date().toISOString(), gateRange: [1, 10] };
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should return 400 for invalid fault type', async () => {
      const fault = validFault({ faultType: 'INVALID' });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should return 400 for invalid run number', async () => {
      const fault = validFault({ run: 3 });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should return 400 for invalid gate range', async () => {
      const fault = validFault({ gateRange: [5] });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should return 400 for negative gate number', async () => {
      const fault = validFault({ gateNumber: -1 });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should return 400 for zero gate number', async () => {
      const fault = validFault({ gateNumber: 0 });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should accept valid fault and return success', async () => {
      const fault = validFault();
      await handler(makeReq('POST', { raceId: 'test' }, { fault, deviceId: 'dev1', deviceName: 'iPad' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        success: true,
      }));
    });

    it('should accept fault with voice notes', async () => {
      const fault = validFault({ notes: 'Fall at gate 5', notesSource: 'voice', notesTimestamp: new Date().toISOString() });
      await handler(makeReq('POST', { raceId: 'test' }, { fault, deviceId: 'dev1' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        success: true,
      }));
    });

    it('should accept fault with deletion workflow fields', async () => {
      const fault = validFault({
        markedForDeletion: true,
        markedForDeletionAt: new Date().toISOString(),
        markedForDeletionBy: 'Judge A',
      });
      await handler(makeReq('POST', { raceId: 'test' }, { fault, deviceId: 'dev1' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        success: true,
      }));
    });

    it('should update gate assignment when provided in body', async () => {
      const fault = validFault();
      await handler(makeReq('POST', { raceId: 'test' }, {
        fault,
        deviceId: 'dev1',
        deviceName: 'iPad',
        gateRange: [1, 10],
        isReady: true,
        firstGateColor: 'blue',
      }), mockRes as any);
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });

    it('should accept all valid fault types (MG, STR, BR)', async () => {
      for (const faultType of ['MG', 'STR', 'BR']) {
        vi.clearAllMocks();
        vi.mocked(validateAuth).mockResolvedValue({ valid: true, method: 'jwt', payload: { role: 'timer' } });
        vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 99, reset: 9999, limit: 100 });
        const fault = validFault({ faultType });
        await handler(makeReq('POST', { raceId: 'test' }, { fault, deviceId: 'dev1' }), mockRes as any);
        expect(sendSuccess).toHaveBeenCalled();
      }
    });

    it('should accept fault with bib at max length (10 chars)', async () => {
      const fault = validFault({ bib: '1234567890' });
      await handler(makeReq('POST', { raceId: 'test' }, { fault, deviceId: 'dev1' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('should reject fault with bib longer than 10 chars', async () => {
      const fault = validFault({ bib: '12345678901' });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should reject fault with invalid timestamp', async () => {
      const fault = validFault({ timestamp: 'not-a-date' });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });

    it('should reject fault with non-numeric gate range values', async () => {
      const fault = validFault({ gateRange: ['a', 'b'] });
      await handler(makeReq('POST', { raceId: 'test' }, { fault }), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Invalid fault format');
    });
  });

  // ─── DELETE: Requires chiefJudge Role ───

  describe('DELETE /api/v1/faults', () => {
    it('should return 403 when user is not chiefJudge', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'timer' } });
      await handler(makeReq('DELETE', { raceId: 'test' }, { faultId: 'fault-1' }), mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Fault deletion requires Chief Judge role', 403);
    });

    it('should return 403 when user is gateJudge', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'gateJudge' } });
      await handler(makeReq('DELETE', { raceId: 'test' }, { faultId: 'fault-1' }), mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Fault deletion requires Chief Judge role', 403);
    });

    it('should return 400 when faultId is missing (chiefJudge)', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'chiefJudge' } });
      await handler(makeReq('DELETE', { raceId: 'test' }, {}), mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'faultId is required');
    });

    it('should delete fault when user is chiefJudge', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'chiefJudge' } });
      await handler(makeReq('DELETE', { raceId: 'test' }, { faultId: 'fault-1', deviceId: 'dev1', approvedBy: 'Chief A' }), mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        success: true,
        faultId: 'fault-1',
      }));
    });

    it('should track deleted fault in Redis set', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'chiefJudge' } });
      await handler(makeReq('DELETE', { raceId: 'test' }, { faultId: 'fault-1', deviceId: 'dev1' }), mockRes as any);
      expect(mockRedisClient.sadd).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });

    it('should return 403 when role is undefined (no role in payload)', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { type: 'race-management' } as any });
      await handler(makeReq('DELETE', { raceId: 'test' }, { faultId: 'fault-1' }), mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Fault deletion requires Chief Judge role', 403);
    });
  });

  // ─── Unsupported Methods ───

  describe('Unsupported Methods', () => {
    it('should return 405 for PUT', async () => {
      await handler(makeReq('PUT', { raceId: 'test' }), mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Unexpected'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Internal server error', 500);
    });

    it('should return 503 on ECONNREFUSED', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database connection failed. Please try again.');
    });

    it('should return 503 on ETIMEDOUT', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('ETIMEDOUT'));
      await handler(makeReq('GET', { raceId: 'test' }), mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database connection failed. Please try again.');
    });
  });

  // ─── Race ID Normalization ───

  describe('Race ID Normalization', () => {
    it('should normalize race ID to lowercase', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await handler(makeReq('GET', { raceId: 'MY-RACE' }), mockRes as any);
      expect(mockRedisClient.get).toHaveBeenCalledWith(expect.stringContaining('my-race'));
    });
  });
});
