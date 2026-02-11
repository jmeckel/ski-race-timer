/**
 * Faults Slice
 * Handles Fault CRUD operations, version history, and deletion workflow
 */

import type { FaultEntry, FaultVersion, Run } from '../../types';
import { logger } from '../../utils/logger';
import { sanitizeFaultEntry } from '../../utils/validation';

// Maximum version history entries to keep per fault (for performance)
const MAX_VERSION_HISTORY = 50;

/**
 * Extract version data fields from a fault entry
 */
export function extractFaultVersionData(
  fault:
    | FaultEntry
    | Omit<
        FaultEntry,
        'currentVersion' | 'versionHistory' | 'markedForDeletion'
      >,
): FaultVersion['data'] {
  return {
    id: fault.id,
    bib: fault.bib,
    run: fault.run,
    gateNumber: fault.gateNumber,
    faultType: fault.faultType,
    timestamp: fault.timestamp,
    deviceId: fault.deviceId,
    deviceName: fault.deviceName,
    gateRange: fault.gateRange,
    syncedAt: fault.syncedAt,
    // Voice notes
    notes: fault.notes,
    notesSource: fault.notesSource,
    notesTimestamp: fault.notesTimestamp,
  };
}

/**
 * Create a new fault version record
 */
export function createFaultVersion(
  version: number,
  changeType: FaultVersion['changeType'],
  data: FaultVersion['data'],
  editedBy: string,
  editedByDeviceId: string,
  changeDescription?: string,
): FaultVersion {
  return {
    version,
    timestamp: new Date().toISOString(),
    editedBy,
    editedByDeviceId,
    changeType,
    data,
    changeDescription,
  };
}

/**
 * Append a version to history, trimming if needed
 */
export function appendToVersionHistory(
  existingHistory: FaultVersion[] | undefined,
  newVersion: FaultVersion,
): FaultVersion[] {
  const history = [...(existingHistory || []), newVersion];
  return history.length > MAX_VERSION_HISTORY
    ? history.slice(-MAX_VERSION_HISTORY)
    : history;
}

/**
 * Add a new fault entry with version tracking
 */
export function addFaultEntry(
  faultEntries: FaultEntry[],
  fault: Omit<
    FaultEntry,
    'currentVersion' | 'versionHistory' | 'markedForDeletion'
  >,
): FaultEntry[] {
  const initialVersion = createFaultVersion(
    1,
    'create',
    extractFaultVersionData(fault),
    fault.deviceName,
    fault.deviceId,
  );

  const faultWithVersion: FaultEntry = {
    ...fault,
    currentVersion: 1,
    versionHistory: [initialVersion],
    markedForDeletion: false,
  };

  return [...faultEntries, faultWithVersion];
}

/**
 * Delete a fault entry (hard delete)
 */
export function deleteFaultEntry(
  faultEntries: FaultEntry[],
  id: string,
): FaultEntry[] {
  return faultEntries.filter((f) => f.id !== id);
}

/**
 * Update a fault entry (simple update without version tracking)
 */
export function updateFaultEntry(
  faultEntries: FaultEntry[],
  id: string,
  updates: Partial<FaultEntry>,
): FaultEntry[] | null {
  const index = faultEntries.findIndex((f) => f.id === id);
  if (index === -1) return null;

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = { ...newFaultEntries[index]!, ...updates };
  return newFaultEntries;
}

/**
 * Update a fault entry with version history tracking
 */
export function updateFaultEntryWithHistory(
  faultEntries: FaultEntry[],
  id: string,
  updates: Partial<
    Pick<
      FaultEntry,
      | 'bib'
      | 'run'
      | 'gateNumber'
      | 'faultType'
      | 'notes'
      | 'notesSource'
      | 'notesTimestamp'
    >
  >,
  deviceName: string,
  deviceId: string,
  changeDescription?: string,
): FaultEntry[] | null {
  const index = faultEntries.findIndex((f) => f.id === id);
  if (index === -1) return null;

  const oldFault = faultEntries[index]!;
  if (oldFault.markedForDeletion) return null;

  const newVersion = oldFault.currentVersion + 1;
  const updatedFault = { ...oldFault, ...updates };
  const newVersionRecord = createFaultVersion(
    newVersion,
    'edit',
    extractFaultVersionData(updatedFault),
    deviceName,
    deviceId,
    changeDescription,
  );

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = {
    ...updatedFault,
    currentVersion: newVersion,
    versionHistory: appendToVersionHistory(
      oldFault.versionHistory,
      newVersionRecord,
    ),
  };
  return newFaultEntries;
}

