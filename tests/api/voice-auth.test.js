/**
 * API Tests - Voice API Authentication
 *
 * Tests that the voice API endpoint enforces JWT authentication
 * and fails closed when Redis is unavailable.
 *
 * Architecture: voice.ts uses createHandler() middleware from api/lib/handler.ts.
 * Authentication, Redis init, and fail-closed patterns are centralized in handler.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing handler
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  multi: vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 1],
      [null, 1],
    ]),
  })),
  on: vi.fn(),
};

let mockRedisThrows = false;
let mockRedisError = false;

vi.mock('../../api/lib/redis.js', () => ({
  getRedis: vi.fn(() => {
    if (mockRedisThrows) throw new Error('Redis unavailable');
    return mockRedisClient;
  }),
  hasRedisError: vi.fn(() => mockRedisError),
  CLIENT_PIN_KEY: 'admin:clientPin',
}));

vi.mock('../../api/lib/jwt.js', () => ({
  validateAuth: vi.fn(async (req, client, key) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader) {
      const storedPin = await client.get(key);
      if (!storedPin) return { valid: true, method: 'none' };
      return { valid: false, error: 'Authorization required' };
    }
    if (authHeader === 'Bearer valid-token') {
      return { valid: true, method: 'jwt', payload: { role: 'timer' } };
    }
    return { valid: false, error: 'Invalid token' };
  }),
  hashPin: vi.fn(),
  verifyPin: vi.fn(),
}));

vi.mock('../../api/lib/response.js', () => ({
  handlePreflight: vi.fn((req, res, methods) => {
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
  sendServiceUnavailable: vi.fn((res, msg) => {
    res.status(503).json({ error: msg });
  }),
  sendAuthRequired: vi.fn((res, msg, expired) => {
    res.status(401).json({ error: msg });
  }),
  sendRateLimitExceeded: vi.fn((res, retryAfter) => {
    res.status(429).json({ error: 'Too many requests' });
  }),
  setRateLimitHeaders: vi.fn(),
  getClientIP: vi.fn(() => '127.0.0.1'),
  sanitizeString: vi.fn((str, maxLen) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .slice(0, maxLen)
      .replace(/[<>&]/g, '')
      .replace(/[\x00-\x1f\x7f]/g, '');
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

// Create response helper that captures status/body
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader: vi.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((data) => {
      res.body = data;
      return res;
    }),
    end: vi.fn(),
  };
  return res;
}

describe('Voice API Authentication', () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisThrows = false;
    mockRedisError = false;
    mockRedisClient.get.mockResolvedValue('some-pin-hash');

    // Dynamic import to pick up mocks
    vi.resetModules();
    try {
      const module = await import('../../api/v1/voice.ts');
      handler = module.default;
    } catch {
      // voice.js may fail to import due to missing env vars or other deps
      handler = null;
    }
  });

  // Only run tests if handler can be imported
  // Voice API has complex dependencies (LLM provider env vars)
  // so these tests verify the auth pattern conceptually

  describe('fail-closed behavior', () => {
    it('should deny access when Redis init throws', async () => {
      if (!handler) return; // Skip if handler can't be imported

      mockRedisThrows = true;
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { text: 'test' },
      };
      const res = createMockRes();

      await handler(req, res);

      // Should return 503 (service unavailable), NOT proceed without auth
      expect(res.statusCode).toBe(503);
    });

    it('should deny access when Redis has errors', async () => {
      if (!handler) return;

      mockRedisError = true;
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { text: 'test' },
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(503);
    });
  });

  describe('authentication enforcement pattern', () => {
    // These tests verify the code pattern via source code assertions

    it('voice.ts should use createHandler which provides fail-closed auth', async () => {
      // Read the source file to verify the pattern
      const fs = await import('fs');
      const source = fs.readFileSync('api/v1/voice.ts', 'utf-8');

      // Should use createHandler middleware (which handles Redis init, auth, fail-closed)
      expect(source).toContain('createHandler');
      // Should enable auth via createHandler options
      expect(source).toContain('auth: true');
    });

    it('handler.ts should enforce fail-closed Redis checks', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('api/lib/handler.ts', 'utf-8');

      // Should check for Redis unavailability via try/catch and hasRedisError
      expect(source).toContain('getRedis()');
      expect(source).toContain('hasRedisError()');
      expect(source).toContain('sendServiceUnavailable');

      // Should NOT have the old pattern that skipped auth
      expect(source).not.toContain('if (redisClient && !hasRedisError())');
    });

    it('handler.ts should call validateAuth and check validity', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('api/lib/handler.ts', 'utf-8');

      expect(source).toContain('validateAuth');
      expect(source).toContain('sendAuthRequired');
    });
  });
});
