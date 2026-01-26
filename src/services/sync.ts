import { store } from '../store';
import type { Entry, SyncResponse, DeviceInfo, FaultEntry, GateAssignment } from '../types';
import { isValidEntry } from '../utils/validation';
import { fetchWithTimeout } from '../utils/errors';
import { photoStorage } from './photoStorage';
import { t } from '../i18n/translations';
import { getPointLabel } from '../utils/format';
import { batteryService, type BatteryLevel } from './battery';
import { addRecentRace } from '../utils/recentRaces';

// API configuration
const API_BASE = '/api/sync';
const FAULTS_API_BASE = '/api/faults';
const AUTH_TOKEN_KEY = 'skiTimerAuthToken';

// Get auth headers for sync API requests (JWT token)
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

// Check if we have a valid auth token
export function hasAuthToken(): boolean {
  return !!localStorage.getItem(AUTH_TOKEN_KEY);
}

// Store auth token
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Clear auth token (on expiry or logout)
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Exchange PIN for JWT token
export async function exchangePinForToken(pin: string): Promise<{ success: boolean; token?: string; error?: string; isNewPin?: boolean }> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Authentication failed' };
    }

    if (data.token) {
      setAuthToken(data.token);
      return { success: true, token: data.token, isNewPin: data.isNewPin };
    }

    return { success: false, error: 'No token received' };
  } catch (error) {
    console.error('Token exchange error:', error);
    return { success: false, error: 'Network error' };
  }
}

// Sync configuration
const POLL_INTERVAL_NORMAL = 5000; // 5 seconds - fast polling when active
const POLL_INTERVAL_ERROR = 30000; // 30 seconds on error
const MAX_RETRIES = 5;
const RETRY_BACKOFF_BASE = 2000; // 2 seconds
const QUEUE_PROCESS_INTERVAL = 10000; // 10 seconds
const FETCH_TIMEOUT = 8000; // 8 seconds timeout for sync requests

// Adaptive polling configuration
// Gradually increases interval when no changes detected to save battery
const POLL_INTERVALS_IDLE = [5000, 10000, 15000, 20000, 30000]; // Gradual increase
const IDLE_THRESHOLD = 6; // Number of no-change polls before starting to throttle

// Battery-aware polling configuration
// More aggressive throttling when battery is low
const POLL_INTERVALS_LOW_BATTERY = [10000, 20000, 30000, 45000, 60000]; // Low battery: slower
const POLL_INTERVALS_CRITICAL = [30000, 45000, 60000]; // Critical: much slower
const IDLE_THRESHOLD_LOW_BATTERY = 3; // Start throttling sooner on low battery

// Network-aware polling configuration
// Reduce sync frequency on metered connections (cellular) to save data
const POLL_INTERVALS_METERED = [10000, 15000, 20000, 30000]; // Metered: slower to save data
const POLL_INTERVAL_METERED_BASE = 10000; // 10s base when on metered connection

// Network Information API type definition
interface NetworkInformation extends EventTarget {
  type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
  onchange?: ((this: NetworkInformation, ev: Event) => unknown) | null;
}

