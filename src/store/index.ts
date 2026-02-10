/**
 * Store - State Management Facade
 *
 * This Store class acts as a facade that delegates to domain slices.
 * The API remains identical to the original for backwards compatibility.
 */

import type {
  AppState,
  Entry,
  FaultEntry,
  Settings,
  Action,
  SyncStatus,
  TimingPoint,
  Run,
  Language,
  SyncQueueItem,
  DeviceInfo,
  DeviceRole,
  GateColor
} from '../types';
import { generateDeviceId, generateDeviceName } from '../utils/id';
import { isValidEntry, migrateSchema } from '../utils/validation';
import { SCHEMA_VERSION } from '../types';
import { logger } from '../utils/logger';

// Import slices
import * as entriesSlice from './slices/entriesSlice';
import * as faultsSlice from './slices/faultsSlice';
import * as uiSlice from './slices/uiSlice';
import * as gateJudgeSlice from './slices/gateJudgeSlice';
import * as syncSlice from './slices/syncSlice';
import { DEFAULT_SETTINGS, type BooleanSettingKey } from './slices/settingsSlice';
import * as settingsSlice from './slices/settingsSlice';

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
  SCHEMA_VERSION: 'skiTimerSchemaVersion',
  DEVICE_ROLE: 'skiTimerDeviceRole',
  GATE_ASSIGNMENT: 'skiTimerGateAssignment',
  FIRST_GATE_COLOR: 'skiTimerFirstGateColor',
  FAULT_ENTRIES: 'skiTimerFaultEntries'
} as const;

// Maximum pending notification queue size
const MAX_NOTIFICATION_QUEUE = 100;

// All state keys that get persisted to localStorage
const PERSISTENT_KEYS = [
  'entries', 'settings', 'currentLang', 'deviceName', 'raceId',
  'lastSyncedRaceId', 'syncQueue', 'deviceRole', 'gateAssignment',
  'firstGateColor', 'faultEntries'
] as const;

/**
 * State change listener type
 */
type StateListener = (stateSnapshot: Readonly<AppState>, changedKeys: (keyof AppState)[]) => void;

// Error callback for listener exceptions
type ListenerErrorCallback = (error: unknown, listener: StateListener) => void;

