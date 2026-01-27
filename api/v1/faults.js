import { validateAuth } from '../lib/jwt.js';
import { getRedis, hasRedisError } from '../lib/redis.js';
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
const MAX_FAULTS_PER_RACE = 5000;
const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;
const CACHE_EXPIRY_SECONDS = 86400; // 24 hours
const MAX_ATOMIC_RETRIES = 5;

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_MAX_POSTS = 50;

// Redis key for client PIN
const CLIENT_PIN_KEY = 'admin:clientPin';

// Rate limiting using Redis
async function checkRateLimit(client, ip, method) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);
  const limit = method === 'POST' ? RATE_LIMIT_MAX_POSTS : RATE_LIMIT_MAX_REQUESTS;
  const key = `ratelimit:faults:${method}:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW + 10);
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
    return { allowed: true, remaining: limit, reset: windowStart + RATE_LIMIT_WINDOW, limit };
  }
}

// Input validation helpers
function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

// Validate fault type
const VALID_FAULT_TYPES = ['MG', 'STR', 'BR'];

function isValidFaultEntry(fault) {
  if (!fault || typeof fault !== 'object') return false;

  // ID must be string or number
  if (typeof fault.id !== 'number' && typeof fault.id !== 'string') return false;
  if (typeof fault.id === 'string' && fault.id.length === 0) return false;

  // Bib is required
  if (!fault.bib || typeof fault.bib !== 'string') return false;
  if (fault.bib.length > 10) return false;

  // Run must be 1 or 2
  if (fault.run !== 1 && fault.run !== 2) return false;

  // Gate number must be positive integer
  if (typeof fault.gateNumber !== 'number' || fault.gateNumber < 1) return false;

  // Fault type must be valid
  if (!VALID_FAULT_TYPES.includes(fault.faultType)) return false;

  // Timestamp required
  if (!fault.timestamp || isNaN(Date.parse(fault.timestamp))) return false;

  // Gate range must be array of two numbers
  if (!Array.isArray(fault.gateRange) || fault.gateRange.length !== 2) return false;
  if (typeof fault.gateRange[0] !== 'number' || typeof fault.gateRange[1] !== 'number') return false;

  return true;
}

/**
 * Atomically add fault to race data
 */
async function atomicAddFault(client, redisKey, enrichedFault, sanitizedDeviceId) {
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    await client.watch(redisKey);

    const existingData = await client.get(redisKey);
    const existing = safeJsonParse(existingData, { faults: [], lastUpdated: null });

    if (!Array.isArray(existing.faults)) {
      existing.faults = [];
    }

    // Check limit
    if (existing.faults.length >= MAX_FAULTS_PER_RACE) {
      await client.unwatch();
      return {
        success: false,
        error: `Maximum faults limit (${MAX_FAULTS_PER_RACE}) reached for this race`,
        existing
      };
    }

    // Check for existing fault (same fault from same device)
    const faultId = String(enrichedFault.id);
    const existingIndex = existing.faults.findIndex(
      f => String(f.id) === faultId && f.deviceId === sanitizedDeviceId
    );

    if (existingIndex !== -1) {
      const existingFault = existing.faults[existingIndex];
      // Update if version is newer or if marking for deletion
      const shouldUpdate =
        (enrichedFault.currentVersion > (existingFault.currentVersion || 1)) ||
        (enrichedFault.markedForDeletion !== existingFault.markedForDeletion);

      if (shouldUpdate) {
        // Update existing fault with new data
        existing.faults[existingIndex] = enrichedFault;
        existing.lastUpdated = Date.now();
      } else {
        // No update needed, return as duplicate
        await client.unwatch();
        return { success: true, existing, isDuplicate: true };
      }
    } else {
      // Add new fault
      existing.faults.push(enrichedFault);
      existing.lastUpdated = Date.now();
    }

    const multi = client.multi();
    multi.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      return { success: true, existing, isDuplicate: false };
    }

    console.log(`atomicAddFault: retry ${retry + 1}/${MAX_ATOMIC_RETRIES}`);
  }

  return {
    success: false,
    error: 'Concurrent modification conflict, please retry',
    existing: null
  };
}

/**
 * Atomically delete fault from race data
 */
async function atomicDeleteFault(client, redisKey, faultIdStr, sanitizedDeviceId) {
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    await client.watch(redisKey);

    const existingData = await client.get(redisKey);
    const existing = safeJsonParse(existingData, { faults: [], lastUpdated: null });

    if (!Array.isArray(existing.faults)) {
      existing.faults = [];
    }

    const originalLength = existing.faults.length;
    existing.faults = existing.faults.filter(f => {
      const idMatch = String(f.id) === faultIdStr;
      if (sanitizedDeviceId) {
        return !(idMatch && f.deviceId === sanitizedDeviceId);
      }
      return !idMatch;
    });

    const wasRemoved = existing.faults.length < originalLength;

    if (!wasRemoved) {
      await client.unwatch();
      return { success: true, wasRemoved: false, existing };
    }

    existing.lastUpdated = Date.now();

    const multi = client.multi();
    multi.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
    const result = await multi.exec();

    if (result !== null) {
      return { success: true, wasRemoved: true, existing };
    }

    console.log(`atomicDeleteFault: retry ${retry + 1}/${MAX_ATOMIC_RETRIES}`);
  }

  return {
    success: false,
    error: 'Concurrent modification conflict, please retry',
    existing: null
  };
}

/**
 * Update gate assignment for a device
 */
async function updateGateAssignment(client, normalizedRaceId, deviceId, deviceName, gateRange, isReady, firstGateColor) {
  if (!deviceId || !gateRange) return;

  const assignmentsKey = `race:${normalizedRaceId}:gate_assignments`;
  const assignmentData = JSON.stringify({
    deviceName: deviceName || 'Unknown',
    gateStart: gateRange[0],
    gateEnd: gateRange[1],
    lastSeen: Date.now(),
    isReady: isReady === true,
    firstGateColor: firstGateColor || 'red'
  });

  await client.hset(assignmentsKey, deviceId, assignmentData);
  await client.expire(assignmentsKey, CACHE_EXPIRY_SECONDS);
}

/**
 * Get all gate assignments for a race
 */
async function getGateAssignments(client, normalizedRaceId) {
  const assignmentsKey = `race:${normalizedRaceId}:gate_assignments`;
  const assignments = await client.hgetall(assignmentsKey);

  if (!assignments || Object.keys(assignments).length === 0) {
    return [];
  }

  const result = [];
  const now = Date.now();
  const staleThreshold = 60000; // 1 minute

  for (const [deviceId, assignmentJson] of Object.entries(assignments)) {
    try {
      const assignment = JSON.parse(assignmentJson);
      // Include if seen within threshold
      if (now - assignment.lastSeen <= staleThreshold) {
        result.push({
          deviceId,
          deviceName: assignment.deviceName,
          gateStart: assignment.gateStart,
          gateEnd: assignment.gateEnd,
          lastSeen: assignment.lastSeen,
          isReady: assignment.isReady === true,
          firstGateColor: assignment.firstGateColor || 'red'
        });
      }
    } catch (e) {
      // Skip invalid data
    }
  }

  return result;
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
    return sendBadRequest(res, 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only.');
  }

  const normalizedRaceId = raceId.toLowerCase();
  const faultsKey = `race:${normalizedRaceId}:faults`;

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

  setRateLimitHeaders(res, rateLimitResult.limit, rateLimitResult.remaining, rateLimitResult.reset);

  if (!rateLimitResult.allowed) {
    return sendRateLimitExceeded(res, rateLimitResult.reset - Math.floor(Date.now() / 1000));
  }

  // Validate sync authorization
  const authResult = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!authResult.valid) {
    return sendAuthRequired(res, authResult.error, authResult.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // Fetch faults for race
      const data = await client.get(faultsKey);
      const parsed = safeJsonParse(data, { faults: [], lastUpdated: null });

      // Get deleted fault IDs
      const deletedKey = `race:${normalizedRaceId}:deleted_faults`;
      const deletedIds = await client.smembers(deletedKey);

      // Get gate assignments
      const gateAssignments = await getGateAssignments(client, normalizedRaceId);

      // Update gate assignment if provided in query (with validation)
      const { deviceId, deviceName, gateStart, gateEnd, isReady, firstGateColor } = req.query;
      if (deviceId && gateStart && gateEnd) {
        const start = parseInt(gateStart, 10);
        const end = parseInt(gateEnd, 10);
        // Validate gate numbers: must be positive integers, end >= start, reasonable max (100 gates)
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start && end <= 100) {
          const validColor = (firstGateColor === 'red' || firstGateColor === 'blue') ? firstGateColor : 'red';
          await updateGateAssignment(
            client,
            normalizedRaceId,
            deviceId,
            deviceName,
            [start, end],
            isReady === 'true',
            validColor
          );
        }
      }

      return sendSuccess(res, {
        faults: Array.isArray(parsed.faults) ? parsed.faults : [],
        lastUpdated: parsed.lastUpdated || null,
        deletedIds: deletedIds || [],
        gateAssignments
      });
    }

    if (req.method === 'POST') {
      const { fault, deviceId, deviceName, gateRange, isReady, firstGateColor } = req.body || {};

      if (!fault) {
        return sendBadRequest(res, 'fault is required');
      }

      if (!isValidFaultEntry(fault)) {
        return sendBadRequest(res, 'Invalid fault format');
      }

      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);

      // Build enriched fault with version history and deletion flags
      const enrichedFault = {
        id: String(fault.id),
        bib: sanitizeString(fault.bib, 10),
        run: fault.run,
        gateNumber: fault.gateNumber,
        faultType: fault.faultType,
        timestamp: fault.timestamp,
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        gateRange: fault.gateRange,
        syncedAt: Date.now(),
        // Version tracking fields
        currentVersion: fault.currentVersion || 1,
        versionHistory: Array.isArray(fault.versionHistory) ? fault.versionHistory : [],
        // Deletion workflow fields
        markedForDeletion: fault.markedForDeletion === true,
        markedForDeletionAt: fault.markedForDeletionAt || null,
        markedForDeletionBy: fault.markedForDeletionBy || null,
        markedForDeletionByDeviceId: fault.markedForDeletionByDeviceId || null,
        deletionApprovedAt: fault.deletionApprovedAt || null,
        deletionApprovedBy: fault.deletionApprovedBy || null
      };

      const addResult = await atomicAddFault(client, faultsKey, enrichedFault, sanitizedDeviceId);

      if (!addResult.success) {
        const status = addResult.error?.includes('limit') ? 400 : 409;
        return sendError(res, addResult.error, status);
      }

      // Update gate assignment if provided (with validation)
      if (gateRange && Array.isArray(gateRange) && gateRange.length === 2) {
        const start = parseInt(gateRange[0], 10);
        const end = parseInt(gateRange[1], 10);
        // Validate gate numbers: must be positive integers, end >= start, reasonable max (100 gates)
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start && end <= 100) {
          const validColor = (firstGateColor === 'red' || firstGateColor === 'blue') ? firstGateColor : 'red';
          await updateGateAssignment(client, normalizedRaceId, sanitizedDeviceId, sanitizedDeviceName, [start, end], isReady === true, validColor);
        }
      }

      // Get updated gate assignments
      const gateAssignments = await getGateAssignments(client, normalizedRaceId);

      return sendSuccess(res, {
        success: true,
        faults: addResult.existing.faults,
        lastUpdated: addResult.existing.lastUpdated,
        gateAssignments
      });
    }

    if (req.method === 'DELETE') {
      // Server-side role validation for fault deletion
      // Only users with 'chiefJudge' role can delete faults
      const userRole = authResult.payload?.role;
      if (userRole !== 'chiefJudge') {
        console.log(`[AUDIT] Fault deletion DENIED: role=${userRole}, expected=chiefJudge, ip=${clientIP}`);
        return sendError(res, 'Fault deletion requires Chief Judge role', 403);
      }

      const { faultId, deviceId, deviceName, approvedBy } = req.body || {};

      if (!faultId) {
        return sendBadRequest(res, 'faultId is required');
      }

      const faultIdStr = String(faultId);
      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);
      const sanitizedApprovedBy = sanitizeString(approvedBy, MAX_DEVICE_NAME_LENGTH);

      // Audit log for deletion
      console.log(`[AUDIT] Fault deletion: race=${normalizedRaceId}, faultId=${faultIdStr}, deviceId=${sanitizedDeviceId}, deviceName=${sanitizedDeviceName}, approvedBy=${sanitizedApprovedBy}, ip=${clientIP}`);

      const deleteResult = await atomicDeleteFault(client, faultsKey, faultIdStr, sanitizedDeviceId);

      if (!deleteResult.success) {
        return sendError(res, deleteResult.error, 409);
      }

      // Track deleted fault ID with metadata
      const deletedKey = `race:${normalizedRaceId}:deleted_faults`;
      const deleteKey = sanitizedDeviceId ? `${faultIdStr}:${sanitizedDeviceId}` : faultIdStr;
      await client.sadd(deletedKey, deleteKey);
      await client.expire(deletedKey, CACHE_EXPIRY_SECONDS);

      return sendSuccess(res, {
        success: true,
        deleted: deleteResult.wasRemoved,
        faultId: faultIdStr
      });
    }

    return sendMethodNotAllowed(res);
  } catch (error) {
    console.error('Faults API error:', error.message);

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return sendServiceUnavailable(res, 'Database connection failed. Please try again.');
    }

    return sendError(res, 'Internal server error', 500);
  }
}
