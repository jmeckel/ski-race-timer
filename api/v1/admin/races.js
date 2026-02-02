import { validateAuth } from '../../lib/jwt.js';
import { getRedis, hasRedisError, CLIENT_PIN_KEY } from '../../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendAuthRequired
} from '../../lib/response.js';

// Configuration
const TOMBSTONE_EXPIRY_SECONDS = 300; // 5 minutes - enough for all clients to poll

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
  if (handlePreflight(req, res, ['GET', 'DELETE', 'OPTIONS'])) {
    return;
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  // Authenticate admin request using JWT or PIN hash
  const auth = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!auth.valid) {
    return sendAuthRequired(res, auth.error || 'Unauthorized', auth.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // List all races
      const races = await listRaces(client);
      return sendSuccess(res, { races });
    }

    if (req.method === 'DELETE') {
      // Race deletion requires chiefJudge role for security
      const userRole = auth.payload?.role;
      if (userRole !== 'chiefJudge') {
        console.log(`[AUDIT] Race deletion DENIED: role=${userRole}, expected=chiefJudge`);
        return sendError(res, 'Race deletion requires Chief Judge role', 403);
      }

      const { raceId, deleteAll } = req.query;

      // Batch delete all races
      if (deleteAll === 'true') {
        const races = await listRaces(client);
        const results = [];
        for (const race of races) {
          const result = await deleteRace(client, race.raceId);
          results.push({ raceId: race.raceId, ...result });
        }
        return sendSuccess(res, {
          success: true,
          deleted: results.filter(r => r.success).length,
          total: races.length,
          results
        });
      }

      if (!raceId) {
        return sendBadRequest(res, 'raceId is required (or use deleteAll=true)');
      }

      const result = await deleteRace(client, raceId);

      if (!result.success) {
        return sendError(res, result.error, 404);
      }

      return sendSuccess(res, result);
    }

    return sendMethodNotAllowed(res);
  } catch (error) {
    console.error('Admin API error:', error.message);

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return sendServiceUnavailable(res, 'Database connection failed. Please try again.');
    }

    return sendError(res, 'Internal server error', 500);
  }
}
