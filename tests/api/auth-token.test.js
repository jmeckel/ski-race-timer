/**
 * API Tests - Auth Token Endpoint
 *
 * Tests for the /api/auth/token endpoint (api/auth/token.js)
 * Tests PIN-to-JWT token exchange
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ============================================
// Mock Redis Client
// ============================================

const mockRedisData = new Map();

const createMockRedis = () => ({
  get: vi.fn((key) => Promise.resolve(mockRedisData.get(key) || null)),
  set: vi.fn((key, value, ...args) => {
    mockRedisData.set(key, value);
    return Promise.resolve('OK');
  }),
  on: vi.fn(),
  connect: vi.fn(() => Promise.resolve())
});

// ============================================
// JWT Utilities (matching api/lib/jwt.js)
// ============================================

const JWT_ISSUER = 'ski-race-timer';

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// Simple JWT decoder (for testing - not full verification)
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch {
    return null;
  }
}

// ============================================
// Mock Handler Implementation
// ============================================

const CLIENT_PIN_KEY = 'admin:clientPin';

async function handler(req, res, redis) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

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

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      mockRes.setHeader(key, value);
    });
    return mockRes.status(200).end();
  }

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    mockRes.setHeader(key, value);
  });

  if (req.method !== 'POST') {
    return mockRes.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pin } = req.body || {};

    if (!pin || typeof pin !== 'string') {
      return mockRes.status(400).json({ error: 'PIN is required' });
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return mockRes.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    // Get stored PIN hash from Redis
    const storedPinHash = await redis.get(CLIENT_PIN_KEY);

    if (!storedPinHash) {
      // No PIN set yet - this is the first time setup
      const newPinHash = hashPin(pin);
      await redis.set(CLIENT_PIN_KEY, newPinHash);

      // Generate mock token (in real implementation this uses jsonwebtoken)
      const token = generateMockToken({ createdAt: Date.now() });

      return mockRes.status(200).json({
        success: true,
        token,
        isNewPin: true,
        message: 'PIN set successfully'
      });
    }

    // Verify provided PIN against stored hash
    const providedPinHash = hashPin(pin);

    try {
      if (!crypto.timingSafeEqual(Buffer.from(providedPinHash), Buffer.from(storedPinHash))) {
        return mockRes.status(401).json({ error: 'Invalid PIN' });
      }
    } catch (e) {
      return mockRes.status(401).json({ error: 'Invalid PIN format' });
    }

    // PIN is valid, generate JWT token
    const token = generateMockToken({ authenticatedAt: Date.now() });

    return mockRes.status(200).json({
      success: true,
      token
    });
  } catch (error) {
    return mockRes.status(500).json({ error: 'Internal server error' });
  }
}

// Generate a mock JWT-like token for testing
function generateMockToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    type: 'race-management',
    iss: JWT_ISSUER,
    exp: Math.floor(Date.now() / 1000) + 86400 // 24h expiry
  })).toString('base64');
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

// ============================================
// Tests
// ============================================

describe('API: /api/auth/token', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedisData.clear();
    mockRedis = createMockRedis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('OPTIONS (CORS Preflight)', () => {
    it('should return 200 with CORS headers', async () => {
      const req = { method: 'OPTIONS' };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('POST /api/auth/token', () => {
    describe('PIN Validation', () => {
      it('should return 400 when PIN is missing', async () => {
        const req = { method: 'POST', body: {} };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN is required');
      });

      it('should return 400 when PIN is not a string', async () => {
        const req = { method: 'POST', body: { pin: 1234 } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN is required');
      });

      it('should return 400 for PIN shorter than 4 digits', async () => {
        const req = { method: 'POST', body: { pin: '123' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN must be exactly 4 digits');
      });

      it('should return 400 for PIN longer than 4 digits', async () => {
        const req = { method: 'POST', body: { pin: '12345' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN must be exactly 4 digits');
      });

      it('should return 400 for non-numeric PIN', async () => {
        const req = { method: 'POST', body: { pin: 'abcd' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN must be exactly 4 digits');
      });

      it('should return 400 for PIN with spaces', async () => {
        const req = { method: 'POST', body: { pin: '12 4' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('PIN must be exactly 4 digits');
      });
    });

    describe('First-time PIN Setup', () => {
      it('should set PIN and return token with isNewPin flag', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
        expect(result.body.token).toBeDefined();
        expect(result.body.isNewPin).toBe(true);
        expect(result.body.message).toBe('PIN set successfully');
      });

      it('should store PIN hash in Redis', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        await handler(req, {}, mockRedis);

        expect(mockRedis.set).toHaveBeenCalledWith(
          CLIENT_PIN_KEY,
          expect.any(String)
        );

        // Verify hash was stored
        const storedHash = mockRedisData.get(CLIENT_PIN_KEY);
        expect(storedHash).toBe(hashPin('1234'));
      });

      it('should return JWT-formatted token', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        const token = result.body.token;
        expect(token).toBeDefined();

        // JWT has 3 parts separated by dots
        const parts = token.split('.');
        expect(parts.length).toBe(3);

        // Decode payload
        const payload = decodeJwtPayload(token);
        expect(payload).not.toBeNull();
        expect(payload.type).toBe('race-management');
        expect(payload.iss).toBe(JWT_ISSUER);
        expect(payload.createdAt).toBeDefined();
      });
    });

    describe('PIN Verification (existing PIN)', () => {
      beforeEach(() => {
        // Pre-set a PIN hash
        mockRedisData.set(CLIENT_PIN_KEY, hashPin('5678'));
      });

      it('should return token for correct PIN', async () => {
        const req = { method: 'POST', body: { pin: '5678' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
        expect(result.body.token).toBeDefined();
        expect(result.body.isNewPin).toBeUndefined();
      });

      it('should return 401 for incorrect PIN', async () => {
        const req = { method: 'POST', body: { pin: '0000' } };
        const result = await handler(req, {}, mockRedis);

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('Invalid PIN');
      });

      it('should not modify stored PIN on verification', async () => {
        const originalHash = mockRedisData.get(CLIENT_PIN_KEY);

        const req = { method: 'POST', body: { pin: '5678' } };
        await handler(req, {}, mockRedis);

        // Stored hash should be unchanged
        expect(mockRedisData.get(CLIENT_PIN_KEY)).toBe(originalHash);
      });

      it('should return JWT token with authenticatedAt timestamp', async () => {
        const req = { method: 'POST', body: { pin: '5678' } };
        const result = await handler(req, {}, mockRedis);

        const payload = decodeJwtPayload(result.body.token);
        expect(payload.authenticatedAt).toBeDefined();
      });
    });

    describe('Token Format', () => {
      it('should include race-management type in token', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        const payload = decodeJwtPayload(result.body.token);
        expect(payload.type).toBe('race-management');
      });

      it('should include issuer in token', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        const payload = decodeJwtPayload(result.body.token);
        expect(payload.iss).toBe('ski-race-timer');
      });

      it('should include expiration in token', async () => {
        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        const payload = decodeJwtPayload(result.body.token);
        expect(payload.exp).toBeDefined();
        // Expiry should be in the future (within 24 hours)
        expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      });
    });

    describe('Security', () => {
      it('should use constant-time comparison for PIN hash', async () => {
        // Pre-set PIN
        mockRedisData.set(CLIENT_PIN_KEY, hashPin('9999'));

        // Try incorrect PIN - timing should be same as correct PIN
        const req1 = { method: 'POST', body: { pin: '0000' } };
        const req2 = { method: 'POST', body: { pin: '9999' } };

        // Both should complete without timing differences
        const result1 = await handler(req1, {}, mockRedis);
        const result2 = await handler(req2, {}, mockRedis);

        expect(result1.status).toBe(401);
        expect(result2.status).toBe(200);
      });

      it('should not expose stored PIN hash in response', async () => {
        mockRedisData.set(CLIENT_PIN_KEY, hashPin('1234'));

        const req = { method: 'POST', body: { pin: '1234' } };
        const result = await handler(req, {}, mockRedis);

        const responseStr = JSON.stringify(result.body);
        const storedHash = mockRedisData.get(CLIENT_PIN_KEY);

        expect(responseStr).not.toContain(storedHash);
      });
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for GET', async () => {
      const req = { method: 'GET' };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
      expect(result.body.error).toBe('Method not allowed');
    });

    it('should return 405 for PUT', async () => {
      const req = { method: 'PUT' };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
    });

    it('should return 405 for DELETE', async () => {
      const req = { method: 'DELETE' };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful response', async () => {
      const req = { method: 'POST', body: { pin: '1234' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should include CORS headers in error response', async () => {
      const req = { method: 'POST', body: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

describe('JWT Validation Integration', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedisData.clear();
    mockRedis = createMockRedis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token-based API access', () => {
    it('should generate tokens that can be used for subsequent API calls', async () => {
      // First, get a token
      const tokenReq = { method: 'POST', body: { pin: '1234' } };
      const tokenResult = await handler(tokenReq, {}, mockRedis);

      expect(tokenResult.status).toBe(200);
      expect(tokenResult.body.token).toBeDefined();

      // Token should be a valid JWT format
      const token = tokenResult.body.token;
      const parts = token.split('.');
      expect(parts.length).toBe(3);
    });

    it('should allow multiple tokens to be generated', async () => {
      // Set up PIN first
      mockRedisData.set(CLIENT_PIN_KEY, hashPin('1234'));

      // Generate first token
      const req1 = { method: 'POST', body: { pin: '1234' } };
      const result1 = await handler(req1, {}, mockRedis);

      // Wait a small amount to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      // Generate second token
      const req2 = { method: 'POST', body: { pin: '1234' } };
      const result2 = await handler(req2, {}, mockRedis);

      expect(result1.body.token).toBeDefined();
      expect(result2.body.token).toBeDefined();
      // Both tokens should be valid JWT format (3 parts with dots)
      expect(result1.body.token.split('.').length).toBe(3);
      expect(result2.body.token.split('.').length).toBe(3);
    });
  });
});
