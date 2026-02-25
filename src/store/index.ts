/**
 * Store - State Management Facade
 *
 * This Store class acts as a facade that delegates to domain slices.
 * The API remains identical to the original for backwards compatibility.
 */

/**
 * ## State Management with Preact Signals
 *
 * This store uses Preact Signals for reactive state management.
 * The `$state` signal wraps the entire app state, and computed selectors
 * provide fine-grained reactivity for individual state fields.
 *
 * **Reading state:**
 * - Use computed selectors (`$entries`, `$currentView`, etc.) in effects
 * - Use `store.getState()` for one-shot reads (event handlers, init)
 *
 * **Reacting to changes:**
 * - Use `effect()` from `@preact/signals-core` for side effects
 * - Effects auto-track signal dependencies and re-run when they change
 *
 * **Available computed selectors:**
 * Field extractors: `$entries`, `$settings`, `$syncStatus`, `$currentLang`,
 *   `$gpsStatus`, `$deviceRole`, `$faultEntries`, `$entryCount`, `$cloudDeviceCount`,
 *   `$currentView`, `$bibInput`, `$selectedPoint`, `$selectedRun`, `$undoStack`,
 *   `$isJudgeReady`, `$gateAssignment`, `$isChiefJudgeView`, `$penaltySeconds`,
 *   `$usePenaltyMode`, `$selectedEntries`, `$isSyncing`
 * Derived state: `$hasUnsyncedChanges`, `$entriesByRun`
 */

import {
  computed,
  effect,
  type Signal,
  signal,
  untracked,
} from '@preact/signals-core';
import { storage } from '../services/storage';
import type {
  Action,
  AppState,
  DeviceInfo,
  DeviceRole,
  Entry,
  FaultEntry,
  GateColor,
  Language,
  Run,
  Settings,
  SyncQueueItem,
  SyncStatus,
  TimingPoint,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { generateDeviceId, generateDeviceName } from '../utils/id';
import { logger } from '../utils/logger';
import { hasFullPhotoData } from '../utils/photoHelpers';
import { checkLocalStorageQuota } from '../utils/storageQuota';
import { isValidEntry, migrateSchema } from '../utils/validation';

// Import slices
import * as entriesSlice from './slices/entriesSlice';
import * as faultsSlice from './slices/faultsSlice';
import * as gateJudgeSlice from './slices/gateJudgeSlice';
import * as settingsSlice from './slices/settingsSlice';
import {
  type BooleanSettingKey,
  DEFAULT_SETTINGS,
} from './slices/settingsSlice';
import * as syncSlice from './slices/syncSlice';
import * as uiSlice from './slices/uiSlice';

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
  FAULT_ENTRIES: 'skiTimerFaultEntries',
  PENALTY_SECONDS: 'skiTimerPenaltySeconds',
  USE_PENALTY_MODE: 'skiTimerUsePenaltyMode',
  FINALIZED_RACERS: 'skiTimerFinalizedRacers',
} as const;

// All state keys that get persisted to localStorage
const PERSISTENT_KEYS = [
  'entries',
  'settings',
  'currentLang',
  'deviceName',
  'raceId',
  'lastSyncedRaceId',
  'syncQueue',
  'deviceRole',
  'gateAssignment',
  'firstGateColor',
  'faultEntries',
  'penaltySeconds',
  'usePenaltyMode',
  'finalizedRacers',
] as const;

/**
 * Parse JSON from a storage key, returning `fallback` on missing/invalid data.
 * An optional `validate` function can narrow or transform the parsed value.
 */
