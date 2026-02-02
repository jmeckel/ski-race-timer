import { validateAuth } from '../lib/jwt.js';
import { getRedis, hasRedisError, CLIENT_PIN_KEY } from '../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendRateLimitExceeded,
  sendAuthRequired,
  setRateLimitHeaders,
  getClientIP,
  sanitizeString,
  safeJsonParse
} from '../lib/response.js';

// Configuration
const MAX_ENTRIES_PER_RACE = 10000;
const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;
const CACHE_EXPIRY_SECONDS = 86400; // 24 hours
const DEVICE_STALE_THRESHOLD = 30000; // 30 seconds - device considered inactive after this
const MAX_ATOMIC_RETRIES = 5; // Max retries for atomic operations

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window per IP
const RATE_LIMIT_MAX_POSTS = 30; // Max POST requests per window per IP

// Photo upload rate limiting (per device per race)
const PHOTO_RATE_LIMIT_WINDOW = 300; // 5 minute window
const PHOTO_RATE_LIMIT_MAX = 20; // Max photos per device per window

// Rate limiting using Redis
async function checkRateLimit(client, ip, method) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);

  // Different limits for GET and POST
  const limit = method === 'POST' ? RATE_LIMIT_MAX_POSTS : RATE_LIMIT_MAX_REQUESTS;
  const key = `ratelimit:${method}:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW + 10); // Extra buffer for expiry
    const results = await multi.exec();

    const count = results[0][1];

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      reset: windowStart + RATE_LIMIT_WINDOW,
      limit
    };
  } catch (error) {
    console.error('Rate limit check error:', error.message);
    // SECURITY: Fail closed - deny request if rate limiting cannot be enforced
    return { allowed: false, remaining: 0, reset: windowStart + RATE_LIMIT_WINDOW, limit, error: 'Rate limiting unavailable' };
  }
}

// Photo rate limiting per device per race
// Prevents memory exhaustion from rapid photo uploads
async function checkPhotoRateLimit(client, raceId, deviceId) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % PHOTO_RATE_LIMIT_WINDOW);
  const key = `ratelimit:photo:${raceId}:${deviceId}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, PHOTO_RATE_LIMIT_WINDOW + 10);
    const results = await multi.exec();

    const count = results[0][1];
    return {
      allowed: count <= PHOTO_RATE_LIMIT_MAX,
      count,
      limit: PHOTO_RATE_LIMIT_MAX
    };
  } catch (error) {
    console.error('Photo rate limit check error:', error.message);
    // Fail open on Redis errors (same as general rate limiting)
    // Set redisError flag so caller can distinguish from actual rate limit
    return { allowed: true, count: 0, limit: PHOTO_RATE_LIMIT_MAX, redisError: true };
  }
}

// Input validation helpers
/**
 * Validate race ID format.
 * Race IDs are CASE-INSENSITIVE - they are normalized to lowercase internally.
 * Example: "RACE2024", "Race2024", and "race2024" all refer to the same race.
 */
function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  // Allow alphanumeric, hyphens, and underscores only
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;

  // ID can be string (new format) or number (legacy)
  if (typeof entry.id !== 'number' && typeof entry.id !== 'string') return false;
  if (typeof entry.id === 'number' && entry.id <= 0) return false;
  if (typeof entry.id === 'string' && entry.id.length === 0) return false;

  if (entry.bib !== undefined && typeof entry.bib !== 'string') return false;
  if (entry.bib && entry.bib.length > 10) return false;
  if (!['S', 'F'].includes(entry.point)) return false;
  if (!entry.timestamp || isNaN(Date.parse(entry.timestamp))) return false;
  if (entry.status && !['ok', 'dns', 'dnf', 'dsq', 'flt'].includes(entry.status)) return false;

  // Run validation (optional field, but must be 1 or 2 if present)
  if (entry.run !== undefined && entry.run !== 1 && entry.run !== 2) return false;

  return true;
}

// Update device heartbeat in Redis
async function updateDeviceHeartbeat(client, normalizedRaceId, deviceId, deviceName) {
  if (!deviceId) return;

  const devicesKey = `race:${normalizedRaceId}:devices`;
  const deviceData = JSON.stringify({
    name: deviceName || 'Unknown',
    lastSeen: Date.now()
  });

  await client.hset(devicesKey, deviceId, deviceData);
  await client.expire(devicesKey, CACHE_EXPIRY_SECONDS);
}

