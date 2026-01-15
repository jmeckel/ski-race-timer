// Timing point types
export type TimingPoint = 'S' | 'F';

// Entry status types
export type EntryStatus = 'ok' | 'dns' | 'dnf' | 'dsq';

// Sync status types
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'offline';

// Language types
export type Language = 'en' | 'de';

// Entry interface - core timing data
export interface Entry {
  id: string;
  bib: string;
  point: TimingPoint;
  timestamp: string;
  status: EntryStatus;
  deviceId: string;
  deviceName: string;
  syncedAt?: number;
  photo?: string; // Base64 encoded photo
  gpsCoords?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

// Settings interface
export interface Settings {
  auto: boolean;        // Auto-increment bib
  haptic: boolean;      // Haptic feedback
  sound: boolean;       // Sound feedback
  sync: boolean;        // Cloud sync enabled
  gps: boolean;         // GPS enabled
  simple: boolean;      // Simple mode
  photoCapture: boolean; // Photo capture on timestamp
}

// Device info for multi-device sync
export interface DeviceInfo {
  id: string;
  name: string;
  lastSeen: number;
}

// Sync queue item for offline support
export interface SyncQueueItem {
  entry: Entry;
  retryCount: number;
  lastAttempt: number;
  error?: string;
}

// Action types for undo/redo
export type ActionType =
  | 'ADD_ENTRY'
  | 'DELETE_ENTRY'
  | 'DELETE_MULTIPLE'
  | 'CLEAR_ALL'
  | 'UPDATE_ENTRY';

// Action interface for undo/redo stack
export interface Action {
  type: ActionType;
  data: Entry | Entry[];
  timestamp: number;
}

// Application state interface
export interface AppState {
  // UI State
  currentView: 'timer' | 'results' | 'settings';
  currentLang: Language;
  bibInput: string;
  selectedPoint: TimingPoint;
  selectMode: boolean;
  selectedEntries: Set<string>;
  isRecording: boolean;
  lastRecordedEntry: Entry | null;

  // Data
  entries: Entry[];

  // Undo/Redo
  undoStack: Action[];
  redoStack: Action[];

  // Settings
  settings: Settings;

  // Device/Sync State
  deviceId: string;
  deviceName: string;
  raceId: string;
  lastSyncedRaceId: string;
  syncStatus: SyncStatus;
  syncQueue: SyncQueueItem[];
  connectedDevices: Map<string, DeviceInfo>;

  // GPS State
  gpsEnabled: boolean;
  gpsAccuracy: number | null;
  gpsStatus: 'inactive' | 'searching' | 'active';

  // Camera State
  cameraReady: boolean;
  cameraError: string | null;
}

// Event types for state changes
export interface StateChangeEvent {
  type: string;
  payload?: unknown;
  previousState?: Partial<AppState>;
}

// API response types
export interface SyncResponse {
  entries: Entry[];
  lastUpdated: number | null;
  success?: boolean;
  error?: string;
}

// Export format types
export type ExportFormat = 'csv' | 'json' | 'race-horology';

// Statistics interface
export interface RaceStatistics {
  totalEntries: number;
  uniqueRacers: number;
  finishedCount: number;
  dnsCount: number;
  dnfCount: number;
  dsqCount: number;
  fastestTime: number | null;
  averageTime: number | null;
  byPoint: Record<TimingPoint, number>;
}

// Virtual scroll item
export interface VirtualScrollItem {
  index: number;
  entry: Entry;
  top: number;
  height: number;
}

// Translation keys
export interface Translations {
  timer: string;
  results: string;
  settings: string;
  start: string;
  finish: string;
  bib: string;
  point: string;
  time: string;
  status: string;
  noEntries: string;
  confirmDelete: string;
  confirmClearAll: string;
  clearAllText: string;
  undo: string;
  export: string;
  search: string;
  filter: string;
  all: string;
  connected: string;
  offline: string;
  syncError: string;
  syncReceived: string;
  saved: string;
  deleted: string;
  cleared: string;
  duplicateWarning: string;
  gpsActive: string;
  gpsSearching: string;
  gpsInactive: string;
  simpleMode: string;
  fullMode: string;
  photoCapture: string;
  photoCaptured: string;
  photoError: string;
  [key: string]: string;
}

// Schema version for data migration
export const SCHEMA_VERSION = 2;

// Data schema for validation
export interface DataSchema {
  version: number;
  entries: Entry[];
  settings: Settings;
  deviceId: string;
  deviceName: string;
  raceId: string;
  syncQueue: SyncQueueItem[];
  lastExport?: number;
}
