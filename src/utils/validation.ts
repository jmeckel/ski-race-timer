import type {
  DataSchema,
  Entry,
  FaultEntry,
  FaultType,
  FaultVersion,
  Run,
  Settings,
  SyncQueueItem,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { generateDeviceName } from './id';

// Re-export shared validation functions and constants
export {
  isValidDeviceId,
  isValidEntry,
  isValidRaceId,
  MAX_BIB_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
  MAX_RACE_ID_LENGTH,
  VALID_FAULT_TYPES,
  VALID_POINTS,
  VALID_STATUSES,
} from '../../shared/validation';

// Import for local use within this file (re-export above handles external consumers)
import {
  isValidDeviceId,
  isValidEntry,
  isValidRaceId,
  VALID_FAULT_TYPES,
} from '../../shared/validation';

/**
 * Validate that a run number is a positive integer
 */
function isValidRun(run: unknown): run is Run {
  return run === 1 || run === 2;
}
const VALID_CHANGE_TYPES = ['create', 'edit', 'restore'] as const;

/**
 * Validate a FaultVersion object (used in version history)
 * Deep validation to prevent injection of malicious data
 */
export function isValidFaultVersion(version: unknown): version is FaultVersion {
  if (!version || typeof version !== 'object') return false;

  const v = version as Record<string, unknown>;

  // Version number must be positive integer
  if (
    typeof v.version !== 'number' ||
    !Number.isInteger(v.version) ||
    v.version < 1
  )
    return false;

  // Timestamp must be valid ISO date
  if (typeof v.timestamp !== 'string' || Number.isNaN(Date.parse(v.timestamp)))
    return false;

  // EditedBy must be string
  if (typeof v.editedBy !== 'string' || v.editedBy.length > 100) return false;

  // EditedByDeviceId must be string
  if (typeof v.editedByDeviceId !== 'string' || v.editedByDeviceId.length > 100)
    return false;

  // ChangeType must be valid
  if (
    !VALID_CHANGE_TYPES.includes(
      v.changeType as (typeof VALID_CHANGE_TYPES)[number],
    )
  )
    return false;

  // Data must be object with required fields
  if (!v.data || typeof v.data !== 'object') return false;
  const data = v.data as Record<string, unknown>;

  // Validate core fault data fields
  if (typeof data.id !== 'string') return false;
  if (typeof data.bib !== 'string' || data.bib.length > 10) return false;
  if (!isValidRun(data.run)) return false;
  if (
    typeof data.gateNumber !== 'number' ||
    !Number.isInteger(data.gateNumber) ||
    data.gateNumber < 0
  )
    return false;
  if (!VALID_FAULT_TYPES.includes(data.faultType as FaultType)) return false;
  if (
    typeof data.timestamp !== 'string' ||
    Number.isNaN(Date.parse(data.timestamp))
  )
    return false;
  if (typeof data.deviceId !== 'string') return false;
  if (typeof data.deviceName !== 'string' || data.deviceName.length > 100)
    return false;

  // GateRange must be valid tuple
  if (!Array.isArray(data.gateRange) || data.gateRange.length !== 2)
    return false;
  if (
    typeof data.gateRange[0] !== 'number' ||
    typeof data.gateRange[1] !== 'number'
  )
    return false;
  if (
    !Number.isInteger(data.gateRange[0]) ||
    !Number.isInteger(data.gateRange[1])
  )
    return false;

  // ChangeDescription is optional but must be string if present
  if (
    v.changeDescription !== undefined &&
    typeof v.changeDescription !== 'string'
  )
    return false;
  if (
    typeof v.changeDescription === 'string' &&
    v.changeDescription.length > 500
  )
    return false;

  return true;
}

/**
 * Validate a FaultEntry object
 * Includes deep validation of versionHistory to prevent injection attacks
 */
export function isValidFaultEntry(fault: unknown): fault is FaultEntry {
  if (!fault || typeof fault !== 'object') return false;

  const f = fault as Record<string, unknown>;

  // Required string fields
  if (typeof f.id !== 'string' || f.id.length === 0) return false;
  if (typeof f.bib !== 'string' || f.bib.length > 10) return false;
  if (typeof f.deviceId !== 'string') return false;
  if (typeof f.deviceName !== 'string' || f.deviceName.length > 100)
    return false;
  if (typeof f.timestamp !== 'string' || Number.isNaN(Date.parse(f.timestamp)))
    return false;

  // Run must be valid
  if (!isValidRun(f.run)) return false;

  // Gate number must be valid
  if (
    typeof f.gateNumber !== 'number' ||
    !Number.isInteger(f.gateNumber) ||
    f.gateNumber < 0
  )
    return false;

  // Fault type must be valid
  if (!VALID_FAULT_TYPES.includes(f.faultType as FaultType)) return false;

  // GateRange must be valid tuple
  if (!Array.isArray(f.gateRange) || f.gateRange.length !== 2) return false;
  if (typeof f.gateRange[0] !== 'number' || typeof f.gateRange[1] !== 'number')
    return false;
  if (!Number.isInteger(f.gateRange[0]) || !Number.isInteger(f.gateRange[1]))
    return false;

  // CurrentVersion must be positive integer
  if (
    typeof f.currentVersion !== 'number' ||
    !Number.isInteger(f.currentVersion) ||
    f.currentVersion < 1
  )
    return false;

  // VersionHistory must be array with valid entries (deep validation)
  if (!Array.isArray(f.versionHistory)) return false;
  for (const version of f.versionHistory) {
    if (!isValidFaultVersion(version)) return false;
  }

  // MarkedForDeletion must be boolean
  if (typeof f.markedForDeletion !== 'boolean') return false;

  // Optional timestamp fields must be valid ISO dates if present
  if (
    f.markedForDeletionAt !== undefined &&
    (typeof f.markedForDeletionAt !== 'string' ||
      Number.isNaN(Date.parse(f.markedForDeletionAt)))
  )
    return false;
  if (
    f.deletionApprovedAt !== undefined &&
    (typeof f.deletionApprovedAt !== 'string' ||
      Number.isNaN(Date.parse(f.deletionApprovedAt)))
  )
    return false;

  // Optional string fields must be strings if present
  if (
    f.markedForDeletionBy !== undefined &&
    typeof f.markedForDeletionBy !== 'string'
  )
    return false;
  if (
    f.markedForDeletionByDeviceId !== undefined &&
    typeof f.markedForDeletionByDeviceId !== 'string'
  )
    return false;
  if (
    f.deletionApprovedBy !== undefined &&
    typeof f.deletionApprovedBy !== 'string'
  )
    return false;

  // SyncedAt is optional but must be valid number if present
  if (
    f.syncedAt !== undefined &&
    (typeof f.syncedAt !== 'number' || !Number.isFinite(f.syncedAt))
  )
    return false;

  return true;
}

/**
 * Sanitize a FaultEntry by cleaning all string fields
 */
export function sanitizeFaultEntry(fault: unknown): FaultEntry | null {
  if (!isValidFaultEntry(fault)) return null;

  const f = fault as FaultEntry;

  // Sanitize version history
  const sanitizedVersionHistory = f.versionHistory.map((v) => ({
    ...v,
    editedBy: sanitizeString(v.editedBy, 100),
    editedByDeviceId: sanitizeString(v.editedByDeviceId, 100),
    changeDescription: v.changeDescription
      ? sanitizeString(v.changeDescription, 500)
      : undefined,
    data: {
      ...v.data,
      bib: sanitizeString(v.data.bib, 10),
      deviceId: sanitizeString(v.data.deviceId, 100),
      deviceName: sanitizeString(v.data.deviceName, 100),
    },
  }));

  return {
    ...f,
    bib: sanitizeString(f.bib, 10),
    deviceId: sanitizeString(f.deviceId, 100),
    deviceName: sanitizeString(f.deviceName, 100),
    markedForDeletionBy: f.markedForDeletionBy
      ? sanitizeString(f.markedForDeletionBy, 100)
      : undefined,
    markedForDeletionByDeviceId: f.markedForDeletionByDeviceId
      ? sanitizeString(f.markedForDeletionByDeviceId, 100)
      : undefined,
    deletionApprovedBy: f.deletionApprovedBy
      ? sanitizeString(f.deletionApprovedBy, 100)
      : undefined,
    versionHistory: sanitizedVersionHistory,
  };
}

/**
 * Validate settings object
 */
export function isValidSettings(settings: unknown): settings is Settings {
  if (!settings || typeof settings !== 'object') return false;

  const s = settings as Record<string, unknown>;

  // All settings should be booleans
  const booleanKeys = [
    'auto',
    'haptic',
    'sound',
    'sync',
    'syncPhotos',
    'gps',
    'simple',
    'photoCapture',
  ];
  for (const key of booleanKeys) {
    if (key in s && typeof s[key] !== 'boolean') return false;
  }

  return true;
}

/**
 * Validate sync queue item
 */
export function isValidSyncQueueItem(item: unknown): item is SyncQueueItem {
  if (!item || typeof item !== 'object') return false;

  const i = item as Record<string, unknown>;

  if (!isValidEntry(i.entry)) return false;
  if (typeof i.retryCount !== 'number' || i.retryCount < 0) return false;
  if (typeof i.lastAttempt !== 'number' || i.lastAttempt < 0) return false;

  return true;
}

/**
 * Validate full data schema
 */
export function isValidDataSchema(data: unknown): data is DataSchema {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  // Version check
  if (typeof d.version !== 'number' || d.version > SCHEMA_VERSION) return false;

  // Entries validation
  if (!Array.isArray(d.entries)) return false;

  // Settings validation
  if (d.settings && !isValidSettings(d.settings)) return false;

  return true;
}

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Note: Always use escapeHtml() when rendering to HTML for XSS prevention.
 */
export function sanitizeString(str: unknown, maxLength: number = 100): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[<>&]/g, '') // Strip angle brackets and ampersand (HTML injection)
    .replace(/[\x00-\x1F\x7F]/g, ''); // Strip control characters
  // Note: quotes (' ") are NOT stripped — they are valid in names (e.g. O'Brien).
  // Use escapeHtml()/escapeAttr() at render time for XSS prevention.
}