// Get active device count (devices seen within threshold)
async function getActiveDeviceCount(client, normalizedRaceId) {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await client.hgetall(devicesKey);

  if (!devices || Object.keys(devices).length === 0) {
    return 0;
  }

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

  // Clean up stale devices
  if (staleDevices.length > 0) {
    await client.hdel(devicesKey, ...staleDevices);
  }

  return activeCount;
}

// Update highest bib if new bib is higher (atomic with WATCH)
async function updateHighestBib(client, normalizedRaceId, bib) {
  if (!bib) return;

  const bibNum = parseInt(bib, 10);
  if (isNaN(bibNum) || bibNum <= 0) return;

  const highestBibKey = `race:${normalizedRaceId}:highestBib`;

  // Use WATCH for atomic compare-and-set
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    await client.watch(highestBibKey);

    const currentHighest = await client.get(highestBibKey);
    const currentNum = parseInt(currentHighest, 10) || 0;

    if (bibNum <= currentNum) {
      await client.unwatch();
      return; // No update needed
    }

    const multi = client.multi();
    multi.set(highestBibKey, String(bibNum), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      return; // Success
    }
    // WATCH detected change, retry
  }
  console.warn('updateHighestBib: max retries exceeded');
}

/**
 * Atomically add entry to race data using WATCH/MULTI/EXEC
 * Returns { success, existing, isDuplicate, crossDeviceDuplicate, error }
 */
