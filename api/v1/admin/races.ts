import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { apiLogger, getRequestId } from '../../lib/apiLogger.js';
import { getActiveDeviceCount } from '../../lib/deviceHeartbeat.js';
import { validateAuth } from '../../lib/jwt.js';
import { CLIENT_PIN_KEY, getRedis, hasRedisError } from '../../lib/redis.js';
import {
  handlePreflight,
  sendAuthRequired,
  sendBadRequest,
  sendError,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendSuccess,
} from '../../lib/response.js';

// Configuration
const TOMBSTONE_EXPIRY_SECONDS = 300; // 5 minutes - enough for all clients to poll

interface RaceData {
  entries?: unknown[];
  lastUpdated?: number | null;
}

interface RaceListItem {
  raceId: string;
  entryCount: number;
  deviceCount: number;
  lastUpdated: number | null;
}

interface DeleteRaceResult {
  success: boolean;
  error?: string;
  raceId?: string;
}

// List all races using SCAN
async function listRaces(client: Redis): Promise<RaceListItem[]> {
  const races: RaceListItem[] = [];
  const seenRaceIds = new Set<string>();
  let cursor = '0';

  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      'race:*',
      'COUNT',
      100,
    );
    cursor = nextCursor;

    for (const key of keys) {
      // Skip auxiliary keys (devices, highestBib, deleted*, faults, gate_assignments)
      if (
        key.includes(':devices') ||
        key.includes(':highestBib') ||
        key.includes(':deleted') ||
        key.includes(':faults') ||
        key.includes(':gate_assignments')
      ) {
        continue;
      }

      // Extract race ID from key
      const raceId = key.replace('race:', '');
      if (seenRaceIds.has(raceId)) continue;
      seenRaceIds.add(raceId);

      try {
        const data = await client.get(key);
        if (data) {
          const parsed: RaceData = JSON.parse(data);
          const entryCount = Array.isArray(parsed.entries)
            ? parsed.entries.length
            : 0;
          const deviceCount = await getActiveDeviceCount(client, raceId);

          races.push({
            raceId,
            entryCount,
            deviceCount,
            lastUpdated: parsed.lastUpdated || null,
          });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        apiLogger.error('Error parsing race data', { key, error: message });
      }
    }
  } while (cursor !== '0');

  // Sort by lastUpdated descending
  races.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

  return races;
}

// Delete a race and set tombstone
async function deleteRace(
  client: Redis,
  raceId: string,
): Promise<DeleteRaceResult> {
  // Validate raceId before proceeding (defensive: check type and non-empty)
  if (!raceId || typeof raceId !== 'string' || raceId.trim() === '') {
    return { success: false, error: 'Invalid race ID' };
  }

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
  const faultsKey = `race:${actualRaceId}:faults`;
  const deletedEntriesKey = `race:${actualRaceId}:deleted_entries`;
  const deletedFaultsKey = `race:${actualRaceId}:deleted_faults`;
  const gateAssignmentsKey = `race:${actualRaceId}:gate_assignments`;

  // Set tombstone with expiry (use lowercase for tombstone for consistency)
  await client.set(
    `race:${normalizedRaceId}:deleted`,
    JSON.stringify({
      deletedAt: Date.now(),
      message: 'Race deleted by administrator',
    }),
    'EX',
    TOMBSTONE_EXPIRY_SECONDS,
  );

  // Delete all race data including auxiliary keys
  await client.del(
    raceKey,
    devicesKey,
    highestBibKey,
    faultsKey,
    deletedEntriesKey,
    deletedFaultsKey,
    gateAssignmentsKey,
  );

  // Also try to delete any leftover keys with different casing
  if (actualRaceId !== normalizedRaceId) {
    await client.del(
      normalizedKey,
      `race:${normalizedRaceId}:devices`,
      `race:${normalizedRaceId}:highestBib`,
      `race:${normalizedRaceId}:faults`,
      `race:${normalizedRaceId}:deleted_entries`,
      `race:${normalizedRaceId}:deleted_faults`,
      `race:${normalizedRaceId}:gate_assignments`,
    );
  } else if (raceId !== normalizedRaceId) {
    await client.del(
      originalKey,
      `race:${raceId}:devices`,
      `race:${raceId}:highestBib`,
      `race:${raceId}:faults`,
      `race:${raceId}:deleted_entries`,
      `race:${raceId}:deleted_faults`,
      `race:${raceId}:gate_assignments`,
    );
  }

  return { success: true, raceId: actualRaceId };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['GET', 'DELETE', 'OPTIONS'])) {
    return;
  }

  let client: Redis;
  try {
    client = getRedis();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Redis initialization error', { error: message });
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(
      res,
      'Database connection issue. Please try again.',
    );
  }

  // Authenticate admin request using JWT or PIN hash
  const auth = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!auth.valid) {
    return sendAuthRequired(
      res,
      auth.error || 'Unauthorized',
      auth.expired || false,
    );
  }

  const reqId = getRequestId(req.headers);
  const log = apiLogger.withRequestId(reqId);

  try {
    if (req.method === 'GET') {
      // List all races
      const races = await listRaces(client);
      return sendSuccess(res, { races });
    }

    if (req.method === 'DELETE') {
      // Race deletion requires chiefJudge role for security
      const userRole = auth.payload?.role as string | undefined;
      if (userRole !== 'chiefJudge') {
        log.warn('Race deletion DENIED', {
          role: userRole,
          expected: 'chiefJudge',
        });
        return sendError(res, 'Race deletion requires Chief Judge role', 403);
      }

      const { raceId, deleteAll } = req.query;

      // Batch delete all races
      if (deleteAll === 'true') {
        const races = await listRaces(client);
        const results: Array<{ raceId: string } & DeleteRaceResult> = [];
        for (const race of races) {
          // Validate raceId format from Redis keys before deletion
          if (
            !/^[a-zA-Z0-9_-]+$/.test(race.raceId) ||
            race.raceId.length > 100
          ) {
            results.push({
              raceId: race.raceId,
              success: false,
              error: 'Invalid race ID format',
            });
            continue;
          }
          const result = await deleteRace(client, race.raceId);
          results.push({ raceId: race.raceId, ...result });
        }
        return sendSuccess(res, {
          success: true,
          deleted: results.filter((r) => r.success).length,
          total: races.length,
          results,
        });
      }

      if (!raceId) {
        return sendBadRequest(
          res,
          'raceId is required (or use deleteAll=true)',
        );
      }

      // Validate raceId format
      const raceIdStr = typeof raceId === 'string' ? raceId : String(raceId);
      if (!/^[a-zA-Z0-9_-]+$/.test(raceIdStr) || raceIdStr.length > 100) {
        return sendBadRequest(res, 'Invalid race ID format');
      }

      const result = await deleteRace(client, raceIdStr);

      if (!result.success) {
        return sendError(res, result.error!, 404);
      }

      return sendSuccess(res, { ...result });
    }

    return sendMethodNotAllowed(res);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('Admin API error', { error: err.message });

    if (
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ETIMEDOUT')
    ) {
      return sendServiceUnavailable(
        res,
        'Database connection failed. Please try again.',
      );
    }

    return sendError(res, 'Internal server error', 500);
  }
}
