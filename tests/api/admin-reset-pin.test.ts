/**
 * API Tests - Admin Reset PIN Endpoint (api/v1/admin/reset-pin.ts)
 *
 * Tests POST reset-pin flow: SERVER_API_PIN validation,
 * rate limiting, Redis deletion, error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock Dependencies
// ============================================

const mockExec = vi.fn().mockResolvedValue([[null, 1], [null, 1]]);

const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  multi: vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: mockExec,
  })),
  on: vi.fn(),
};

vi.mock('../../api/lib/redis.js', () => ({
  getRedis: vi.fn(() => mockRedisClient),
  hasRedisError: vi.fn(() => false),
  CLIENT_PIN_KEY: 'admin:clientPin',
  CHIEF_JUDGE_PIN_KEY: 'admin:chiefJudgePin',
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
  handlePreflight: vi.fn((req: any, res: any) => {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return true;
    }
    return false;
  }),
  getClientIP: vi.fn(() => '127.0.0.1'),
  sendSuccess: vi.fn(),
  sendError: vi.fn(),
  sendMethodNotAllowed: vi.fn(),
  sendServiceUnavailable: vi.fn(),
  sendRateLimitExceeded: vi.fn(),
  setRateLimitHeaders: vi.fn(),
  setCorsHeaders: vi.fn(),
  setSecurityHeaders: vi.fn(),
}));

vi.mock('../../api/lib/apiLogger.js', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import handler from '../../api/v1/admin/reset-pin';
import { getRedis, hasRedisError } from '../../api/lib/redis.js';
import { sendSuccess, sendError, sendMethodNotAllowed, sendServiceUnavailable, sendRateLimitExceeded } from '../../api/lib/response.js';

// ============================================
// Tests
// ============================================

describe('API: /api/v1/admin/reset-pin', () => {
  const ORIGINAL_ENV = process.env;
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = createMockRes();
    process.env = { ...ORIGINAL_ENV, SERVER_API_PIN: 'secret-server-pin' };
    mockExec.mockResolvedValue([[null, 1], [null, 1]]);
    mockRedisClient.del.mockResolvedValue(1);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.clearAllMocks();
  });

  // ─── CORS Preflight ───

  describe('OPTIONS (CORS Preflight)', () => {
    it('should handle preflight request', async () => {
      const req = { method: 'OPTIONS', headers: {}, body: null } as any;
      await handler(req, mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ─── Method Validation ───

  describe('Method Validation', () => {
    it('should reject GET requests', async () => {
      const req = { method: 'GET', headers: {}, body: null, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });

    it('should reject PUT requests', async () => {
      const req = { method: 'PUT', headers: {}, body: null, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });

    it('should reject DELETE requests', async () => {
      const req = { method: 'DELETE', headers: {}, body: null, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendMethodNotAllowed).toHaveBeenCalled();
    });
  });

  // ─── SERVER_API_PIN Not Configured ───

  describe('SERVER_API_PIN Not Configured', () => {
    it('should return 500 when SERVER_API_PIN is not set', async () => {
      delete process.env.SERVER_API_PIN;
      const req = { method: 'POST', headers: {}, body: { serverPin: 'test' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Service configuration error', 500);
    });
  });

  // ─── Authorization ───

  describe('Authorization', () => {
    it('should return 401 when serverPin is not provided', async () => {
      const req = { method: 'POST', headers: {}, body: {}, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Authorization required', 401);
    });

    it('should return 401 when serverPin is null', async () => {
      const req = { method: 'POST', headers: {}, body: { serverPin: null }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Authorization required', 401);
    });

    it('should return 401 for incorrect serverPin', async () => {
      const req = { method: 'POST', headers: {}, body: { serverPin: 'wrong-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Authorization required', 401);
    });

    it('should return 401 for serverPin with different length', async () => {
      const req = { method: 'POST', headers: {}, body: { serverPin: 'short' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      // SHA-256 hashing normalizes length before timingSafeEqual, so different length PIN still fails on hash mismatch
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Authorization required', 401);
    });
  });

  // ─── Redis Errors ───

  describe('Redis Errors', () => {
    it('should return 503 when Redis init fails', async () => {
      vi.mocked(getRedis).mockImplementationOnce(() => { throw new Error('No Redis'); });
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database service unavailable');
    });

    it('should return 503 when Redis has recent error', async () => {
      vi.mocked(hasRedisError).mockReturnValueOnce(true);
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Database connection issue. Please try again.');
    });
  });

  // ─── Rate Limiting ───

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      mockExec.mockResolvedValue([[null, 4], [null, 1]]); // 4 > 3 max
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendRateLimitExceeded).toHaveBeenCalled();
    });

    it('should fail closed when rate limit check fails', async () => {
      mockExec.mockRejectedValue(new Error('Redis down'));
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendServiceUnavailable).toHaveBeenCalledWith(expect.anything(), 'Rate limiting unavailable');
    });
  });

  // ─── Successful PIN Reset ───

  describe('Successful PIN Reset', () => {
    it('should delete both PINs and return success', async () => {
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);

      expect(mockRedisClient.del).toHaveBeenCalledWith('admin:clientPin');
      expect(mockRedisClient.del).toHaveBeenCalledWith('admin:chiefJudgePin');
      expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        success: true,
        message: expect.stringContaining('PINs have been reset'),
      }));
    });

    it('should handle body being null', async () => {
      const req = { method: 'POST', headers: {}, body: null, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Authorization required', 401);
    });
  });

  // ─── IP Extraction ───

  describe('IP Extraction', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      const req = { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      // Just verifying it doesn't crash with x-forwarded-for header
      expect(mockRedisClient.multi).toHaveBeenCalled();
    });

    it('should extract IP from x-real-ip header', async () => {
      const req = { method: 'POST', headers: { 'x-real-ip': '10.0.0.1' }, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(mockRedisClient.multi).toHaveBeenCalled();
    });

    it('should fallback to socket.remoteAddress', async () => {
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '192.168.1.1' } } as any;
      await handler(req, mockRes as any);
      expect(mockRedisClient.multi).toHaveBeenCalled();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    it('should return 500 when Redis del fails', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis write error'));
      const req = { method: 'POST', headers: {}, body: { serverPin: 'secret-server-pin' }, socket: { remoteAddress: '127.0.0.1' } } as any;
      await handler(req, mockRes as any);
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Internal server error', 500);
    });
  });
});
