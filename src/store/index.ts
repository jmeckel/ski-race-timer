import type {
  AppState,
  Entry,
  Settings,
  Action,
  SyncStatus,
  TimingPoint,
  Run,
  Language,
  SyncQueueItem,
  DeviceInfo
} from '../types';
import { generateDeviceId, generateDeviceName } from '../utils/id';
import { isValidEntry, migrateSchema } from '../utils/validation';
import { SCHEMA_VERSION } from '../types';

// Storage keys
const STORAGE_KEYS = {
  ENTRIES: 'skiTimerEntries',
  SETTINGS: 'skiTimerSettings',
  LANG: 'skiTimerLang',
  DEVICE_ID: 'skiTimerDeviceId',
  DEVICE_NAME: 'skiTimerDeviceName',
  RACE_ID: 'skiTimerRaceId',
  LAST_SYNCED_RACE_ID: 'skiTimerLastSyncedRaceId',
  SYNC_QUEUE: 'skiTimerSyncQueue',
  SCHEMA_VERSION: 'skiTimerSchemaVersion'
} as const;

// Default settings
const DEFAULT_SETTINGS: Settings = {
  auto: true,
  haptic: true,
  sound: false,
  sync: false,
  syncPhotos: false,  // Sync photos disabled by default - must be enabled separately
  gps: true,          // GPS enabled by default for accurate timestamps
  simple: false,  // Normal mode is default (simple mode toggle is hidden)
  photoCapture: false,
  autoFinishTiming: false,
  autoFinishLinePosition: 50,
  autoFinishGateWidth: 20,
  autoFinishSensitivity: 60,
  // Liquid Glass UI settings - enabled by default for modern look
  motionEffects: true,
  glassEffects: true,
  outdoorMode: false
};

// Maximum undo stack size
const MAX_UNDO_STACK = 50;

/**
 * State change listener type
 *
 * IMPORTANT: The state parameter is a snapshot taken when the notification was queued.
 * This ensures all listeners in a batch see consistent state, even if one listener
 * triggers additional state changes. If you need the absolute latest state (e.g., for
 * chained updates), call store.getState() instead of using the passed state parameter.
 */
type StateListener = (state: Readonly<AppState>, changedKeys: (keyof AppState)[]) => void;

// Error callback for listener exceptions
type ListenerErrorCallback = (error: unknown, listener: StateListener) => void;

class Store {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isNotifying = false;
  private pendingNotifications: { keys: (keyof AppState)[]; stateSnapshot: AppState }[] = [];
  private listenerErrorCallback: ListenerErrorCallback | null = null;
  private failedListenerCount = 0;

  constructor() {
    this.state = this.loadInitialState();
  }

  private loadInitialState(): AppState {
    // Load device ID first (or generate new one)
    let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    // Load and migrate data
    const entriesJson = localStorage.getItem(STORAGE_KEYS.ENTRIES);
    const settingsJson = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const syncQueueJson = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);

    let entries: Entry[] = [];
    let settings = DEFAULT_SETTINGS;
    let syncQueue: SyncQueueItem[] = [];

    try {
      if (entriesJson) {
        const parsed = JSON.parse(entriesJson);
        if (Array.isArray(parsed)) {
          // Filter valid entries and ensure run field exists (backwards compat)
          entries = parsed
            .filter(e => isValidEntry(e))
            .map(e => ({ ...e, run: e.run ?? 1 }));
        }
      }
    } catch (e) {
      console.error('Failed to parse entries:', e);
    }

    try {
      if (settingsJson) {
        const parsed = JSON.parse(settingsJson);
        settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error('Failed to parse settings:', e);
    }

    try {
      if (syncQueueJson) {
        const parsed = JSON.parse(syncQueueJson);
        if (Array.isArray(parsed)) {
          syncQueue = parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse sync queue:', e);
    }

    // Load other values
    const lang = (localStorage.getItem(STORAGE_KEYS.LANG) || 'de') as Language;
    let deviceName = localStorage.getItem(STORAGE_KEYS.DEVICE_NAME);
    if (!deviceName) {
      deviceName = generateDeviceName();
      localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, deviceName);
    }
    const raceId = localStorage.getItem(STORAGE_KEYS.RACE_ID) || '';
    const lastSyncedRaceId = localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_RACE_ID) || '';

    return {
      // UI State
      currentView: 'timer',
      currentLang: lang,
      bibInput: '',
      selectedPoint: 'F',
      selectedRun: 1 as Run,
      selectMode: false,
      selectedEntries: new Set(),
      isRecording: false,
      lastRecordedEntry: null,

      // Data
      entries,

      // Undo/Redo
      undoStack: [],
      redoStack: [],

      // Settings
      settings,

      // Device/Sync State
      deviceId,
      deviceName,
      raceId,
      lastSyncedRaceId,
      syncStatus: 'disconnected',
      syncQueue,
      connectedDevices: new Map(),
      cloudDeviceCount: 0,
      cloudHighestBib: 0,
      raceExistsInCloud: null,

      // GPS State
      gpsEnabled: settings.gps,
      gpsAccuracy: null,
      gpsStatus: 'inactive',

      // Camera State
      cameraReady: false,
      cameraError: null
    };
  }

