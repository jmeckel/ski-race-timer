/**
 * Sync Module Types
 * Shared types and constants for the sync service
 */

// API configuration (v1)
export const API_BASE = '/api/v1/sync';
export const FAULTS_API_BASE = '/api/v1/faults';

// Sync configuration
export const POLL_INTERVAL_NORMAL = 15000; // 15 seconds - balanced polling when active
export const POLL_INTERVAL_ERROR = 30000; // 30 seconds on error
export const MAX_RETRIES = 5;
export const RETRY_BACKOFF_BASE = 2000; // 2 seconds
export const QUEUE_PROCESS_INTERVAL = 10000; // 10 seconds
export const FETCH_TIMEOUT = 8000; // 8 seconds timeout for sync requests

// Adaptive polling configuration
// Gradually increases interval when no changes detected to save battery
export const POLL_INTERVALS_IDLE = [15000, 20000, 30000, 45000, 60000]; // Gradual increase
export const IDLE_THRESHOLD = 6; // Number of no-change polls before starting to throttle

// Battery-aware polling configuration
// More aggressive throttling when battery is low
export const POLL_INTERVALS_MEDIUM_BATTERY = [20000, 30000, 45000, 60000, 90000]; // Medium battery: slightly slower
export const IDLE_THRESHOLD_MEDIUM_BATTERY = 4; // Start throttling a bit sooner on medium battery
export const POLL_INTERVALS_LOW_BATTERY = [30000, 45000, 60000, 90000, 120000]; // Low battery: slower
export const POLL_INTERVALS_CRITICAL = [30000, 60000]; // Critical: much slower
export const IDLE_THRESHOLD_LOW_BATTERY = 3; // Start throttling sooner on low battery

// Ultra-low battery polling configuration
// When battery is below 5%, effectively stop automatic polling (5 min interval)
export const POLL_INTERVAL_ULTRA_LOW_BATTERY = 300000; // 5 minutes

// Network-aware polling configuration
// Reduce sync frequency on metered connections (cellular) to save data
// Each poll triggers a 2-3s cellular radio wake-up, so 30s base saves significant battery
export const POLL_INTERVALS_METERED = [30000, 45000, 60000, 90000, 120000]; // Metered: slower to save data
export const POLL_INTERVAL_METERED_BASE = 30000; // 30s base when on metered connection

// Connection quality-aware polling configuration
// Slow connections (2g, slow-2g, saveData) use longer intervals
export const POLL_INTERVAL_SLOW = 30000; // 30s base when on slow connection
// Offline uses long interval just to check if back online
export const POLL_INTERVAL_OFFLINE = 60000; // 60s when offline
// Hidden tab uses reduced polling to save battery/data
export const POLL_INTERVAL_HIDDEN = 30000; // 30s when tab is hidden

/**
 * Connection quality levels for adaptive polling
 */
export type ConnectionQuality = 'good' | 'slow' | 'offline';

/**
 * Network Information API type definition
 */
export interface NetworkInformation extends EventTarget {
  type?:
    | 'bluetooth'
    | 'cellular'
    | 'ethernet'
    | 'none'
    | 'wifi'
    | 'wimax'
    | 'other'
    | 'unknown';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
  onchange?: ((this: NetworkInformation, ev: Event) => unknown) | null;
}

/**
 * Polling configuration returned by getPollingConfig()
 */
export interface PollingConfig {
  intervals: number[];
  threshold: number;
  baseInterval: number;
}

/**
 * Broadcast message types for cross-tab communication
 */
export type BroadcastMessageType =
  | 'entry'
  | 'presence'
  | 'fault'
  | 'fault-deleted';

export interface BroadcastMessage {
  type: BroadcastMessageType;
  entry?: import('../../types').Entry;
  fault?: import('../../types').FaultEntry;
  faultId?: string;
  deviceId?: string;
}