class Store {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private dirtySlices: Set<string> = new Set(); // Track which slices need saving
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
          entries = parsed
            .filter(e => isValidEntry(e))
            .map(e => ({ ...e, run: e.run ?? 1 }));
        }
      }
    } catch (e) {
      logger.error('Failed to parse entries:', e);
    }

    try {
      if (settingsJson) {
        const parsed = JSON.parse(settingsJson);
        settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      logger.error('Failed to parse settings:', e);
    }

    try {
      if (syncQueueJson) {
        const parsed = JSON.parse(syncQueueJson);
        if (Array.isArray(parsed)) {
          syncQueue = parsed;
        }
      }
    } catch (e) {
      logger.error('Failed to parse sync queue:', e);
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

    // Load Gate Judge state
    const deviceRole = (localStorage.getItem(STORAGE_KEYS.DEVICE_ROLE) || 'timer') as DeviceRole;
    let gateAssignment: [number, number] | null = null;
    let firstGateColor: GateColor = 'red';
    let faultEntries: FaultEntry[] = [];

    try {
      const gateAssignmentJson = localStorage.getItem(STORAGE_KEYS.GATE_ASSIGNMENT);
      if (gateAssignmentJson) {
        const parsed = JSON.parse(gateAssignmentJson);
        if (Array.isArray(parsed) && parsed.length === 2) {
          gateAssignment = parsed as [number, number];
        }
      }
      const storedColor = localStorage.getItem(STORAGE_KEYS.FIRST_GATE_COLOR);
      if (storedColor === 'red' || storedColor === 'blue') {
        firstGateColor = storedColor;
      }
    } catch (e) {
      logger.error('Failed to parse gate assignment:', e);
    }

    try {
      const faultEntriesJson = localStorage.getItem(STORAGE_KEYS.FAULT_ENTRIES);
      if (faultEntriesJson) {
        const parsed = JSON.parse(faultEntriesJson);
        if (Array.isArray(parsed)) {
          faultEntries = parsed;
        }
      }
    } catch (e) {
      logger.error('Failed to parse fault entries:', e);
    }

    return {
      currentView: deviceRole === 'gateJudge' ? 'gateJudge' : 'timer',
      currentLang: lang,
      bibInput: '',
      selectedPoint: 'F',
      selectedRun: 1 as Run,
      selectMode: false,
      selectedEntries: new Set(),
      isRecording: false,
      lastRecordedEntry: null,
      entries,
      deviceRole,
      gateAssignment,
      firstGateColor,
      faultEntries,
      selectedFaultBib: '',
      isJudgeReady: false,
      isChiefJudgeView: false,
      finalizedRacers: new Set<string>(),
      penaltySeconds: 5,
      usePenaltyMode: true,
      undoStack: [],
      redoStack: [],
      settings,
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
      gpsEnabled: settings.gps,
      gpsAccuracy: null,
      gpsStatus: 'inactive',
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
  private notify(changedKeys: (keyof AppState)[]) {
    const stateSnapshot = this.state;

    // Check queue bounds before adding
    if (this.pendingNotifications.length >= MAX_NOTIFICATION_QUEUE) {
      logger.warn(`Notification queue exceeded ${MAX_NOTIFICATION_QUEUE} - draining oldest`);
      this.pendingNotifications.splice(0, Math.floor(MAX_NOTIFICATION_QUEUE / 2));
    }

    this.pendingNotifications.push({ keys: changedKeys, stateSnapshot });

    // If already processing notifications, the while loop will pick up the new entry
    if (this.isNotifying) {
      return;
    }

    this.isNotifying = true;
    try {
      while (this.pendingNotifications.length > 0) {
        const { keys, stateSnapshot } = this.pendingNotifications.shift()!;
        const listenersCopy = Array.from(this.listeners);
        for (const listener of listenersCopy) {
          try {
            listener(stateSnapshot, keys);
          } catch (e) {
            logger.error('State listener error:', e);
            this.failedListenerCount++;
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

  onListenerError(callback: ListenerErrorCallback): void {
    this.listenerErrorCallback = callback;
  }

  getListenerFailureCount(): number {
    return this.failedListenerCount;
  }

  private setState(updates: Partial<AppState>, persist: boolean = true) {
    const changedKeys = Object.keys(updates) as (keyof AppState)[];
    this.state = { ...this.state, ...updates };
    this.notify(changedKeys);

    if (persist) {
      // Track which slices are dirty to avoid serializing unchanged data
      for (const key of changedKeys) {
        this.dirtySlices.add(key);
      }
      this.scheduleSave();
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => this.saveToStorage(), 100);
  }

  forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    // Mark all persistent slices as dirty for a full save
    for (const key of PERSISTENT_KEYS) {
      this.dirtySlices.add(key);
    }
    this.saveToStorage();
  }

  private saveToStorage() {
    const dirty = this.dirtySlices;
    this.dirtySlices = new Set();

    if (dirty.size === 0) return;

    try {
      void this.checkStorageQuota();

      // Only serialize slices that actually changed
      if (dirty.has('entries')) {
        const entriesToSave = this.state.entries.map(entry => {
          if (entry.photo && entry.photo !== 'indexeddb' && entry.photo.length > 20) {
            return { ...entry, photo: 'indexeddb' };
          }
          return entry;
        });
        localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entriesToSave));
      }

      if (dirty.has('settings')) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.state.settings));
      }

      if (dirty.has('currentLang')) {
        localStorage.setItem(STORAGE_KEYS.LANG, this.state.currentLang);
      }

      if (dirty.has('deviceName')) {
        localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, this.state.deviceName);
      }

      if (dirty.has('raceId')) {
        localStorage.setItem(STORAGE_KEYS.RACE_ID, this.state.raceId);
      }

      if (dirty.has('lastSyncedRaceId')) {
        localStorage.setItem(STORAGE_KEYS.LAST_SYNCED_RACE_ID, this.state.lastSyncedRaceId);
      }

      if (dirty.has('syncQueue')) {
        localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(this.state.syncQueue));
      }

      if (dirty.has('deviceRole')) {
        localStorage.setItem(STORAGE_KEYS.DEVICE_ROLE, this.state.deviceRole);
      }

      if (dirty.has('gateAssignment')) {
        if (this.state.gateAssignment) {
          localStorage.setItem(STORAGE_KEYS.GATE_ASSIGNMENT, JSON.stringify(this.state.gateAssignment));
        } else {
          localStorage.removeItem(STORAGE_KEYS.GATE_ASSIGNMENT);
        }
      }

      if (dirty.has('firstGateColor')) {
        localStorage.setItem(STORAGE_KEYS.FIRST_GATE_COLOR, this.state.firstGateColor);
      }

      if (dirty.has('faultEntries')) {
        localStorage.setItem(STORAGE_KEYS.FAULT_ENTRIES, JSON.stringify(this.state.faultEntries));
      }

      // Schema version only needs writing when entries or settings change
      if (dirty.has('entries') || dirty.has('settings')) {
        localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
      }
    } catch (e) {
      logger.error('Failed to save to storage:', e);
      this.dispatchStorageError(e as Error);
    }
  }

  private async checkStorageQuota() {
    if (navigator.storage?.estimate) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (quota && usage) {
          const usagePercent = usage / quota;
          if (usagePercent > 0.9) {
            window.dispatchEvent(new CustomEvent('storage-warning', {
              detail: { usage, quota, percent: Math.round(usagePercent * 100) }
            }));
          }
        }
      } catch (e) {
        logger.warn('Could not check storage quota:', e);
      }
    }
  }

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

  // ===== Entry Actions (delegated to entriesSlice) =====

  addEntry(entry: Entry) {
    const result = entriesSlice.addEntry(
      this.state.entries,
      entry,
      this.state.undoStack,
      this.state.redoStack
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack,
      lastRecordedEntry: entry,
      isRecording: false
    });

    if (this.state.settings.sync && this.state.raceId) {
      this.addToSyncQueue(entry);
    }
  }

  deleteEntry(id: string) {
    const result = entriesSlice.deleteEntry(
      this.state.entries,
      id,
      this.state.undoStack,
      this.state.redoStack
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack
      });
    }
  }

  deleteMultiple(ids: string[]) {
    const result = entriesSlice.deleteMultiple(
      this.state.entries,
      ids,
      this.state.undoStack,
      this.state.redoStack
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
        selectMode: false,
        selectedEntries: new Set()
      });
    }
  }

  clearAll() {
    const result = entriesSlice.clearAll(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
        selectMode: false,
        selectedEntries: new Set()
      });
    }
  }

  updateEntry(id: string, updates: Partial<Entry>): boolean {
    const result = entriesSlice.updateEntry(
      this.state.entries,
      id,
      updates,
      this.state.undoStack,
      this.state.redoStack
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack
      });
      return true;
    }
    return false;
  }

  // ===== Undo/Redo =====

  canUndo(): boolean {
    return this.state.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  peekUndo(): Action | null {
    if (!this.canUndo()) return null;
    return this.state.undoStack[this.state.undoStack.length - 1];
  }

  undo(): { type: Action['type']; data: Entry | Entry[] } | null {
    const result = entriesSlice.undo(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack
    });
    return result.result;
  }

  redo(): Entry | Entry[] | null {
    const result = entriesSlice.redo(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack
    });
    return result.result;
  }

  // ===== Sync Queue =====

  addToSyncQueue(entry: Entry) {
    const syncQueue = entriesSlice.addToSyncQueue(this.state.syncQueue, entry);
    this.setState({ syncQueue });
  }

  removeFromSyncQueue(entryId: string) {
    const syncQueue = entriesSlice.removeFromSyncQueue(this.state.syncQueue, entryId);
    this.setState({ syncQueue });
  }

  updateSyncQueueItem(entryId: string, updates: Partial<SyncQueueItem>) {
    const syncQueue = entriesSlice.updateSyncQueueItem(this.state.syncQueue, entryId, updates);
    this.setState({ syncQueue });
  }

  clearSyncQueue() {
    this.setState({ syncQueue: [] });
  }

  // ===== UI State (delegated to uiSlice) =====

  setView(view: 'timer' | 'results' | 'settings' | 'gateJudge') {
    this.setState(uiSlice.setView(view), false);
  }

  setLanguage(lang: Language) {
    this.setState(uiSlice.setLanguage(lang));
  }

  setBibInput(bib: string) {
    this.setState(uiSlice.setBibInput(bib), false);
  }

  setSelectedPoint(point: TimingPoint) {
    this.setState(uiSlice.setSelectedPoint(point), false);
  }

  setSelectedRun(run: Run) {
    this.setState(uiSlice.setSelectedRun(run), false);
  }

  setSelectMode(enabled: boolean) {
    this.setState(uiSlice.setSelectMode(enabled, this.state.selectedEntries), false);
  }

  toggleEntrySelection(id: string) {
    this.setState(uiSlice.toggleEntrySelection(id, this.state.selectedEntries), false);
  }

  selectAllEntries() {
    this.setState(uiSlice.selectAllEntries(this.state.entries.map(e => e.id)), false);
  }

  clearSelection() {
    this.setState(uiSlice.clearSelection(), false);
  }

  setRecording(isRecording: boolean) {
    this.setState(uiSlice.setRecording(isRecording), false);
  }

  // ===== Gate Judge State (delegated to gateJudgeSlice) =====

  setDeviceRole(role: DeviceRole) {
    this.setState(gateJudgeSlice.setDeviceRole(role));
  }

  setGateAssignment(assignment: [number, number] | null) {
    this.setState(gateJudgeSlice.setGateAssignment(assignment));
  }

  setFirstGateColor(color: GateColor) {
    this.setState(gateJudgeSlice.setFirstGateColor(color));
  }

  getGateColor(gateNumber: number): GateColor {
    return gateJudgeSlice.getGateColor(
      gateNumber,
      this.state.gateAssignment,
      this.state.firstGateColor
    );
  }

  setSelectedFaultBib(bib: string) {
    this.setState(gateJudgeSlice.setSelectedFaultBib(bib), false);
  }

  setJudgeReady(ready: boolean) {
    this.setState(gateJudgeSlice.setJudgeReady(ready));
  }

  toggleJudgeReady() {
    this.setState(gateJudgeSlice.toggleJudgeReady(this.state.isJudgeReady));
  }

  setChiefJudgeView(enabled: boolean) {
    this.setState(gateJudgeSlice.setChiefJudgeView(enabled), false);
  }

  toggleChiefJudgeView() {
    this.setState(gateJudgeSlice.toggleChiefJudgeView(this.state.isChiefJudgeView), false);
  }

  finalizeRacer(bib: string, run: Run) {
    this.setState(gateJudgeSlice.finalizeRacer(bib, run, this.state.finalizedRacers), false);
  }

  unfinalizeRacer(bib: string, run: Run) {
    this.setState(gateJudgeSlice.unfinalizeRacer(bib, run, this.state.finalizedRacers), false);
  }

  isRacerFinalized(bib: string, run: Run): boolean {
    return gateJudgeSlice.isRacerFinalized(bib, run, this.state.finalizedRacers);
  }

  clearFinalizedRacers() {
    this.setState(gateJudgeSlice.clearFinalizedRacers(), false);
  }

  setPenaltySeconds(seconds: number) {
    this.setState(gateJudgeSlice.setPenaltySeconds(seconds), false);
  }

  setUsePenaltyMode(usePenalty: boolean) {
    this.setState(gateJudgeSlice.setUsePenaltyMode(usePenalty), false);
  }

  getActiveBibs(run: Run): string[] {
    return gateJudgeSlice.getActiveBibs(this.state.entries, run);
  }

  // ===== Fault Entry Actions (delegated to faultsSlice) =====

  addFaultEntry(fault: Omit<FaultEntry, 'currentVersion' | 'versionHistory' | 'markedForDeletion'>) {
    const faultEntries = faultsSlice.addFaultEntry(this.state.faultEntries, fault);
    this.setState({ faultEntries });
  }

  deleteFaultEntry(id: string) {
    const faultEntries = faultsSlice.deleteFaultEntry(this.state.faultEntries, id);
    this.setState({ faultEntries });
  }

  updateFaultEntry(id: string, updates: Partial<FaultEntry>): boolean {
    const faultEntries = faultsSlice.updateFaultEntry(this.state.faultEntries, id, updates);
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  updateFaultEntryWithHistory(
    id: string,
    updates: Partial<Pick<FaultEntry, 'bib' | 'run' | 'gateNumber' | 'faultType' | 'notes' | 'notesSource' | 'notesTimestamp'>>,
    changeDescription?: string
  ): boolean {
    const faultEntries = faultsSlice.updateFaultEntryWithHistory(
      this.state.faultEntries,
      id,
      updates,
      this.state.deviceName,
      this.state.deviceId,
      changeDescription
    );
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  restoreFaultVersion(id: string, versionNumber: number): boolean {
    const faultEntries = faultsSlice.restoreFaultVersion(
      this.state.faultEntries,
      id,
      versionNumber,
      this.state.deviceName,
      this.state.deviceId
    );
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  markFaultForDeletion(id: string): boolean {
    const faultEntries = faultsSlice.markFaultForDeletion(
      this.state.faultEntries,
      id,
      this.state.deviceName,
      this.state.deviceId
    );
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  approveFaultDeletion(id: string): FaultEntry | null {
    const result = faultsSlice.approveFaultDeletion(
      this.state.faultEntries,
      id,
      this.state.deviceName
    );
    if (result.approvedFault) {
      this.setState({ faultEntries: result.faultEntries });
    }
    return result.approvedFault;
  }

  rejectFaultDeletion(id: string): boolean {
    const faultEntries = faultsSlice.rejectFaultDeletion(
      this.state.faultEntries,
      id,
      this.state.deviceName,
      this.state.deviceId
    );
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  getPendingDeletions(): FaultEntry[] {
    return faultsSlice.getPendingDeletions(this.state.faultEntries);
  }

  clearFaultEntries() {
    this.setState({ faultEntries: [] });
  }

  getFaultsForBib(bib: string, run: Run): FaultEntry[] {
    return faultsSlice.getFaultsForBib(this.state.faultEntries, bib, run);
  }

  mergeFaultsFromCloud(cloudFaults: unknown[], deletedIds: string[] = []): number {
    const result = faultsSlice.mergeFaultsFromCloud(
      this.state.faultEntries,
      cloudFaults,
      deletedIds,
      this.state.deviceId
    );
    if (result.addedCount > 0) {
      this.setState({ faultEntries: result.faultEntries });
    }
    return result.addedCount;
  }

  removeDeletedCloudFaults(deletedIds: string[]): number {
    const result = faultsSlice.removeDeletedCloudFaults(this.state.faultEntries, deletedIds);
    if (result.removedCount > 0) {
      this.setState({ faultEntries: result.faultEntries });
    }
    return result.removedCount;
  }

  markFaultSynced(faultId: string) {
    const faultEntries = faultsSlice.markFaultSynced(this.state.faultEntries, faultId);
    this.setState({ faultEntries });
  }

  // ===== Settings (delegated to settingsSlice) =====

  updateSettings(updates: Partial<Settings>) {
    const settings = settingsSlice.updateSettings(this.state.settings, updates);
    this.setState({ settings });
  }

  toggleSetting(key: BooleanSettingKey) {
    const settings = settingsSlice.toggleSetting(this.state.settings, key);
    this.setState({ settings });
  }

  // ===== Sync State (delegated to syncSlice) =====

  setSyncStatus(status: SyncStatus) {
    this.setState(syncSlice.setSyncStatus(status), false);
  }

  setRaceId(raceId: string) {
    const result = syncSlice.setRaceId(raceId, this.state.raceId);
    if (result.clearUndoRedo) {
      this.setState({ raceId: result.raceId, undoStack: [], redoStack: [] });
    } else {
      this.setState({ raceId: result.raceId });
    }
  }

  setLastSyncedRaceId(raceId: string) {
    this.setState(syncSlice.setLastSyncedRaceId(raceId));
  }

  markCurrentRaceAsSynced() {
    this.setState({ lastSyncedRaceId: this.state.raceId });
  }

  setDeviceName(name: string) {
    this.setState(syncSlice.setDeviceName(name));
  }

  addConnectedDevice(device: DeviceInfo) {
    this.setState(syncSlice.addConnectedDevice(device, this.state.connectedDevices), false);
  }

  removeConnectedDevice(deviceId: string) {
    this.setState(syncSlice.removeConnectedDevice(deviceId, this.state.connectedDevices), false);
  }

  setCloudDeviceCount(count: number) {
    this.setState(syncSlice.setCloudDeviceCount(count), false);
  }

  setCloudHighestBib(bib: number) {
    this.setState(syncSlice.setCloudHighestBib(bib), false);
  }

  setRaceExistsInCloud(exists: boolean | null) {
    this.setState(syncSlice.setRaceExistsInCloud(exists), false);
  }

  // ===== GPS State =====

  setGpsStatus(status: 'inactive' | 'searching' | 'active' | 'paused', accuracy?: number) {
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

  // ===== Cloud Merge Operations =====

  mergeCloudEntries(cloudEntries: Entry[], deletedIds: string[] = []): number {
    const result = entriesSlice.mergeCloudEntries(
      this.state.entries,
      cloudEntries,
      deletedIds,
      this.state.deviceId
    );
    if (result.addedCount > 0) {
      this.setState({ entries: result.entries });
    }
    return result.addedCount;
  }

  removeDeletedCloudEntries(deletedIds: string[]): number {
    const result = entriesSlice.removeDeletedCloudEntries(this.state.entries, deletedIds);
    if (result.removedCount > 0) {
      this.setState({ entries: result.entries });
    }
    return result.removedCount;
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

      const existingIds = new Set(this.state.entries.map(e => e.id));
      const newEntries = migrated.entries.filter((e: Entry) => !existingIds.has(e.id));

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
