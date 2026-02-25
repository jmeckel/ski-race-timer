/**
 * Cross-Device Duplicate Detection
 *
 * Pure function that checks whether a new entry duplicates an existing entry
 * from a different device (same bib + same point + same run).
 */

import type { CrossDeviceDuplicate, RaceEntry } from './syncTypes.js';

/**
 * Detect if a new entry is a cross-device duplicate of an existing entry.
 * A cross-device duplicate means: same bib + same point + same run, but from a different device.
 *
 * @param existingEntries - All entries currently stored for the race
 * @param newEntry - The new entry being submitted
 * @param deviceId - The device ID submitting the new entry
 * @returns CrossDeviceDuplicate info if a match is found, or null
 */
export function detectCrossDeviceDuplicate(
  existingEntries: RaceEntry[],
  newEntry: RaceEntry,
  deviceId: string,
): CrossDeviceDuplicate | null {
  if (!newEntry.bib) return null;

  const entryRun = newEntry.run ?? 1;
  const existingMatch = existingEntries.find(
    (e: RaceEntry) =>
      e.bib === newEntry.bib &&
      e.point === newEntry.point &&
      (e.run ?? 1) === entryRun &&
      e.deviceId !== deviceId,
  );

  if (!existingMatch) return null;

  return {
    bib: existingMatch.bib!,
    point: existingMatch.point,
    run: existingMatch.run ?? 1,
    deviceName: existingMatch.deviceName || 'Unknown device',
    timestamp: existingMatch.timestamp,
  };
}
