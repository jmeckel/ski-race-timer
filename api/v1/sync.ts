import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { atomicUpdate, CACHE_EXPIRY_SECONDS, MAX_ATOMIC_RETRIES } from '../lib/atomicOps.js';
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
import { isValidRaceId, checkRateLimit, MAX_DEVICE_NAME_LENGTH } from '../lib/validation.js';

// Configuration
const MAX_ENTRIES_PER_RACE = 10000;
const DEFAULT_PAGE_LIMIT = 500;
const MAX_PAGE_LIMIT = 2000;
const DEVICE_STALE_THRESHOLD = 30000; // 30 seconds - device considered inactive after this

// Photo upload rate limiting (per device per race)
const PHOTO_RATE_LIMIT_WINDOW = 300; // 5 minute window
const PHOTO_RATE_LIMIT_MAX = 20; // Max photos per device per window

interface DeviceData {
  name: string;
  lastSeen: number;
}

interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface RaceEntry {
  id: string | number;
  bib?: string;
  point: 'S' | 'F';
  timestamp: string;
  status?: 'ok' | 'dns' | 'dnf' | 'dsq' | 'flt';
  run?: 1 | 2;
  deviceId?: string;
  deviceName?: string;
  photo?: string;
  gpsCoords?: GpsCoords;
  syncedAt?: number;
}

interface RaceData {
  entries: RaceEntry[];
  lastUpdated: number | null;
}

interface PhotoRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  error?: string;
}

interface AtomicAddResult {
  success: boolean;
  existing: RaceData;
  isDuplicate?: boolean;
  crossDeviceDuplicate?: CrossDeviceDuplicate | null;
  error?: string;
}

interface AtomicDeleteResult {
  success: boolean;
  wasRemoved?: boolean;
  existing?: RaceData;
  error?: string;
}

interface CrossDeviceDuplicate {
  bib: string;
  point: string;
  run: number;
  deviceName: string;
  timestamp: string;
}

interface HighestBibResult {
  success: boolean;
  error?: string;
}

interface PostRequestBody {
  entry?: RaceEntry;
  deviceId?: string;
  deviceName?: string;
}

interface DeleteRequestBody {
  entryId?: string | number;
  deviceId?: string;
  deviceName?: string;
}

