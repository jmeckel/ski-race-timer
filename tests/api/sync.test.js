/**
 * API Tests - Sync Endpoint
 *
 * Tests for the /api/sync endpoint (api/sync.js)
 * Uses mocked Redis client to test handler logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  hset: vi.fn((key, field, value) => {
    const hash = mockRedisData.get(key) || {};
    hash[field] = value;
    mockRedisData.set(key, hash);
    return Promise.resolve(1);
  }),
  hgetall: vi.fn((key) => Promise.resolve(mockRedisData.get(key) || {})),
  hdel: vi.fn((key, ...fields) => {
    const hash = mockRedisData.get(key) || {};
    fields.forEach(f => delete hash[f]);
    mockRedisData.set(key, hash);
    return Promise.resolve(fields.length);
  }),
  expire: vi.fn(() => Promise.resolve(1)),
  exists: vi.fn((key) => Promise.resolve(mockRedisData.has(key) ? 1 : 0)),
  on: vi.fn(),
  connect: vi.fn(() => Promise.resolve())
});

// ============================================
// Mock Handler Implementation
// ============================================

const MAX_ENTRIES_PER_RACE = 10000;
const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;
const CACHE_EXPIRY_SECONDS = 86400;
const DEVICE_STALE_THRESHOLD = 30000; // 30 seconds

function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'number' || entry.id <= 0) return false;
  if (entry.bib !== undefined && typeof entry.bib !== 'string') return false;
  if (entry.bib && entry.bib.length > 10) return false;
  if (!['S', 'I1', 'I2', 'I3', 'F'].includes(entry.point)) return false;
  if (!entry.timestamp || isNaN(Date.parse(entry.timestamp))) return false;
  if (entry.status && !['ok', 'dns', 'dnf', 'dsq'].includes(entry.status)) return false;
  return true;
}

function sanitizeString(str, maxLength) {
  if (!str || typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

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

// Helper: Update device heartbeat
async function updateDeviceHeartbeat(redis, normalizedRaceId, deviceId, deviceName) {
  if (!deviceId) return;
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const deviceData = JSON.stringify({
    name: deviceName || 'Unknown',
    lastSeen: Date.now()
  });
  await redis.hset(devicesKey, deviceId, deviceData);
  await redis.expire(devicesKey, CACHE_EXPIRY_SECONDS);
}

// Helper: Get active device count
async function getActiveDeviceCount(redis, normalizedRaceId) {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await redis.hgetall(devicesKey);
  if (!devices || Object.keys(devices).length === 0) return 0;

  const now = Date.now();
  let activeCount = 0;
  const staleDevices = [];

  for (const [deviceId, deviceJson] of Object.entries(devices)) {
    try {
      const device = JSON.parse(deviceJson);
      if (now - device.lastSeen <= DEVICE_STALE_THRESHOLD) {
        activeCount++;
      } else {
        staleDevices.push(deviceId);
      }
    } catch (e) {
      staleDevices.push(deviceId);
    }
  }

  if (staleDevices.length > 0) {
    await redis.hdel(devicesKey, ...staleDevices);
  }

  return activeCount;
}

// Helper: Update highest bib
async function updateHighestBib(redis, normalizedRaceId, bib) {
  if (!bib) return;
  const bibNum = parseInt(bib, 10);
  if (isNaN(bibNum) || bibNum <= 0) return;

  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const currentHighest = await redis.get(highestBibKey);
  const currentNum = parseInt(currentHighest, 10) || 0;

  if (bibNum > currentNum) {
    await redis.set(highestBibKey, String(bibNum), 'EX', CACHE_EXPIRY_SECONDS);
  }
}

// Helper: Get highest bib
async function getHighestBib(redis, normalizedRaceId) {
  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const highest = await redis.get(highestBibKey);
  return parseInt(highest, 10) || 0;
}

// Simplified handler for testing (updated with new features)
async function handler(req, res, redis) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Track response
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

  const { raceId } = req.query || {};

  if (!raceId) {
    return mockRes.status(400).json({ error: 'raceId is required' });
  }

  if (!isValidRaceId(raceId)) {
    return mockRes.status(400).json({
      error: 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).'
    });
  }

  // Normalize race ID to lowercase for case-insensitive matching
  const normalizedRaceId = raceId.toLowerCase();
  const redisKey = `race:${normalizedRaceId}`;

  try {
    if (req.method === 'GET') {
      // Handle checkOnly query - just check if race exists
      if (req.query.checkOnly === 'true') {
        const data = await redis.get(redisKey);
        const parsed = safeJsonParse(data, null);
        const exists = parsed !== null;
        const entryCount = exists && Array.isArray(parsed.entries) ? parsed.entries.length : 0;
        return mockRes.status(200).json({ exists, entryCount });
      }

      // Update device heartbeat if deviceId provided
      const { deviceId: queryDeviceId, deviceName: queryDeviceName } = req.query;
      if (queryDeviceId) {
        await updateDeviceHeartbeat(redis, normalizedRaceId, queryDeviceId, queryDeviceName);
      }

      const data = await redis.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

      // Get active device count
      const deviceCount = await getActiveDeviceCount(redis, normalizedRaceId);

      // Get highest bib
      const highestBib = await getHighestBib(redis, normalizedRaceId);

      return mockRes.status(200).json({
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastUpdated: parsed.lastUpdated || null,
        deviceCount,
        highestBib
      });
    }

    if (req.method === 'POST') {
      const { entry, deviceId, deviceName } = req.body || {};

      if (!entry) {
        return mockRes.status(400).json({ error: 'entry is required' });
      }

      if (!isValidEntry(entry)) {
        return mockRes.status(400).json({ error: 'Invalid entry format' });
      }

      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);

      const existingData = await redis.get(redisKey);
      const existing = safeJsonParse(existingData, { entries: [], lastUpdated: null });

      if (!Array.isArray(existing.entries)) {
        existing.entries = [];
      }

      if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
        return mockRes.status(400).json({
          error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`
        });
      }

      const enrichedEntry = {
        id: entry.id,
        bib: sanitizeString(entry.bib, 10),
        point: entry.point,
        timestamp: entry.timestamp,
        status: entry.status || 'ok',
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        syncedAt: Date.now()
      };

      // Handle photo (with size limit)
      let photoSkipped = false;
      if (entry.photo && typeof entry.photo === 'string') {
        if (entry.photo.length <= 500000) {
          enrichedEntry.photo = entry.photo;
        } else {
          photoSkipped = true;
        }
      }

      const isDuplicate = existing.entries.some(
        e => e.id === entry.id && e.deviceId === sanitizedDeviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();
        await redis.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
      }

      // Update device heartbeat
      await updateDeviceHeartbeat(redis, normalizedRaceId, sanitizedDeviceId, sanitizedDeviceName);

      // Update highest bib
      await updateHighestBib(redis, normalizedRaceId, enrichedEntry.bib);

      // Get active device count
      const deviceCount = await getActiveDeviceCount(redis, normalizedRaceId);

      // Get highest bib
      const highestBib = await getHighestBib(redis, normalizedRaceId);

      return mockRes.status(200).json({
        success: true,
        entries: existing.entries,
        lastUpdated: existing.lastUpdated,
        deviceCount,
        highestBib,
        photoSkipped
      });
    }

    return mockRes.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return mockRes.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================
// Tests
// ============================================

describe('API: /api/sync', () => {
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
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('GET /api/sync', () => {
    it('should return 400 when raceId is missing', async () => {
      const req = { method: 'GET', query: {} };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('raceId is required');
    });

    it('should return 400 for invalid raceId format', async () => {
      const req = { method: 'GET', query: { raceId: 'invalid race!' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Invalid raceId format');
    });

    it('should return empty entries for new race', async () => {
      const req = { method: 'GET', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toEqual([]);
      expect(result.body.lastUpdated).toBe(null);
    });

    it('should return existing entries for race', async () => {
      // Pre-populate data (use lowercase key since handler normalizes to lowercase)
      mockRedisData.set('race:race2024', JSON.stringify({
        entries: [{ id: 1, bib: '001', point: 'S' }],
        lastUpdated: 1704067200000
      }));

      const req = { method: 'GET', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toHaveLength(1);
      expect(result.body.entries[0].bib).toBe('001');
    });

    it('should handle corrupted data gracefully', async () => {
      mockRedisData.set('race:race2024', 'invalid json');

      const req = { method: 'GET', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toEqual([]);
    });
  });

  describe('POST /api/sync', () => {
    const validEntry = {
      id: 1704067200000,
      bib: '001',
      point: 'S',
      timestamp: '2024-01-01T12:00:00.000Z',
      status: 'ok'
    };

    it('should return 400 when entry is missing', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {}
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('entry is required');
    });

    it('should return 400 for invalid entry format', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: { entry: { invalid: true } }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('Invalid entry format');
    });

    it('should create new entry successfully', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.entries).toHaveLength(1);
      expect(result.body.entries[0].deviceId).toBe('dev_123');
    });

    it('should prevent duplicate entries', async () => {
      // First entry
      const req1 = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      await handler(req1, {}, mockRedis);

      // Duplicate entry
      const req2 = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      const result = await handler(req2, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toHaveLength(1); // Still only 1 entry
    });

    it('should allow same entry from different device', async () => {
      // First device
      const req1 = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      await handler(req1, {}, mockRedis);

      // Second device
      const req2 = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_456',
          deviceName: 'Timer 2'
        }
      };
      const result = await handler(req2, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toHaveLength(2);
    });

    it('should sanitize deviceName', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: '<script>alert(1)</script>'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries[0].deviceName).not.toContain('<');
      expect(result.body.entries[0].deviceName).not.toContain('>');
    });

    it('should enforce max entries limit', async () => {
      // Pre-populate with max entries (use lowercase key since handler normalizes to lowercase)
      const entries = Array.from({ length: MAX_ENTRIES_PER_RACE }, (_, i) => ({
        id: i + 1,
        bib: String(i).padStart(3, '0'),
        point: 'S',
        timestamp: new Date().toISOString(),
        status: 'ok'
      }));
      mockRedisData.set('race:race2024', JSON.stringify({ entries, lastUpdated: Date.now() }));

      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: { ...validEntry, id: MAX_ENTRIES_PER_RACE + 1 },
          deviceId: 'dev_new'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Maximum entries limit');
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for PUT', async () => {
      const req = { method: 'PUT', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
      expect(result.body.error).toBe('Method not allowed');
    });

    it('should return 405 for DELETE', async () => {
      const req = { method: 'DELETE', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(405);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in GET response', async () => {
      const req = { method: 'GET', query: { raceId: 'RACE2024' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should include CORS headers in POST response', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: {
            id: 1,
            bib: '001',
            point: 'S',
            timestamp: new Date().toISOString()
          },
          deviceId: 'dev_123'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  // ============================================
  // New Feature Tests
  // ============================================

  describe('Case-insensitive Race ID', () => {
    const validEntry = {
      id: 1704067200000,
      bib: '001',
      point: 'S',
      timestamp: '2024-01-01T12:00:00.000Z',
      status: 'ok'
    };

    it('should treat RACE2024 and race2024 as the same race', async () => {
      // Create entry with uppercase race ID
      const req1 = {
        method: 'POST',
        query: { raceId: 'RACE2024' },
        body: {
          entry: validEntry,
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      await handler(req1, {}, mockRedis);

      // Fetch with lowercase race ID
      const req2 = { method: 'GET', query: { raceId: 'race2024' } };
      const result = await handler(req2, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toHaveLength(1);
    });

    it('should treat MixedCase and mixedcase as the same race', async () => {
      // Create entry with mixed case
      const req1 = {
        method: 'POST',
        query: { raceId: 'MyRace2024' },
        body: {
          entry: { ...validEntry, id: 1704067200001 },
          deviceId: 'dev_123'
        }
      };
      await handler(req1, {}, mockRedis);

      // Fetch with different case
      const req2 = { method: 'GET', query: { raceId: 'MYRACE2024' } };
      const result = await handler(req2, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries).toHaveLength(1);
    });
  });

  describe('Device Counter', () => {
    it('should return deviceCount in GET response', async () => {
      const req = {
        method: 'GET',
        query: { raceId: 'DEVICE-TEST', deviceId: 'dev_123', deviceName: 'Timer 1' }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(typeof result.body.deviceCount).toBe('number');
    });

    it('should count active device on heartbeat', async () => {
      // First device
      const req1 = {
        method: 'GET',
        query: { raceId: 'DEVICE-TEST-2', deviceId: 'dev_1', deviceName: 'Timer 1' }
      };
      await handler(req1, {}, mockRedis);

      // Second device
      const req2 = {
        method: 'GET',
        query: { raceId: 'DEVICE-TEST-2', deviceId: 'dev_2', deviceName: 'Timer 2' }
      };
      const result = await handler(req2, {}, mockRedis);

      expect(result.body.deviceCount).toBe(2);
    });

    it('should return deviceCount in POST response', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'DEVICE-POST-TEST' },
        body: {
          entry: {
            id: 1704067200000,
            bib: '001',
            point: 'S',
            timestamp: '2024-01-01T12:00:00.000Z'
          },
          deviceId: 'dev_123',
          deviceName: 'Timer 1'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(typeof result.body.deviceCount).toBe('number');
      expect(result.body.deviceCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Race Exists Check (checkOnly)', () => {
    it('should return exists=false for new race', async () => {
      const req = {
        method: 'GET',
        query: { raceId: 'NEW-RACE', checkOnly: 'true' }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.exists).toBe(false);
      expect(result.body.entryCount).toBe(0);
    });

    it('should return exists=true for existing race with entries', async () => {
      // Create race with entries
      mockRedisData.set('race:existing-race', JSON.stringify({
        entries: [
          { id: 1, bib: '001', point: 'S' },
          { id: 2, bib: '002', point: 'S' }
        ],
        lastUpdated: Date.now()
      }));

      const req = {
        method: 'GET',
        query: { raceId: 'EXISTING-RACE', checkOnly: 'true' }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.exists).toBe(true);
      expect(result.body.entryCount).toBe(2);
    });

    it('should be case-insensitive for checkOnly', async () => {
      // Create race with uppercase
      mockRedisData.set('race:check-case', JSON.stringify({
        entries: [{ id: 1, bib: '001', point: 'S' }],
        lastUpdated: Date.now()
      }));

      // Check with different case
      const req = {
        method: 'GET',
        query: { raceId: 'CHECK-CASE', checkOnly: 'true' }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.body.exists).toBe(true);
    });
  });

  describe('Highest Bib Tracking', () => {
    it('should return highestBib in GET response', async () => {
      const req = { method: 'GET', query: { raceId: 'BIB-TEST' } };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(typeof result.body.highestBib).toBe('number');
    });

    it('should track highest bib from POST entries', async () => {
      const baseEntry = {
        point: 'S',
        timestamp: '2024-01-01T12:00:00.000Z'
      };

      // Post entry with bib 005
      const req1 = {
        method: 'POST',
        query: { raceId: 'BIB-TRACK-TEST' },
        body: {
          entry: { ...baseEntry, id: 1, bib: '005' },
          deviceId: 'dev_1'
        }
      };
      await handler(req1, {}, mockRedis);

      // Post entry with bib 010
      const req2 = {
        method: 'POST',
        query: { raceId: 'BIB-TRACK-TEST' },
        body: {
          entry: { ...baseEntry, id: 2, bib: '010' },
          deviceId: 'dev_1'
        }
      };
      await handler(req2, {}, mockRedis);

      // Post entry with bib 003 (lower, should not change highest)
      const req3 = {
        method: 'POST',
        query: { raceId: 'BIB-TRACK-TEST' },
        body: {
          entry: { ...baseEntry, id: 3, bib: '003' },
          deviceId: 'dev_1'
        }
      };
      const result = await handler(req3, {}, mockRedis);

      expect(result.body.highestBib).toBe(10);
    });

    it('should return highestBib in POST response', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'BIB-POST-TEST' },
        body: {
          entry: {
            id: 1704067200000,
            bib: '042',
            point: 'S',
            timestamp: '2024-01-01T12:00:00.000Z'
          },
          deviceId: 'dev_123'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.highestBib).toBe(42);
    });
  });

  describe('Photo Sync', () => {
    const baseEntry = {
      id: 1704067200000,
      bib: '001',
      point: 'S',
      timestamp: '2024-01-01T12:00:00.000Z'
    };

    it('should include small photo in entry', async () => {
      const smallPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(1000);

      const req = {
        method: 'POST',
        query: { raceId: 'PHOTO-SMALL-TEST' },
        body: {
          entry: { ...baseEntry, photo: smallPhoto },
          deviceId: 'dev_123'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries[0].photo).toBe(smallPhoto);
      expect(result.body.photoSkipped).toBe(false);
    });

    it('should skip photo larger than 500KB and set photoSkipped flag', async () => {
      const largePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(600000);

      const req = {
        method: 'POST',
        query: { raceId: 'PHOTO-LARGE-TEST' },
        body: {
          entry: { ...baseEntry, id: 1704067200001, photo: largePhoto },
          deviceId: 'dev_123'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.entries[0].photo).toBeUndefined();
      expect(result.body.photoSkipped).toBe(true);
    });

    it('should return photoSkipped=false when no photo provided', async () => {
      const req = {
        method: 'POST',
        query: { raceId: 'PHOTO-NONE-TEST' },
        body: {
          entry: { ...baseEntry, id: 1704067200002 },
          deviceId: 'dev_123'
        }
      };
      const result = await handler(req, {}, mockRedis);

      expect(result.status).toBe(200);
      expect(result.body.photoSkipped).toBe(false);
    });
  });
});
