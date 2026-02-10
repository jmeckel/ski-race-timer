/**
 * Shared Timestamp Recording Utility
 * Extracts common entry creation logic used by both radialTimerView and timerView.
 */

import type { Entry, Run, TimeSource, TimingPoint } from '../types';
import { generateEntryId } from './id';

/**
 * GPS service interface - the subset of GpsService methods needed for timestamp recording.
 */
export interface TimestampGpsService {
  getTimeOffset(): number | null;
  getCoordinates():
    | { latitude: number; longitude: number; accuracy: number }
    | undefined;
  getTimestamp(): number | null;
}

/**
 * Parameters for creating a timestamp entry.
 */
export interface CreateTimestampEntryParams {
  bib: string;
  point: TimingPoint;
  run: Run;
  deviceId: string;
  deviceName: string;
  gpsService: TimestampGpsService;
}

/**
 * Result of creating a timestamp entry.
 */
export interface CreateTimestampEntryResult {
  entry: Entry;
  timeSource: TimeSource;
}

/**
 * Create a timestamp entry with GPS-corrected time if available.
 *
 * CRITICAL: Call this function IMMEDIATELY when the user taps the record button,
 * before any async operations (photo capture, etc.), to ensure precise timing.
 */
export function createTimestampEntry(
  params: CreateTimestampEntryParams,
): CreateTimestampEntryResult {
  const { bib, point, run, deviceId, deviceName, gpsService } = params;

  // Capture timestamp using GPS offset if available
  const gpsOffset = gpsService.getTimeOffset();
  let preciseTimestamp: string;
  let timeSource: TimeSource;
  if (gpsOffset !== null) {
    preciseTimestamp = new Date(Date.now() + gpsOffset).toISOString();
    timeSource = 'gps';
  } else {
    preciseTimestamp = new Date().toISOString();
    timeSource = 'system';
  }
  const gpsCoords = gpsService.getCoordinates();
  const rawGpsTimestamp = gpsService.getTimestamp() ?? undefined;

  const entry: Entry = {
    id: generateEntryId(deviceId),
    bib: bib ? bib.padStart(3, '0') : '',
    point,
    run,
    timestamp: preciseTimestamp,
    status: 'ok',
    deviceId,
    deviceName,
    gpsCoords,
    timeSource,
    gpsTimestamp: rawGpsTimestamp,
  };

  return { entry, timeSource };
}

/**
 * Check if an entry is a duplicate of an existing entry.
 * A duplicate has the same bib, point, and run.
 */
export function isDuplicateEntry(
  entry: Entry,
  existingEntries: Entry[],
): boolean {
  return !!(
    entry.bib &&
    existingEntries.some(
      (e) =>
        e.bib === entry.bib &&
        e.point === entry.point &&
        (e.run ?? 1) === entry.run,
    )
  );
}