/**
 * Restore a fault to a previous version
 */
export function restoreFaultVersion(
  faultEntries: FaultEntry[],
  id: string,
  versionNumber: number,
  deviceName: string,
  deviceId: string,
): FaultEntry[] | null {
  const index = faultEntries.findIndex((f) => f.id === id);
  if (index === -1) return null;

  const oldFault = faultEntries[index]!;
  if (oldFault.markedForDeletion) return null;

  const versionToRestore = oldFault.versionHistory?.find(
    (v) => v.version === versionNumber,
  );
  if (!versionToRestore) return null;

  const newVersion = oldFault.currentVersion + 1;
  const restoreVersionRecord = createFaultVersion(
    newVersion,
    'restore',
    { ...versionToRestore.data },
    deviceName,
    deviceId,
    `Restored to version ${versionNumber}`,
  );

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = {
    ...oldFault!,
    bib: versionToRestore.data.bib,
    run: versionToRestore.data.run,
    gateNumber: versionToRestore.data.gateNumber,
    faultType: versionToRestore.data.faultType,
    // Restore notes fields
    notes: versionToRestore.data.notes,
    notesSource: versionToRestore.data.notesSource,
    notesTimestamp: versionToRestore.data.notesTimestamp,
    currentVersion: newVersion,
    versionHistory: appendToVersionHistory(
      oldFault.versionHistory,
      restoreVersionRecord,
    ),
  };
  return newFaultEntries;
}

/**
 * Mark a fault for deletion
 */
export function markFaultForDeletion(
  faultEntries: FaultEntry[],
  id: string,
  deviceName: string,
  deviceId: string,
): FaultEntry[] | null {
  const index = faultEntries.findIndex((f) => f.id === id);
  if (index === -1) return null;

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = {
    ...newFaultEntries[index]!,
    markedForDeletion: true,
    markedForDeletionAt: new Date().toISOString(),
    markedForDeletionBy: deviceName,
    markedForDeletionByDeviceId: deviceId,
  };
  return newFaultEntries;
}

/**
 * Approve fault deletion (returns the approved fault before deleting)
 */
export function approveFaultDeletion(
  faultEntries: FaultEntry[],
  id: string,
  deviceName: string,
): { faultEntries: FaultEntry[]; approvedFault: FaultEntry | null } {
  const fault = faultEntries.find((f) => f.id === id);
  if (!fault || !fault.markedForDeletion) {
    return { faultEntries, approvedFault: null };
  }

  const approvedFault: FaultEntry = {
    ...fault,
    deletionApprovedAt: new Date().toISOString(),
    deletionApprovedBy: deviceName,
  };

  return {
    faultEntries: faultEntries.filter((f) => f.id !== id),
    approvedFault,
  };
}

/**
 * Reject fault deletion
 */
export function rejectFaultDeletion(
  faultEntries: FaultEntry[],
  id: string,
  deviceName: string,
  deviceId: string,
): FaultEntry[] | null {
  const index = faultEntries.findIndex((f) => f.id === id);
  if (index === -1) return null;

  const oldFault = faultEntries[index]!;
  const newVersion = oldFault.currentVersion + 1;
  const rejectionVersionRecord = createFaultVersion(
    newVersion,
    'edit',
    extractFaultVersionData(oldFault),
    deviceName,
    deviceId,
    'Deletion rejected by Chief Judge',
  );

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = {
    ...newFaultEntries[index]!,
    markedForDeletion: false,
    markedForDeletionAt: undefined,
    markedForDeletionBy: undefined,
    markedForDeletionByDeviceId: undefined,
    currentVersion: newVersion,
    versionHistory: appendToVersionHistory(
      oldFault.versionHistory,
      rejectionVersionRecord,
    ),
  };
  return newFaultEntries;
}