/**
 * Sanitize an entry by ensuring all fields are valid
 */
export function sanitizeEntry(entry: unknown, deviceId: string): Entry | null {
  if (!isValidEntry(entry)) return null;

  const e = entry as Entry;

  return {
    id: typeof e.id === 'number' ? String(e.id) : String(e.id),
    bib: sanitizeString(e.bib, 10),
    point: e.point,
    run: e.run ?? 1,
    timestamp: e.timestamp,
    status: e.status || 'ok',
    deviceId: sanitizeString(e.deviceId || deviceId, 50),
    deviceName: sanitizeString(e.deviceName || 'Unknown Device', 100),
    syncedAt: e.syncedAt,
    photo: e.photo, // Base64 doesn't need sanitization
    gpsCoords: e.gpsCoords,
  };
}

/**
 * Migrate data from old schema to new
 */
export function migrateSchema(data: unknown, deviceId: string): DataSchema {
  const defaultSettings: Settings = {
    auto: true,
    haptic: true,
    sound: false,
    sync: false,
    syncPhotos: false, // Sync photos disabled by default
    gps: true, // GPS enabled by default for accurate timestamps
    simple: false, // Normal mode is default
    photoCapture: false,
    // Liquid Glass UI settings
    motionEffects: true,
    glassEffects: true,
    outdoorMode: false,
    ambientMode: true, // Auto-dim after inactivity - saves battery
  };

  // Handle completely invalid data
  if (!data || typeof data !== 'object') {
    return {
      version: SCHEMA_VERSION,
      entries: [],
      settings: defaultSettings,
      deviceId,
      deviceName: generateDeviceName(),
      raceId: '',
      syncQueue: [],
    };
  }

  const d = data as Record<string, unknown>;

  // Migrate entries
  let entries: Entry[] = [];
  if (Array.isArray(d.entries)) {
    entries = d.entries
      .map((e) => sanitizeEntry(e, deviceId))
      .filter((e): e is Entry => e !== null);
  }

  // Migrate settings
  let settings = defaultSettings;
  if (d.settings && typeof d.settings === 'object') {
    const s = d.settings as Record<string, unknown>;
    settings = {
      auto: typeof s.auto === 'boolean' ? s.auto : defaultSettings.auto,
      haptic: typeof s.haptic === 'boolean' ? s.haptic : defaultSettings.haptic,
      sound: typeof s.sound === 'boolean' ? s.sound : defaultSettings.sound,
      sync: typeof s.sync === 'boolean' ? s.sync : defaultSettings.sync,
      syncPhotos:
        typeof s.syncPhotos === 'boolean'
          ? s.syncPhotos
          : defaultSettings.syncPhotos,
      gps: typeof s.gps === 'boolean' ? s.gps : defaultSettings.gps,
      simple: typeof s.simple === 'boolean' ? s.simple : defaultSettings.simple,
      photoCapture:
        typeof s.photoCapture === 'boolean'
          ? s.photoCapture
          : defaultSettings.photoCapture,
      // Liquid Glass UI settings
      motionEffects:
        typeof s.motionEffects === 'boolean'
          ? s.motionEffects
          : defaultSettings.motionEffects,
      glassEffects:
        typeof s.glassEffects === 'boolean'
          ? s.glassEffects
          : defaultSettings.glassEffects,
      outdoorMode:
        typeof s.outdoorMode === 'boolean'
          ? s.outdoorMode
          : defaultSettings.outdoorMode,
      ambientMode:
        typeof s.ambientMode === 'boolean'
          ? s.ambientMode
          : defaultSettings.ambientMode,
    };
  }

  // Migrate sync queue
  let syncQueue: SyncQueueItem[] = [];
  if (Array.isArray(d.syncQueue)) {
    syncQueue = d.syncQueue.filter(isValidSyncQueueItem);
  }

  return {
    version: SCHEMA_VERSION,
    entries,
    settings,
    deviceId: isValidDeviceId(d.deviceId) ? d.deviceId : deviceId,
    deviceName: sanitizeString(d.deviceName, 100) || generateDeviceName(),
    raceId: isValidRaceId(d.raceId) ? d.raceId : '',
    syncQueue,
    lastExport: typeof d.lastExport === 'number' ? d.lastExport : undefined,
  };
}

/**
 * Make an input accept only numeric characters
 * Useful for bib numbers, PIN inputs, etc.
 */
export function makeNumericInput(
  input: HTMLInputElement,
  maxLength?: number,
): void {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^0-9]/g, '');
    if (maxLength !== undefined) {
      input.value = input.value.slice(0, maxLength);
    }
  });
}

/**
 * Calculate checksum for data integrity verification
 */
export function calculateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Verify data integrity
 */
export function verifyChecksum(
  data: string,
  expectedChecksum: string,
): boolean {
  return calculateChecksum(data) === expectedChecksum;
}