interface PaginationMeta {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Photo rate limiting per device per race
// Prevents memory exhaustion from rapid photo uploads
async function checkPhotoRateLimit(client: Redis, raceId: string, deviceId: string): Promise<PhotoRateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % PHOTO_RATE_LIMIT_WINDOW);
  const key = `ratelimit:photo:${raceId}:${deviceId}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, PHOTO_RATE_LIMIT_WINDOW + 10);
    const results = await multi.exec();

    const count = results![0][1] as number;
    return {
      allowed: count <= PHOTO_RATE_LIMIT_MAX,
      count,
      limit: PHOTO_RATE_LIMIT_MAX
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Photo rate limit check error:', message);
    // SECURITY: Fail closed - deny request if rate limiting cannot be enforced
    // Prevents memory exhaustion if Redis is unavailable
    return { allowed: false, count: 0, limit: PHOTO_RATE_LIMIT_MAX, error: 'Rate limiting unavailable' };
  }
}

function isValidEntry(entry: unknown): entry is RaceEntry {
  if (!entry || typeof entry !== 'object') return false;

  const e = entry as Record<string, unknown>;

  // ID can be string (new format) or number (legacy)
  if (typeof e.id !== 'number' && typeof e.id !== 'string') return false;
  if (typeof e.id === 'number' && e.id <= 0) return false;
  if (typeof e.id === 'string' && e.id.length === 0) return false;

  if (e.bib !== undefined && typeof e.bib !== 'string') return false;
  if (typeof e.bib === 'string' && e.bib.length > 10) return false;
  if (!['S', 'F'].includes(e.point as string)) return false;
  if (!e.timestamp || isNaN(Date.parse(e.timestamp as string))) return false;
  if (e.status && !['ok', 'dns', 'dnf', 'dsq', 'flt'].includes(e.status as string)) return false;

  // Run validation (optional field, but must be 1 or 2 if present)
  if (e.run !== undefined && e.run !== 1 && e.run !== 2) return false;

  return true;
}

// Update device heartbeat in Redis
async function updateDeviceHeartbeat(client: Redis, normalizedRaceId: string, deviceId: string, deviceName: string): Promise<void> {
  if (!deviceId) return;

  const devicesKey = `race:${normalizedRaceId}:devices`;
  const deviceData = JSON.stringify({
    name: deviceName || 'Unknown',
    lastSeen: Date.now()
  } satisfies DeviceData);

  await client.hset(devicesKey, deviceId, deviceData);
  await client.expire(devicesKey, CACHE_EXPIRY_SECONDS);
}

// Get active device count (devices seen within threshold)
async function getActiveDeviceCount(client: Redis, normalizedRaceId: string): Promise<number> {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await client.hgetall(devicesKey);

  if (!devices || Object.keys(devices).length === 0) {
    return 0;
  }

  const now = Date.now();
  let activeCount = 0;
  const staleDevices: string[] = [];

  for (const [deviceId, deviceJson] of Object.entries(devices)) {
    try {
      const device: DeviceData = JSON.parse(deviceJson);
      if (now - device.lastSeen <= DEVICE_STALE_THRESHOLD) {
        activeCount++;
      } else {
        staleDevices.push(deviceId);
      }
    } catch (e: unknown) {
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
// Returns { success: true } on success, { success: false, error: string } on failure
async function updateHighestBib(client: Redis, normalizedRaceId: string, bib: string | undefined): Promise<HighestBibResult> {
  if (!bib) return { success: true };

  const bibNum = parseInt(bib, 10);
  if (isNaN(bibNum) || bibNum <= 0) return { success: true };

  const highestBibKey = `race:${normalizedRaceId}:highestBib`;

  // Use WATCH for atomic compare-and-set
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    await client.watch(highestBibKey);

    const currentHighest = await client.get(highestBibKey);
    const currentNum = parseInt(currentHighest as string, 10) || 0;

    if (bibNum <= currentNum) {
      await client.unwatch();
      return { success: true }; // No update needed
    }

    const multi = client.multi();
    multi.set(highestBibKey, String(bibNum), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      return { success: true }; // Success
    }
    // WATCH detected change, retry
  }
  console.warn('updateHighestBib: max retries exceeded');
  return { success: false, error: 'Max retries exceeded updating highest bib' };
}

/**
 * Atomically add entry to race data using WATCH/MULTI/EXEC
 * Returns { success, existing, isDuplicate, crossDeviceDuplicate, error }
 */
async function atomicAddEntry(client: Redis, redisKey: string, enrichedEntry: RaceEntry, sanitizedDeviceId: string): Promise<AtomicAddResult> {
  const result = await atomicUpdate<RaceData, AtomicAddResult>(
    client, redisKey,
    { entries: [], lastUpdated: null },
    (existing: RaceData) => {
      if (!Array.isArray(existing.entries)) existing.entries = [];

      // Check entry limit
      if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
        return { abort: true, result: {
          success: false,
          error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`,
          existing
        }};
      }

      // Check for duplicates (same entry from same device)
      const entryId = String(enrichedEntry.id);
      const isDuplicate = existing.entries.some(
        (e: RaceEntry) => String(e.id) === entryId && e.deviceId === sanitizedDeviceId
      );

      // Check for cross-device duplicates (same bib + same point + same run from different device)
      let crossDeviceDuplicate: CrossDeviceDuplicate | null = null;
      if (enrichedEntry.bib) {
        const entryRun = enrichedEntry.run ?? 1;
        const existingMatch = existing.entries.find(
          (e: RaceEntry) => e.bib === enrichedEntry.bib &&
               e.point === enrichedEntry.point &&
               ((e.run ?? 1) === entryRun) &&
               e.deviceId !== sanitizedDeviceId
        );
        if (existingMatch) {
          crossDeviceDuplicate = {
            bib: existingMatch.bib!,
            point: existingMatch.point,
            run: existingMatch.run ?? 1,
            deviceName: existingMatch.deviceName || 'Unknown device',
            timestamp: existingMatch.timestamp
          };
        }
      }

      if (isDuplicate) {
        return { abort: true, result: { success: true, existing, isDuplicate: true, crossDeviceDuplicate }};
      }

      existing.entries.push(enrichedEntry);
      existing.lastUpdated = Date.now();
      return { data: existing, result: { success: true, existing, isDuplicate: false, crossDeviceDuplicate }};
    },
    'atomicAddEntry'
  );
  // Handle AtomicConflictError (existing: null) by providing empty default
  if (result.existing === null) {
    return { ...result, existing: { entries: [], lastUpdated: null } };
  }
  return result;
}