/**
 * Get faults pending deletion
 */
export function getPendingDeletions(faultEntries: FaultEntry[]): FaultEntry[] {
  return faultEntries.filter((f) => f.markedForDeletion);
}

/**
 * Get faults for a specific bib and run
 */
export function getFaultsForBib(
  faultEntries: FaultEntry[],
  bib: string,
  run: Run,
): FaultEntry[] {
  return faultEntries.filter((f) => f.bib === bib && f.run === run);
}

/**
 * Mark a fault as synced
 */
export function markFaultSynced(
  faultEntries: FaultEntry[],
  faultId: string,
): FaultEntry[] {
  const index = faultEntries.findIndex((f) => f.id === faultId);
  if (index === -1) return faultEntries;

  const newFaultEntries = [...faultEntries];
  newFaultEntries[index] = { ...newFaultEntries[index]!, syncedAt: Date.now() };
  return newFaultEntries;
}

/**
 * Merge faults from cloud sync
 */
export function mergeFaultsFromCloud(
  faultEntries: FaultEntry[],
  cloudFaults: unknown[],
  deletedIds: string[],
  localDeviceId: string,
): { faultEntries: FaultEntry[]; addedCount: number } {
  let addedCount = 0;
  let updatedCount = 0;
  const existingFaultsMap = new Map(
    faultEntries.map((f) => [`${f.id}-${f.deviceId}`, f]),
  );
  const deletedSet = new Set(deletedIds);
  const newFaults: FaultEntry[] = [];
  const updatedFaults: FaultEntry[] = [];

  for (const rawFault of cloudFaults) {
    // Validate and sanitize each fault from untrusted cloud data
    const fault = sanitizeFaultEntry(rawFault);
    if (!fault) {
      logger.warn('Skipping invalid fault from cloud:', rawFault);
      continue;
    }

    // Skip faults from this device
    if (fault.deviceId === localDeviceId) continue;

    // Skip faults that were deleted
    const deleteKey = `${fault.id}:${fault.deviceId}`;
    if (deletedSet.has(deleteKey) || deletedSet.has(fault.id)) continue;

    const key = `${fault.id}-${fault.deviceId}`;
    const existingFault = existingFaultsMap.get(key);

    if (existingFault) {
      // Check if cloud version is newer or has different deletion status
      const cloudVersion = fault.currentVersion || 1;
      const localVersion = existingFault.currentVersion || 1;

      if (
        cloudVersion > localVersion ||
        fault.markedForDeletion !== existingFault.markedForDeletion
      ) {
        updatedFaults.push(fault);
        updatedCount++;
      }
    } else {
      newFaults.push(fault);
      addedCount++;
    }
  }

  if (newFaults.length > 0 || updatedFaults.length > 0) {
    let result = [...faultEntries];

    // Update existing faults
    for (const updated of updatedFaults) {
      const key = `${updated.id}-${updated.deviceId}`;
      const index = result.findIndex((f) => `${f.id}-${f.deviceId}` === key);
      if (index !== -1) {
        result[index] = updated;
      }
    }

    // Add new faults
    result = [...result, ...newFaults];

    // Sort by timestamp
    result.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return { faultEntries: result, addedCount: addedCount + updatedCount };
  }

  return { faultEntries, addedCount: 0 };
}

/**
 * Remove faults that were deleted from cloud
 */
export function removeDeletedCloudFaults(
  faultEntries: FaultEntry[],
  deletedIds: string[],
): { faultEntries: FaultEntry[]; removedCount: number } {
  const deletedSet = new Set(deletedIds);
  let removedCount = 0;

  const filtered = faultEntries.filter((fault) => {
    const deleteKey = `${fault.id}:${fault.deviceId}`;
    const isDeleted = deletedSet.has(deleteKey) || deletedSet.has(fault.id);

    if (isDeleted) {
      removedCount++;
      return false;
    }
    return true;
  });

  return { faultEntries: filtered, removedCount };
}
