import { store } from '../store';
import type { Entry, SyncResponse, DeviceInfo } from '../types';
import { isValidEntry } from '../utils/validation';

// API configuration
const API_BASE = '/api/sync';

// Sync configuration
const POLL_INTERVAL_NORMAL = 5000; // 5 seconds
const POLL_INTERVAL_ERROR = 30000; // 30 seconds on error
const MAX_RETRIES = 5;
const RETRY_BACKOFF_BASE = 2000; // 2 seconds
const QUEUE_PROCESS_INTERVAL = 10000; // 10 seconds

class SyncService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private consecutiveErrors = 0;
  private lastSyncTimestamp = 0;
  private isProcessingQueue = false;

  /**
   * Initialize sync service
   */
  initialize(): void {
    const state = store.getState();

    if (!state.settings.sync || !state.raceId) {
      this.cleanup();
      return;
    }

    // Initialize BroadcastChannel for same-browser tab sync
    this.initBroadcastChannel(state.raceId);

    // Start cloud sync polling
    this.startPolling();

    // Start queue processing
    this.startQueueProcessor();

    // Push existing local entries to cloud
    this.pushLocalEntries();

    store.setSyncStatus('connecting');
    console.log('Sync service initialized for race:', state.raceId);
  }

  /**
   * Initialize BroadcastChannel for cross-tab communication
   */
  private initBroadcastChannel(raceId: string): void {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.close();
      }

      this.broadcastChannel = new BroadcastChannel(`ski-timer-${raceId}`);

      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data;

        if (type === 'entry' && isValidEntry(data)) {
          store.mergeCloudEntries([data]);
        } else if (type === 'presence') {
          const deviceInfo = data as DeviceInfo;
          store.addConnectedDevice(deviceInfo);
        }
      };
    } catch (error) {
      console.warn('BroadcastChannel not supported:', error);
    }
  }

  /**
   * Broadcast entry to other tabs
   */
  broadcastEntry(entry: Entry): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'entry', data: entry });
      } catch (error) {
        console.error('Broadcast error:', error);
      }
    }
  }

  /**
   * Broadcast presence to other tabs
   */
  broadcastPresence(): void {
    const state = store.getState();
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'presence',
          data: {
            id: state.deviceId,
            name: state.deviceName,
            lastSeen: Date.now()
          }
        });
      } catch (error) {
        console.error('Presence broadcast error:', error);
      }
    }
  }

  /**
   * Start polling for cloud updates
   */
  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Initial fetch
    this.fetchCloudEntries();

    // Set up polling
    const interval = this.consecutiveErrors > 2 ? POLL_INTERVAL_ERROR : POLL_INTERVAL_NORMAL;
    this.pollInterval = setInterval(() => this.fetchCloudEntries(), interval);
  }

  /**
   * Adjust polling interval based on success/failure
   */
  private adjustPollingInterval(success: boolean): void {
    if (success) {
      this.consecutiveErrors = 0;
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.fetchCloudEntries(), POLL_INTERVAL_NORMAL);
      }
    } else {
      this.consecutiveErrors++;
      if (this.consecutiveErrors > 2 && this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.fetchCloudEntries(), POLL_INTERVAL_ERROR);
      }
    }
  }

  /**
   * Fetch entries from cloud
   */
  async fetchCloudEntries(): Promise<void> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return;

    try {
      const response = await fetch(
        `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let data: SyncResponse;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid response format');
      }

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data structure');
      }

      const cloudEntries = Array.isArray(data.entries) ? data.entries : [];

      // Update sync status
      store.setSyncStatus('connected');

      // Merge remote entries
      if (cloudEntries.length > 0) {
        const added = store.mergeCloudEntries(cloudEntries);
        if (added > 0) {
          this.showSyncToast(`Synced ${added} entries from cloud`);
        }
      }

      this.lastSyncTimestamp = data.lastUpdated || Date.now();
      this.adjustPollingInterval(true);
    } catch (error) {
      console.error('Cloud sync fetch error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('500') || errorMessage.includes('503')) {
        store.setSyncStatus('error');
      } else if (errorMessage.includes('Failed to fetch')) {
        store.setSyncStatus('offline');
      } else {
        store.setSyncStatus('error');
      }

      this.adjustPollingInterval(false);
    }
  }

  /**
   * Send entry to cloud
   */
  async sendEntryToCloud(entry: Entry): Promise<boolean> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return false;

    try {
      const response = await fetch(
        `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entry,
            deviceId: state.deviceId,
            deviceName: state.deviceName
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Remove from sync queue on success
      store.removeFromSyncQueue(entry.id);

      return true;
    } catch (error) {
      console.error('Cloud sync send error:', error);
      return false;
    }
  }

  /**
   * Push all local entries to cloud
   */
  private async pushLocalEntries(): Promise<void> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return;

    console.log('Pushing', state.entries.length, 'local entries to cloud');

    for (const entry of state.entries) {
      // Only push entries from this device
      if (entry.deviceId === state.deviceId && !entry.syncedAt) {
        await this.sendEntryToCloud(entry);
      }
    }
  }

  /**
   * Start processing sync queue
   */
  private startQueueProcessor(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
    }

    this.queueInterval = setInterval(() => this.processQueue(), QUEUE_PROCESS_INTERVAL);
  }

  /**
   * Process sync queue with retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    const state = store.getState();
    if (!state.settings.sync || !state.raceId || state.syncQueue.length === 0) return;

    this.isProcessingQueue = true;

    try {
      const now = Date.now();

      for (const item of state.syncQueue) {
        // Skip if max retries exceeded
        if (item.retryCount >= MAX_RETRIES) {
          console.warn('Max retries exceeded for entry:', item.entry.id);
          store.removeFromSyncQueue(item.entry.id);
          continue;
        }

        // Calculate backoff delay
        const backoffDelay = RETRY_BACKOFF_BASE * Math.pow(2, item.retryCount);
        if (now - item.lastAttempt < backoffDelay) {
          continue; // Not ready to retry yet
        }

        // Attempt to send
        const success = await this.sendEntryToCloud(item.entry);

        if (!success) {
          store.updateSyncQueueItem(item.entry.id, {
            retryCount: item.retryCount + 1,
            lastAttempt: now,
            error: 'Failed to sync'
          });
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Show sync toast notification
   */
  private showSyncToast(message: string): void {
    // Dispatch custom event for toast
    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message, type: 'success' }
    }));
  }

  /**
   * Cleanup sync service
   */
  cleanup(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    this.consecutiveErrors = 0;
    store.setSyncStatus('disconnected');
    console.log('Sync service cleaned up');
  }

  /**
   * Force refresh from cloud
   */
  async forceRefresh(): Promise<void> {
    await this.fetchCloudEntries();
  }

  /**
   * Get sync queue length
   */
  getQueueLength(): number {
    return store.getState().syncQueue.length;
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTime(): number {
    return this.lastSyncTimestamp;
  }
}

// Singleton instance
export const syncService = new SyncService();

// Helper function to send entry and broadcast
export async function syncEntry(entry: Entry): Promise<void> {
  const state = store.getState();

  // Broadcast to other tabs
  syncService.broadcastEntry(entry);

  // Send to cloud if enabled
  if (state.settings.sync && state.raceId) {
    const success = await syncService.sendEntryToCloud(entry);
    if (!success) {
      // Entry will be added to queue by store
      console.log('Entry queued for retry:', entry.id);
    }
  }
}
