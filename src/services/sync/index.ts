/**
 * Sync Service Facade
 * Coordinates all sync modules and maintains backwards-compatible API
 */

import { store } from '../../store';
import { fetchWithTimeout } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { isPhotoMarker } from '../../utils/photoHelpers';
import { getAuthHeaders } from '../auth';
import { batteryService } from '../battery';
import { photoStorage } from '../photoStorage';
import { broadcastManager } from './broadcast';
import {
  cleanupEntrySync,
  deleteEntryFromCloud,
  fetchCloudEntries,
  getLastSyncTimestamp,
  initializeEntrySync,
  pushLocalEntries,
  sendEntriesToCloudBatch,
  sendEntryToCloud,
} from './entrySync';
import {
  cleanupFaultSync,
  deleteFaultFromCloudApi,
  fetchCloudFaults,
  getOtherGateAssignments,
  initializeFaultSync,
  pushLocalFaults,
  sendFaultToCloud,
} from './faultSync';
// Import modules
import { networkMonitor } from './networkMonitor';
import { pollingManager } from './polling';
import { queueProcessor } from './queue';
import { API_BASE, FETCH_TIMEOUT } from './types';

// Re-export auth functions for backwards compatibility
export {
  AUTH_TOKEN_KEY,
  clearAuthToken,
  exchangePinForToken,
  hasAuthToken,
  setAuthToken,
} from '../auth';

// Re-export types
export type {
  BroadcastMessage,
  ConnectionQuality,
  PollingConfig,
} from './types';

/**
 * SyncService facade - coordinates all sync modules
 */
// Fault polling interval: faults change less frequently than entries,
// so poll separately at a slower cadence to save cellular data/battery
const FAULT_POLL_INTERVAL = 120000; // 2 minutes

class SyncService {
  private visibilityHandler: (() => void) | null = null;
  private wasQueueProcessingBeforeHidden = false;
  private faultPollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize sync service
   */
  initialize(): void {
    const state = store.getState();

    if (!state.settings.sync || !state.raceId) {
      this.cleanup();
      return;
    }

    // Initialize modules with callbacks
    this.initializeModules();

    // Initialize BroadcastChannel for same-browser tab sync
    broadcastManager.initialize(state.raceId);

    // Initialize network monitoring
    networkMonitor.initialize();

    // Start cloud sync polling
    pollingManager.start();

    // Start independent fault polling (slower cadence than entry polling)
    this.startFaultPolling();

    // Start queue processing
    queueProcessor.start();

    // Push existing local entries/faults to cloud (fire-and-forget with error handling)
    pushLocalEntries().catch((error) => {
      logger.error('Failed to push local entries during sync init:', error);
    });
    pushLocalFaults().catch((error) => {
      logger.error('Failed to push local faults during sync init:', error);
    });

    // Add visibility change handler: slow down polling when hidden, restore when visible
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          // Page is hidden - slow down polling instead of stopping entirely
          // This keeps data flowing at a reduced rate while saving battery
          pollingManager.setTabHidden(true);
          // Stop queue processing and fault polling to save battery (not time-sensitive)
          this.wasQueueProcessingBeforeHidden = queueProcessor.isProcessing();
          queueProcessor.stop();
          this.stopFaultPolling();
        } else {
          // Page is visible - restore normal polling (triggers immediate poll)
          pollingManager.setTabHidden(false);
          // Resume queue processing if it was active
          if (this.wasQueueProcessingBeforeHidden) {
            queueProcessor.start();
          }
          // Resume fault polling
          this.startFaultPolling();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (document.hidden) {
        this.visibilityHandler();
      }
    }

    // Initialize battery service for adaptive polling
    batteryService.initialize().catch((err) => {
      logger.warn('[Sync] Battery service init failed:', err);
    });

    // Register online/offline handlers
    networkMonitor.registerOnlineHandlers(
      () => {
        // Browser came back online - try to reconnect
        if (store.getState().syncStatus === 'offline') {
          store.setSyncStatus('connecting');
          pollingManager.start();
          // Push any faults that failed to sync while offline
          pushLocalFaults().catch((error) => {
            logger.error('Failed to push local faults on reconnect:', error);
          });
        }
      },
      () => {
        // Browser went offline - update status immediately
        store.setSyncStatus('offline');
      },
    );