/**
 * Atomically delete entry from race data using WATCH/MULTI/EXEC
 * Returns { success, wasRemoved, existing, error }
 */
async function atomicDeleteEntry(client: Redis, redisKey: string, entryIdStr: string, sanitizedDeviceId: string): Promise<AtomicDeleteResult> {
  const result = await atomicUpdate<RaceData, AtomicDeleteResult>(
    client, redisKey,
    { entries: [], lastUpdated: null },
    (existing: RaceData) => {
      if (!Array.isArray(existing.entries)) existing.entries = [];

      const originalLength = existing.entries.length;
      existing.entries = existing.entries.filter((e: RaceEntry) => {
        const idMatch = String(e.id) === entryIdStr;
        if (sanitizedDeviceId) return !(idMatch && e.deviceId === sanitizedDeviceId);
        return !idMatch;
      });

      const wasRemoved = existing.entries.length < originalLength;
      if (!wasRemoved) {
        return { abort: true, result: { success: true, wasRemoved: false, existing }};
      }

      existing.lastUpdated = Date.now();
      return { data: existing, result: { success: true, wasRemoved: true, existing }};
    },
    'atomicDeleteEntry'
  );
  if (result.existing === null) {
    return { ...result, existing: { entries: [], lastUpdated: null } };
  }
  return result;
}

