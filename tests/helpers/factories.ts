/**
 * Test Factories
 * Shared builders for creating test data with sensible defaults.
 * Override any field via the `overrides` parameter.
 */

import type {
  Entry,
  FaultEntry,
  Settings,
  SyncQueueItem,
} from '../../src/types';

let entryCounter = 0;
let faultCounter = 0;

/**
 * Create a valid Entry with sensible defaults
 */
export function createEntry(overrides: Partial<Entry> = {}): Entry {
  entryCounter++;
  return {
    id: `entry-${entryCounter}-${Math.random().toString(36).slice(2, 8)}`,
    bib: String(entryCounter).padStart(3, '0'),
    point: 'S',
    run: 1,
    timestamp: new Date().toISOString(),
    status: 'ok',
    deviceId: 'dev_test',
    deviceName: 'Test Timer',
    ...overrides,
  };
}

/**
 * Create a valid FaultEntry with sensible defaults
 */
export function createFault(overrides: Partial<FaultEntry> = {}): FaultEntry {
  faultCounter++;
  return {
    id: `fault-${faultCounter}-${Math.random().toString(36).slice(2, 8)}`,
    bib: String(faultCounter).padStart(3, '0'),
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: new Date().toISOString(),
    deviceId: 'dev_judge',
    deviceName: 'Judge 1',
    gateRange: [1, 10] as [number, number],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion: false,
    ...overrides,
  };
}

/**
 * Create default Settings
 */
export function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    auto: true,
    haptic: true,
    sound: false,
    sync: false,
    syncPhotos: false,
    gps: true,
    simple: false,
    photoCapture: false,
    motionEffects: true,
    glassEffects: true,
    outdoorMode: false,
    ambientMode: true,
    ...overrides,
  };
}

/**
 * Create a SyncQueueItem wrapping an entry
 */
export function createSyncQueueItem(
  entryOverrides: Partial<Entry> = {},
  queueOverrides: Partial<SyncQueueItem> = {},
): SyncQueueItem {
  return {
    entry: createEntry(entryOverrides),
    retryCount: 0,
    lastAttempt: 0,
    ...queueOverrides,
  };
}

/**
 * Create a fake JWT token with given payload
 */
export function createJWT(
  payload: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT', ...header }));
  const p = btoa(
    JSON.stringify({
      sub: 'test',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24h from now
      ...payload,
    }),
  );
  const s = btoa('fake-signature');
  return `${h}.${p}.${s}`;
}

/**
 * Create an expired JWT token
 */
export function createExpiredJWT(
  payload: Record<string, unknown> = {},
): string {
  return createJWT({
    exp: Math.floor(Date.now() / 1000) - 3600, // 1h ago
    ...payload,
  });
}

/**
 * Reset counters (call in beforeEach if needed)
 */
export function resetFactoryCounters(): void {
  entryCounter = 0;
  faultCounter = 0;
}
