import Redis from 'ioredis';
import crypto from 'crypto';

// Configuration
const TOMBSTONE_EXPIRY_SECONDS = 300; // 5 minutes - enough for all clients to poll

// Authentication - PIN must be set via ADMIN_PIN environment variable
const ADMIN_PIN = process.env.ADMIN_PIN;

/**
 * Hash PIN using SHA-256 for secure comparison
 */
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * Authenticate admin request
 * Returns { authenticated: boolean, error?: string }
 */
function authenticateAdmin(req) {
  // If no ADMIN_PIN is configured, authentication is disabled (development mode)
  if (!ADMIN_PIN) {
    console.warn('ADMIN_PIN not configured - admin API is unprotected!');
    return { authenticated: true };
  }

  // Get PIN from Authorization header (format: "Bearer <pin>")
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { authenticated: false, error: 'Authorization header required' };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return { authenticated: false, error: 'Invalid authorization format. Use: Bearer <pin>' };
  }

  const providedPin = parts[1];

  // Validate PIN format (4 digits)
  if (!/^\d{4}$/.test(providedPin)) {
    return { authenticated: false, error: 'Invalid PIN format' };
  }

  // Compare PINs using timing-safe comparison
  const providedHash = hashPin(providedPin);
  const expectedHash = hashPin(ADMIN_PIN);

  if (!crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash))) {
    return { authenticated: false, error: 'Invalid PIN' };
  }

  return { authenticated: true };
}

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
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      }
    });

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

// CORS configuration
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Device stale threshold (same as sync.js)
const DEVICE_STALE_THRESHOLD = 30000; // 30 seconds

// Get active device count for a race
async function getActiveDeviceCount(client, normalizedRaceId) {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await client.hgetall(devicesKey);

  if (!devices || Object.keys(devices).length === 0) {
    return 0;
  }

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

// List all races using SCAN
async function listRaces(client) {
  const races = [];
  const seenRaceIds = new Set();
  let cursor = '0';

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'race:*', 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys) {
      // Skip auxiliary keys (devices, highestBib, deleted)
      if (key.includes(':devices') || key.includes(':highestBib') || key.includes(':deleted')) {
        continue;
      }

      // Extract race ID from key
      const raceId = key.replace('race:', '');
      if (seenRaceIds.has(raceId)) continue;
      seenRaceIds.add(raceId);

      try {
        const data = await client.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          const entryCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
          const deviceCount = await getActiveDeviceCount(client, raceId);

          races.push({
            raceId,
            entryCount,
            deviceCount,
            lastUpdated: parsed.lastUpdated || null
          });
        }
      } catch (e) {
        console.error('Error parsing race data:', key, e.message);
      }
    }
  } while (cursor !== '0');

  // Sort by lastUpdated descending
  races.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

  return races;
}

// Delete a race and set tombstone
async function deleteRace(client, raceId) {
  // Try original casing first, then lowercase (for backwards compatibility)
  const originalKey = `race:${raceId}`;
  const normalizedRaceId = raceId.toLowerCase();
  const normalizedKey = `race:${normalizedRaceId}`;

  // Check which key exists (original casing or normalized)
  let actualRaceId = raceId;
  let raceKey = originalKey;

  const existsOriginal = await client.exists(originalKey);
  if (!existsOriginal) {
    // Try lowercase version
    const existsNormalized = await client.exists(normalizedKey);
    if (!existsNormalized) {
      return { success: false, error: 'Race not found' };
    }
    actualRaceId = normalizedRaceId;
    raceKey = normalizedKey;
  }

  const devicesKey = `race:${actualRaceId}:devices`;
  const highestBibKey = `race:${actualRaceId}:highestBib`;
  const tombstoneKey = `race:${actualRaceId}:deleted`;

  // Set tombstone with expiry (use lowercase for tombstone for consistency)
  await client.set(
    `race:${normalizedRaceId}:deleted`,
    JSON.stringify({
      deletedAt: Date.now(),
      message: 'Race deleted by administrator'
    }),
    'EX',
    TOMBSTONE_EXPIRY_SECONDS
  );

  // Delete all race data
  await client.del(raceKey, devicesKey, highestBibKey);

  // Also try to delete any leftover keys with different casing
  if (actualRaceId !== normalizedRaceId) {
    await client.del(normalizedKey, `race:${normalizedRaceId}:devices`, `race:${normalizedRaceId}:highestBib`);
  } else if (raceId !== normalizedRaceId) {
    await client.del(originalKey, `race:${raceId}:devices`, `race:${raceId}:highestBib`);
  }

  return { success: true, raceId: actualRaceId };
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  // Authenticate admin request
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  if (redisError) {
    return res.status(503).json({ error: 'Database connection issue. Please try again.' });
  }

  try {
    if (req.method === 'GET') {
      // List all races
      const races = await listRaces(client);
      return res.status(200).json({ races });
    }

    if (req.method === 'DELETE') {
      const { raceId, deleteAll } = req.query;

      // Batch delete all races
      if (deleteAll === 'true') {
        const races = await listRaces(client);
        const results = [];
        for (const race of races) {
          const result = await deleteRace(client, race.raceId);
          results.push({ raceId: race.raceId, ...result });
        }
        return res.status(200).json({
          success: true,
          deleted: results.filter(r => r.success).length,
          total: races.length,
          results
        });
      }

      if (!raceId) {
        return res.status(400).json({ error: 'raceId is required (or use deleteAll=true)' });
      }

      const result = await deleteRace(client, raceId);

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin API error:', error.message);

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return res.status(503).json({ error: 'Database connection failed. Please try again.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}
