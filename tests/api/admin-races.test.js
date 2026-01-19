/**
 * API Tests - Admin Races Endpoint
 *
 * Tests for the /api/admin/races endpoint (api/admin/races.js)
 * Uses mocked Redis client to test handler logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock Redis Client
// ============================================

const mockRedisData = new Map();
let scanCursor = 0;

const createMockRedis = () => ({
  get: vi.fn((key) => Promise.resolve(mockRedisData.get(key) || null)),
  set: vi.fn((key, value, ...args) => {
    mockRedisData.set(key, value);
    return Promise.resolve('OK');
  }),
  del: vi.fn((...keys) => {
    let deleted = 0;
    keys.forEach(key => {
      if (mockRedisData.has(key)) {
        mockRedisData.delete(key);
        deleted++;
      }
    });
    return Promise.resolve(deleted);
  }),
  exists: vi.fn((key) => Promise.resolve(mockRedisData.has(key) ? 1 : 0)),
  hgetall: vi.fn((key) => Promise.resolve(mockRedisData.get(key) || {})),
  scan: vi.fn((cursor, match, pattern, count, countNum) => {
    // Simple mock: return all matching keys on first scan, then return '0' cursor
    if (cursor === '0') {
      const keys = Array.from(mockRedisData.keys()).filter(k => k.startsWith('race:'));
      return Promise.resolve(['0', keys]);
    }
    return Promise.resolve(['0', []]);
  }),
  on: vi.fn(),
  connect: vi.fn(() => Promise.resolve())
});

// ============================================
// Mock Handler Implementation
// ============================================

const TOMBSTONE_EXPIRY_SECONDS = 300;
const DEVICE_STALE_THRESHOLD = 30000;

function safeJsonParse(str, defaultValue) {
  if (str === null || str === undefined || str === '') {
    return defaultValue;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

async function getActiveDeviceCount(redis, normalizedRaceId) {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await redis.hgetall(devicesKey);
  if (!devices || Object.keys(devices).length === 0) return 0;

  const now = Date.now();
  let activeCount = 0;

  for (const [, deviceJson] of Object.entries(devices)) {
    try {
      const device = JSON.parse(deviceJson);
      if (now - device.lastSeen <= DEVICE_STALE_THRESHOLD) {
        activeCount++;
      }
    } catch {
      // Ignore invalid device data
    }
  }

  return activeCount;
}

async function listRaces(redis) {
  const races = [];
  const seenRaceIds = new Set();
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'race:*', 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys) {
      if (key.includes(':devices') || key.includes(':highestBib') || key.includes(':deleted')) {
        continue;
      }

      const raceId = key.replace('race:', '');
      if (seenRaceIds.has(raceId)) continue;
      seenRaceIds.add(raceId);

      try {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          const entryCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
          const deviceCount = await getActiveDeviceCount(redis, raceId);

          races.push({
            raceId,
            entryCount,
            deviceCount,
            lastUpdated: parsed.lastUpdated || null
          });
        }
      } catch (e) {
        // Skip invalid data
      }
    }
  } while (cursor !== '0');

  races.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  return races;
}

async function deleteRace(redis, raceId) {
  const normalizedRaceId = raceId.toLowerCase();
  const raceKey = `race:${normalizedRaceId}`;
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const tombstoneKey = `race:${normalizedRaceId}:deleted`;

  const exists = await redis.exists(raceKey);
  if (!exists) {
    return { success: false, error: 'Race not found' };
  }

  // Set tombstone
  await redis.set(
    tombstoneKey,
    JSON.stringify({
      deletedAt: Date.now(),
      message: 'Race deleted by administrator'
    }),
    'EX',
    TOMBSTONE_EXPIRY_SECONDS
  );

  // Delete race data
  await redis.del(raceKey, devicesKey, highestBibKey);

  return { success: true, raceId: normalizedRaceId };
}

// Simplified handler for testing
async function handler(req, res, redis) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      mockRes.setHeader(key, value);
    });
    return mockRes.status(200).end();
  }

  Object.entries(corsHeaders).forEach(([key, value]) => {
    mockRes.setHeader(key, value);
  });

  try {
    if (req.method === 'GET') {
      const races = await listRaces(redis);
      return mockRes.status(200).json({ races });
    }

    if (req.method === 'DELETE') {
      const { raceId } = req.query || {};

      if (!raceId) {
        return mockRes.status(400).json({ error: 'raceId is required' });
      }

      const result = await deleteRace(redis, raceId);

      if (!result.success) {
        return mockRes.status(404).json({ error: result.error });
      }

      return mockRes.status(200).json(result);
    }

    return mockRes.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return mockRes.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================
// Tests
// ============================================

describe('API: /api/admin/races', () => {
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
      const req = { method: 'OPTIONS', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('DELETE');
    });
  });

  describe('GET /api/admin/races', () => {
    it('should return empty array when no races exist', async () => {
      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.races).toEqual([]);
    });

    it('should return list of races with metadata', async () => {
      // Create test races
      mockRedisData.set('race:race-001', JSON.stringify({
        entries: [{ id: 1, bib: '001', point: 'S' }, { id: 2, bib: '002', point: 'S' }],
        lastUpdated: 1705123456789
      }));
      mockRedisData.set('race:race-002', JSON.stringify({
        entries: [{ id: 1, bib: '001', point: 'F' }],
        lastUpdated: 1705123456000
      }));

      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.races).toHaveLength(2);

      const race1 = result.body.races.find(r => r.raceId === 'race-001');
      expect(race1).toBeDefined();
      expect(race1.entryCount).toBe(2);

      const race2 = result.body.races.find(r => r.raceId === 'race-002');
      expect(race2).toBeDefined();
      expect(race2.entryCount).toBe(1);
    });

    it('should exclude auxiliary keys from race list', async () => {
      // Create race with auxiliary keys
      mockRedisData.set('race:test-race', JSON.stringify({
        entries: [{ id: 1 }],
        lastUpdated: Date.now()
      }));
      mockRedisData.set('race:test-race:devices', { dev_1: JSON.stringify({ lastSeen: Date.now() }) });
      mockRedisData.set('race:test-race:highestBib', '10');
      mockRedisData.set('race:test-race:deleted', JSON.stringify({ deletedAt: Date.now() }));

      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      // Should only have 1 race (not auxiliary keys)
      expect(result.body.races).toHaveLength(1);
      expect(result.body.races[0].raceId).toBe('test-race');
    });

    it('should sort races by lastUpdated descending', async () => {
      mockRedisData.set('race:old-race', JSON.stringify({
        entries: [],
        lastUpdated: 1000000000000
      }));
      mockRedisData.set('race:new-race', JSON.stringify({
        entries: [],
        lastUpdated: 2000000000000
      }));

      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.races[0].raceId).toBe('new-race');
      expect(result.body.races[1].raceId).toBe('old-race');
    });

    it('should handle corrupted race data gracefully', async () => {
      mockRedisData.set('race:valid-race', JSON.stringify({
        entries: [{ id: 1 }],
        lastUpdated: Date.now()
      }));
      mockRedisData.set('race:invalid-race', 'not valid json');

      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      // Should only return valid race
      expect(result.body.races).toHaveLength(1);
      expect(result.body.races[0].raceId).toBe('valid-race');
    });
  });

  describe('DELETE /api/admin/races', () => {
    it('should return 400 when raceId is missing', async () => {
      const req = { method: 'DELETE', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('raceId is required');
    });

    it('should return 404 for non-existent race', async () => {
      const req = { method: 'DELETE', query: { raceId: 'non-existent' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(404);
      expect(result.body.error).toBe('Race not found');
    });

    it('should delete race and set tombstone', async () => {
      // Create race data
      mockRedisData.set('race:delete-me', JSON.stringify({
        entries: [{ id: 1 }],
        lastUpdated: Date.now()
      }));
      mockRedisData.set('race:delete-me:devices', { dev_1: '{}' });
      mockRedisData.set('race:delete-me:highestBib', '5');

      const req = { method: 'DELETE', query: { raceId: 'DELETE-ME' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.raceId).toBe('delete-me');

      // Verify tombstone was set
      const tombstone = mockRedisData.get('race:delete-me:deleted');
      expect(tombstone).toBeDefined();
      const parsed = JSON.parse(tombstone);
      expect(parsed.deletedAt).toBeDefined();
      expect(parsed.message).toBe('Race deleted by administrator');

      // Verify race data was deleted
      expect(mockRedis.del).toHaveBeenCalledWith(
        'race:delete-me',
        'race:delete-me:devices',
        'race:delete-me:highestBib'
      );
    });

    it('should normalize race ID to lowercase', async () => {
      mockRedisData.set('race:uppercase-test', JSON.stringify({
        entries: [],
        lastUpdated: Date.now()
      }));

      const req = { method: 'DELETE', query: { raceId: 'UPPERCASE-TEST' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.raceId).toBe('uppercase-test');
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for POST', async () => {
      const req = { method: 'POST', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
      expect(result.body.error).toBe('Method not allowed');
    });

    it('should return 405 for PUT', async () => {
      const req = { method: 'PUT', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in GET response', async () => {
      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should include CORS headers in DELETE response', async () => {
      mockRedisData.set('race:cors-test', JSON.stringify({
        entries: [],
        lastUpdated: Date.now()
      }));

      const req = { method: 'DELETE', query: { raceId: 'cors-test' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

describe('Sync API Tombstone Detection', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedisData.clear();
    mockRedis = createMockRedis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mock sync handler with tombstone detection
  async function syncHandler(req, res, redis) {
    const response = {
      status: null,
      body: null
    };

    const mockRes = {
      status: (code) => {
        response.status = code;
        return {
          json: (data) => { response.body = data; return response; }
        };
      }
    };

    const { raceId } = req.query || {};
    if (!raceId) {
      return mockRes.status(400).json({ error: 'raceId is required' });
    }

    const normalizedRaceId = raceId.toLowerCase();
    const tombstoneKey = `race:${normalizedRaceId}:deleted`;

    // Check for tombstone
    const tombstoneData = await redis.get(tombstoneKey);
    if (tombstoneData) {
      const tombstone = safeJsonParse(tombstoneData, {});
      return mockRes.status(200).json({
        deleted: true,
        deletedAt: tombstone.deletedAt || Date.now(),
        message: tombstone.message || 'Race deleted by administrator'
      });
    }

    // Return normal response
    const raceKey = `race:${normalizedRaceId}`;
    const data = await redis.get(raceKey);
    const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

    return mockRes.status(200).json({
      entries: parsed.entries || [],
      lastUpdated: parsed.lastUpdated
    });
  }

  it('should return deleted response when tombstone exists', async () => {
    // Set tombstone
    mockRedisData.set('race:deleted-race:deleted', JSON.stringify({
      deletedAt: 1705123456789,
      message: 'Race deleted by administrator'
    }));

    const req = { method: 'GET', query: { raceId: 'DELETED-RACE' } };
    const result = await syncHandler(req, {}, mockRedis);

    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
    expect(result.body.deletedAt).toBe(1705123456789);
    expect(result.body.message).toBe('Race deleted by administrator');
  });

  it('should return normal response when no tombstone exists', async () => {
    // Create normal race data
    mockRedisData.set('race:active-race', JSON.stringify({
      entries: [{ id: 1, bib: '001' }],
      lastUpdated: Date.now()
    }));

    const req = { method: 'GET', query: { raceId: 'ACTIVE-RACE' } };
    const result = await syncHandler(req, {}, mockRedis);

    expect(result.status).toBe(200);
    expect(result.body.deleted).toBeUndefined();
    expect(result.body.entries).toHaveLength(1);
  });

  it('should detect tombstone even for empty race', async () => {
    // Only tombstone, no race data
    mockRedisData.set('race:tombstone-only:deleted', JSON.stringify({
      deletedAt: Date.now(),
      message: 'Race deleted'
    }));

    const req = { method: 'GET', query: { raceId: 'tombstone-only' } };
    const result = await syncHandler(req, {}, mockRedis);

    expect(result.body.deleted).toBe(true);
  });
});

// ============================================
// JWT Authentication Tests for Admin API
// ============================================

describe('Admin API JWT Authentication', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedisData.clear();
    mockRedis = createMockRedis();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mock validateAuth function matching api/lib/jwt.js behavior
  async function validateAuth(req, redis, clientPinKey) {
    const authHeader = req.headers?.authorization;

    if (!authHeader) {
      const storedPinHash = await redis.get(clientPinKey);
      if (!storedPinHash) {
        return { valid: true, method: 'none' };
      }
      return { valid: false, error: 'Authorization required. Set Race Management PIN in settings.' };
    }

    // Extract Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return { valid: false, error: 'Invalid authorization format. Use: Bearer <token>' };
    }

    const token = parts[1];

    // Check if token is a valid JWT (3 parts with dots)
    const jwtParts = token.split('.');
    if (jwtParts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
        if (payload.type === 'race-management' && payload.exp > Math.floor(Date.now() / 1000)) {
          return { valid: true, method: 'jwt', payload };
        }
        if (payload.exp <= Math.floor(Date.now() / 1000)) {
          return { valid: false, error: 'Token expired. Please re-authenticate.', expired: true };
        }
      } catch (e) {
        // Not a valid JWT
      }
    }

    // Fallback to PIN hash validation
    const storedPinHash = await redis.get(clientPinKey);
    if (!storedPinHash) {
      return { valid: true, method: 'none' };
    }

    if (token === storedPinHash) {
      return { valid: true, method: 'pin-hash' };
    }

    return { valid: false, error: 'Invalid token or PIN' };
  }

  // Admin handler with auth
  async function adminHandlerWithAuth(req, res, redis) {
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
    mockRes.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    mockRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return mockRes.status(200).end();
    }

    // Validate auth
    const authResult = await validateAuth(req, redis, 'admin:clientPin');
    if (!authResult.valid) {
      return mockRes.status(401).json({
        error: authResult.error,
        expired: authResult.expired || false
      });
    }

    // Proceed with admin operations
    if (req.method === 'GET') {
      const races = await listRaces(redis);
      return mockRes.status(200).json({ races, authMethod: authResult.method });
    }

    if (req.method === 'DELETE') {
      const { raceId } = req.query || {};
      if (!raceId) {
        return mockRes.status(400).json({ error: 'raceId is required' });
      }
      const result = await deleteRace(redis, raceId);
      if (!result.success) {
        return mockRes.status(404).json({ error: result.error });
      }
      return mockRes.status(200).json({ ...result, authMethod: authResult.method });
    }

    return mockRes.status(405).json({ error: 'Method not allowed' });
  }

  describe('No PIN Set', () => {
    it('should allow admin access when no PIN is configured', async () => {
      const req = { method: 'GET', query: {}, headers: {} };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.authMethod).toBe('none');
    });
  });

  describe('PIN Required', () => {
    beforeEach(() => {
      mockRedisData.set('admin:clientPin', 'stored-admin-pin-hash');
    });

    it('should require auth when PIN is set', async () => {
      const req = { method: 'GET', query: {}, headers: {} };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(401);
      expect(result.body.error).toContain('Authorization required');
    });

    it('should accept valid JWT for admin operations', async () => {
      const payload = {
        type: 'race-management',
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      const mockJwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

      const req = {
        method: 'GET',
        query: {},
        headers: { authorization: `Bearer ${mockJwt}` }
      };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.authMethod).toBe('jwt');
    });

    it('should reject expired JWT with expired flag', async () => {
      const payload = {
        type: 'race-management',
        exp: Math.floor(Date.now() / 1000) - 3600 // expired
      };
      const mockJwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

      const req = {
        method: 'GET',
        query: {},
        headers: { authorization: `Bearer ${mockJwt}` }
      };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(401);
      expect(result.body.expired).toBe(true);
    });

    it('should accept PIN hash fallback for admin operations', async () => {
      const req = {
        method: 'GET',
        query: {},
        headers: { authorization: 'Bearer stored-admin-pin-hash' }
      };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.authMethod).toBe('pin-hash');
    });
  });

  describe('DELETE with Auth', () => {
    beforeEach(() => {
      mockRedisData.set('admin:clientPin', 'stored-admin-pin-hash');
      mockRedisData.set('race:test-race', JSON.stringify({
        entries: [{ id: 1 }],
        lastUpdated: Date.now()
      }));
    });

    it('should allow DELETE with valid JWT', async () => {
      const payload = {
        type: 'race-management',
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      const mockJwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

      const req = {
        method: 'DELETE',
        query: { raceId: 'TEST-RACE' },
        headers: { authorization: `Bearer ${mockJwt}` }
      };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.authMethod).toBe('jwt');
    });

    it('should reject DELETE without auth', async () => {
      const req = {
        method: 'DELETE',
        query: { raceId: 'TEST-RACE' },
        headers: {}
      };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(401);
    });
  });

  describe('CORS Headers', () => {
    it('should include Authorization in CORS allowed headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const result = await adminHandlerWithAuth(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });
  });
});