  // Get current state (readonly)
  getState(): Readonly<AppState> {
    return this.state;
  }

  // Subscribe to state changes
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state changes
  // RE-ENTRANCY FIX: Queue notifications to prevent mutations during notification
  // STATE SNAPSHOT FIX: Capture state at notification time so all listeners see consistent state
  private notify(changedKeys: (keyof AppState)[]) {
    // Queue the notification with a snapshot of current state
    // This ensures all listeners in a batch see the same state, even if one listener triggers more changes
    this.pendingNotifications.push({ keys: changedKeys, stateSnapshot: this.state });

    // If already notifying, let the current notification loop handle it
    if (this.isNotifying) {
      return;
    }

    // Process all pending notifications
    this.isNotifying = true;
    try {
      while (this.pendingNotifications.length > 0) {
        const { keys, stateSnapshot } = this.pendingNotifications.shift()!;
        // Create a copy of listeners to avoid issues if listeners are added/removed during iteration
        const listenersCopy = Array.from(this.listeners);
        for (const listener of listenersCopy) {
          try {
            listener(stateSnapshot, keys);
          } catch (e) {
            console.error('State listener error:', e);
            this.failedListenerCount++;
            // Notify error callback if registered
            if (this.listenerErrorCallback) {
              try {
                this.listenerErrorCallback(e, listener);
              } catch {
                // Ignore errors in error callback
              }
            }
          }
        }
      }
    } finally {
      this.isNotifying = false;
    }
  }

  /**
   * Register a callback for listener errors
   * Useful for logging to analytics or showing user notification
   */
  onListenerError(callback: ListenerErrorCallback): void {
    this.listenerErrorCallback = callback;
  }

  /**
   * Get the count of listener failures since app start
   * Can be used for health monitoring
   */
  getListenerFailureCount(): number {
    return this.failedListenerCount;
  }

  // Update state
  private setState(updates: Partial<AppState>, persist: boolean = true) {
    const changedKeys = Object.keys(updates) as (keyof AppState)[];
    this.state = { ...this.state, ...updates };
    this.notify(changedKeys);

    if (persist) {
      this.scheduleSave();
    }
  }

