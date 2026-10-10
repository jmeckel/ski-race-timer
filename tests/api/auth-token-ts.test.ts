/**
 * API Tests - Auth Token Endpoint (TypeScript source)
 *
 * Tests the actual handler in api/v1/auth/token.ts
 * Covers: POST PIN exchange, role-based tokens, rate limiting,
 * chief judge PIN, legacy hash migration, CORS preflight, error paths
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================
// Mock Dependencies
// ============================================

const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  multi: vi.fn(),
  on: vi.fn(),
};

vi.mock('../../api/lib/redis.js', () => ({
  TOKEN_EPOCH_KEY: 'admin:tokenEpoch',
  getRedis: vi.fn(() => mockRedisClient),
  hasRedisError: vi.fn(() => false),
  CLIENT_PIN_KEY: 'admin:clientPin',
  CHIEF_JUDGE_PIN_KEY: 'admin:chiefJudgePin',
}));

vi.mock('../../api/lib/jwt.js', () => ({
  issueToken: vi.fn(async () => 'mock-jwt-token'),
  validateAuth: vi.fn(async () => ({ valid: true, method: 'none' })),
  hashPin: vi.fn((pin: string) => `hashed:${pin}`),
  verifyPin: vi.fn((pin: string, stored: string) => stored === `hashed:${pin}`),
}));

// Response mock: simple stubs (no chaining through res)
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
  setRateLimitHeaders: vi.fn(),
  getClientIP: vi.fn(() => '127.0.0.1'),
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

import {
  hashPin,
  issueToken,
  validateAuth,
  verifyPin,
} from '../../api/lib/jwt.js';
import { getRedis, hasRedisError } from '../../api/lib/redis.js';
import {
  handlePreflight,
  sendBadRequest,
  sendError,
  sendMethodNotAllowed,
  sendRateLimitExceeded,
  sendServiceUnavailable,
  sendSuccess,
} from '../../api/lib/response.js';
// Import after mocks
import handler from '../../api/v1/auth/token';

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

// ============================================
// Tests
// ============================================

describe('API: /api/v1/auth/token (TypeScript handler)', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = createMockRes();

    // Default: rate limit allows requests
    const mockMulti = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1]]),
    };
    mockRedisClient.multi.mockReturnValue(mockMulti);
    mockRedisClient.get.mockReset().mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
  });

  // ─── CORS Preflight ───

  describe('OPTIONS (CORS Preflight)', () => {
    it('should handle preflight and return early', async () => {
      const req = { method: 'OPTIONS', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(handlePreflight).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ─── Method Validation ───

  describe('Method Validation', () => {
    it('should reject GET requests', async () => {
      const req = { method: 'GET', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalledWith(expect.anything());
    });

    it('should reject PUT requests', async () => {
      const req = { method: 'PUT', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalledWith(expect.anything());
    });

    it('should reject DELETE requests', async () => {
      const req = { method: 'DELETE', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalledWith(expect.anything());
    });
  });

  // ─── Redis Initialization ───

  describe('Redis Initialization', () => {
    it('should return 503 when Redis init throws', async () => {
      vi.mocked(getRedis).mockImplementationOnce(() => {
        throw new Error('No REDIS_URL');
      });
      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database service unavailable',
      );
    });

    it('should return 503 when Redis has recent error', async () => {
      vi.mocked(hasRedisError).mockReturnValueOnce(true);
      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Database connection issue. Please try again.',
      );
    });
  });

  // ─── Rate Limiting ───

  describe('Rate Limiting', () => {
    it('should block when rate limit is exceeded', async () => {
      const mockMulti = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 6]]), // 6 > 5 max
      };
      mockRedisClient.multi.mockReturnValue(mockMulti);

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendRateLimitExceeded).toHaveBeenCalled();
    });

    it('should return 503 when rate limit check fails (fail closed)', async () => {
      const mockMulti = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Redis down')),
      };
      mockRedisClient.multi.mockReturnValue(mockMulti);

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(
        expect.anything(),
        'Rate limiting unavailable',
      );
    });
  });

  // ─── PIN Validation ───

  describe('PIN Validation', () => {
    it('should return 400 when PIN is missing', async () => {
      const req = { method: 'POST', headers: {}, body: {} } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN is required',
      );
    });

    it('should return 400 when PIN is null', async () => {
      const req = { method: 'POST', headers: {}, body: { pin: null } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN is required',
      );
    });

    it('should return 400 when PIN is a number', async () => {
      const req = { method: 'POST', headers: {}, body: { pin: 1234 } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN is required',
      );
    });

    it('should return 400 for PIN shorter than 4 digits', async () => {
      const req = { method: 'POST', headers: {}, body: { pin: '123' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN must be exactly 4 digits',
      );
    });

    it('should return 400 for PIN longer than 4 digits', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '12345' },
      } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN must be exactly 4 digits',
      );
    });

    it('should return 400 for non-numeric PIN', async () => {
      const req = { method: 'POST', headers: {}, body: { pin: 'abcd' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN must be exactly 4 digits',
      );
    });

    it('should return 400 when body is null', async () => {
      const req = { method: 'POST', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(
        expect.anything(),
        'PIN is required',
      );
    });
  });

  // ─── First-time PIN Setup (timer role) ───

  describe('First-time PIN Setup', () => {
    it('should set PIN and return token with isNewPin flag', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK'); // SET NX succeeds

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      expect(hashPin).toHaveBeenCalledWith('1234');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'admin:clientPin',
        'hashed:1234',
        'NX',
      );
      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'timer' }),
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
          isNewPin: true,
          role: 'timer',
          message: 'PIN set successfully',
        }),
      );
    });

    it('should set PIN with gateJudge role when specified', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK'); // SET NX succeeds

      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '1234', role: 'gateJudge' },
      } as any;
      await handler(req, mockRes as any);

      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'gateJudge' }),
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'gateJudge',
          isNewPin: true,
        }),
      );
    });

    it('should handle concurrent PIN setup race condition', async () => {
      // First GET returns null, but SET NX fails (another request set it first)
      mockRedisClient.get
        .mockResolvedValueOnce(null) // initial check
        .mockResolvedValueOnce('hashed:1234'); // re-read after NX fail
      mockRedisClient.set.mockResolvedValue(null); // SET NX fails

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      // Should still succeed — verifies against the concurrently-set PIN
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('should reject when concurrent PIN differs', async () => {
      // First GET returns null, but SET NX fails and concurrent PIN is different
      mockRedisClient.get
        .mockResolvedValueOnce(null) // initial check
        .mockResolvedValueOnce('hashed:9999'); // different PIN was set concurrently
      mockRedisClient.set.mockResolvedValue(null); // SET NX fails

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      // Should reject — PIN doesn't match the one set concurrently
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        'Invalid PIN',
        401,
      );
    });
  });

  // ─── PIN Verification (existing PIN) ───

  describe('PIN Verification', () => {
    it('should return token for correct PIN', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:5678');

      const req = { method: 'POST', headers: {}, body: { pin: '5678' } } as any;
      await handler(req, mockRes as any);

      expect(verifyPin).toHaveBeenCalledWith('5678', 'hashed:5678');
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
          role: 'timer',
        }),
      );
    });

    it('should return 401 for incorrect PIN', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:5678');

      const req = { method: 'POST', headers: {}, body: { pin: '0000' } } as any;
      await handler(req, mockRes as any);

      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        'Invalid PIN',
        401,
      );
    });

    it('should migrate legacy SHA-256 hash to PBKDF2 on valid PIN', async () => {
      const legacyHash = 'abcdef1234567890';
      mockRedisClient.get.mockResolvedValue(legacyHash);
      vi.mocked(verifyPin).mockReturnValueOnce(true);

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      expect(hashPin).toHaveBeenCalledWith('1234');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'admin:clientPin',
        'hashed:1234',
      );
    });

    it('should NOT migrate hash if already PBKDF2 format', async () => {
      const pbkdf2Hash = 'salt:hash_value';
      mockRedisClient.get.mockResolvedValue(pbkdf2Hash);
      vi.mocked(verifyPin).mockReturnValueOnce(true);

      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      // Should NOT update the hash since it already has ':'
      expect(mockRedisClient.set).not.toHaveBeenCalledWith(
        'admin:clientPin',
        expect.anything(),
      );
    });
  });

  // ─── Role Handling ───

  describe('Role Handling', () => {
    it('should default to timer role when no role specified', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');
      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'timer' }),
      );
    });

    it('should default to timer role for invalid role', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '1234', role: 'admin' },
      } as any;
      await handler(req, mockRes as any);
      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'timer' }),
      );
    });

    it('should accept gateJudge role', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:1234');
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '1234', role: 'gateJudge' },
      } as any;
      await handler(req, mockRes as any);
      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'gateJudge' }),
      );
    });
  });

  // ─── Chief Judge PIN ───

  describe('Chief Judge PIN', () => {
    it('should set chief judge PIN on first use', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK'); // SET NX succeeds
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '9999', role: 'chiefJudge' },
      } as any;
      await handler(req, mockRes as any);

      expect(hashPin).toHaveBeenCalledWith('9999');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'admin:chiefJudgePin',
        'hashed:9999',
        'NX',
      );
      expect(issueToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'chiefJudge' }),
      );
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
          isNewPin: true,
          role: 'chiefJudge',
          message: 'Chief Judge PIN set successfully',
        }),
      );
    });

    it('should refuse to set first chief judge PIN without race membership', async () => {
      // Client PIN exists, caller has no valid token
      mockRedisClient.get.mockImplementation(async (key: string) =>
        key === 'admin:clientPin' ? 'hashed:1234' : null,
      );
      vi.mocked(validateAuth).mockResolvedValueOnce({
        valid: false,
        error: 'Authorization required',
      });
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '9999', role: 'chiefJudge' },
      } as any;
      await handler(req, mockRes as any);

      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(issueToken).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('race PIN'),
        401,
      );
    });

    it('should verify chief judge PIN against stored hash', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:9999');
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '9999', role: 'chiefJudge' },
      } as any;
      await handler(req, mockRes as any);

      expect(verifyPin).toHaveBeenCalledWith('9999', 'hashed:9999');
      expect(sendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          success: true,
          role: 'chiefJudge',
        }),
      );
    });

    it('should return 401 for incorrect chief judge PIN', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:9999');
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '0000', role: 'chiefJudge' },
      } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        'Invalid Chief Judge PIN',
        401,
      );
    });

    it('should migrate legacy chief judge hash to PBKDF2', async () => {
      const legacyHash = 'abcdef1234567890';
      mockRedisClient.get.mockResolvedValue(legacyHash);
      vi.mocked(verifyPin).mockReturnValueOnce(true);
      const req = {
        method: 'POST',
        headers: {},
        body: { pin: '9999', role: 'chiefJudge' },
      } as any;
      await handler(req, mockRes as any);
      expect(hashPin).toHaveBeenCalledWith('9999');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'admin:chiefJudgePin',
        'hashed:9999',
      );
    });
  });

  // ─── Brute-force Lockout ───

  describe('Global failed-attempt lockout', () => {
    it('should record a failure for an incorrect PIN', async () => {
      mockRedisClient.get.mockImplementation(async (key: string) =>
        key === 'admin:clientPin' ? 'hashed:1234' : null,
      );
      const req = { method: 'POST', headers: {}, body: { pin: '0000' } } as any;
      await handler(req, mockRes as any);

      const multi = mockRedisClient.multi.mock.results.at(-1)?.value;
      expect(multi.incr).toHaveBeenCalledWith('auth:failures:admin:clientPin');
    });

    it('should reject even the correct PIN once the failure budget is spent', async () => {
      mockRedisClient.get.mockImplementation(async (key: string) => {
        if (key === 'admin:clientPin') return 'hashed:1234';
        if (key === 'auth:failures:admin:clientPin') return '30';
        return null;
      });
      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);

      expect(sendRateLimitExceeded).toHaveBeenCalled();
      expect(verifyPin).not.toHaveBeenCalled();
      expect(issueToken).not.toHaveBeenCalled();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Unexpected'));
      const req = { method: 'POST', headers: {}, body: { pin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        'Internal server error',
        500,
      );
    });
  });
});
