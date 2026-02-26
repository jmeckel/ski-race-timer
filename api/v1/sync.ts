import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { apiLogger } from '../lib/apiLogger.js';
import {
  atomicUpdate,
  CACHE_EXPIRY_SECONDS,
  MAX_ATOMIC_RETRIES,
} from '../lib/atomicOps.js';
import {
  getActiveDeviceCount,
  updateDeviceHeartbeat,
} from '../lib/deviceHeartbeat.js';
import { detectCrossDeviceDuplicate } from '../lib/duplicateDetection.js';
import { createHandler } from '../lib/handler.js';
import { checkPhotoRateLimit } from '../lib/photoRateLimit.js';
import {
  checkIfNoneMatch,
  generateETag,
  safeJsonParse,
  sanitizeString,
  sendBadRequest,
  sendError,
  sendSuccess,
} from '../lib/response.js';
import { EntrySchema, validate } from '../lib/schemas.js';
import type {
  AtomicAddResult,
  AtomicDeleteResult,
  BatchEntryResult,
  DeleteRequestBody,
  HighestBibResult,
  PaginationMeta,
  PostRequestBody,
  RaceData,
  RaceEntry,
} from '../lib/syncTypes.js';
import { isValidRaceId, MAX_DEVICE_NAME_LENGTH } from '../lib/validation.js';

// Configuration
const MAX_ENTRIES_PER_RACE = 10000;
const MAX_BATCH_SIZE = 10;
const DEFAULT_PAGE_LIMIT = 500;
const MAX_PAGE_LIMIT = 2000;

// Update highest bib if new bib is higher (atomic with WATCH)
// Returns { success: true } on success, { success: false, error: string } on failure
async function updateHighestBib(
  client: Redis,
  normalizedRaceId: string,
  bib: string | undefined,
): Promise<HighestBibResult> {
  if (!bib) return { success: true };

  const bibNum = parseInt(bib, 10);
  if (Number.isNaN(bibNum) || bibNum <= 0) return { success: true };

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
  apiLogger.warn('updateHighestBib: max retries exceeded');
  return { success: false, error: 'Max retries exceeded updating highest bib' };
}

/**
 * Atomically add entry to race data using WATCH/MULTI/EXEC
 * Returns { success, existing, isDuplicate, crossDeviceDuplicate, error }
 */