// Get highest bib for race
async function getHighestBib(client: Redis, normalizedRaceId: string): Promise<number> {
  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const highest = await client.get(highestBibKey);
  return parseInt(highest as string, 10) || 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['GET', 'POST', 'DELETE', 'OPTIONS'])) {
    return;
  }

  const { raceId } = req.query;

  // Validate raceId
  if (!raceId) {
    return sendBadRequest(res, 'raceId is required');
  }

  const raceIdStr = typeof raceId === 'string' ? raceId : String(raceId);

  if (!isValidRaceId(raceIdStr)) {
    return sendBadRequest(res, 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).');
  }

  // Normalize race ID to lowercase for case-insensitive matching
  const normalizedRaceId = raceIdStr.toLowerCase();
  const redisKey = `race:${normalizedRaceId}`;

  let client: Redis;
  try {
    client = getRedis();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Redis initialization error:', message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  // Apply rate limiting
  const clientIP = getClientIP(req);
  const rateLimitResult = await checkRateLimit(client, clientIP, req.method!, {
    keyPrefix: 'sync',
    window: 60,
    maxRequests: 100,
    maxPosts: 30
  });

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
        const tombstone = safeJsonParse(tombstoneData, {} as Record<string, unknown>);
        return sendSuccess(res, {
          deleted: true,
          deletedAt: tombstone.deletedAt || Date.now(),
          message: tombstone.message || 'Race deleted by administrator'
        });
      }

      // Handle checkOnly query - just check if race exists
      if (req.query.checkOnly === 'true') {
        const data = await client.get(redisKey);
        const parsed = safeJsonParse(data, null) as RaceData | null;
        const exists = parsed !== null;
        const entryCount = exists && Array.isArray(parsed.entries) ? parsed.entries.length : 0;
        return sendSuccess(res, { exists, entryCount });
      }

      // Update device heartbeat if deviceId provided (from query params)
      const { deviceId: queryDeviceId, deviceName: queryDeviceName } = req.query;
      if (queryDeviceId) {
        const deviceIdStr = typeof queryDeviceId === 'string' ? queryDeviceId : String(queryDeviceId);
        const deviceNameStr = typeof queryDeviceName === 'string' ? queryDeviceName : '';
        await updateDeviceHeartbeat(client, normalizedRaceId, deviceIdStr, deviceNameStr);
      }

      const data = await client.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null }) as RaceData;

      // Get deleted entry IDs
      const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
      const deletedIds = await client.smembers(deletedKey);

      // Get active device count
      const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

      // Get highest bib
      const highestBib = await getHighestBib(client, normalizedRaceId);

      const allEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const total = allEntries.length;

      // Pagination: optional offset/limit query params (backwards-compatible)
      const { offset: offsetParam, limit: limitParam } = req.query;
      let entries = allEntries;
      let paginationMeta: PaginationMeta | null = null;

      if (limitParam !== undefined) {
        const offset = Math.max(0, parseInt(offsetParam as string, 10) || 0);
        const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(limitParam as string, 10) || DEFAULT_PAGE_LIMIT));
        entries = allEntries.slice(offset, offset + limit);
        paginationMeta = { offset, limit, total, hasMore: offset + limit < total };
      }

      return sendSuccess(res, {
        entries,
        lastUpdated: parsed.lastUpdated || null,
        total,
        deviceCount,
        highestBib,
        deletedIds: deletedIds || [],
        ...(paginationMeta && { pagination: paginationMeta })
      });
    }

    if (req.method === 'POST') {
      // Check for tombstone (race deleted by admin)
      const tombstoneKey = `race:${normalizedRaceId}:deleted`;
      const tombstoneData = await client.get(tombstoneKey);
      if (tombstoneData) {
        const tombstone = safeJsonParse(tombstoneData, {} as Record<string, unknown>);
        return sendSuccess(res, {
          deleted: true,
          deletedAt: tombstone.deletedAt || Date.now(),
          message: tombstone.message || 'Race deleted by administrator'
        });
      }

      const { entry, deviceId, deviceName } = (req.body || {}) as PostRequestBody;

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
      const enrichedEntry: RaceEntry = {
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
        return sendError(res, addResult.error!, status);
      }

      // Update device heartbeat
      await updateDeviceHeartbeat(client, normalizedRaceId, sanitizedDeviceId, sanitizedDeviceName);

      // Update highest bib (also atomic) - non-critical, entry already saved
      const bibUpdateResult = await updateHighestBib(client, normalizedRaceId, enrichedEntry.bib);

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
        crossDeviceDuplicate: addResult.crossDeviceDuplicate,
        // Flag if highest bib update failed (non-critical warning)
        highestBibUpdateFailed: !bibUpdateResult.success
      });
    }

    if (req.method === 'DELETE') {
      const { entryId, deviceId } = (req.body || {}) as DeleteRequestBody;

      // Validate inputs
      if (!entryId) {
        return sendBadRequest(res, 'entryId is required');
      }

      const entryIdStr = String(entryId);
      const sanitizedDeviceId = sanitizeString(deviceId, 50);

      // Atomically delete entry using WATCH/MULTI/EXEC
      const deleteResult = await atomicDeleteEntry(client, redisKey, entryIdStr, sanitizedDeviceId);

      if (!deleteResult.success) {
        return sendError(res, deleteResult.error!, 409);
      }

      // Add to deleted entries set (tracks all deleted IDs for sync)
      const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
      // Store as "entryId:deviceId" to uniquely identify
      const deleteKey = sanitizedDeviceId ? `${entryIdStr}:${sanitizedDeviceId}` : entryIdStr;
      await client.sadd(deletedKey, deleteKey);
      await client.expire(deletedKey, CACHE_EXPIRY_SECONDS);

      // Update device heartbeat
      if (sanitizedDeviceId) {
        const sanitizedDeviceName = sanitizeString((req.body as DeleteRequestBody)?.deviceName, MAX_DEVICE_NAME_LENGTH);
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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Sync API error:', err.message);

    // Don't expose internal error details to client
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      return sendServiceUnavailable(res, 'Database connection failed. Please try again.');
    }

    return sendError(res, 'Internal server error', 500);
  }
}