    // Check initial online status
    if (!navigator.onLine) {
      store.setSyncStatus('offline');
    } else {
      store.setSyncStatus('connecting');
    }
  }

  /**
   * Initialize all modules with their callbacks
   */
  private initializeModules(): void {
    // Initialize polling manager
    pollingManager.initialize(() => {
      fetchCloudEntries().catch((err) => {
        logger.error('Poll fetch failed:', err);
      });
    });

    // Initialize queue processor with single and batch callbacks
    queueProcessor.initialize(sendEntryToCloud);
    queueProcessor.initializeBatch(sendEntriesToCloudBatch);

    // Initialize entry sync
    initializeEntrySync({
      onPollingAdjust: (success, hasChanges) => {
        pollingManager.adjustPollingInterval(success, hasChanges);
      },
      onResetFastPolling: () => {
        pollingManager.resetToFastPolling();
      },
      onCleanup: () => this.cleanup(),
      showToast: (message, type, duration) =>
        this.showSyncToast(message, type, duration),
    });

    // Initialize fault sync
    initializeFaultSync({
      onResetFastPolling: () => {
        pollingManager.resetToFastPolling();
      },
      showToast: (message, type, duration) =>
        this.showSyncToast(message, type, duration),
    });
  }

  /**
   * Start independent fault polling at a slower cadence than entry polling.
   * Faults change less frequently than entries, so a separate 2-minute
   * interval avoids doubling request count on cellular networks.
   */
  private startFaultPolling(): void {
    this.stopFaultPolling();
    // Initial fault fetch
    fetchCloudFaults().catch((err) => {
      logger.error('Initial fault fetch failed:', err);
    });
    this.faultPollInterval = setInterval(() => {
      fetchCloudFaults().catch((err) => {
        logger.error('Fault poll failed:', err);
      });
    }, FAULT_POLL_INTERVAL);
  }

  /**
   * Stop fault polling
   */
  private stopFaultPolling(): void {
    if (this.faultPollInterval) {
      clearInterval(this.faultPollInterval);
      this.faultPollInterval = null;
    }
  }

  /**
   * Show sync toast notification
   */
  private showSyncToast(
    message: string,
    type: 'success' | 'warning' | 'error' = 'success',
    duration?: number,
  ): void {
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: { message, type, duration },
      }),
    );
  }

  /**
   * Cleanup sync service
   */
  cleanup(): void {
    // Stop polling, fault polling, and queue processing
    pollingManager.cleanup();
    this.stopFaultPolling();
    queueProcessor.cleanup();

    // Close broadcast channel
    broadcastManager.cleanup();

    // Cleanup network monitoring
    networkMonitor.cleanup();

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.wasQueueProcessingBeforeHidden = false;

    // Cleanup module state
    cleanupEntrySync();
    cleanupFaultSync();

    store.setSyncStatus('disconnected');
  }

  // ===== Public API Methods =====

  /**
   * Force refresh from cloud
   */
  async forceRefresh(): Promise<void> {
    await fetchCloudEntries();
  }

  /**
   * Get sync queue length
   */
  getQueueLength(): number {
    return queueProcessor.getQueueLength();
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTime(): number {
    return getLastSyncTimestamp();
  }

  /**
   * Broadcast entry to other tabs
   */
  broadcastEntry(entry: import('../../types').Entry): void {
    broadcastManager.broadcastEntry(entry);
  }

  /**
   * Broadcast presence to other tabs
   */
  broadcastPresence(): void {
    broadcastManager.broadcastPresence();
  }

  /**
   * Reset to fast polling (call when user sends an entry)
   */
  resetToFastPolling(): void {
    pollingManager.resetToFastPolling();
  }

  /**
   * Send entry to cloud
   */
  sendEntryToCloud(entry: import('../../types').Entry): Promise<boolean> {
    return sendEntryToCloud(entry);
  }

  /**
   * Delete entry from cloud
   */
  deleteEntryFromCloud(
    entryId: string,
    entryDeviceId?: string,
  ): Promise<boolean> {
    return deleteEntryFromCloud(entryId, entryDeviceId);
  }

  /**
   * Send fault to cloud
   */
  sendFaultToCloud(fault: import('../../types').FaultEntry): Promise<boolean> {
    return sendFaultToCloud(fault);
  }

  /**
   * Delete fault from cloud
   */
  async deleteFaultFromCloud(
    faultId: string,
    faultDeviceId?: string,
    approvedBy?: string,
  ): Promise<boolean> {
    return deleteFaultFromCloudApi(faultId, faultDeviceId, approvedBy);
  }

  /**
   * Get gate assignments from other devices
   */
  getOtherGateAssignments(): import('../../types').GateAssignment[] {
    return getOtherGateAssignments();
  }

  /**
   * Check if a race exists in the cloud
   */
  async checkRaceExists(
    raceId: string,
  ): Promise<{ exists: boolean; entryCount: number }> {
    if (!raceId) {
      return { exists: false, entryCount: 0 };
    }

    try {
      const response = await fetchWithTimeout(
        `${API_BASE}?raceId=${encodeURIComponent(raceId)}&checkOnly=true`,
        {
          headers: { 'Accept-Encoding': 'gzip, deflate', ...getAuthHeaders() },
        },
        5000,
      );

      if (!response.ok) {
        return { exists: false, entryCount: 0 };
      }

      const data = await response.json();
      return {
        exists: data.exists === true,
        entryCount: typeof data.entryCount === 'number' ? data.entryCount : 0,
      };
    } catch (error) {
      logger.error('Check race exists error:', error);
      return { exists: false, entryCount: 0 };
    }
  }

  /**
   * Get photo sync statistics for the warning modal
   */
  async getPhotoSyncStats(): Promise<{
    uploadCount: number;
    uploadSize: number;
    downloadCount: number;
    downloadSize: number;
    totalSize: number;
  }> {
    const state = store.getState();
    let uploadCount = 0;
    let uploadSize = 0;
    let downloadCount = 0;
    let downloadSize = 0;

    // Count local photos to upload
    for (const entry of state.entries) {
      if (isPhotoMarker(entry.photo) && entry.deviceId === state.deviceId) {
        const photoData = await photoStorage.getPhoto(entry.id);
        if (photoData) {
          uploadCount++;
          uploadSize += photoData.length;
        }
      }
    }

    // Estimate photos to download from cloud using lightweight stats endpoint
    if (state.settings.sync && state.raceId) {
      try {
        const params = new URLSearchParams({
          raceId: state.raceId,
          deviceId: state.deviceId,
          deviceName: state.deviceName,
          statsOnly: 'true',
        });
        const response = await fetchWithTimeout(
          `${API_BASE}?${params}`,
          {
            headers: {
              'Accept-Encoding': 'gzip, deflate',
              ...getAuthHeaders(),
            },
          },
          FETCH_TIMEOUT,
        );

        if (response.ok) {
          const data = await response.json();
          downloadCount =
            typeof data.photoCount === 'number' ? data.photoCount : 0;
          downloadSize =
            typeof data.photoTotalSize === 'number' ? data.photoTotalSize : 0;
        }
      } catch (error) {
        logger.warn('Failed to fetch cloud photo stats:', error);
      }
    }

    return {
      uploadCount,
      uploadSize,
      downloadCount,
      downloadSize,
      totalSize: uploadSize + downloadSize,
    };
  }
}

