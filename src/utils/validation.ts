import type { Entry, Settings, TimingPoint, EntryStatus, DataSchema, SyncQueueItem } from '../types';
import { SCHEMA_VERSION } from '../types';

const VALID_POINTS: TimingPoint[] = ['S', 'I1', 'I2', 'I3', 'F'];
const VALID_STATUSES: EntryStatus[] = ['ok', 'dns', 'dnf', 'dsq'];

/**
 * Validate a single entry
 */
export function isValidEntry(entry: unknown): entry is Entry {
  if (!entry || typeof entry !== 'object') return false;

  const e = entry as Record<string, unknown>;

  // ID can be string (new format) or number (legacy)
  if (typeof e.id !== 'string' && typeof e.id !== 'number') return false;
  if (typeof e.id === 'string' && e.id.length === 0) return false;
  if (typeof e.id === 'number' && e.id <= 0) return false;

  // Bib is optional but must be string if present
  if (e.bib !== undefined && typeof e.bib !== 'string') return false;
  if (typeof e.bib === 'string' && e.bib.length > 10) return false;

  // Point is required and must be valid
  if (!VALID_POINTS.includes(e.point as TimingPoint)) return false;

  // Timestamp is required
  if (!e.timestamp || typeof e.timestamp !== 'string') return false;
  if (isNaN(Date.parse(e.timestamp))) return false;

  // Status is optional but must be valid if present
  if (e.status && !VALID_STATUSES.includes(e.status as EntryStatus)) return false;

  return true;
}

/**
 * Validate settings object
 */
export function isValidSettings(settings: unknown): settings is Settings {
  if (!settings || typeof settings !== 'object') return false;

  const s = settings as Record<string, unknown>;

  // All settings should be booleans
  const booleanKeys = ['auto', 'haptic', 'sound', 'sync', 'gps', 'simple', 'photoCapture'];
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
 * Validate race ID format
 */
export function isValidRaceId(raceId: unknown): raceId is string {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > 50) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

/**
 * Validate device ID format
 */
export function isValidDeviceId(deviceId: unknown): deviceId is string {
  if (!deviceId || typeof deviceId !== 'string') return false;
  return deviceId.startsWith('dev_') && deviceId.length > 4;
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
 * Sanitize a string to prevent XSS
 */
export function sanitizeString(str: unknown, maxLength: number = 100): string {
  if (!str || typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
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
    timestamp: e.timestamp,
    status: e.status || 'ok',
    deviceId: sanitizeString(e.deviceId || deviceId, 50),
    deviceName: sanitizeString(e.deviceName || 'Unknown Device', 100),
    syncedAt: e.syncedAt,
    photo: e.photo, // Base64 doesn't need sanitization
    gpsCoords: e.gpsCoords
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
    gps: false,
    simple: true,
    photoCapture: false
  };

  // Handle completely invalid data
  if (!data || typeof data !== 'object') {
    return {
      version: SCHEMA_VERSION,
      entries: [],
      settings: defaultSettings,
      deviceId,
      deviceName: 'Timer 1',
      raceId: '',
      syncQueue: []
    };
  }

  const d = data as Record<string, unknown>;

  // Migrate entries
  let entries: Entry[] = [];
  if (Array.isArray(d.entries)) {
    entries = d.entries
      .map(e => sanitizeEntry(e, deviceId))
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
      gps: typeof s.gps === 'boolean' ? s.gps : defaultSettings.gps,
      simple: typeof s.simple === 'boolean' ? s.simple : defaultSettings.simple,
      photoCapture: typeof s.photoCapture === 'boolean' ? s.photoCapture : defaultSettings.photoCapture
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
    deviceName: sanitizeString(d.deviceName, 100) || 'Timer 1',
    raceId: isValidRaceId(d.raceId) ? d.raceId : '',
    syncQueue,
    lastExport: typeof d.lastExport === 'number' ? d.lastExport : undefined
  };
}

/**
 * Calculate checksum for data integrity verification
 */
export function calculateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Verify data integrity
 */
export function verifyChecksum(data: string, expectedChecksum: string): boolean {
  return calculateChecksum(data) === expectedChecksum;
}