async function atomicAddEntry(
  client: Redis,
  redisKey: string,
  enrichedEntry: RaceEntry,
  sanitizedDeviceId: string,
): Promise<AtomicAddResult> {
  const result = await atomicUpdate<RaceData, AtomicAddResult>(
    client,
    redisKey,
    { entries: [], lastUpdated: null },
    (existing: RaceData) => {
      if (!Array.isArray(existing.entries)) existing.entries = [];

      // Check entry limit
      if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
        return {
          abort: true,
          result: {
            success: false,
            error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`,
            existing,
          },
        };
      }

      // Check for duplicates (same entry from same device)
      const entryId = String(enrichedEntry.id);
      const isDuplicate = existing.entries.some(
        (e: RaceEntry) =>
          String(e.id) === entryId && e.deviceId === sanitizedDeviceId,
      );

      // Check for cross-device duplicates
      const crossDeviceDuplicate = detectCrossDeviceDuplicate(
        existing.entries,
        enrichedEntry,
        sanitizedDeviceId,
      );

      if (isDuplicate) {
        return {
          abort: true,
          result: {
            success: true,
            existing,
            isDuplicate: true,
            crossDeviceDuplicate,
          },
        };
      }

      existing.entries.push(enrichedEntry);
      existing.lastUpdated = Date.now();
      return {
        data: existing,
        result: {
          success: true,
          existing,
          isDuplicate: false,
          crossDeviceDuplicate,
        },
      };
    },
    'atomicAddEntry',
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
async function atomicDeleteEntry(
  client: Redis,
  redisKey: string,
  entryIdStr: string,
  sanitizedDeviceId: string,
): Promise<AtomicDeleteResult> {
  const result = await atomicUpdate<RaceData, AtomicDeleteResult>(
    client,
    redisKey,
    { entries: [], lastUpdated: null },
    (existing: RaceData) => {
      if (!Array.isArray(existing.entries)) existing.entries = [];

      const originalLength = existing.entries.length;
      existing.entries = existing.entries.filter((e: RaceEntry) => {
        const idMatch = String(e.id) === entryIdStr;
        if (sanitizedDeviceId)
          return !(idMatch && e.deviceId === sanitizedDeviceId);
        return !idMatch;
      });

      const wasRemoved = existing.entries.length < originalLength;
      if (!wasRemoved) {
        return {
          abort: true,
          result: { success: true, wasRemoved: false, existing },
        };
      }

      existing.lastUpdated = Date.now();
      return {
        data: existing,
        result: { success: true, wasRemoved: true, existing },
      };
    },
    'atomicDeleteEntry',
  );
  if (result.existing === null) {
    return { ...result, existing: { entries: [], lastUpdated: null } };
  }
  return result;
}

// Get highest bib for race
async function getHighestBib(
  client: Redis,
  normalizedRaceId: string,
): Promise<number> {
  const highestBibKey = `race:${normalizedRaceId}:highestBib`;
  const highest = await client.get(highestBibKey);
  return parseInt(highest as string, 10) || 0;
}

// ─── GET Handler ───

async function handleGet(
  req: VercelRequest,
  res: VercelResponse,
  client: Redis,
  normalizedRaceId: string,
  redisKey: string,
): Promise<void> {
  // Check for tombstone (race deleted by admin)
  const tombstoneKey = `race:${normalizedRaceId}:deleted`;
  const tombstoneData = await client.get(tombstoneKey);
  if (tombstoneData) {
    const tombstone = safeJsonParse(
      tombstoneData,
      {} as Record<string, unknown>,
    );
    return sendSuccess(res, {
      deleted: true,
      deletedAt: tombstone.deletedAt || Date.now(),
      message: tombstone.message || 'Race deleted by administrator',
    });
  }

  // Handle checkOnly query - just check if race exists
  if (req.query.checkOnly === 'true') {
    const data = await client.get(redisKey);
    const parsed = safeJsonParse(data, null) as RaceData | null;
    const exists = parsed !== null;
    const entryCount =
      exists && Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    return sendSuccess(res, { exists, entryCount });
  }

  // Update device heartbeat if deviceId provided (from query params)
  const { deviceId: queryDeviceId, deviceName: queryDeviceName } = req.query;
  if (queryDeviceId) {
    const deviceIdStr =
      typeof queryDeviceId === 'string' ? queryDeviceId : String(queryDeviceId);
    const deviceNameStr =
      typeof queryDeviceName === 'string' ? queryDeviceName : '';
    await updateDeviceHeartbeat(
      client,
      normalizedRaceId,
      deviceIdStr,
      deviceNameStr,
    );
  }

  const data = await client.get(redisKey);
  const parsed = safeJsonParse(data, {
    entries: [],
    lastUpdated: null,
  }) as RaceData;

  // Get deleted entry IDs
  const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
  const deletedIds = await client.smembers(deletedKey);

  // Get active device count
  const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

  // Get highest bib
  const highestBib = await getHighestBib(client, normalizedRaceId);

  const allEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const total = allEntries.length;

  // Delta sync: optional `since` query param filters entries modified after timestamp
  // When present, only entries with syncedAt >= since are returned (reduces payload)
  // When absent, all entries are returned (backward compatible, used on first sync)
  const { since: sinceParam } = req.query;
  let filteredEntries = allEntries;
  if (sinceParam !== undefined) {
    const sinceTs = parseInt(sinceParam as string, 10);
    if (!Number.isNaN(sinceTs) && sinceTs > 0) {
      filteredEntries = allEntries.filter(
        (e: RaceEntry) =>
          typeof e.syncedAt === 'number' && e.syncedAt >= sinceTs,
      );
    }
  }

  // Pagination: optional offset/limit query params (backwards-compatible)
  const { offset: offsetParam, limit: limitParam } = req.query;
  let entries = filteredEntries;
  let paginationMeta: PaginationMeta | null = null;

  if (limitParam !== undefined) {
    const offset = Math.max(0, parseInt(offsetParam as string, 10) || 0);
    const limit = Math.min(
      MAX_PAGE_LIMIT,
      Math.max(1, parseInt(limitParam as string, 10) || DEFAULT_PAGE_LIMIT),
    );
    entries = filteredEntries.slice(offset, offset + limit);
    const filteredTotal = filteredEntries.length;
    paginationMeta = {
      offset,
      limit,
      total: filteredTotal,
      hasMore: offset + limit < filteredTotal,
    };
  }

  const responseData = {
    entries,
    lastUpdated: parsed.lastUpdated || null,
    total,
    deviceCount,
    highestBib,
    deletedIds: deletedIds || [],
    ...(paginationMeta && { pagination: paginationMeta }),
  };

  // ETag support: allow clients to skip re-downloading unchanged data
  const etag = generateETag(responseData);
  if (checkIfNoneMatch(req, etag)) {
    res.setHeader('ETag', etag);
    res.status(304).end();
    return;
  }
  res.setHeader('ETag', etag);

  return sendSuccess(res, responseData);
}

// ─── POST Handler ───

/**
 * Enrich a raw entry with sanitized fields and optional photo/GPS data
 */
async function enrichEntry(
  entry: RaceEntry,
  sanitizedDeviceId: string,
  sanitizedDeviceName: string,
  client: Redis,
  normalizedRaceId: string,
  log: ReturnType<typeof apiLogger.withRequestId>,
): Promise<{
  enrichedEntry: RaceEntry;
  photoSkipped: boolean;
  photoRateLimited: boolean;
}> {
  const enrichedEntry: RaceEntry = {
    id: String(entry.id),
    bib: sanitizeString(entry.bib, 10),
    point: entry.point,
    timestamp: entry.timestamp,
    status: entry.status || 'ok',
    deviceId: sanitizedDeviceId,
    deviceName: sanitizedDeviceName,
    syncedAt: Date.now(),
  };

  // Include photo if present (base64, limit size and rate)
  let photoSkipped = false;
  let photoRateLimited = false;
  const ALLOWED_PHOTO_PREFIXES = [
    'data:image/jpeg;base64,',
    'data:image/png;base64,',
    'data:image/webp;base64,',
  ];
  if (entry.photo && typeof entry.photo === 'string') {
    const hasValidPrefix = ALLOWED_PHOTO_PREFIXES.some((prefix) =>
      entry.photo!.startsWith(prefix),
    );
    if (!hasValidPrefix) {
      photoSkipped = true;
    } else if (entry.photo.length <= 500000) {
      const photoRateLimit = await checkPhotoRateLimit(
        client,
        normalizedRaceId,
        sanitizedDeviceId,
      );
      if (photoRateLimit.allowed) {
        enrichedEntry.photo = entry.photo;
      } else {
        photoRateLimited = true;
        log.warn('Photo rate limited', {
          race: normalizedRaceId,
          device: sanitizedDeviceId,
          count: photoRateLimit.count,
          limit: photoRateLimit.limit,
        });
      }
    } else {
      photoSkipped = true;
    }
  }

  // Include run if present
  if (entry.run === 1 || entry.run === 2) {
    enrichedEntry.run = entry.run;
  }

  // Include GPS timing metadata if present
  if (entry.timeSource === 'gps' || entry.timeSource === 'system') {
    enrichedEntry.timeSource = entry.timeSource;
  }
  if (
    typeof entry.gpsTimestamp === 'number' &&
    Number.isFinite(entry.gpsTimestamp)
  ) {
    enrichedEntry.gpsTimestamp = entry.gpsTimestamp;
  }

  // Include GPS coords if present
  if (entry.gpsCoords && typeof entry.gpsCoords === 'object') {
    enrichedEntry.gpsCoords = {
      latitude: Number(entry.gpsCoords.latitude) || 0,
      longitude: Number(entry.gpsCoords.longitude) || 0,
      accuracy: Number(entry.gpsCoords.accuracy) || 0,
    };
  }

  return { enrichedEntry, photoSkipped, photoRateLimited };
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  client: Redis,
  normalizedRaceId: string,
  redisKey: string,
  log: ReturnType<typeof apiLogger.withRequestId>,
): Promise<void> {
  // Check for tombstone (race deleted by admin)
  const tombstoneKey = `race:${normalizedRaceId}:deleted`;
  const tombstoneData = await client.get(tombstoneKey);
  if (tombstoneData) {
    const tombstone = safeJsonParse(
      tombstoneData,
      {} as Record<string, unknown>,
    );
    return sendSuccess(res, {
      deleted: true,
      deletedAt: tombstone.deletedAt || Date.now(),
      message: tombstone.message || 'Race deleted by administrator',
    });
  }

  const { entry, entries, deviceId, deviceName } = (req.body ||
    {}) as PostRequestBody;

  // Batch mode: process multiple entries
  if (entries) {
    return handlePostBatch(
      req,
      res,
      client,
      normalizedRaceId,
      redisKey,
      log,
      entries,
      deviceId,
      deviceName,
    );
  }

  // Single entry mode (backward compatible)
  if (!entry) {
    return sendBadRequest(res, 'entry is required');
  }

  // Validate entry with Valibot schema (replaces hand-written isValidEntry)
  const entryResult = validate(EntrySchema, entry);
  if (!entryResult.success) {
    return sendBadRequest(res, `Invalid entry: ${entryResult.error}`);
  }

  // Sanitize device info
  const sanitizedDeviceId = sanitizeString(deviceId, 50);
  const sanitizedDeviceName = sanitizeString(
    deviceName,
    MAX_DEVICE_NAME_LENGTH,
  );

  const { enrichedEntry, photoSkipped, photoRateLimited } = await enrichEntry(
    entry,
    sanitizedDeviceId,
    sanitizedDeviceName,
    client,
    normalizedRaceId,
    log,
  );

  // Atomically add entry using WATCH/MULTI/EXEC to prevent race conditions
  const addResult = await atomicAddEntry(
    client,
    redisKey,
    enrichedEntry,
    sanitizedDeviceId,
  );

  if (!addResult.success) {
    const status = addResult.error?.includes('limit') ? 400 : 409;
    return sendError(res, addResult.error!, status);
  }

  // Update device heartbeat
  await updateDeviceHeartbeat(
    client,
    normalizedRaceId,
    sanitizedDeviceId,
    sanitizedDeviceName,
  );

  // Update highest bib (also atomic) - non-critical, entry already saved
  const bibUpdateResult = await updateHighestBib(
    client,
    normalizedRaceId,
    enrichedEntry.bib,
  );

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
    highestBibUpdateFailed: !bibUpdateResult.success,
  });
}

// ─── POST Batch Handler ───

async function handlePostBatch(
  _req: VercelRequest,
  res: VercelResponse,
  client: Redis,
  normalizedRaceId: string,
  redisKey: string,
  log: ReturnType<typeof apiLogger.withRequestId>,
  entries: RaceEntry[],
  deviceId: string | undefined,
  deviceName: string | undefined,
): Promise<void> {
  // Validate entries is an array
  if (!Array.isArray(entries)) {
    return sendBadRequest(res, 'entries must be an array');
  }

  // Enforce batch size limit
  if (entries.length > MAX_BATCH_SIZE) {
    return sendBadRequest(
      res,
      `Batch size exceeds maximum of ${MAX_BATCH_SIZE} entries`,
    );
  }

  if (entries.length === 0) {
    return sendBadRequest(res, 'entries array must not be empty');
  }

  // Sanitize device info
  const sanitizedDeviceId = sanitizeString(deviceId, 50);
  const sanitizedDeviceName = sanitizeString(
    deviceName,
    MAX_DEVICE_NAME_LENGTH,
  );

  // Process each entry atomically
  const results: BatchEntryResult[] = [];

  for (const entry of entries) {
    const entryId = String(entry.id || '');

    const entryValidation = validate(EntrySchema, entry);
    if (!entryValidation.success) {
      results.push({
        entryId,
        success: false,
        error: `Invalid entry: ${entryValidation.error}`,
      });
      continue;
    }

    try {
      const { enrichedEntry } = await enrichEntry(
        entry,
        sanitizedDeviceId,
        sanitizedDeviceName,
        client,
        normalizedRaceId,
        log,
      );

      const addResult = await atomicAddEntry(
        client,
        redisKey,
        enrichedEntry,
        sanitizedDeviceId,
      );

      if (!addResult.success) {
        results.push({ entryId, success: false, error: addResult.error });
      } else {
        results.push({ entryId, success: true });

        // Update highest bib (non-critical)
        await updateHighestBib(
          client,
          normalizedRaceId,
          enrichedEntry.bib,
        ).catch(() => {});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.warn('Batch entry processing error', { entryId, error: message });
      results.push({ entryId, success: false, error: 'Processing error' });
    }
  }

  // Update device heartbeat once for the batch
  await updateDeviceHeartbeat(
    client,
    normalizedRaceId,
    sanitizedDeviceId,
    sanitizedDeviceName,
  );

  // Get active device count
  const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

  // Get highest bib
  const highestBib = await getHighestBib(client, normalizedRaceId);

  return sendSuccess(res, {
    success: true,
    results,
    deviceCount,
    highestBib,
  });
}

// ─── DELETE Handler ───

async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  client: Redis,
  normalizedRaceId: string,
  redisKey: string,
): Promise<void> {
  const { entryId, deviceId } = (req.body || {}) as DeleteRequestBody;

  // Validate inputs
  if (!entryId) {
    return sendBadRequest(res, 'entryId is required');
  }

  const entryIdStr = String(entryId);
  const sanitizedDeviceId = sanitizeString(deviceId, 50);

  // Atomically delete entry using WATCH/MULTI/EXEC
  const deleteResult = await atomicDeleteEntry(
    client,
    redisKey,
    entryIdStr,
    sanitizedDeviceId,
  );

  if (!deleteResult.success) {
    return sendError(res, deleteResult.error!, 409);
  }

  // Add to deleted entries set (tracks all deleted IDs for sync)
  const deletedKey = `race:${normalizedRaceId}:deleted_entries`;
  // Store as "entryId:deviceId" to uniquely identify
  const deleteKey = sanitizedDeviceId
    ? `${entryIdStr}:${sanitizedDeviceId}`
    : entryIdStr;
  await client.sadd(deletedKey, deleteKey);
  await client.expire(deletedKey, CACHE_EXPIRY_SECONDS);

  // Update device heartbeat
  if (sanitizedDeviceId) {
    const sanitizedDeviceName = sanitizeString(
      (req.body as DeleteRequestBody)?.deviceName,
      MAX_DEVICE_NAME_LENGTH,
    );
    await updateDeviceHeartbeat(
      client,
      normalizedRaceId,
      sanitizedDeviceId,
      sanitizedDeviceName,
    );
  }

  // Get active device count
  const deviceCount = await getActiveDeviceCount(client, normalizedRaceId);

  return sendSuccess(res, {
    success: true,
    deleted: deleteResult.wasRemoved,
    entryId: entryIdStr,
    deviceCount,
  });
}

// ─── Main Handler ───

export default createHandler(
  {
    methods: ['GET', 'POST', 'DELETE'],
    rateLimit: {
      keyPrefix: 'sync',
      window: 60,
      maxRequests: 100,
      maxPosts: 100,
    },
    auth: true,
    writeRequiresAuth: true,
  },
  async (req, res, { client, log }) => {
    const { raceId } = req.query;

    // Validate raceId
    if (!raceId) {
      return sendBadRequest(res, 'raceId is required');
    }

    const raceIdStr = typeof raceId === 'string' ? raceId : String(raceId);

    if (!isValidRaceId(raceIdStr)) {
      return sendBadRequest(
        res,
        'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).',
      );
    }

    // Normalize race ID to lowercase for case-insensitive matching
    const normalizedRaceId = raceIdStr.toLowerCase();
    const redisKey = `race:${normalizedRaceId}`;

    if (req.method === 'GET') {
      return await handleGet(req, res, client, normalizedRaceId, redisKey);
    }

    if (req.method === 'POST') {
      return await handlePost(
        req,
        res,
        client,
        normalizedRaceId,
        redisKey,
        log,
      );
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res, client, normalizedRaceId, redisKey);
    }
  },
);