async function atomicAddEntry(client, redisKey, enrichedEntry, sanitizedDeviceId) {
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    // Watch the key for changes
    await client.watch(redisKey);

    // Read current data
    const existingData = await client.get(redisKey);
    const existing = safeJsonParse(existingData, { entries: [], lastUpdated: null });

    // Ensure entries is an array
    if (!Array.isArray(existing.entries)) {
      existing.entries = [];
    }

    // Check entry limit
    if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
      await client.unwatch();
      return {
        success: false,
        error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`,
        existing
      };
    }

    // Check for duplicates (same entry from same device)
    const entryId = String(enrichedEntry.id);
    const isDuplicate = existing.entries.some(
      e => String(e.id) === entryId && e.deviceId === sanitizedDeviceId
    );

    // Check for cross-device duplicates (same bib + same point + same run from different device)
    let crossDeviceDuplicate = null;
    if (enrichedEntry.bib) {
      const entryRun = enrichedEntry.run ?? 1;
      const existingMatch = existing.entries.find(
        e => e.bib === enrichedEntry.bib &&
             e.point === enrichedEntry.point &&
             (e.run ?? 1) === entryRun &&
             e.deviceId !== sanitizedDeviceId
      );
      if (existingMatch) {
        crossDeviceDuplicate = {
          bib: existingMatch.bib,
          point: existingMatch.point,
          run: existingMatch.run ?? 1,
          deviceName: existingMatch.deviceName || 'Unknown device',
          timestamp: existingMatch.timestamp
        };
      }
    }

    if (isDuplicate) {
      await client.unwatch();
      return { success: true, existing, isDuplicate: true, crossDeviceDuplicate };
    }

    // Add entry and update timestamp
    existing.entries.push(enrichedEntry);
    existing.lastUpdated = Date.now();

    // Atomic write with MULTI/EXEC
    const multi = client.multi();
    multi.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      // Success - transaction committed
      return { success: true, existing, isDuplicate: false, crossDeviceDuplicate };
    }

    // WATCH detected concurrent modification, retry
    console.log(`atomicAddEntry: retry ${retry + 1}/${MAX_ATOMIC_RETRIES} due to concurrent modification`);
  }

  // Max retries exceeded
  return {
    success: false,
    error: 'Concurrent modification conflict, please retry',
    existing: null
  };
}

/**
 * Atomically delete entry from race data using WATCH/MULTI/EXEC
 * Returns { success, wasRemoved, existing, error }
 */
async function atomicDeleteEntry(client, redisKey, entryIdStr, sanitizedDeviceId) {
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    // Watch the key for changes
    await client.watch(redisKey);

    // Read current data
    const existingData = await client.get(redisKey);
    const existing = safeJsonParse(existingData, { entries: [], lastUpdated: null });

    // Ensure entries is an array
    if (!Array.isArray(existing.entries)) {
      existing.entries = [];
    }

    // Filter out the entry to delete
    const originalLength = existing.entries.length;
    existing.entries = existing.entries.filter(e => {
      const idMatch = String(e.id) === entryIdStr;
      // If deviceId provided, only delete entries from that device
      if (sanitizedDeviceId) {
        return !(idMatch && e.deviceId === sanitizedDeviceId);
      }
      return !idMatch;
    });

    const wasRemoved = existing.entries.length < originalLength;

    if (!wasRemoved) {
      await client.unwatch();
      return { success: true, wasRemoved: false, existing };
    }

    // Update timestamp and write atomically
    existing.lastUpdated = Date.now();

    const multi = client.multi();
    multi.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      return { success: true, wasRemoved: true, existing };
    }

    // WATCH detected concurrent modification, retry
    console.log(`atomicDeleteEntry: retry ${retry + 1}/${MAX_ATOMIC_RETRIES} due to concurrent modification`);
  }

  return {
    success: false,
    error: 'Concurrent modification conflict, please retry',
    existing: null
  };
}

// Get highest bib for race
async function getHighestBib(client, normalizedRaceId) {
  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const highest = await client.get(highestBibKey);
  return parseInt(highest, 10) || 0;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['GET', 'POST', 'DELETE', 'OPTIONS'])) {
    return;
  }

  const { raceId } = req.query;

  // Validate raceId
  if (!raceId) {
    return sendBadRequest(res, 'raceId is required');
  }

  if (!isValidRaceId(raceId)) {
    return sendBadRequest(res, 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).');
  }

  // Normalize race ID to lowercase for case-insensitive matching
  const normalizedRaceId = raceId.toLowerCase();
  const redisKey = `race:${normalizedRaceId}`;

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

  // Apply rate limiting
  const clientIP = getClientIP(req);
  const rateLimitResult = await checkRateLimit(client, clientIP, req.method);

  // Set rate limit headers
  setRateLimitHeaders(res, rateLimitResult.limit, rateLimitResult.remaining, rateLimitResult.reset);

  if (!rateLimitResult.allowed) {
    return sendRateLimitExceeded(res, rateLimitResult.reset - Math.floor(Date.now() / 1000));
  }

  // Validate sync authorization (JWT or PIN hash)
  const authResult = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!authResult.valid) {
    return sendAuthRequired(res, authResult.error, authResult.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // Check for tombstone (race deleted by admin)
      const tombstoneKey = `race:${normalizedRaceId}:deleted`;
      const tombstoneData = await client.get(tombstoneKey);
      if (tombstoneData) {
        const tombstone = safeJsonParse(tombstoneData, {});
        return sendSuccess(res, {
          deleted: true,
          deletedAt: tombstone.deletedAt || Date.now(),
          message: tombstone.message || 'Race deleted by administrator'
        });
      }

      // Handle checkOnly query - just check if race exists
      if (req.query.checkOnly === 'true') {
        const data = await client.get(redisKey);
        const parsed = safeJsonParse(data, null);
        const exists = parsed !== null;
        const entryCount = exists && Array.isArray(parsed.entries) ? parsed.entries.length : 0;
        return sendSuccess(res, { exists, entryCount });
      }

      // Update device heartbeat if deviceId provided (from query params)
      const { deviceId: queryDeviceId, deviceName: queryDeviceName } = req.query;
      if (queryDeviceId) {
        await updateDeviceHeartbeat(client, normalizedRaceId, queryDeviceId, queryDeviceName);
      }

      const data = await client.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

      // Get deleted entry IDs
      const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
      const deletedIds = await client.smembers(deletedKey);

      // Get active device count
      const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

      // Get highest bib
      const highestBib = await getHighestBib(client, normalizedRaceId);

      return sendSuccess(res, {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastUpdated: parsed.lastUpdated || null,
        deviceCount,
        highestBib,
        deletedIds: deletedIds || []
      });
    }

    if (req.method === 'POST') {
      // Check for tombstone (race deleted by admin)
      const tombstoneKey = `race:${normalizedRaceId}:deleted`;
      const tombstoneData = await client.get(tombstoneKey);
      if (tombstoneData) {
        const tombstone = safeJsonParse(tombstoneData, {});
        return sendSuccess(res, {
          deleted: true,
          deletedAt: tombstone.deletedAt || Date.now(),
          message: tombstone.message || 'Race deleted by administrator'
        });
      }

      const { entry, deviceId, deviceName } = req.body || {};

      // Validate entry
      if (!entry) {
        return sendBadRequest(res, 'entry is required');
      }

      if (!isValidEntry(entry)) {
        return sendBadRequest(res, 'Invalid entry format');
      }

      // Sanitize device info
      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);

      // Build enriched entry with only allowed fields
      const enrichedEntry = {
        id: String(entry.id),
        bib: sanitizeString(entry.bib, 10),
        point: entry.point,
        timestamp: entry.timestamp,
        status: entry.status || 'ok',
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        syncedAt: Date.now()
      };

      // Include photo if present (base64, limit size and rate)
      let photoSkipped = false;
      let photoRateLimited = false;
      if (entry.photo && typeof entry.photo === 'string') {
        // Limit photo size to ~500KB base64 (roughly 375KB image)
        if (entry.photo.length <= 500000) {
          // Check photo rate limit per device to prevent memory exhaustion
          const photoRateLimit = await checkPhotoRateLimit(client, normalizedRaceId, sanitizedDeviceId);
          if (photoRateLimit.allowed) {
            enrichedEntry.photo = entry.photo;
          } else {
            photoRateLimited = true;
            console.log(`Photo rate limited: race=${normalizedRaceId}, device=${sanitizedDeviceId}, count=${photoRateLimit.count}/${photoRateLimit.limit}`);
          }
        } else {
          photoSkipped = true;
        }
      }

      // Include GPS coords if present
      if (entry.gpsCoords && typeof entry.gpsCoords === 'object') {
        enrichedEntry.gpsCoords = {
          latitude: Number(entry.gpsCoords.latitude) || 0,
          longitude: Number(entry.gpsCoords.longitude) || 0,
          accuracy: Number(entry.gpsCoords.accuracy) || 0
        };
      }

      // Atomically add entry using WATCH/MULTI/EXEC to prevent race conditions
      const addResult = await atomicAddEntry(client, redisKey, enrichedEntry, sanitizedDeviceId);

      if (!addResult.success) {
        const status = addResult.error?.includes('limit') ? 400 : 409;
        return sendError(res, addResult.error, status);
      }

      // Update device heartbeat
      await updateDeviceHeartbeat(client, normalizedRaceId, sanitizedDeviceId, sanitizedDeviceName);

      // Update highest bib (also atomic)
      await updateHighestBib(client, normalizedRaceId, enrichedEntry.bib);

      // Get active device count
      const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

      // Get highest bib
      const highestBib = await getHighestBib(client, normalizedRaceId);

      return sendSuccess(res, {
        success: true,
        entries: addResult.existing.entries,
        lastUpdated: addResult.existing.lastUpdated,
        deviceCount,
        highestBib,
        photoSkipped,
        photoRateLimited,
        crossDeviceDuplicate: addResult.crossDeviceDuplicate
      });
    }

    if (req.method === 'DELETE') {
      const { entryId, deviceId } = req.body || {};

      // Validate inputs
      if (!entryId) {
        return sendBadRequest(res, 'entryId is required');
      }

      const entryIdStr = String(entryId);
      const sanitizedDeviceId = sanitizeString(deviceId, 50);

      // Atomically delete entry using WATCH/MULTI/EXEC
      const deleteResult = await atomicDeleteEntry(client, redisKey, entryIdStr, sanitizedDeviceId);

      if (!deleteResult.success) {
        return sendError(res, deleteResult.error, 409);
      }

      // Add to deleted entries set (tracks all deleted IDs for sync)
      const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
      // Store as "entryId:deviceId" to uniquely identify
      const deleteKey = sanitizedDeviceId ? `${entryIdStr}:${sanitizedDeviceId}` : entryIdStr;
      await client.sadd(deletedKey, deleteKey);
      await client.expire(deletedKey, CACHE_EXPIRY_SECONDS);

      // Update device heartbeat
      if (sanitizedDeviceId) {
        const sanitizedDeviceName = sanitizeString(req.body?.deviceName, MAX_DEVICE_NAME_LENGTH);
        await updateDeviceHeartbeat(client, normalizedRaceId, sanitizedDeviceId, sanitizedDeviceName);
      }

      // Get active device count
      const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

      return sendSuccess(res, {
        success: true,
        deleted: deleteResult.wasRemoved,
        entryId: entryIdStr,
        deviceCount
      });
    }

    return sendMethodNotAllowed(res);
  } catch (error) {
    console.error('Sync API error:', error.message);

    // Don't expose internal error details to client
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return sendServiceUnavailable(res, 'Database connection failed. Please try again.');
    }

    return sendError(res, 'Internal server error', 500);
  }
}
