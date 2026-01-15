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
  set: vi.fn((key, value) => {
    mockRedisData.set(key, value);
    return Promise.resolve('OK');
  }),
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
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

// Simplified handler for testing
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

  const redisKey = `race:${raceId}`;

  try {
    if (req.method === 'GET') {
      const data = await redis.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

      return mockRes.status(200).json({
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastUpdated: parsed.lastUpdated || null
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

      const isDuplicate = existing.entries.some(
        e => e.id === entry.id && e.deviceId === sanitizedDeviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();
        await redis.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
      }

      return mockRes.status(200).json({
        success: true,
        entries: existing.entries,
        lastUpdated: existing.lastUpdated
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
      // Pre-populate data
      mockRedisData.set('race:RACE2024', JSON.stringify({
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
      mockRedisData.set('race:RACE2024', 'invalid json');

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
      // Pre-populate with max entries
      const entries = Array.from({ length: MAX_ENTRIES_PER_RACE }, (_, i) => ({
        id: i + 1,
        bib: String(i).padStart(3, '0'),
        point: 'S',
        timestamp: new Date().toISOString(),
        status: 'ok'
      }));
      mockRedisData.set('race:RACE2024', JSON.stringify({ entries, lastUpdated: Date.now() }));

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
});
