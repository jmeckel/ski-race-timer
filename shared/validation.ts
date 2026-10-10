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

/** Maximum entry ID length */
export const MAX_ENTRY_ID_LENGTH = 128;

/** Maximum device ID length */
export const MAX_DEVICE_ID_LENGTH = 50;

/** Maximum inline photo length (base64 chars) — matches server upload limit */
export const MAX_PHOTO_LENGTH = 500_000;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const PHOTO_DATA_URL_PREFIX_RE = /^data:image\/(jpeg|png|webp);base64,/;

/**
 * Validate inline photo data: raw base64 (optionally with an image data-URL
 * prefix) within the size cap. The 'indexeddb' marker is NOT photo data.
 */
export function isValidPhotoData(photo: unknown): photo is string {
  if (typeof photo !== 'string' || photo.length === 0) return false;
  if (photo.length > MAX_PHOTO_LENGTH) return false;
  return BASE64_RE.test(photo.replace(PHOTO_DATA_URL_PREFIX_RE, ''));
}

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
 * Length caps for deviceId/deviceName and photo format are enforced by
 * sanitization (truncate/strip) rather than rejection, so a bad field never
 * drops the timing data itself.
 */
export function isValidEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;

  const e = entry as Record<string, unknown>;

  // ID can be string (new format) or number (legacy)
  if (typeof e.id !== 'string' && typeof e.id !== 'number') return false;
  if (typeof e.id === 'string' && e.id.length === 0) return false;
  if (typeof e.id === 'string' && e.id.length > MAX_ENTRY_ID_LENGTH)
    return false;
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

  // Run is optional (legacy data) but must be 1 or 2 if present
  if (e.run !== undefined && e.run !== 1 && e.run !== 2) return false;

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