class SyncService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private consecutiveErrors = 0;
  private lastSyncTimestamp = 0;
  private isProcessingQueue = false;
  private visibilityHandler: (() => void) | null = null;
  private wasPollingBeforeHidden = false;
  private wasQueueProcessingBeforeHidden = false;

  // Adaptive polling state
  private consecutiveNoChanges = 0; // Track polls with no changes
  private currentIdleLevel = 0; // Index into POLL_INTERVALS_IDLE

  // Battery-aware polling state
  private currentBatteryLevel: BatteryLevel = 'normal';
  private batteryUnsubscribe: (() => void) | null = null;
  private isAdjustingInterval = false; // Prevent concurrent interval adjustments

  // Network-aware polling state
  private isMeteredConnection = false;
  private networkChangeHandler: (() => void) | null = null;

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

    // Push existing local faults to cloud
    this.pushLocalFaults();

    // Add visibility change handler to pause/resume polling for battery optimization
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          // Page is hidden - stop polling to save battery
          this.wasPollingBeforeHidden = this.pollInterval !== null;
          this.wasQueueProcessingBeforeHidden = this.queueInterval !== null;
          if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
          }
          if (this.queueInterval) {
            clearInterval(this.queueInterval);
            this.queueInterval = null;
          }
        } else {
          // Page is visible again - resume polling if it was active before
          if (this.wasPollingBeforeHidden) {
            this.startPolling();
          }
          if (this.wasQueueProcessingBeforeHidden) {
            this.startQueueProcessor();
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (document.hidden) {
        this.visibilityHandler();
      }
    }

    // Subscribe to battery status changes for adaptive polling
    if (!this.batteryUnsubscribe) {
      batteryService.initialize().then(() => {
        this.batteryUnsubscribe = batteryService.subscribe((status) => {
          const previousLevel = this.currentBatteryLevel;
          this.currentBatteryLevel = status.batteryLevel;

          // Adjust polling if battery level changed and we're actively polling
          if (previousLevel !== status.batteryLevel && this.pollInterval) {
            this.applyBatteryAwarePolling();
          }
        });
      });
    }

    // Subscribe to network status changes for data-aware polling
    this.initNetworkMonitoring();

    store.setSyncStatus('connecting');
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
   * Initialize network monitoring for data-aware polling
   * Detects metered connections (cellular) to reduce data usage
   */
  private initNetworkMonitoring(): void {
    // Check if Network Information API is available
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!connection) {
      return;
    }

    // Check initial network state
    this.updateNetworkState(connection);

    // Subscribe to network changes
    if (!this.networkChangeHandler) {
      this.networkChangeHandler = () => {
        const wasMetered = this.isMeteredConnection;
        this.updateNetworkState(connection);

        // Adjust polling if metered state changed and we're actively polling
        if (wasMetered !== this.isMeteredConnection && this.pollInterval) {
          this.applyBatteryAwarePolling();
        }
      };
      connection.addEventListener('change', this.networkChangeHandler);
    }
  }

  /**
   * Update network metered state from connection info
   */
  private updateNetworkState(connection: NetworkInformation): void {
    // Consider connection metered if:
    // 1. User has enabled data saver mode
    // 2. Connection type is cellular
    // 3. Effective type is slow (2G or slower)
    this.isMeteredConnection =
      connection.saveData === true ||
      connection.type === 'cellular' ||
      connection.effectiveType === 'slow-2g' ||
      connection.effectiveType === '2g';
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
   * Get the appropriate polling intervals based on battery level and network state
   * Battery critical takes priority, then metered network, then low battery
   */
  private getPollingIntervals(): number[] {
    // Battery critical takes highest priority
    if (this.currentBatteryLevel === 'critical') {
      return POLL_INTERVALS_CRITICAL;
    }
    // Metered network uses reduced intervals to save data
    if (this.isMeteredConnection) {
      return POLL_INTERVALS_METERED;
    }
    // Low battery uses slower intervals
    if (this.currentBatteryLevel === 'low') {
      return POLL_INTERVALS_LOW_BATTERY;
    }
    return POLL_INTERVALS_IDLE;
  }

  /**
   * Get the idle threshold based on battery level
   */
  private getIdleThreshold(): number {
    return this.currentBatteryLevel === 'normal'
      ? IDLE_THRESHOLD
      : IDLE_THRESHOLD_LOW_BATTERY;
  }

  /**
   * Get the base polling interval based on battery level and network state
   */
  private getBasePollingInterval(): number {
    // Battery critical takes priority
    if (this.currentBatteryLevel === 'critical') {
      return POLL_INTERVALS_CRITICAL[0]; // 30s even when active
    }
    // Metered connections use slower base to save data
    if (this.isMeteredConnection) {
      return POLL_INTERVAL_METERED_BASE; // 10s when on cellular
    }
    // Low battery uses slower intervals
    if (this.currentBatteryLevel === 'low') {
      return POLL_INTERVALS_LOW_BATTERY[0]; // 10s when active
    }
    return POLL_INTERVAL_NORMAL; // 5s when active
  }

  /**
   * Apply battery-aware polling based on current state
   * Called when battery level changes
   * Uses mutex flag to prevent race condition with adjustPollingInterval
   */
  private applyBatteryAwarePolling(): void {
    // Prevent concurrent interval adjustments
    if (this.isAdjustingInterval) {
      return;
    }
    this.isAdjustingInterval = true;

    try {
      const intervals = this.getPollingIntervals();

      // Clamp idle level to new interval array bounds
      this.currentIdleLevel = Math.min(this.currentIdleLevel, intervals.length - 1);

      // Get appropriate interval
      let newInterval: number;
      if (this.consecutiveNoChanges < this.getIdleThreshold()) {
        // Active mode - use base interval for battery level
        newInterval = this.getBasePollingInterval();
      } else {
        // Idle mode - use throttled interval
        newInterval = intervals[this.currentIdleLevel];
      }

      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.fetchCloudEntries(), newInterval);
      }
    } finally {
      this.isAdjustingInterval = false;
    }
  }

  /**
   * Adjust polling interval based on success/failure and whether changes were detected
   * Implements adaptive polling: fast when active, slow when idle
   * Battery-aware: uses slower intervals when battery is low
   * Uses mutex flag to prevent race condition with applyBatteryAwarePolling
   */
  private adjustPollingInterval(success: boolean, hasChanges: boolean = false): void {
    // Prevent concurrent interval adjustments
    if (this.isAdjustingInterval) {
      return;
    }
    this.isAdjustingInterval = true;

    try {
      if (!success) {
        // Error case - use error interval
        this.consecutiveErrors++;
        if (this.consecutiveErrors > 2 && this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = setInterval(() => this.fetchCloudEntries(), POLL_INTERVAL_ERROR);
        }
        return;
      }

      // Success case - reset error counter
      this.consecutiveErrors = 0;

      const intervals = this.getPollingIntervals();
      const idleThreshold = this.getIdleThreshold();
      const baseInterval = this.getBasePollingInterval();

      if (hasChanges) {
        // Changes detected - reset to fast polling (battery-aware)
        this.consecutiveNoChanges = 0;
        this.currentIdleLevel = 0;

        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = setInterval(() => this.fetchCloudEntries(), baseInterval);
        }
      } else {
        // No changes - consider throttling
        this.consecutiveNoChanges++;

        if (this.consecutiveNoChanges >= idleThreshold) {
          // Start or continue throttling
          const newIdleLevel = Math.min(
            this.currentIdleLevel + 1,
            intervals.length - 1
          );

          // Only adjust if level changed
          if (newIdleLevel !== this.currentIdleLevel) {
            this.currentIdleLevel = newIdleLevel;
            const newInterval = intervals[this.currentIdleLevel];

            if (this.pollInterval) {
              clearInterval(this.pollInterval);
              this.pollInterval = setInterval(() => this.fetchCloudEntries(), newInterval);
            }
          }
        }
      }
    } finally {
      this.isAdjustingInterval = false;
    }
  }

  /**
   * Reset adaptive polling to fast mode (call when user sends an entry)
   * Uses battery-aware base interval
   */
  resetToFastPolling(): void {
    this.consecutiveNoChanges = 0;
    this.currentIdleLevel = 0;

    const baseInterval = this.getBasePollingInterval();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => this.fetchCloudEntries(), baseInterval);
    }
  }

  /**
   * Process photos from cloud entries - store in IndexedDB and set marker
   * Only processes photos if syncPhotos setting is enabled
   */
  private async processCloudPhotos(entries: Entry[]): Promise<Entry[]> {
    const state = store.getState();
    const processedEntries: Entry[] = [];

    for (const entry of entries) {
      if (entry.photo && entry.photo !== 'indexeddb' && entry.photo.length > 20) {
        // Entry has full photo data from cloud
        if (state.settings.syncPhotos) {
          // Save to IndexedDB when photo sync is enabled
          const saved = await photoStorage.savePhoto(entry.id, entry.photo);
          if (saved) {
            // Replace full photo with marker
            processedEntries.push({ ...entry, photo: 'indexeddb' });
          } else {
            // Failed to save - keep entry without photo (performance priority, no retry)
            console.warn('Sync: Photo storage failed for entry:', entry.id);
            processedEntries.push({ ...entry, photo: undefined });
          }
        } else {
          // Photo sync disabled - discard incoming photo data
          processedEntries.push({ ...entry, photo: undefined });
        }
      } else {
        // No photo or already has marker
        processedEntries.push(entry);
      }
    }

    return processedEntries;
  }

  /**
   * Fetch entries from cloud
   */
  async fetchCloudEntries(): Promise<void> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return;

    // Set syncing status to show activity indicator
    const previousStatus = state.syncStatus;
    if (previousStatus === 'connected' || previousStatus === 'connecting') {
      store.setSyncStatus('syncing');
    }

    try {
      // Include deviceId and deviceName for heartbeat tracking
      const params = new URLSearchParams({
        raceId: state.raceId,
        deviceId: state.deviceId,
        deviceName: state.deviceName
      });
      const response = await fetchWithTimeout(`${API_BASE}?${params}`, {
        headers: getAuthHeaders()
      }, FETCH_TIMEOUT);

      // Handle authentication errors specially
      if (response.status === 401) {
        let data;
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        if (data.expired) {
          // Token expired - clear and notify user
          clearAuthToken();
          store.setSyncStatus('disconnected');
          window.dispatchEvent(new CustomEvent('auth-expired', {
            detail: { message: 'Session expired. Please re-enter your PIN.' }
          }));
          this.cleanup();
          return;
        }
        throw new Error(`HTTP ${response.status}: ${data.error || 'Unauthorized'}`);
      }

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

      // Check if race was deleted by admin
      if (data.deleted) {
        window.dispatchEvent(new CustomEvent('race-deleted', {
          detail: {
            raceId: state.raceId,
            deletedAt: data.deletedAt,
            message: data.message
          }
        }));
        this.cleanup();
        return;
      }

      // Validate and filter entries - only accept well-formed entries
      const rawEntries = Array.isArray(data.entries) ? data.entries : [];
      const cloudEntries = rawEntries.filter(entry => {
        if (!isValidEntry(entry)) {
          console.warn('Skipping invalid entry from cloud:', entry);
          return false;
        }
        return true;
      });
      const deletedIds = Array.isArray(data.deletedIds)
        ? data.deletedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      // Update sync status
      store.setSyncStatus('connected');

      // Update device count
      if (typeof data.deviceCount === 'number') {
        store.setCloudDeviceCount(data.deviceCount);
      }

      // Update highest bib
      if (typeof data.highestBib === 'number') {
        store.setCloudHighestBib(data.highestBib);
      }

      // Track if any changes occurred for adaptive polling
      let hasChanges = false;

      // Remove locally any entries that were deleted from cloud
      if (deletedIds.length > 0) {
        store.removeDeletedCloudEntries(deletedIds);
        hasChanges = true;
      }

      // Merge remote entries (excluding deleted ones)
      if (cloudEntries.length > 0) {
        // Process photos from cloud entries - store in IndexedDB
        const processedEntries = await this.processCloudPhotos(cloudEntries);
        const added = store.mergeCloudEntries(processedEntries, deletedIds);
        if (added > 0) {
          hasChanges = true;
          const lang = store.getState().currentLang;
          this.showSyncToast(t('syncedEntriesFromCloud', lang).replace('{count}', String(added)));
        }
      }

      this.lastSyncTimestamp = data.lastUpdated || Date.now();

      // Track this race as recently synced
      if (state.raceId) {
        addRecentRace(state.raceId, this.lastSyncTimestamp, cloudEntries.length);
      }

      // Also fetch faults (for gate judge view and results display)
      await this.fetchCloudFaults();

      this.adjustPollingInterval(true, hasChanges);
    } catch (error) {
      console.error('Cloud sync fetch error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : '';

      if (errorName === 'FetchTimeoutError' || errorMessage.includes('timed out')) {
        store.setSyncStatus('error');
      } else if (errorMessage.includes('500') || errorMessage.includes('503')) {
        store.setSyncStatus('error');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        store.setSyncStatus('offline');
      } else {
        store.setSyncStatus('error');
      }

      this.adjustPollingInterval(false);
    }
  }

  /**
   * Delete entry from cloud
   */
  async deleteEntryFromCloud(entryId: string, entryDeviceId?: string): Promise<boolean> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return false;

    try {
      const response = await fetchWithTimeout(
        `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            entryId,
            deviceId: entryDeviceId || state.deviceId,
            deviceName: state.deviceName
          })
        },
        FETCH_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Cloud sync delete error:', error);
      return false;
    }
  }

  /**
   * Send entry to cloud
   */
  async sendEntryToCloud(entry: Entry): Promise<boolean> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return false;

    try {
      // Prepare entry for sync - load photo from IndexedDB if syncPhotos is enabled
      let entryToSync = { ...entry };
      if (state.settings.syncPhotos && entry.photo === 'indexeddb') {
        const photoData = await photoStorage.getPhoto(entry.id);
        if (photoData) {
          entryToSync = { ...entry, photo: photoData };
        } else {
          // Photo not found in IndexedDB, send without photo
          entryToSync = { ...entry, photo: undefined };
        }
      } else if (entry.photo) {
        // syncPhotos is disabled - strip photo data from sync
        entryToSync = { ...entry, photo: undefined };
      }

      const response = await fetchWithTimeout(
        `${API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            entry: entryToSync,
            deviceId: state.deviceId,
            deviceName: state.deviceName
          })
        },
        FETCH_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Parse response to check for flags and warnings
      try {
        const data = await response.json();
        const lang = store.getState().currentLang;

        if (data.photoSkipped) {
          this.showSyncToast(t('photoTooLarge', lang), 'warning');
        }

        // Check for cross-device duplicate warning
        if (data.crossDeviceDuplicate) {
          const dup = data.crossDeviceDuplicate;
          const pointLabel = getPointLabel(dup.point, lang);
          this.showSyncToast(
            t('crossDeviceDuplicate', lang)
              .replace('{bib}', dup.bib)
              .replace('{point}', pointLabel)
              .replace('{device}', dup.deviceName),
            'warning',
            5000
          );
          // Dispatch event for UI to show more prominent warning
          window.dispatchEvent(new CustomEvent('cross-device-duplicate', {
            detail: dup
          }));
        }

        // Update device count and highest bib from response
        if (typeof data.deviceCount === 'number') {
          store.setCloudDeviceCount(data.deviceCount);
        }
        if (typeof data.highestBib === 'number') {
          store.setCloudHighestBib(data.highestBib);
        }
      } catch {
        // Ignore parse errors for response body
      }

      // Remove from sync queue on success
      store.removeFromSyncQueue(entry.id);

      // Reset to fast polling when user is actively sending entries
      this.resetToFastPolling();

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
   * ATOMICITY FIX: Set flag before any checks to prevent concurrent processing
   */
  private async processQueue(): Promise<void> {
    // CRITICAL: Set flag FIRST to prevent race condition
    // Multiple calls could pass the check if flag is set after early returns
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const state = store.getState();
      if (!state.settings.sync || !state.raceId || state.syncQueue.length === 0) {
        return; // Early exit, but finally block will clear flag
      }
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
  private showSyncToast(message: string, type: 'success' | 'warning' | 'error' = 'success', duration?: number): void {
    // Dispatch custom event for toast
    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message, type, duration }
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

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.wasPollingBeforeHidden = false;

    // Unsubscribe from battery changes
    if (this.batteryUnsubscribe) {
      this.batteryUnsubscribe();
      this.batteryUnsubscribe = null;
    }

    // Remove network change handler
    if (this.networkChangeHandler) {
      const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      if (connection) {
        connection.removeEventListener('change', this.networkChangeHandler);
      }
      this.networkChangeHandler = null;
    }

    // Reset adaptive polling state
    this.consecutiveErrors = 0;
    this.consecutiveNoChanges = 0;
    this.currentIdleLevel = 0;
    this.currentBatteryLevel = 'normal';
    this.isMeteredConnection = false;

    store.setSyncStatus('disconnected');
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

  /**
   * Check if a race exists in the cloud
   */
  async checkRaceExists(raceId: string): Promise<{ exists: boolean; entryCount: number }> {
    if (!raceId) {
      return { exists: false, entryCount: 0 };
    }

    try {
      const response = await fetchWithTimeout(
        `${API_BASE}?raceId=${encodeURIComponent(raceId)}&checkOnly=true`,
        { headers: getAuthHeaders() },
        5000 // 5 second timeout for quick check
      );

      if (!response.ok) {
        return { exists: false, entryCount: 0 };
      }

      const data = await response.json();
      return {
        exists: data.exists === true,
        entryCount: typeof data.entryCount === 'number' ? data.entryCount : 0
      };
    } catch (error) {
      console.error('Check race exists error:', error);
      return { exists: false, entryCount: 0 };
    }
  }

  /**
   * Get photo sync statistics for the warning modal
   * Returns counts and sizes for photos to upload and download
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

    // Count local photos to upload (entries with photo='indexeddb' from this device)
    for (const entry of state.entries) {
      if (entry.photo === 'indexeddb' && entry.deviceId === state.deviceId) {
        const photoData = await photoStorage.getPhoto(entry.id);
        if (photoData) {
          uploadCount++;
          // Estimate size: base64 is ~4/3 of original, string length is bytes
          uploadSize += photoData.length;
        }
      }
    }

    // Estimate photos to download from cloud
    // Fetch current cloud entries to count photos from other devices
    if (state.settings.sync && state.raceId) {
      try {
        const params = new URLSearchParams({
          raceId: state.raceId,
          deviceId: state.deviceId,
          deviceName: state.deviceName
        });
        const response = await fetchWithTimeout(`${API_BASE}?${params}`, {
          headers: getAuthHeaders()
        }, FETCH_TIMEOUT);

        if (response.ok) {
          const data = await response.json();
          const cloudEntries = Array.isArray(data.entries) ? data.entries : [];

          for (const cloudEntry of cloudEntries) {
            // Count photos from other devices that we don't have locally
            if (cloudEntry.photo &&
                cloudEntry.photo !== 'indexeddb' &&
                cloudEntry.photo.length > 20 &&
                cloudEntry.deviceId !== state.deviceId) {
              // Check if we already have this entry locally
              const localEntry = state.entries.find(e =>
                e.id === cloudEntry.id && e.deviceId === cloudEntry.deviceId
              );
              if (!localEntry || !localEntry.photo) {
                downloadCount++;
                downloadSize += cloudEntry.photo.length;
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to fetch cloud entries for photo stats:', error);
      }
    }

    return {
      uploadCount,
      uploadSize,
      downloadCount,
      downloadSize,
      totalSize: uploadSize + downloadSize
    };
  }

  // ===== Fault Sync Methods =====

  /**
   * Fetch faults from cloud
   * Called alongside entry polling
   */
  async fetchCloudFaults(): Promise<void> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return;

    // Only fetch faults if device is a gate judge or if we want to show faults in results
    // For now, always fetch to support showing faults in results view
    try {
      const params = new URLSearchParams({
        raceId: state.raceId,
        deviceId: state.deviceId,
        deviceName: state.deviceName
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
        { headers: getAuthHeaders() },
        FETCH_TIMEOUT
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
        ? data.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
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
          this.showSyncToast(t('syncedFaultsFromCloud', lang).replace('{count}', String(added)));
        }
      }

      // Store gate assignments for display (other judges' coverage)
      if (Array.isArray(data.gateAssignments)) {
        this.updateGateAssignments(data.gateAssignments);
      }
    } catch (error) {
      console.error('Fault sync fetch error:', error);
      // Don't change sync status for fault errors - main sync handles that
    }
  }

  /**
   * Send fault to cloud
   */
  async sendFaultToCloud(fault: FaultEntry): Promise<boolean> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return false;

    try {
      const response = await fetchWithTimeout(
        `${FAULTS_API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            fault,
            deviceId: state.deviceId,
            deviceName: state.deviceName,
            gateRange: state.gateAssignment,
            isReady: state.isJudgeReady,
            firstGateColor: state.firstGateColor
          })
        },
        FETCH_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Mark fault as synced
      store.markFaultSynced(fault.id);

      // Reset to fast polling when user is actively recording faults
      this.resetToFastPolling();

      return true;
    } catch (error) {
      console.error('Fault sync send error:', error);
      return false;
    }
  }

  /**
   * Delete fault from cloud
   */
  async deleteFaultFromCloud(faultId: string, faultDeviceId?: string, approvedBy?: string): Promise<boolean> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return false;

    try {
      const response = await fetchWithTimeout(
        `${FAULTS_API_BASE}?raceId=${encodeURIComponent(state.raceId)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            faultId,
            deviceId: faultDeviceId || state.deviceId,
            deviceName: state.deviceName,
            approvedBy: approvedBy || state.deviceName
          })
        },
        FETCH_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Fault sync delete error:', error);
      return false;
    }
  }

  /**
   * Push local faults to cloud
   */
  async pushLocalFaults(): Promise<void> {
    const state = store.getState();
    if (!state.settings.sync || !state.raceId) return;

    for (const fault of state.faultEntries) {
      // Only push faults from this device that haven't been synced
      if (fault.deviceId === state.deviceId && !fault.syncedAt) {
        await this.sendFaultToCloud(fault);
      }
    }
  }

  // Gate assignments from other devices (for UI display)
  private otherGateAssignments: GateAssignment[] = [];

  /**
   * Update gate assignments from cloud response
   */
  private updateGateAssignments(assignments: GateAssignment[]): void {
    const state = store.getState();
    // Filter out this device's assignment
    this.otherGateAssignments = assignments.filter(a => a.deviceId !== state.deviceId);
  }

  /**
   * Get gate assignments from other devices
   */
  getOtherGateAssignments(): GateAssignment[] {
    return this.otherGateAssignments;
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
    await syncService.sendEntryToCloud(entry);
  }
}

// Helper function to sync fault to cloud
export async function syncFault(fault: FaultEntry): Promise<void> {
  const state = store.getState();

  // Send to cloud if enabled
  if (state.settings.sync && state.raceId) {
    await syncService.sendFaultToCloud(fault);
  }
}

// Helper function to delete fault from cloud
export async function deleteFaultFromCloud(fault: FaultEntry): Promise<boolean> {
  return syncService.deleteFaultFromCloud(fault.id, fault.deviceId, fault.deletionApprovedBy);
}
