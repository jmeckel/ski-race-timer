/**
 * API Tests - Admin PIN Endpoint (api/v1/admin/pin.ts)
 *
 * Tests GET (PIN status check) and POST (change PIN) paths.
 * Covers: auth validation, input validation, error handling, PIN change flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock Dependencies
// ============================================

const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
};

vi.mock('../../api/lib/redis.js', () => ({
  getRedis: vi.fn(() => mockRedisClient),
  hasRedisError: vi.fn(() => false),
  CLIENT_PIN_KEY: 'admin:clientPin',
  CHIEF_JUDGE_PIN_KEY: 'admin:chiefJudgePin',
}));

vi.mock('../../api/lib/jwt.js', () => ({
  validateAuth: vi.fn().mockResolvedValue({ valid: true, method: 'jwt' }),
  hashPin: vi.fn((pin: string) => `hashed:${pin}`),
  verifyPin: vi.fn((pin: string, stored: string) => stored === `hashed:${pin}`),
}));

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

vi.mock('../../api/lib/response.js', () => ({
  handlePreflight: vi.fn((req: any, res: any, methods: string[]) => {
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
  sendAuthRequired: vi.fn(),
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

import handler from '../../api/v1/admin/pin';
import { getRedis, hasRedisError } from '../../api/lib/redis.js';
import { validateAuth, hashPin, verifyPin } from '../../api/lib/jwt.js';
import { sendSuccess, sendError, sendBadRequest, sendMethodNotAllowed, sendServiceUnavailable, sendAuthRequired, sendRateLimitExceeded } from '../../api/lib/response.js';

// ============================================
// Tests
// ============================================

describe('API: /api/v1/admin/pin', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = createMockRes();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    vi.mocked(validateAuth).mockResolvedValue({ valid: true, method: 'jwt' });
  });

  // ─── CORS Preflight ───

  describe('OPTIONS (CORS Preflight)', () => {
    it('should handle preflight request', async () => {
      const req = { method: 'OPTIONS', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ─── Redis Errors ───

  describe('Redis Errors', () => {
    it('should return 503 when Redis init fails', async () => {
      vi.mocked(getRedis).mockImplementationOnce(() => { throw new Error('No Redis'); });
      const req = { method: 'GET', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database service unavailable');
    });

    it('should return 503 when Redis has recent error', async () => {
      vi.mocked(hasRedisError).mockReturnValueOnce(true);
      const req = { method: 'GET', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database connection issue. Please try again.');
    });
  });

  // ─── Authentication ───

  describe('Authentication', () => {
    it('should reject unauthenticated request', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: false, error: 'Authorization required.', expired: false });
      const req = { method: 'GET', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendAuthRequired).toHaveBeenCalledWith(expect.anything(), 'Authorization required.', false);
    });

    it('should pass expired flag when token is expired', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: false, error: 'Token expired.', expired: true });
      const req = { method: 'GET', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendAuthRequired).toHaveBeenCalledWith(expect.anything(), 'Token expired.', true);
    });
  });

  // ─── GET: PIN Status ───

  describe('GET /api/v1/admin/pin', () => {
    it('should return hasPin=false when no PIN set', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const req = { method: 'GET', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), { hasPin: false, hasChiefPin: false });
    });

    it('should return hasPin=true when client PIN is set', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'admin:clientPin') return Promise.resolve('some-hash');
        return Promise.resolve(null);
      });
      const req = { method: 'GET', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), { hasPin: true, hasChiefPin: false });
    });

    it('should return hasChiefPin=true when chief judge PIN is set', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'admin:chiefJudgePin') return Promise.resolve('chief-hash');
        return Promise.resolve(null);
      });
      const req = { method: 'GET', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), { hasPin: false, hasChiefPin: true });
    });

    it('should return both flags true when both PINs set', async () => {
      mockRedisClient.get.mockResolvedValue('some-hash');
      const req = { method: 'GET', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), { hasPin: true, hasChiefPin: true });
    });
  });

  // ─── POST: Change PIN ───

  describe('POST /api/v1/admin/pin', () => {
    beforeEach(() => {
      // POST requires chiefJudge role
      vi.mocked(validateAuth).mockResolvedValue({ valid: true, method: 'jwt', payload: { role: 'chiefJudge' } });
    });

    it('should return 403 when user is not chiefJudge', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'timer' } });
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'PIN change requires Chief Judge role', 403);
    });

    it('should return 403 when user has no role', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt' });
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'PIN change requires Chief Judge role', 403);
    });

    it('should return 400 when currentPin is missing', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'currentPin and newPin are required');
    });

    it('should return 400 when newPin is missing', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'currentPin and newPin are required');
    });

    it('should return 400 when body is null', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'currentPin and newPin are required');
    });

    it('should return 400 when PINs are not strings', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: 1234, newPin: 5678 } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'PINs must be strings');
    });

    it('should return 400 for invalid PIN format', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '123', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'PINs must be exactly 4 digits');
    });

    it('should return 400 for non-numeric newPin', async () => {
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: 'abcd' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'PINs must be exactly 4 digits');
    });

    it('should return 400 when no PIN is currently set', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendBadRequest).toHaveBeenCalledWith(expect.anything(), 'No PIN is set. Use authentication to set initial PIN.');
    });

    it('should return 401 when current PIN is incorrect', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:9999');
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Current PIN is incorrect', 401);
    });

    it('should change PIN when current PIN is correct', async () => {
      mockRedisClient.get.mockResolvedValue('hashed:1234');
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);

      expect(verifyPin).toHaveBeenCalledWith('1234', 'hashed:1234');
      expect(hashPin).toHaveBeenCalledWith('5678');
      expect(mockRedisClient.set).toHaveBeenCalledWith('admin:clientPin', 'hashed:5678');
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), { success: true });
    });
  });

  // ─── Unsupported Methods ───

  describe('Unsupported Methods', () => {
    it('should return 405 for PUT', async () => {
      const req = { method: 'PUT', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });

    it('should return 405 for DELETE', async () => {
      const req = { method: 'DELETE', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    it('should return 500 on unexpected error in GET', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Unexpected'));
      const req = { method: 'GET', headers: { authorization: 'Bearer token' }, body: null } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Internal server error', 500);
    });

    it('should return 500 on unexpected error in POST', async () => {
      vi.mocked(validateAuth).mockResolvedValueOnce({ valid: true, method: 'jwt', payload: { role: 'chiefJudge' } });
      mockRedisClient.get.mockResolvedValue('hashed:1234');
      vi.mocked(verifyPin).mockImplementationOnce(() => { throw new Error('crypto fail'); });
      const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { currentPin: '1234', newPin: '5678' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Internal server error', 500);
    });
  });
});
