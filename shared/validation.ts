/**
 * Shared Validation Module
 *
 * Pure validation functions and constants shared between the frontend (src/)
 * and backend (api/) codebases. No runtime dependencies - only type imports allowed.
 */

// ===== Shared Constants =====

/** Valid timing points */
export const VALID_POINTS = ['S', 'F'] as const;
export type SharedTimingPoint = (typeof VALID_POINTS)[number];

/** Valid entry status values */
export const VALID_STATUSES = ['ok', 'dns', 'dnf', 'dsq', 'flt'] as const;
export type SharedEntryStatus = (typeof VALID_STATUSES)[number];

/** Valid fault type codes */
export const VALID_FAULT_TYPES = ['MG', 'STR', 'BR'] as const;
export type SharedFaultType = (typeof VALID_FAULT_TYPES)[number];

/** Maximum race ID length */
export const MAX_RACE_ID_LENGTH = 50;

/** Maximum bib string length */
export const MAX_BIB_LENGTH = 10;

/** Maximum device name length */
export const MAX_DEVICE_NAME_LENGTH = 100;

// ===== Shared Validation Functions =====

/**
 * Validate race ID format.
 * Race IDs are CASE-INSENSITIVE - they are normalized to lowercase internally.
 * Alphanumeric characters, hyphens, and underscores only (max 50 chars).
 */
export function isValidRaceId(raceId: unknown): raceId is string {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

/**
 * Validate a single entry.
 *
 * Validates structure and types for core Entry fields:
 * - Required: id, point, timestamp
 * - Optional in legacy data: bib, status, deviceId, deviceName
 * - Optional: syncedAt, photo, gpsCoords, timeSource, gpsTimestamp
 *
 * This is the shared core validation used by both client and server.
 * The server may apply additional constraints (e.g., run limited to 1|2).
 */
export function isValidEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;

  const e = entry as Record<string, unknown>;

  // ID can be string (new format) or number (legacy)
  if (typeof e.id !== 'string' && typeof e.id !== 'number') return false;
  if (typeof e.id === 'string' && e.id.length === 0) return false;
  if (typeof e.id === 'number' && e.id <= 0) return false;

  // Bib is optional but must be string if present
  if (e.bib !== undefined && typeof e.bib !== 'string') return false;
  if (typeof e.bib === 'string' && e.bib.length > MAX_BIB_LENGTH) return false;

  // Point is required and must be valid
  if (!(VALID_POINTS as readonly string[]).includes(e.point as string))
    return false;

  // Timestamp is required and must be valid ISO date
  if (!e.timestamp || typeof e.timestamp !== 'string') return false;
  if (Number.isNaN(Date.parse(e.timestamp))) return false;

  // Status is optional but must be valid if present
  if (
    e.status !== undefined &&
    !(VALID_STATUSES as readonly string[]).includes(e.status as string)
  )
    return false;

  // DeviceId is optional but must be string if present
  if (e.deviceId !== undefined && typeof e.deviceId !== 'string') return false;

  // DeviceName is optional but must be string if present
  if (e.deviceName !== undefined && typeof e.deviceName !== 'string')
    return false;

  // SyncedAt is optional but must be non-negative number if present
  if (e.syncedAt !== undefined) {
    if (
      typeof e.syncedAt !== 'number' ||
      e.syncedAt < 0 ||
      !Number.isFinite(e.syncedAt)
    ) {
      return false;
    }
  }

  // Photo is optional but must be string if present
  if (e.photo !== undefined && typeof e.photo !== 'string') return false;

  // TimeSource is optional but must be valid if present
  if (
    e.timeSource !== undefined &&
    e.timeSource !== 'gps' &&
    e.timeSource !== 'system'
  )
    return false;

  // GpsTimestamp is optional but must be a finite number if present
  if (e.gpsTimestamp !== undefined) {
    if (typeof e.gpsTimestamp !== 'number' || !Number.isFinite(e.gpsTimestamp))
      return false;
  }

  // GpsCoords is optional but must have valid structure if present
  if (e.gpsCoords !== undefined) {
    if (typeof e.gpsCoords !== 'object' || e.gpsCoords === null) return false;
    const coords = e.gpsCoords as Record<string, unknown>;
    if (
      typeof coords.latitude !== 'number' ||
      !Number.isFinite(coords.latitude)
    )
      return false;
    if (
      typeof coords.longitude !== 'number' ||
      !Number.isFinite(coords.longitude)
    )
      return false;
    if (
      typeof coords.accuracy !== 'number' ||
      !Number.isFinite(coords.accuracy) ||
      coords.accuracy < 0
    )
      return false;
  }

  return true;
}

/**
 * Validate device ID format.
 * Must start with 'dev_' and be longer than 4 characters.
 */
export function isValidDeviceId(deviceId: unknown): deviceId is string {
  if (!deviceId || typeof deviceId !== 'string') return false;
  return deviceId.startsWith('dev_') && deviceId.length > 4;
}
