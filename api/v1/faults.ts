import type Redis from 'ioredis';
import { atomicUpdate, CACHE_EXPIRY_SECONDS } from '../lib/atomicOps.js';
import { createHandler } from '../lib/handler.js';
import {
  safeJsonParse,
  sanitizeString,
  sendBadRequest,
  sendError,
  sendMethodNotAllowed,
  sendSuccess,
} from '../lib/response.js';
import {
  FaultEntrySchema,
  type StoredFaultEntry,
  validate,
} from '../lib/schemas.js';
import { isValidRaceId, MAX_DEVICE_NAME_LENGTH } from '../lib/validation.js';

// Configuration
const MAX_FAULTS_PER_RACE = 5000;

interface FaultsData {
  faults: StoredFaultEntry[];
  lastUpdated: number | null;
}

interface GateAssignment {
  deviceName: string;
  gateStart: number;
  gateEnd: number;
  lastSeen: number;
  isReady: boolean;
  firstGateColor: string;
}

interface GateAssignmentResult {
  deviceId: string;
  deviceName: string;
  gateStart: number;
  gateEnd: number;
  lastSeen: number;
  isReady: boolean;
  firstGateColor: string;
}

interface AtomicAddFaultResult {
  success: boolean;
  existing: FaultsData;
  isDuplicate?: boolean;
  error?: string;
}

interface AtomicDeleteFaultResult {
  success: boolean;
  wasRemoved?: boolean;
  existing?: FaultsData;
  error?: string;
}

interface PostRequestBody {
  fault?: Record<string, unknown>;
  deviceId?: string;
  deviceName?: string;
  gateRange?: [number, number];
  isReady?: boolean;
  firstGateColor?: string;
}

interface DeleteRequestBody {
  faultId?: string | number;
  deviceId?: string;
  deviceName?: string;
  approvedBy?: string;
}

/**
 * Sanitize version history items to prevent stored XSS via Redis
 */
function sanitizeVersionHistoryItem(
  item: unknown,
): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value, 200);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Sanitize nested objects (e.g., data field)
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
        if (typeof nv === 'string') {
          nested[nk] = sanitizeString(nv, 200);
        } else if (typeof nv === 'number' || typeof nv === 'boolean') {
          nested[nk] = nv;
        }
      }
      sanitized[key] = nested;
    }
  }
  return sanitized;
}

/**
 * Atomically add fault to race data
 */
async function atomicAddFault(
  client: Redis,
  redisKey: string,
  enrichedFault: StoredFaultEntry,
  sanitizedDeviceId: string,
): Promise<AtomicAddFaultResult> {
  const result = await atomicUpdate<FaultsData, AtomicAddFaultResult>(
    client,
    redisKey,
    { faults: [], lastUpdated: null },
    (existing: FaultsData) => {
      if (!Array.isArray(existing.faults)) existing.faults = [];

      // Check limit
      if (existing.faults.length >= MAX_FAULTS_PER_RACE) {
        return {
          abort: true,
          result: {
            success: false,
            error: `Maximum faults limit (${MAX_FAULTS_PER_RACE}) reached for this race`,
            existing,
          },
        };
      }

      // Check for existing fault (same fault from same device)
      const faultId = String(enrichedFault.id);
      const existingIndex = existing.faults.findIndex(
        (f: StoredFaultEntry) =>
          String(f.id) === faultId && f.deviceId === sanitizedDeviceId,
      );

      if (existingIndex !== -1) {
        const existingFault = existing.faults[existingIndex]!;
        const shouldUpdate =
          (enrichedFault.currentVersion || 1) >
            (existingFault.currentVersion || 1) ||
          enrichedFault.markedForDeletion !== existingFault.markedForDeletion;

        if (shouldUpdate) {
          existing.faults[existingIndex] = enrichedFault;
          existing.lastUpdated = Date.now();
        } else {
          return {
            abort: true,
            result: { success: true, existing, isDuplicate: true },
          };
        }
      } else {
        existing.faults.push(enrichedFault);
        existing.lastUpdated = Date.now();
      }

      return {
        data: existing,
        result: { success: true, existing, isDuplicate: false },
      };
    },
    'atomicAddFault',
  );
  // Handle AtomicConflictError (existing: null) by providing empty default
  if (result.existing === null) {
    return { ...result, existing: { faults: [], lastUpdated: null } };
  }
  return result;
}

