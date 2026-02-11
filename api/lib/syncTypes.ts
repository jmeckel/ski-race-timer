/**
 * Shared Types for the Sync API
 *
 * Extracted from api/v1/sync.ts so that lib modules can share type definitions
 * without circular dependencies.
 */

export interface DeviceData {
  name: string;
  lastSeen: number;
}

export interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface RaceEntry {
  id: string | number;
  bib?: string;
  point: 'S' | 'F';
  timestamp: string;
  status?: 'ok' | 'dns' | 'dnf' | 'dsq' | 'flt';
  run?: 1 | 2;
  deviceId?: string;
  deviceName?: string;
  photo?: string;
  gpsCoords?: GpsCoords;
  syncedAt?: number;
  timeSource?: 'gps' | 'system';
  gpsTimestamp?: number;
}

export interface RaceData {
  entries: RaceEntry[];
  lastUpdated: number | null;
}

export interface CrossDeviceDuplicate {
  bib: string;
  point: string;
  run: number;
  deviceName: string;
  timestamp: string;
}

export interface PhotoRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  error?: string;
}

export interface AtomicAddResult {
  success: boolean;
  existing: RaceData;
  isDuplicate?: boolean;
  crossDeviceDuplicate?: CrossDeviceDuplicate | null;
  error?: string;
}

export interface AtomicDeleteResult {
  success: boolean;
  wasRemoved?: boolean;
  existing?: RaceData;
  error?: string;
}

export interface HighestBibResult {
  success: boolean;
  error?: string;
}

export interface PostRequestBody {
  entry?: RaceEntry;
  deviceId?: string;
  deviceName?: string;
}

export interface DeleteRequestBody {
  entryId?: string | number;
  deviceId?: string;
  deviceName?: string;
}

export interface PaginationMeta {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
