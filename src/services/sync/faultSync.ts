/**
 * Fault Sync Module
 * Handles fault cloud operations and gate assignment coordination
 */

import { t } from '../../i18n/translations';
import { store } from '../../store';
import type { FaultEntry, GateAssignment } from '../../types';
import { fetchWithTimeout } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { getAuthHeaders } from '../auth';
import { FAULTS_API_BASE, FETCH_TIMEOUT } from './types';

/**
 * Callbacks for fault sync operations
 */
export interface FaultSyncCallbacks {
  onResetFastPolling: () => void;
  showToast: (
    message: string,
    type?: 'success' | 'warning' | 'error',
    duration?: number,
  ) => void;
}

let callbacks: FaultSyncCallbacks | null = null;

// Gate assignments from other devices (for UI display)
let otherGateAssignments: GateAssignment[] = [];

/**
 * Initialize fault sync with callbacks
 */
export function initializeFaultSync(syncCallbacks: FaultSyncCallbacks): void {
  callbacks = syncCallbacks;
}

/**
 * Update gate assignments from cloud response
 */
function updateGateAssignments(assignments: GateAssignment[]): void {
  const state = store.getState();
  // Filter out this device's assignment
  otherGateAssignments = assignments.filter(
    (a) => a.deviceId !== state.deviceId,
  );
}

/**
 * Get gate assignments from other devices
 */
export function getOtherGateAssignments(): GateAssignment[] {
  return otherGateAssignments;
}

/**
 * Fetch faults from cloud
 * Called alongside entry polling
 */
export async function fetchCloudFaults(): Promise<void> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return;

  try {
    const params = new URLSearchParams({
      raceId: state.raceId,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
    });

    // Include gate assignment and ready status if this device is a gate judge
    if (state.deviceRole === 'gateJudge' && state.gateAssignment) {
      params.set('gateStart', String(state.gateAssignment[0]));
      params.set('gateEnd', String(state.gateAssignment[1]));
      params.set('isReady', String(state.isJudgeReady));
      params.set('firstGateColor', state.firstGateColor);
    }

    const response = await fetchWithTimeout(
      `${FAULTS_API_BASE}?${params}`,
      { headers: { 'Accept-Encoding': 'gzip, deflate', ...getAuthHeaders() } },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Auth expired - handled by main sync
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Validate response
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid fault data structure');
    }

    const cloudFaults = Array.isArray(data.faults) ? data.faults : [];
    const deletedIds = Array.isArray(data.deletedIds)
      ? data.deletedIds.filter(
          (id: unknown): id is string => typeof id === 'string',
        )
      : [];

    // Remove locally any faults that were deleted from cloud
    if (deletedIds.length > 0) {
      store.removeDeletedCloudFaults(deletedIds);
    }

    // Merge remote faults
    if (cloudFaults.length > 0) {
      const added = store.mergeFaultsFromCloud(cloudFaults, deletedIds);
      if (added > 0) {
        const lang = store.getState().currentLang;
        callbacks?.showToast(
          t('syncedFaultsFromCloud', lang).replace('{count}', String(added)),
        );
      }
    }

    // Store gate assignments for display (other judges' coverage)
    if (Array.isArray(data.gateAssignments)) {
      updateGateAssignments(data.gateAssignments);
    }
  } catch (error) {
    logger.error('Fault sync fetch error:', error);
    // Dispatch event so UI can show fault sync status
    window.dispatchEvent(
      new CustomEvent('fault-sync-error', {
        detail: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
    );
  }
}

/**
 * Send fault to cloud
 */
export async function sendFaultToCloud(fault: FaultEntry): Promise<boolean> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return false;

  try {
    const response = await fetchWithTimeout(
      `${FAULTS_API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate', ...getAuthHeaders() },
        body: JSON.stringify({
          fault,
          deviceId: state.deviceId,
          deviceName: state.deviceName,
          gateRange: state.gateAssignment,
          isReady: state.isJudgeReady,
          firstGateColor: state.firstGateColor,
        }),
      },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Mark fault as synced
    store.markFaultSynced(fault.id);

    // Reset to fast polling when user is actively recording faults
    callbacks?.onResetFastPolling();

    return true;
  } catch (error) {
    logger.error('Fault sync send error:', error);
    return false;
  }
}

/**
 * Delete fault from cloud
 */
export async function deleteFaultFromCloudApi(
  faultId: string,
  faultDeviceId?: string,
  approvedBy?: string,
): Promise<boolean> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return false;

  try {
    const response = await fetchWithTimeout(
      `${FAULTS_API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate', ...getAuthHeaders() },
        body: JSON.stringify({
          faultId,
          deviceId: faultDeviceId || state.deviceId,
          deviceName: state.deviceName,
          approvedBy: approvedBy || state.deviceName,
        }),
      },
      FETCH_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    logger.error('Fault sync delete error:', error);
    return false;
  }
}

/**
 * Push local faults to cloud
 */
export async function pushLocalFaults(): Promise<void> {
  const state = store.getState();
  if (!state.settings.sync || !state.raceId) return;

  for (const fault of state.faultEntries) {
    // Only push faults from this device that haven't been synced
    if (fault.deviceId === state.deviceId && !fault.syncedAt) {
      await sendFaultToCloud(fault);
    }
  }
}

/**
 * Cleanup module state
 */
export function cleanupFaultSync(): void {
  callbacks = null;
  otherGateAssignments = [];
}
