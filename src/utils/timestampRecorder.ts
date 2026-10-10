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

/** Check if bib is all zeros (e.g., "0", "00", "000") */
export function isZeroBib(bib: string): boolean {
  if (!bib) return false;
  return /^0+$/.test(bib);
}

/** Highest bib the auto-increment will produce */
const MAX_AUTO_BIB = 999;

/**
 * Bib input value after recording: the next bib when auto-increment is on,
 * otherwise empty. With cloud sync, skips past the highest bib any device has
 * recorded so devices don't hand out the same number.
 */
export function getNextBibInput(params: {
  bibInput: string;
  auto: boolean;
  sync: boolean;
  cloudHighestBib: number;
}): string {
  const { bibInput, auto, sync, cloudHighestBib } = params;
  if (!auto || !bibInput) return '';

  const localNext = parseInt(bibInput, 10) + 1;
  if (Number.isNaN(localNext)) return '';
  const next =
    sync && cloudHighestBib > 0
      ? Math.max(localNext, cloudHighestBib + 1)
      : localNext;
  return String(Math.min(next, MAX_AUTO_BIB));
}
