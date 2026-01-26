// Timing point types
export type TimingPoint = 'S' | 'F';

// Run types (for multi-run races)
export type Run = 1 | 2;

// Entry status types
// 'flt' = finished with fault penalty (U8/U10 age categories)
export type EntryStatus = 'ok' | 'dns' | 'dnf' | 'dsq' | 'flt';

// Device role determines available views
export type DeviceRole = 'timer' | 'gateJudge';

// Fault types per FIS standards
// MG = Missed Gate, STR = Straddling (Einfädler), BR = Binding Release
export type FaultType = 'MG' | 'STR' | 'BR';

// Age category for penalty calculation
export type AgeCategory = 'U6' | 'U8' | 'U10' | 'U12' | 'U14' | 'U16' | 'masters';

// Sync status types
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error' | 'offline';

// Language types
export type Language = 'en' | 'de';

// Entry interface - core timing data
export interface Entry {
  id: string;
  bib: string;
  point: TimingPoint;
  run: Run;             // Run number (1 or 2), defaults to 1 for backwards compat
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

// Fault entry - linked to timing entries by bib+run
export interface FaultEntry {
  id: string;                    // Unique ID
  bib: string;                   // Racer bib number (Startnummer)
  run: Run;                      // Run 1 or 2 (Lauf)
  gateNumber: number;            // Gate where fault occurred (Tornummer)
  faultType: FaultType;          // Type of fault (Fehlerart)
  timestamp: string;             // When recorded (ISO)
  deviceId: string;              // Judge's device
  deviceName: string;            // Judge name (Torrichter)
  gateRange: [number, number];   // Gates this judge watches (e.g., [4, 12] = gates 4-12)
  syncedAt?: number;
}

// Gate assignment tracking
export interface GateAssignment {
  deviceId: string;
  deviceName: string;
  gateStart: number;
  gateEnd: number;
  lastSeen: number;
}

// Settings interface
export interface Settings {
  auto: boolean;        // Auto-increment bib
  haptic: boolean;      // Haptic feedback
  sound: boolean;       // Sound feedback
  sync: boolean;        // Cloud sync enabled
  syncPhotos: boolean;  // Sync photos to cloud
  gps: boolean;         // GPS enabled
  simple: boolean;      // Simple mode
  photoCapture: boolean; // Photo capture on timestamp
  // Liquid Glass UI settings
  motionEffects: boolean;  // Enable accelerometer-reactive effects
  glassEffects: boolean;   // Enable glass/blur effects
  outdoorMode: boolean;    // High contrast mode for outdoor readability
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
  newData?: Entry;  // For UPDATE_ENTRY redo support
  timestamp: number;
}

// Application state interface
export interface AppState {
  // UI State
  currentView: 'timer' | 'results' | 'settings' | 'gateJudge';
  currentLang: Language;
  bibInput: string;
  selectedPoint: TimingPoint;
  selectedRun: Run;       // Current run selection (1 or 2)
  selectMode: boolean;
  selectedEntries: Set<string>;
  isRecording: boolean;
  lastRecordedEntry: Entry | null;

  // Data
  entries: Entry[];

  // Gate Judge State
  deviceRole: DeviceRole;
  gateAssignment: [number, number] | null;  // [start, end] gate range
  faultEntries: FaultEntry[];
  selectedFaultBib: string;  // Currently selected bib for fault entry

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
  cloudDeviceCount: number;
  cloudHighestBib: number;
  raceExistsInCloud: boolean | null;

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
  deviceCount?: number;
  highestBib?: number;
  raceExists?: boolean;
  photoSkipped?: boolean;
  // Tombstone response when race is deleted by admin
  deleted?: boolean;
  deletedAt?: number;
  message?: string;
  // Deleted entry IDs for sync
  deletedIds?: string[];
}

// Race info for admin race management
export interface RaceInfo {
  raceId: string;
  entryCount: number;
  deviceCount: number;
  lastUpdated: number | null;
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
  run: string;
  run1: string;
  run2: string;
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
  photoSaveFailed: string;
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
