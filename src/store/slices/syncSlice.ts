/**
 * Sync Slice
 * Handles sync status, device info, and cloud state
 */

import type { SyncStatus, DeviceInfo } from '../../types';

// Sync State type
export interface SyncState {
  deviceId: string;
  deviceName: string;
  raceId: string;
  lastSyncedRaceId: string;
  syncStatus: SyncStatus;
  connectedDevices: Map<string, DeviceInfo>;
  cloudDeviceCount: number;
  cloudHighestBib: number;
  raceExistsInCloud: boolean | null;
}

/**
 * Set sync status
 */
export function setSyncStatus(status: SyncStatus): Partial<SyncState> {
  return { syncStatus: status };
}

/**
 * Set race ID (clears undo/redo if changing races)
 */
export function setRaceId(
  raceId: string,
  currentRaceId: string
): { raceId: string; clearUndoRedo: boolean } {
  return {
    raceId,
    clearUndoRedo: raceId !== currentRaceId
  };
}

/**
 * Set last synced race ID
 */
export function setLastSyncedRaceId(raceId: string): Partial<SyncState> {
  return { lastSyncedRaceId: raceId };
}

/**
 * Set device name
 */
export function setDeviceName(name: string): Partial<SyncState> {
  return { deviceName: name };
}

// Devices not seen for 2 minutes are considered stale
const DEVICE_STALE_MS = 120_000;

/**
 * Add connected device and prune stale entries
 */
export function addConnectedDevice(
  device: DeviceInfo,
  currentDevices: Map<string, DeviceInfo>
): Partial<SyncState> {
  const now = Date.now();
  const connectedDevices = new Map<string, DeviceInfo>();
  // Copy non-stale devices
  for (const [id, d] of currentDevices) {
    if (now - d.lastSeen < DEVICE_STALE_MS) {
      connectedDevices.set(id, d);
    }
  }
  connectedDevices.set(device.id, device);
  return { connectedDevices };
}

/**
 * Remove connected device
 */
export function removeConnectedDevice(
  deviceId: string,
  currentDevices: Map<string, DeviceInfo>
): Partial<SyncState> {
  const connectedDevices = new Map(currentDevices);
  connectedDevices.delete(deviceId);
  return { connectedDevices };
}

/**
 * Set cloud device count
 */
export function setCloudDeviceCount(count: number): Partial<SyncState> {
  return { cloudDeviceCount: count };
}

/**
 * Set cloud highest bib
 */
export function setCloudHighestBib(bib: number): Partial<SyncState> {
  return { cloudHighestBib: bib };
}

/**
 * Set race exists in cloud flag
 */
export function setRaceExistsInCloud(exists: boolean | null): Partial<SyncState> {
  return { raceExistsInCloud: exists };
}
