/**
 * API Tests - Faults Endpoint Role Validation
 *
 * Tests for the /api/v1/faults endpoint role-based access control
 * Specifically tests that fault deletion requires chiefJudge role
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ============================================
// Mock Setup
// ============================================

const JWT_SECRET = 'test-secret-key';
const mockRedisData = new Map();

const createMockRedis = () => ({
  get: vi.fn((key) => Promise.resolve(mockRedisData.get(key) || null)),
  set: vi.fn((key, value) => {
    mockRedisData.set(key, value);
    return Promise.resolve('OK');
  }),
  sadd: vi.fn(() => Promise.resolve(1)),
  smembers: vi.fn(() => Promise.resolve([])),
  expire: vi.fn(() => Promise.resolve(1)),
  hgetall: vi.fn(() => Promise.resolve({})),
  multi: vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(() => Promise.resolve([[null, 1], [null, 1]]))
  })),
  on: vi.fn(),
  connect: vi.fn(() => Promise.resolve())
});

// Generate test JWT with specific role
function generateTestToken(role = 'timer') {
  return jwt.sign(
    {
      type: 'race-management',
      role,
      authenticatedAt: Date.now()
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '24h',
      issuer: 'ski-race-timer'
    }
  );
}

// Mock faults handler with role validation
async function faultsHandler(req, res, redis) {
  const response = {
    status: null,
    headers: {},
    body: null
  };

  const mockRes = {
    setHeader: (key, value) => { response.headers[key] = value; },
    status: (code) => {
      response.status = code;
      return {
        json: (data) => { response.body = data; return response; },
        end: () => { return response; }
      };
    }
  };

  // Set CORS headers
  mockRes.setHeader('Access-Control-Allow-Origin', '*');

  // Check auth
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return mockRes.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.replace('Bearer ', '');
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'ski-race-timer'
    });
  } catch (err) {
    return mockRes.status(401).json({ error: 'Invalid token' });
  }

  // Handle DELETE - requires chiefJudge role
  if (req.method === 'DELETE') {
    const userRole = payload.role;
    if (userRole !== 'chiefJudge') {
      return mockRes.status(403).json({ error: 'Fault deletion requires Chief Judge role' });
    }

    // Process deletion (simplified)
    return mockRes.status(200).json({ success: true, deleted: true });
  }

  // Handle GET
  if (req.method === 'GET') {
    return mockRes.status(200).json({ faults: [], lastUpdated: null });
  }

  return mockRes.status(405).json({ error: 'Method not allowed' });
}

// ============================================
// Tests
// ============================================

describe('API: /api/v1/faults - Role Validation', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedisData.clear();
    mockRedis = createMockRedis();
    // Set up PIN so auth is required
    mockRedisData.set('admin:clientPin', 'somehash');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DELETE /api/v1/faults - Role-based access control', () => {
    it('should reject DELETE with timer role (403)', async () => {
      const timerToken = generateTestToken('timer');

      const result = await faultsHandler(
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${timerToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' },
          body: { faultId: 'fault1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(403);
      expect(result.body.error).toContain('Chief Judge role');
    });

    it('should reject DELETE with gateJudge role (403)', async () => {
      const gateJudgeToken = generateTestToken('gateJudge');

      const result = await faultsHandler(
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${gateJudgeToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' },
          body: { faultId: 'fault1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(403);
      expect(result.body.error).toContain('Chief Judge role');
    });

    it('should allow DELETE with chiefJudge role (200)', async () => {
      const chiefJudgeToken = generateTestToken('chiefJudge');

      const result = await faultsHandler(
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${chiefJudgeToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' },
          body: { faultId: 'fault1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
    });

    it('should reject DELETE without auth (401)', async () => {
      const result = await faultsHandler(
        {
          method: 'DELETE',
          headers: {},
          query: { raceId: 'TEST123', deviceId: 'dev1' },
          body: { faultId: 'fault1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(401);
    });

    it('should reject DELETE with invalid token (401)', async () => {
      const result = await faultsHandler(
        {
          method: 'DELETE',
          headers: { authorization: 'Bearer invalid-token' },
          query: { raceId: 'TEST123', deviceId: 'dev1' },
          body: { faultId: 'fault1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(401);
    });
  });

  describe('GET /api/v1/faults - No role restriction', () => {
    it('should allow GET with timer role', async () => {
      const timerToken = generateTestToken('timer');

      const result = await faultsHandler(
        {
          method: 'GET',
          headers: { authorization: `Bearer ${timerToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(200);
    });

    it('should allow GET with gateJudge role', async () => {
      const gateJudgeToken = generateTestToken('gateJudge');

      const result = await faultsHandler(
        {
          method: 'GET',
          headers: { authorization: `Bearer ${gateJudgeToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(200);
    });

    it('should allow GET with chiefJudge role', async () => {
      const chiefJudgeToken = generateTestToken('chiefJudge');

      const result = await faultsHandler(
        {
          method: 'GET',
          headers: { authorization: `Bearer ${chiefJudgeToken}` },
          query: { raceId: 'TEST123', deviceId: 'dev1' }
        },
        {},
        mockRedis
      );

      expect(result.status).toBe(200);
    });
  });
});

describe('Auth Token - Role in JWT', () => {
  it('should include role in generated token', () => {
    const token = generateTestToken('chiefJudge');
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.role).toBe('chiefJudge');
    expect(decoded.type).toBe('race-management');
  });

  it('should default to timer role when not specified', () => {
    const token = generateTestToken();
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.role).toBe('timer');
  });

  it('should include gateJudge role when specified', () => {
    const token = generateTestToken('gateJudge');
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.role).toBe('gateJudge');
  });
});