function parseJson<T>(
  key: string,
  fallback: T,
  validate?: (parsed: unknown) => T,
): T {
  try {
    const raw = storage.getRaw(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return validate ? validate(parsed) : parsed;
  } catch (e) {
    logger.error(`Failed to parse ${key}:`, e);
    return fallback;
  }
}

class Store {
  private state: AppState;
  /** Reactive signal wrapping the entire app state. Future subscribers can use this directly. */
  readonly $state: Signal<Readonly<AppState>>;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private dirtySlices: Set<string> = new Set(); // Track which slices need saving
  private saveRetryCount = 0;
  private static readonly MAX_SAVE_RETRIES = 3;

  constructor() {
    this.state = this.loadInitialState();
    this.$state = signal(this.state);
  }

  private loadInitialState(): AppState {
    // Load device ID first (or generate new one)
    let deviceId = storage.getRaw(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateDeviceId();
      storage.setRaw(STORAGE_KEYS.DEVICE_ID, deviceId);
      storage.flush();
    }

    // Load and migrate data
    const entries = parseJson<Entry[]>(STORAGE_KEYS.ENTRIES, [], (p) =>
      Array.isArray(p)
        ? p
            .filter((e) => isValidEntry(e))
            .map((e) => ({ ...e, run: e.run ?? 1 }))
        : [],
    );
    const settings = parseJson<Settings>(
      STORAGE_KEYS.SETTINGS,
      DEFAULT_SETTINGS,
      (p) => ({
        ...DEFAULT_SETTINGS,
        ...(p as object),
      }),
    );
    const syncQueue = parseJson<SyncQueueItem[]>(
      STORAGE_KEYS.SYNC_QUEUE,
      [],
      (p) => (Array.isArray(p) ? p : []),
    );

    // Load other values
    const lang = (storage.getRaw(STORAGE_KEYS.LANG) || 'de') as Language;
    let deviceName = storage.getRaw(STORAGE_KEYS.DEVICE_NAME);
    if (!deviceName) {
      deviceName = generateDeviceName();
      storage.setRaw(STORAGE_KEYS.DEVICE_NAME, deviceName);
      storage.flush();
    }
    const raceId = storage.getRaw(STORAGE_KEYS.RACE_ID) || '';
    const lastSyncedRaceId =
      storage.getRaw(STORAGE_KEYS.LAST_SYNCED_RACE_ID) || '';

    // Load Gate Judge state
    const deviceRole = (storage.getRaw(STORAGE_KEYS.DEVICE_ROLE) ||
      'timer') as DeviceRole;
    const gateAssignment = parseJson<[number, number] | null>(
      STORAGE_KEYS.GATE_ASSIGNMENT,
      null,
      (p) =>
        Array.isArray(p) && p.length === 2 ? (p as [number, number]) : null,
    );
    const storedColor = storage.getRaw(STORAGE_KEYS.FIRST_GATE_COLOR);
    const firstGateColor: GateColor =
      storedColor === 'red' || storedColor === 'blue' ? storedColor : 'red';
    const faultEntries = parseJson<FaultEntry[]>(
      STORAGE_KEYS.FAULT_ENTRIES,
      [],
      (p) => (Array.isArray(p) ? p : []),
    );

    // Load Chief Judge penalty config
    const storedPenalty = storage.getRaw(STORAGE_KEYS.PENALTY_SECONDS);
    const penaltySeconds = storedPenalty ? Math.max(0, Math.min(60, Number(storedPenalty) || 5)) : 5;
    const storedUsePenalty = storage.getRaw(STORAGE_KEYS.USE_PENALTY_MODE);
    const usePenaltyMode = storedUsePenalty !== null ? storedUsePenalty !== 'false' : true;
    const finalizedRacers = parseJson<string[]>(
      STORAGE_KEYS.FINALIZED_RACERS,
      [],
      (p) => (Array.isArray(p) ? p.filter((s): s is string => typeof s === 'string') : []),
    );

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
      finalizedRacers: new Set<string>(finalizedRacers),
      penaltySeconds,
      usePenaltyMode,
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
      gpsAccuracy: null,
      gpsStatus: 'inactive',
      cameraReady: false,
      cameraError: null,
    };
  }

  // Get current state (readonly) - reads from signal for consistency
  getState(): Readonly<AppState> {
    return this.$state.value;
  }

  private setState(updates: Partial<AppState>, persist: boolean = true) {
    this.state = { ...this.state, ...updates };
    // Update reactive signal — all computed selectors and effects react automatically
    (this.$state as Signal<Readonly<AppState>>).value = this.state;

    if (persist) {
      // Track which slices are dirty to avoid serializing unchanged data
      for (const key of Object.keys(updates)) {
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
    // Snapshot dirty keys to avoid losing changes from re-entrant setState during serialization
    const dirty = new Set(this.dirtySlices);
    this.dirtySlices.clear();
    if (dirty.size === 0) return;

    try {
      // Only serialize slices that actually changed
      if (dirty.has('entries')) {
        const entriesToSave = this.state.entries.map((entry) => {
          if (hasFullPhotoData(entry.photo)) {
            return { ...entry, photo: 'indexeddb' };
          }
          return entry;
        });
        storage.setRaw(STORAGE_KEYS.ENTRIES, JSON.stringify(entriesToSave));
      }

      if (dirty.has('settings')) {
        storage.setRaw(
          STORAGE_KEYS.SETTINGS,
          JSON.stringify(this.state.settings),
        );
      }

      if (dirty.has('currentLang')) {
        storage.setRaw(STORAGE_KEYS.LANG, this.state.currentLang);
      }

      if (dirty.has('deviceName')) {
        storage.setRaw(STORAGE_KEYS.DEVICE_NAME, this.state.deviceName);
      }

      if (dirty.has('raceId')) {
        storage.setRaw(STORAGE_KEYS.RACE_ID, this.state.raceId);
      }

      if (dirty.has('lastSyncedRaceId')) {
        storage.setRaw(
          STORAGE_KEYS.LAST_SYNCED_RACE_ID,
          this.state.lastSyncedRaceId,
        );
      }

      if (dirty.has('syncQueue')) {
        storage.setRaw(
          STORAGE_KEYS.SYNC_QUEUE,
          JSON.stringify(this.state.syncQueue),
        );
      }

      if (dirty.has('deviceRole')) {
        storage.setRaw(STORAGE_KEYS.DEVICE_ROLE, this.state.deviceRole);
      }

      if (dirty.has('gateAssignment')) {
        if (this.state.gateAssignment) {
          storage.setRaw(
            STORAGE_KEYS.GATE_ASSIGNMENT,
            JSON.stringify(this.state.gateAssignment),
          );
        } else {
          storage.remove(STORAGE_KEYS.GATE_ASSIGNMENT);
        }
      }

      if (dirty.has('firstGateColor')) {
        storage.setRaw(
          STORAGE_KEYS.FIRST_GATE_COLOR,
          this.state.firstGateColor,
        );
      }

      if (dirty.has('faultEntries')) {
        storage.setRaw(
          STORAGE_KEYS.FAULT_ENTRIES,
          JSON.stringify(this.state.faultEntries),
        );
      }

      if (dirty.has('penaltySeconds')) {
        storage.setRaw(STORAGE_KEYS.PENALTY_SECONDS, String(this.state.penaltySeconds));
      }

      if (dirty.has('usePenaltyMode')) {
        storage.setRaw(STORAGE_KEYS.USE_PENALTY_MODE, String(this.state.usePenaltyMode));
      }

      if (dirty.has('finalizedRacers')) {
        storage.setRaw(
          STORAGE_KEYS.FINALIZED_RACERS,
          JSON.stringify(Array.from(this.state.finalizedRacers)),
        );
      }

      // Schema version only needs writing when entries or settings change
      if (dirty.has('entries') || dirty.has('settings')) {
        storage.setRaw(STORAGE_KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
      }
      // Flush all pending writes to localStorage synchronously
      storage.flush();
      this.saveRetryCount = 0; // Reset on success
      // Check localStorage quota after save
      const quotaCheck = checkLocalStorageQuota();
      if (quotaCheck.warning) {
        window.dispatchEvent(
          new CustomEvent('storage-warning', {
            detail: {
              usage: quotaCheck.usageBytes,
              quota: quotaCheck.estimatedQuota,
              percent: quotaCheck.usagePercent,
              critical: quotaCheck.usagePercent > 90,
            },
          }),
        );
      }
    } catch (e) {
      // Re-add dirty slices and schedule a retry (with cap to prevent infinite loop)
      for (const key of dirty) {
        this.dirtySlices.add(key);
      }
      logger.error('Failed to save to storage:', e);
      this.dispatchStorageError(e as Error);
      this.saveRetryCount++;
      if (this.saveRetryCount <= Store.MAX_SAVE_RETRIES) {
        this.scheduleSave();
      } else {
        logger.error(`Storage save failed after ${Store.MAX_SAVE_RETRIES} retries, giving up until next state change`);
        this.saveRetryCount = 0;
      }
    }
  }

  private dispatchStorageError(error: Error) {
    window.dispatchEvent(
      new CustomEvent('storage-error', {
        detail: {
          message: error.message,
          isQuotaError:
            error.name === 'QuotaExceededError' ||
            error.message.includes('quota') ||
            error.message.includes('storage'),
          entryCount: this.state.entries.length,
        },
      }),
    );
  }

  // ===== Entry Actions (delegated to entriesSlice) =====

  addEntry(entry: Entry) {
    const result = entriesSlice.addEntry(
      this.state.entries,
      entry,
      this.state.undoStack,
      this.state.redoStack,
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack,
      lastRecordedEntry: entry,
      isRecording: false,
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
      this.state.redoStack,
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
      });
    }
  }

  deleteMultiple(ids: string[]) {
    const result = entriesSlice.deleteMultiple(
      this.state.entries,
      ids,
      this.state.undoStack,
      this.state.redoStack,
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
        selectMode: false,
        selectedEntries: new Set(),
      });
    }
  }

  clearAll() {
    const result = entriesSlice.clearAll(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack,
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
        selectMode: false,
        selectedEntries: new Set(),
      });
    }
  }

  updateEntry(id: string, updates: Partial<Entry>): boolean {
    const result = entriesSlice.updateEntry(
      this.state.entries,
      id,
      updates,
      this.state.undoStack,
      this.state.redoStack,
    );
    if (result) {
      this.setState({
        entries: result.entries,
        undoStack: result.undoStack,
        redoStack: result.redoStack,
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
    return this.state.undoStack[this.state.undoStack.length - 1] ?? null;
  }

  undo(): { type: Action['type']; data: Entry | Entry[] } | null {
    const result = entriesSlice.undo(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack,
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack,
    });
    return result.result;
  }

  redo(): Entry | Entry[] | null {
    const result = entriesSlice.redo(
      this.state.entries,
      this.state.undoStack,
      this.state.redoStack,
    );
    this.setState({
      entries: result.entries,
      undoStack: result.undoStack,
      redoStack: result.redoStack,
    });
    return result.result;
  }

  // ===== Sync Queue =====

  addToSyncQueue(entry: Entry) {
    const syncQueue = entriesSlice.addToSyncQueue(this.state.syncQueue, entry);
    this.setState({ syncQueue });
  }

  removeFromSyncQueue(entryId: string) {
    const syncQueue = entriesSlice.removeFromSyncQueue(
      this.state.syncQueue,
      entryId,
    );
    this.setState({ syncQueue });
  }

  updateSyncQueueItem(entryId: string, updates: Partial<SyncQueueItem>) {
    const syncQueue = entriesSlice.updateSyncQueueItem(
      this.state.syncQueue,
      entryId,
      updates,
    );
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
    this.setState(
      uiSlice.setSelectMode(enabled, this.state.selectedEntries),
      false,
    );
  }

  toggleEntrySelection(id: string) {
    this.setState(
      uiSlice.toggleEntrySelection(id, this.state.selectedEntries),
      false,
    );
  }

  selectAllEntries() {
    this.setState(
      uiSlice.selectAllEntries(this.state.entries.map((e) => e.id)),
      false,
    );
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
      this.state.firstGateColor,
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
    this.setState(
      gateJudgeSlice.toggleChiefJudgeView(this.state.isChiefJudgeView),
      false,
    );
  }

  finalizeRacer(bib: string, run: Run) {
    this.setState(
      gateJudgeSlice.finalizeRacer(bib, run, this.state.finalizedRacers),
    );
  }

  unfinalizeRacer(bib: string, run: Run) {
    this.setState(
      gateJudgeSlice.unfinalizeRacer(bib, run, this.state.finalizedRacers),
    );
  }

  isRacerFinalized(bib: string, run: Run): boolean {
    return gateJudgeSlice.isRacerFinalized(
      bib,
      run,
      this.state.finalizedRacers,
    );
  }

  clearFinalizedRacers() {
    this.setState(gateJudgeSlice.clearFinalizedRacers());
  }

  setPenaltySeconds(seconds: number) {
    this.setState(gateJudgeSlice.setPenaltySeconds(seconds));
  }

  setUsePenaltyMode(usePenalty: boolean) {
    this.setState(gateJudgeSlice.setUsePenaltyMode(usePenalty));
  }

  getActiveBibs(run: Run): string[] {
    return gateJudgeSlice.getActiveBibs(this.state.entries, run);
  }

  // ===== Fault Entry Actions (delegated to faultsSlice) =====

  addFaultEntry(
    fault: Omit<
      FaultEntry,
      'currentVersion' | 'versionHistory' | 'markedForDeletion'
    >,
  ) {
    const faultEntries = faultsSlice.addFaultEntry(
      this.state.faultEntries,
      fault,
    );
    this.setState({ faultEntries });
  }

  deleteFaultEntry(id: string) {
    const faultEntries = faultsSlice.deleteFaultEntry(
      this.state.faultEntries,
      id,
    );
    this.setState({ faultEntries });
  }

  updateFaultEntry(id: string, updates: Partial<FaultEntry>): boolean {
    const faultEntries = faultsSlice.updateFaultEntry(
      this.state.faultEntries,
      id,
      updates,
    );
    if (faultEntries) {
      this.setState({ faultEntries });
      return true;
    }
    return false;
  }

  updateFaultEntryWithHistory(
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
    changeDescription?: string,
  ): boolean {
    const faultEntries = faultsSlice.updateFaultEntryWithHistory(
      this.state.faultEntries,
      id,
      updates,
      this.state.deviceName,
      this.state.deviceId,
      changeDescription,
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
      this.state.deviceId,
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
      this.state.deviceId,
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
      this.state.deviceName,
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
      this.state.deviceId,
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

  mergeFaultsFromCloud(
    cloudFaults: unknown[],
    deletedIds: string[] = [],
  ): number {
    const result = faultsSlice.mergeFaultsFromCloud(
      this.state.faultEntries,
      cloudFaults,
      deletedIds,
      this.state.deviceId,
    );
    if (result.addedCount > 0) {
      this.setState({ faultEntries: result.faultEntries });
    }
    return result.addedCount;
  }

  removeDeletedCloudFaults(deletedIds: string[]): number {
    const result = faultsSlice.removeDeletedCloudFaults(
      this.state.faultEntries,
      deletedIds,
    );
    if (result.removedCount > 0) {
      this.setState({ faultEntries: result.faultEntries });
    }
    return result.removedCount;
  }

  markFaultSynced(faultId: string) {
    const faultEntries = faultsSlice.markFaultSynced(
      this.state.faultEntries,
      faultId,
    );
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
    this.setState(
      syncSlice.addConnectedDevice(device, this.state.connectedDevices),
      false,
    );
  }

  removeConnectedDevice(deviceId: string) {
    this.setState(
      syncSlice.removeConnectedDevice(deviceId, this.state.connectedDevices),
      false,
    );
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

  setGpsStatus(
    status: 'inactive' | 'searching' | 'active' | 'paused',
    accuracy?: number,
  ) {
    this.setState(
      {
        gpsStatus: status,
        gpsAccuracy: accuracy ?? null,
      },
      false,
    );
  }

  // ===== Camera State =====

  setCameraReady(ready: boolean, error?: string) {
    this.setState(
      {
        cameraReady: ready,
        cameraError: error ?? null,
      },
      false,
    );
  }

  // ===== Cloud Merge Operations =====

  mergeCloudEntries(cloudEntries: Entry[], deletedIds: string[] = []): number {
    const result = entriesSlice.mergeCloudEntries(
      this.state.entries,
      cloudEntries,
      deletedIds,
      this.state.deviceId,
    );
    if (result.addedCount > 0) {
      this.setState({ entries: result.entries });
    }
    return result.addedCount;
  }

  removeDeletedCloudEntries(deletedIds: string[]): number {
    const result = entriesSlice.removeDeletedCloudEntries(
      this.state.entries,
      deletedIds,
    );
    if (result.removedCount > 0) {
      this.setState({ entries: result.entries });
    }
    return result.removedCount;
  }

  // ===== Export/Import =====

  exportData(): string {
    return JSON.stringify(
      {
        version: SCHEMA_VERSION,
        entries: this.state.entries,
        settings: this.state.settings,
        deviceId: this.state.deviceId,
        deviceName: this.state.deviceName,
        raceId: this.state.raceId,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  importData(jsonData: string): {
    success: boolean;
    entriesImported: number;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(jsonData);
      const migrated = migrateSchema(parsed, this.state.deviceId);

      const existingIds = new Set(this.state.entries.map((e) => e.id));
      const newEntries = migrated.entries.filter(
        (e: Entry) => !existingIds.has(e.id),
      );

      if (newEntries.length > 0) {
        const entries = [...this.state.entries, ...newEntries];
        entries.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
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

// Computed signals for commonly-accessed derived state.
// These re-compute automatically when the underlying $state signal changes.
export const $entries = computed(() => store.$state.value.entries);
export const $settings = computed(() => store.$state.value.settings);
export const $syncStatus = computed(() => store.$state.value.syncStatus);
export const $currentLang = computed(() => store.$state.value.currentLang);
export const $gpsStatus = computed(() => store.$state.value.gpsStatus);
export const $deviceRole = computed(() => store.$state.value.deviceRole);
export const $faultEntries = computed(() => store.$state.value.faultEntries);
export const $entryCount = computed(() => store.$state.value.entries.length);
export const $cloudDeviceCount = computed(
  () => store.$state.value.cloudDeviceCount,
);
export const $currentView = computed(() => store.$state.value.currentView);
export const $bibInput = computed(() => store.$state.value.bibInput);
export const $selectedPoint = computed(() => store.$state.value.selectedPoint);
export const $selectedRun = computed(() => store.$state.value.selectedRun);
export const $undoStack = computed(() => store.$state.value.undoStack);
export const $isJudgeReady = computed(() => store.$state.value.isJudgeReady);
export const $gateAssignment = computed(
  () => store.$state.value.gateAssignment,
);
export const $isChiefJudgeView = computed(
  () => store.$state.value.isChiefJudgeView,
);
export const $penaltySeconds = computed(
  () => store.$state.value.penaltySeconds,
);
export const $usePenaltyMode = computed(
  () => store.$state.value.usePenaltyMode,
);
export const $selectedEntries = computed(
  () => store.$state.value.selectedEntries,
);
export const $isSyncing = computed(
  () => store.$state.value.syncStatus === 'syncing',
);

// Fine-grained settings selectors — for targeted effects that only react to specific settings
export const $settingsSync = computed(() => store.$state.value.settings.sync);
export const $settingsSyncPhotos = computed(
  () => store.$state.value.settings.syncPhotos,
);
export const $settingsGps = computed(() => store.$state.value.settings.gps);
export const $settingsPhotoCapture = computed(
  () => store.$state.value.settings.photoCapture,
);
export const $settingsGlassEffects = computed(
  () => store.$state.value.settings.glassEffects,
);
export const $settingsOutdoorMode = computed(
  () => store.$state.value.settings.outdoorMode,
);
export const $settingsAmbientMode = computed(
  () => store.$state.value.settings.ambientMode,
);

// Derived computed selectors — memoized aggregate state
export const $hasUnsyncedChanges = computed(() => {
  const state = store.$state.value;
  return state.entries.some((e) => !e.syncedAt) || state.syncQueue.length > 0;
});

export const $entriesByRun = computed(() => {
  const entries = store.$state.value.entries;
  return {
    run1: entries.filter((e) => e.run === 1),
    run2: entries.filter((e) => e.run === 2),
  };
});

// Re-export effect and untracked for consumers that want signal-based subscriptions
export { effect, untracked };

// Backward-compatible helper functions (delegate to computed signals)
export function getEntries(): Entry[] {
  return $entries.value;
}

export function getSettings(): Settings {
  return $settings.value;
}

export function getSyncStatus(): SyncStatus {
  return $syncStatus.value;
}