/**
 * Atomically delete fault from race data
 */
async function atomicDeleteFault(
  client: Redis,
  redisKey: string,
  faultIdStr: string,
  sanitizedDeviceId: string,
): Promise<AtomicDeleteFaultResult> {
  const result = await atomicUpdate<FaultsData, AtomicDeleteFaultResult>(
    client,
    redisKey,
    { faults: [], lastUpdated: null },
    (existing: FaultsData) => {
      if (!Array.isArray(existing.faults)) existing.faults = [];

      const originalLength = existing.faults.length;
      existing.faults = existing.faults.filter((f: StoredFaultEntry) => {
        const idMatch = String(f.id) === faultIdStr;
        if (sanitizedDeviceId)
          return !(idMatch && f.deviceId === sanitizedDeviceId);
        return !idMatch;
      });

      const wasRemoved = existing.faults.length < originalLength;
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
    'atomicDeleteFault',
  );
  if (result.existing === null) {
    return { ...result, existing: { faults: [], lastUpdated: null } };
  }
  return result;
}

/**
 * Update gate assignment for a device
 */
async function updateGateAssignment(
  client: Redis,
  normalizedRaceId: string,
  deviceId: string,
  deviceName: string,
  gateRange: [number, number],
  isReady: boolean,
  firstGateColor: string,
): Promise<void> {
  if (!deviceId || !gateRange) return;

  const assignmentsKey = `race:${normalizedRaceId}:gate_assignments`;
  const assignmentData = JSON.stringify({
    deviceName: deviceName || 'Unknown',
    gateStart: gateRange[0],
    gateEnd: gateRange[1],
    lastSeen: Date.now(),
    isReady: isReady === true,
    firstGateColor: firstGateColor || 'red',
  } satisfies GateAssignment);

  await client.hset(assignmentsKey, deviceId, assignmentData);
  await client.expire(assignmentsKey, CACHE_EXPIRY_SECONDS);
}

/**
 * Get all gate assignments for a race
 */
async function getGateAssignments(
  client: Redis,
  normalizedRaceId: string,
): Promise<GateAssignmentResult[]> {
  const assignmentsKey = `race:${normalizedRaceId}:gate_assignments`;
  const assignments = await client.hgetall(assignmentsKey);

  if (!assignments || Object.keys(assignments).length === 0) {
    return [];
  }

  const result: GateAssignmentResult[] = [];
  const now = Date.now();
  const staleThreshold = 60000; // 1 minute

  for (const [deviceId, assignmentJson] of Object.entries(assignments)) {
    try {
      const assignment: GateAssignment = JSON.parse(assignmentJson);
      // Include if seen within threshold
      if (now - assignment.lastSeen <= staleThreshold) {
        result.push({
          deviceId,
          deviceName: assignment.deviceName,
          gateStart: assignment.gateStart,
          gateEnd: assignment.gateEnd,
          lastSeen: assignment.lastSeen,
          isReady: assignment.isReady === true,
          firstGateColor: assignment.firstGateColor || 'red',
        });
      }
    } catch (_e: unknown) {
      // Skip invalid data
    }
  }

  return result;
}

export default createHandler(
  {
    methods: ['GET', 'POST', 'DELETE'],
    rateLimit: {
      keyPrefix: 'faults',
      window: 60,
      maxRequests: 100,
      maxPosts: 50,
    },
    auth: true,
    writeRequiresAuth: true,
  },
  async (req, res, { client, clientIP, log, auth }) => {
    const { raceId } = req.query;

    // Validate raceId
    if (!raceId) {
      return sendBadRequest(res, 'raceId is required');
    }

    const raceIdStr = typeof raceId === 'string' ? raceId : String(raceId);

    if (!isValidRaceId(raceIdStr)) {
      return sendBadRequest(
        res,
        'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only.',
      );
    }

    const normalizedRaceId = raceIdStr.toLowerCase();
    const faultsKey = `race:${normalizedRaceId}:faults`;

    if (req.method === 'GET') {
      // Fetch faults for race
      const data = await client.get(faultsKey);
      const parsed = safeJsonParse(data, {
        faults: [],
        lastUpdated: null,
      }) as FaultsData;

      // Get deleted fault IDs
      const deletedKey = `race:${normalizedRaceId}:deleted_faults`;
      const deletedIds = await client.smembers(deletedKey);

      // Get gate assignments
      const gateAssignments = await getGateAssignments(
        client,
        normalizedRaceId,
      );

      // Update gate assignment if provided in query (with validation)
      const {
        deviceId,
        deviceName,
        gateStart,
        gateEnd,
        isReady,
        firstGateColor,
      } = req.query;
      if (deviceId && gateStart && gateEnd) {
        const start = parseInt(gateStart as string, 10);
        const end = parseInt(gateEnd as string, 10);
        // Validate gate numbers: must be positive integers, end >= start, reasonable max (100 gates)
        if (
          !Number.isNaN(start) &&
          !Number.isNaN(end) &&
          start > 0 &&
          end >= start &&
          end <= 100
        ) {
          const validColor =
            firstGateColor === 'red' || firstGateColor === 'blue'
              ? firstGateColor
              : 'red';
          await updateGateAssignment(
            client,
            normalizedRaceId,
            deviceId as string,
            deviceName as string,
            [start, end],
            isReady === 'true',
            validColor,
          );
        }
      }

      return sendSuccess(res, {
        faults: Array.isArray(parsed.faults) ? parsed.faults : [],
        lastUpdated: parsed.lastUpdated || null,
        deletedIds: deletedIds || [],
        gateAssignments,
      });
    }

    if (req.method === 'POST') {
      const {
        fault,
        deviceId,
        deviceName,
        gateRange,
        isReady,
        firstGateColor,
      } = (req.body || {}) as PostRequestBody;

      if (!fault) {
        return sendBadRequest(res, 'fault is required');
      }

      // Validate fault with Valibot schema (replaces hand-written isValidFaultEntry)
      const faultResult = validate(FaultEntrySchema, fault);
      if (!faultResult.success) {
        return sendBadRequest(res, `Invalid fault: ${faultResult.error}`);
      }
      const validFault = faultResult.data;

      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(
        deviceName,
        MAX_DEVICE_NAME_LENGTH,
      );

      // Build enriched fault with version history and deletion flags
      const enrichedFault: StoredFaultEntry = {
        id: String(validFault.id),
        bib: sanitizeString(validFault.bib, 10),
        run: validFault.run,
        gateNumber: validFault.gateNumber,
        faultType: validFault.faultType,
        timestamp: validFault.timestamp,
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        gateRange: validFault.gateRange,
        syncedAt: Date.now(),
        // Voice notes fields
        notes: validFault.notes ? sanitizeString(validFault.notes, 500) : null,
        notesSource: validFault.notesSource ?? null,
        notesTimestamp: validFault.notesTimestamp
          ? sanitizeString(validFault.notesTimestamp, 64)
          : null,
        // Version tracking fields
        currentVersion: validFault.currentVersion || 1,
        versionHistory: Array.isArray(validFault.versionHistory)
          ? validFault.versionHistory
              .slice(0, 100)
              .map(sanitizeVersionHistoryItem)
              .filter(Boolean)
          : [],
        // Deletion workflow fields
        markedForDeletion: validFault.markedForDeletion === true,
        markedForDeletionAt: validFault.markedForDeletionAt
          ? sanitizeString(validFault.markedForDeletionAt, 64)
          : null,
        markedForDeletionBy: sanitizeString(
          validFault.markedForDeletionBy,
          100,
        ),
        markedForDeletionByDeviceId: sanitizeString(
          validFault.markedForDeletionByDeviceId,
          50,
        ),
        deletionApprovedAt: validFault.deletionApprovedAt
          ? sanitizeString(validFault.deletionApprovedAt, 64)
          : null,
        deletionApprovedBy: sanitizeString(validFault.deletionApprovedBy, 100),
      };

      const addResult = await atomicAddFault(
        client,
        faultsKey,
        enrichedFault,
        sanitizedDeviceId,
      );

      if (!addResult.success) {
        const status = addResult.error?.includes('limit') ? 400 : 409;
        return sendError(res, addResult.error!, status);
      }

      // Update gate assignment if provided (with validation)
      if (gateRange && Array.isArray(gateRange) && gateRange.length === 2) {
        const start = parseInt(String(gateRange[0]), 10);
        const end = parseInt(String(gateRange[1]), 10);
        // Validate gate numbers: must be positive integers, end >= start, reasonable max (100 gates)
        if (
          !Number.isNaN(start) &&
          !Number.isNaN(end) &&
          start > 0 &&
          end >= start &&
          end <= 100
        ) {
          const validColor =
            firstGateColor === 'red' || firstGateColor === 'blue'
              ? firstGateColor
              : 'red';
          await updateGateAssignment(
            client,
            normalizedRaceId,
            sanitizedDeviceId,
            sanitizedDeviceName,
            [start, end],
            isReady === true,
            validColor,
          );
        }
      }

      // Get updated gate assignments
      const gateAssignments = await getGateAssignments(
        client,
        normalizedRaceId,
      );

      return sendSuccess(res, {
        success: true,
        faults: addResult.existing.faults,
        lastUpdated: addResult.existing.lastUpdated,
        gateAssignments,
      });
    }

    if (req.method === 'DELETE') {
      // Server-side role validation for fault deletion
      // Only users with 'chiefJudge' role can delete faults
      const userRole = auth?.payload?.role as string | undefined;
      if (userRole !== 'chiefJudge') {
        log.warn('Fault deletion DENIED', {
          role: userRole,
          expected: 'chiefJudge',
          ip: clientIP,
        });
        return sendError(res, 'Fault deletion requires Chief Judge role', 403);
      }

      const { faultId, deviceId, deviceName, approvedBy } = (req.body ||
        {}) as DeleteRequestBody;

      if (!faultId) {
        return sendBadRequest(res, 'faultId is required');
      }

      const faultIdStr = String(faultId);
      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(
        deviceName,
        MAX_DEVICE_NAME_LENGTH,
      );
      const sanitizedApprovedBy = sanitizeString(
        approvedBy,
        MAX_DEVICE_NAME_LENGTH,
      );

      // Audit log for deletion
      log.info('Fault deletion', {
        race: normalizedRaceId,
        faultId: faultIdStr,
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        approvedBy: sanitizedApprovedBy,
        ip: clientIP,
      });

      const deleteResult = await atomicDeleteFault(
        client,
        faultsKey,
        faultIdStr,
        sanitizedDeviceId,
      );

      if (!deleteResult.success) {
        return sendError(res, deleteResult.error!, 409);
      }

      // Track deleted fault ID with metadata
      const deletedKey = `race:${normalizedRaceId}:deleted_faults`;
      const deleteKey = sanitizedDeviceId
        ? `${faultIdStr}:${sanitizedDeviceId}`
        : faultIdStr;
      await client.sadd(deletedKey, deleteKey);
      await client.expire(deletedKey, CACHE_EXPIRY_SECONDS);

      return sendSuccess(res, {
        success: true,
        deleted: deleteResult.wasRemoved,
        faultId: faultIdStr,
      });
    }

    return sendMethodNotAllowed(res);
  },
);