// Singleton instance
export const syncService = new SyncService();

// Helper function to send entry and broadcast
export async function syncEntry(
  entry: import('../../types').Entry,
): Promise<void> {
  const state = store.getState();

  // Broadcast to other tabs
  syncService.broadcastEntry(entry);

  // Send to cloud if enabled
  if (state.settings.sync && state.raceId) {
    const success = await syncService.sendEntryToCloud(entry);
    if (!success) {
      // Add to retry queue
      store.addToSyncQueue(entry);
    }
  }
}

// Helper function to sync fault
export async function syncFault(
  fault: import('../../types').FaultEntry,
): Promise<void> {
  const state = store.getState();

  // Broadcast to other tabs
  broadcastManager.broadcastFault(fault);

  // Send to cloud if enabled
  if (state.settings.sync && state.raceId) {
    const success = await syncService.sendFaultToCloud(fault);
    if (!success) {
      logger.warn(
        'Failed to sync fault to cloud, will retry on next poll:',
        fault.id,
      );
    }
  }
}

// Helper function to delete fault from cloud
export async function deleteFaultFromCloud(
  fault: import('../../types').FaultEntry,
): Promise<boolean> {
  const state = store.getState();

  // Broadcast deletion to other tabs
  broadcastManager.broadcastFaultDeletion(fault.id);

  // Delete from cloud if enabled
  if (state.settings.sync && state.raceId) {
    return syncService.deleteFaultFromCloud(
      fault.id,
      fault.deviceId,
      fault.markedForDeletionBy,
    );
  }
  return true;
}