  // Debounced save to localStorage
  private scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => this.saveToStorage(), 100);
  }

  /**
   * Force immediate save to localStorage (bypasses debounce)
   * Use when you need to ensure data is persisted before navigation/modal close
   */
  forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveToStorage();
  }

  // Save state to localStorage
  private saveToStorage() {
    try {
      // Check storage quota if available
      this.checkStorageQuota();

      // Strip full photo data from entries before saving
      // Photos are stored in IndexedDB, only keep 'indexeddb' marker
      const entriesToSave = this.state.entries.map(entry => {
        if (entry.photo && entry.photo !== 'indexeddb' && entry.photo.length > 20) {
          // This is legacy full base64 data - strip it
          return { ...entry, photo: 'indexeddb' };
        }
        return entry;
      });

      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entriesToSave));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.state.settings));
      localStorage.setItem(STORAGE_KEYS.LANG, this.state.currentLang);
      localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, this.state.deviceName);
      localStorage.setItem(STORAGE_KEYS.RACE_ID, this.state.raceId);
      localStorage.setItem(STORAGE_KEYS.LAST_SYNCED_RACE_ID, this.state.lastSyncedRaceId);
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(this.state.syncQueue));
      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
    } catch (e) {
      console.error('Failed to save to storage:', e);
      // Notify user of storage failure - this is critical for a timing app
      this.dispatchStorageError(e as Error);
    }
  }

  // Check storage quota and warn if running low
  private async checkStorageQuota() {
    if (navigator.storage?.estimate) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (quota && usage) {
          const usagePercent = usage / quota;
          if (usagePercent > 0.9) {
            // Storage is over 90% full - warn user
            window.dispatchEvent(new CustomEvent('storage-warning', {
              detail: { usage, quota, percent: Math.round(usagePercent * 100) }
            }));
          }
        }
      } catch (e) {
        // Quota check failed, continue anyway
        console.warn('Could not check storage quota:', e);
      }
    }
  }

  // Dispatch storage error event for UI notification
  private dispatchStorageError(error: Error) {
    window.dispatchEvent(new CustomEvent('storage-error', {
      detail: {
        message: error.message,
        isQuotaError: error.name === 'QuotaExceededError' ||
                      error.message.includes('quota') ||
                      error.message.includes('storage'),
        entryCount: this.state.entries.length
      }
    }));
  }

  // Push action to undo stack
  private pushUndo(action: Action) {
    const undoStack = [...this.state.undoStack, action];
    if (undoStack.length > MAX_UNDO_STACK) {
      undoStack.shift();
    }
    this.setState({ undoStack, redoStack: [] }, false);
  }

  // ===== Entry Actions =====

  addEntry(entry: Entry) {
    const entries = [...this.state.entries, entry];
    this.pushUndo({
      type: 'ADD_ENTRY',
      data: entry,
      timestamp: Date.now()
    });
    this.setState({
      entries,
      lastRecordedEntry: entry,
      isRecording: false
    });

    // Add to sync queue if sync is enabled
    if (this.state.settings.sync && this.state.raceId) {
      this.addToSyncQueue(entry);
    }
  }

  deleteEntry(id: string) {
    const entry = this.state.entries.find(e => e.id === id);
    if (!entry) return;

    this.pushUndo({
      type: 'DELETE_ENTRY',
      data: entry,
      timestamp: Date.now()
    });

    const entries = this.state.entries.filter(e => e.id !== id);
    this.setState({ entries });
  }

  deleteMultiple(ids: string[]) {
    const deletedEntries = this.state.entries.filter(e => ids.includes(e.id));
    if (deletedEntries.length === 0) return;

    this.pushUndo({
      type: 'DELETE_MULTIPLE',
      data: deletedEntries,
      timestamp: Date.now()
    });

    const entries = this.state.entries.filter(e => !ids.includes(e.id));
    this.setState({
      entries,
      selectMode: false,
      selectedEntries: new Set()
    });
  }

  clearAll() {
    if (this.state.entries.length === 0) return;

    this.pushUndo({
      type: 'CLEAR_ALL',
      data: [...this.state.entries],
      timestamp: Date.now()
    });

    this.setState({
      entries: [],
      selectMode: false,
      selectedEntries: new Set()
    });
  }

  /**
   * Update an entry by ID
   * @returns true if entry was found and updated, false if entry not found
   */
  updateEntry(id: string, updates: Partial<Entry>): boolean {
    const index = this.state.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    const oldEntry = this.state.entries[index];
    const newEntry = { ...oldEntry, ...updates };

    this.pushUndo({
      type: 'UPDATE_ENTRY',
      data: oldEntry,
      timestamp: Date.now()
    });

    const entries = [...this.state.entries];
    entries[index] = newEntry;
    this.setState({ entries });
    return true;
  }

  // ===== Undo/Redo =====

  canUndo(): boolean {
    return this.state.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  /**
   * Peek at the next undo action without performing it
   * Useful for showing confirmation dialogs for destructive actions
   */
  peekUndo(): Action | null {
    if (!this.canUndo()) return null;
    return this.state.undoStack[this.state.undoStack.length - 1];
  }

  undo(): { type: Action['type']; data: Entry | Entry[] } | null {
    if (!this.canUndo()) return null;

    const undoStack = [...this.state.undoStack];
    const action = undoStack.pop()!;
    const redoStack = [...this.state.redoStack, action];

    let entries = [...this.state.entries];
    let result: Entry | Entry[] | null = null;

    switch (action.type) {
      case 'ADD_ENTRY': {
        const entry = action.data as Entry;
        entries = entries.filter(e => e.id !== entry.id);
        result = entry;
        break;
      }
      case 'DELETE_ENTRY': {
        const entry = action.data as Entry;
        entries.push(entry);
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        result = entry;
        break;
      }
      case 'DELETE_MULTIPLE':
      case 'CLEAR_ALL': {
        const deletedEntries = action.data as Entry[];
        entries = [...entries, ...deletedEntries];
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        result = deletedEntries;
        break;
      }
      case 'UPDATE_ENTRY': {
        const oldEntry = action.data as Entry;
        const index = entries.findIndex(e => e.id === oldEntry.id);
        if (index !== -1) {
          entries[index] = oldEntry;
        }
        result = oldEntry;
        break;
      }
    }

    this.setState({ entries, undoStack, redoStack });
    return result ? { type: action.type, data: result } : null;
  }

  redo(): Entry | Entry[] | null {
    if (!this.canRedo()) return null;

    const redoStack = [...this.state.redoStack];
    const action = redoStack.pop()!;
    const undoStack = [...this.state.undoStack, action];

    let entries = [...this.state.entries];
    let result: Entry | Entry[] | null = null;

    switch (action.type) {
      case 'ADD_ENTRY': {
        const entry = action.data as Entry;
        entries.push(entry);
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        result = entry;
        break;
      }
      case 'DELETE_ENTRY': {
        const entry = action.data as Entry;
        entries = entries.filter(e => e.id !== entry.id);
        result = entry;
        break;
      }
      case 'DELETE_MULTIPLE':
      case 'CLEAR_ALL': {
        const deletedEntries = action.data as Entry[];
        const idsToDelete = new Set(deletedEntries.map(e => e.id));
        entries = entries.filter(e => !idsToDelete.has(e.id));
        result = deletedEntries;
        break;
      }
      case 'UPDATE_ENTRY': {
        // For redo, we need to re-apply the update
        // This is tricky because we only stored the old entry
        // For now, we just restore the old entry (same as undo)
        const oldEntry = action.data as Entry;
        const index = entries.findIndex(e => e.id === oldEntry.id);
        if (index !== -1) {
          entries[index] = oldEntry;
        }
        result = oldEntry;
        break;
      }
    }

    this.setState({ entries, undoStack, redoStack });
    return result;
  }

  // ===== Sync Queue =====

  addToSyncQueue(entry: Entry) {
    const item: SyncQueueItem = {
      entry,
      retryCount: 0,
      lastAttempt: 0
    };
    const syncQueue = [...this.state.syncQueue, item];
    this.setState({ syncQueue });
  }

  removeFromSyncQueue(entryId: string) {
    const syncQueue = this.state.syncQueue.filter(item => item.entry.id !== entryId);
    this.setState({ syncQueue });
  }

  updateSyncQueueItem(entryId: string, updates: Partial<SyncQueueItem>) {
    const syncQueue = this.state.syncQueue.map(item =>
      item.entry.id === entryId ? { ...item, ...updates } : item
    );
    this.setState({ syncQueue });
  }

  clearSyncQueue() {
    this.setState({ syncQueue: [] });
  }

  // ===== UI State =====

  setView(view: 'timer' | 'results' | 'settings') {
    this.setState({ currentView: view }, false);
  }

  setLanguage(lang: Language) {
    this.setState({ currentLang: lang });
  }

  setBibInput(bib: string) {
    // Limit to 3 digits
    const sanitized = bib.replace(/\D/g, '').slice(0, 3);
    this.setState({ bibInput: sanitized }, false);
  }

  setSelectedPoint(point: TimingPoint) {
    this.setState({ selectedPoint: point }, false);
  }

  setSelectedRun(run: Run) {
    this.setState({ selectedRun: run }, false);
  }

  setSelectMode(enabled: boolean) {
    this.setState({
      selectMode: enabled,
      selectedEntries: enabled ? this.state.selectedEntries : new Set()
    }, false);
  }

  toggleEntrySelection(id: string) {
    const selectedEntries = new Set(this.state.selectedEntries);
    if (selectedEntries.has(id)) {
      selectedEntries.delete(id);
    } else {
      selectedEntries.add(id);
    }
    this.setState({
      selectedEntries,
      selectMode: selectedEntries.size > 0
    }, false);
  }

  selectAllEntries() {
    const selectedEntries = new Set(this.state.entries.map(e => e.id));
    this.setState({ selectedEntries, selectMode: true }, false);
  }

  clearSelection() {
    this.setState({
      selectedEntries: new Set(),
      selectMode: false
    }, false);
  }

  setRecording(isRecording: boolean) {
    this.setState({ isRecording }, false);
  }

  // ===== Settings =====

  updateSettings(updates: Partial<Settings>) {
    const settings = { ...this.state.settings, ...updates };
    this.setState({ settings });
  }

  toggleSetting(key: keyof Settings) {
    const settings = { ...this.state.settings };
    const current = settings[key];
    if (typeof current === 'boolean') {
      settings[key] = (!current) as Settings[typeof key];
      this.setState({ settings });
    }
  }

  // ===== Sync State =====

  setSyncStatus(status: SyncStatus) {
    this.setState({ syncStatus: status }, false);
  }

  setRaceId(raceId: string) {
    // Clear undo/redo stacks when changing to a different race
    // This prevents undoing actions from a previous race
    if (raceId !== this.state.raceId) {
      this.setState({ raceId, undoStack: [], redoStack: [] });
    } else {
      this.setState({ raceId });
    }
  }

  setLastSyncedRaceId(raceId: string) {
    this.setState({ lastSyncedRaceId: raceId });
  }

  markCurrentRaceAsSynced() {
    this.setState({ lastSyncedRaceId: this.state.raceId });
  }

  setDeviceName(name: string) {
    this.setState({ deviceName: name });
  }

  addConnectedDevice(device: DeviceInfo) {
    const connectedDevices = new Map(this.state.connectedDevices);
    connectedDevices.set(device.id, device);
    this.setState({ connectedDevices }, false);
  }

  removeConnectedDevice(deviceId: string) {
    const connectedDevices = new Map(this.state.connectedDevices);
    connectedDevices.delete(deviceId);
    this.setState({ connectedDevices }, false);
  }

  setCloudDeviceCount(count: number) {
    this.setState({ cloudDeviceCount: count }, false);
  }

  setCloudHighestBib(bib: number) {
    this.setState({ cloudHighestBib: bib }, false);
  }

  setRaceExistsInCloud(exists: boolean | null) {
    this.setState({ raceExistsInCloud: exists }, false);
  }

  // ===== GPS State =====

  setGpsStatus(status: 'inactive' | 'searching' | 'active', accuracy?: number) {
    this.setState({
      gpsStatus: status,
      gpsAccuracy: accuracy ?? null
    }, false);
  }

  // ===== Camera State =====

  setCameraReady(ready: boolean, error?: string) {
    this.setState({
      cameraReady: ready,
      cameraError: error ?? null
    }, false);
  }

  // ===== Merge Cloud Entries =====

  mergeCloudEntries(cloudEntries: Entry[], deletedIds: string[] = []): number {
    let addedCount = 0;
    const existingIds = new Set(this.state.entries.map(e => `${e.id}-${e.deviceId}`));
    const deletedSet = new Set(deletedIds);
    const newEntries: Entry[] = [];

    for (const entry of cloudEntries) {
      // Skip invalid entries
      if (!isValidEntry(entry)) continue;

      // Skip entries from this device
      if (entry.deviceId === this.state.deviceId) continue;

      // Skip entries that were deleted
      const deleteKey = `${entry.id}:${entry.deviceId}`;
      if (deletedSet.has(deleteKey) || deletedSet.has(entry.id)) continue;

      // Skip duplicates
      const key = `${entry.id}-${entry.deviceId}`;
      if (existingIds.has(key)) continue;

      // Ensure run field exists (backwards compat)
      newEntries.push({ ...entry, run: entry.run ?? 1 });
      existingIds.add(key);
      addedCount++;
    }

    if (newEntries.length > 0) {
      const entries = [...this.state.entries, ...newEntries];
      entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      this.setState({ entries });
    }

    return addedCount;
  }

  // ===== Remove Deleted Cloud Entries =====

  removeDeletedCloudEntries(deletedIds: string[]): number {
    const deletedSet = new Set(deletedIds);
    let removedCount = 0;

    const entries = this.state.entries.filter(entry => {
      // Check if entry matches any deleted ID pattern
      const deleteKey = `${entry.id}:${entry.deviceId}`;
      const isDeleted = deletedSet.has(deleteKey) || deletedSet.has(entry.id);

      if (isDeleted) {
        removedCount++;
        return false;
      }
      return true;
    });

    if (removedCount > 0) {
      this.setState({ entries });
    }

    return removedCount;
  }

  // ===== Export/Import =====

  exportData(): string {
    return JSON.stringify({
      version: SCHEMA_VERSION,
      entries: this.state.entries,
      settings: this.state.settings,
      deviceId: this.state.deviceId,
      deviceName: this.state.deviceName,
      raceId: this.state.raceId,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  importData(jsonData: string): { success: boolean; entriesImported: number; error?: string } {
    try {
      const parsed = JSON.parse(jsonData);
      const migrated = migrateSchema(parsed, this.state.deviceId);

      // Merge entries (don't overwrite existing)
      const existingIds = new Set(this.state.entries.map(e => e.id));
      const newEntries = migrated.entries.filter(e => !existingIds.has(e.id));

      if (newEntries.length > 0) {
        const entries = [...this.state.entries, ...newEntries];
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.setState({ entries });
      }

      return { success: true, entriesImported: newEntries.length };
    } catch (e) {
      return { success: false, entriesImported: 0, error: String(e) };
    }
  }
}

// Singleton store instance
export const store = new Store();

// Helper hooks for common state access
export function getEntries(): Entry[] {
  return store.getState().entries;
}

export function getSettings(): Settings {
  return store.getState().settings;
}

export function getSyncStatus(): SyncStatus {
  return store.getState().syncStatus;
}
