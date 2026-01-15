import Redis from 'ioredis';

// Configuration
const MAX_ENTRIES_PER_RACE = 10000;
const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;
const CACHE_EXPIRY_SECONDS = 86400; // 24 hours

// Create Redis client - reuse connection across invocations
let redis = null;
let redisError = null;

function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not configured');
    }

    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 2000);
      }
    });

    // Handle Redis connection errors
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      redisError = err;
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
      redisError = null;
    });
  }
  return redis;
}

// CORS configuration - use environment variable or default to restrictive
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Input validation helpers
function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  // Allow alphanumeric, hyphens, and underscores only
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
    const parsed = JSON.parse(str);
    return parsed;
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  setCorsHeaders(res);

  const { raceId } = req.query;

  // Validate raceId
  if (!raceId) {
    return res.status(400).json({ error: 'raceId is required' });
  }

  if (!isValidRaceId(raceId)) {
    return res.status(400).json({
      error: 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).'
    });
  }

  const redisKey = `race:${raceId}`;

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  // Check for recent Redis errors
  if (redisError) {
    return res.status(503).json({ error: 'Database connection issue. Please try again.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await client.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

      return res.status(200).json({
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastUpdated: parsed.lastUpdated || null
      });
    }

    if (req.method === 'POST') {
      const { entry, deviceId, deviceName } = req.body || {};

      // Validate entry
      if (!entry) {
        return res.status(400).json({ error: 'entry is required' });
      }

      if (!isValidEntry(entry)) {
        return res.status(400).json({ error: 'Invalid entry format' });
      }

      // Sanitize device info
      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);

      // Get existing data
      const existingData = await client.get(redisKey);
      const existing = safeJsonParse(existingData, { entries: [], lastUpdated: null });

      // Ensure entries is an array
      if (!Array.isArray(existing.entries)) {
        existing.entries = [];
      }

      // Check entry limit
      if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
        return res.status(400).json({
          error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`
        });
      }

      // Build enriched entry with only allowed fields
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

      // Check for duplicates (same entry from same device)
      const isDuplicate = existing.entries.some(
        e => e.id === entry.id && e.deviceId === sanitizedDeviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();

        // Store with expiry
        await client.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
      }

      return res.status(200).json({
        success: true,
        entries: existing.entries,
        lastUpdated: existing.lastUpdated
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sync API error:', error.message);

    // Don't expose internal error details to client
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return res.status(503).json({ error: 'Database connection failed. Please try again.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}
