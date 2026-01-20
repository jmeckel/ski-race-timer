/**
 * Centralized API client
 * Provides consistent fetch patterns with auth, error handling, and typing
 */

import { fetchWithTimeout, logError } from './errors';
import type { RaceInfo } from '../types';

// ===== Constants =====

const AUTH_TOKEN_KEY = 'skiTimerAuthToken';
const ADMIN_API_BASE = '/api/admin/races';
const SYNC_API_BASE = '/api/sync';
const AUTH_API_BASE = '/api/auth/token';
const PIN_API_BASE = '/api/admin/pin';

const DEFAULT_TIMEOUT = 10000;
const SHORT_TIMEOUT = 5000;

// ===== Types =====

export interface ApiRequestOptions {
  timeout?: number;
  requiresAuth?: boolean;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  expired?: boolean;
}

export interface RacesResponse {
  races: RaceInfo[];
}

export interface RaceExistsResponse {
  exists: boolean;
  entryCount: number;
}

export interface PinStatusResponse {
  hasPin: boolean;
}

export interface TokenResponse {
  success: boolean;
  token?: string;
  isNewPin?: boolean;
  error?: string;
}

// ===== Auth Helpers =====

/**
 * Get the stored auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Check if user has an auth token
 */
export function hasAuthToken(): boolean {
  return !!getAuthToken();
}

/**
 * Get authorization headers if token exists
 */
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

// ===== Core API Function =====

/**
 * Make an API request with consistent error handling
 */
async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  apiOptions: ApiRequestOptions = {}
): Promise<ApiResult<T>> {
  const { timeout = DEFAULT_TIMEOUT, requiresAuth = false } = apiOptions;

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (requiresAuth) {
      Object.assign(headers, getAuthHeaders());
    }

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    }, timeout);

    // Handle auth errors
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error || 'Unauthorized',
        status: 401,
        expired: data.expired || false,
      };
    }

    // Handle rate limiting
    if (response.status === 429) {
      return {
        ok: false,
        error: 'Too many requests. Please try again later.',
        status: 429,
      };
    }

    // Handle other errors
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error || `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    // Parse successful response
    const data = await response.json();
    return {
      ok: true,
      data: data as T,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError('API', url, error);
    return {
      ok: false,
      error: message,
    };
  }
}

// ===== Admin API =====

/**
 * Fetch all races from the admin API
 */
export async function fetchRaces(): Promise<ApiResult<RacesResponse>> {
  return apiRequest<RacesResponse>(ADMIN_API_BASE, {
    method: 'GET',
  }, {
    requiresAuth: true,
    timeout: SHORT_TIMEOUT,
  });
}

/**
 * Delete a race by ID
 */
export async function deleteRace(raceId: string): Promise<ApiResult<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(
    `${ADMIN_API_BASE}?raceId=${encodeURIComponent(raceId)}`,
    { method: 'DELETE' },
    { requiresAuth: true }
  );
}

/**
 * Check if a race exists
 */
export async function checkRaceExists(raceId: string): Promise<ApiResult<RaceExistsResponse>> {
  const params = new URLSearchParams({
    raceId: raceId.toLowerCase(),
    checkOnly: 'true',
  });

  return apiRequest<RaceExistsResponse>(
    `${SYNC_API_BASE}?${params}`,
    { method: 'GET' },
    { requiresAuth: true, timeout: SHORT_TIMEOUT }
  );
}

// ===== PIN API =====

/**
 * Check PIN status
 */
export async function getPinStatus(): Promise<ApiResult<PinStatusResponse>> {
  return apiRequest<PinStatusResponse>(PIN_API_BASE, {
    method: 'GET',
  }, {
    timeout: SHORT_TIMEOUT,
  });
}

/**
 * Set or update PIN
 */
export async function setPin(pin: string): Promise<ApiResult<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(PIN_API_BASE, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  }, {
    requiresAuth: true,
  });
}

// ===== Auth API =====

/**
 * Exchange PIN for JWT token
 */
export async function exchangeToken(pin: string): Promise<ApiResult<TokenResponse>> {
  try {
    const response = await fetchWithTimeout(AUTH_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    }, SHORT_TIMEOUT);

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Authentication failed',
        status: response.status,
      };
    }

    // Store token if successful
    if (data.success && data.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    }

    return {
      ok: data.success,
      data,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      error: message,
    };
  }
}

/**
 * Clear stored auth token
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// ===== Recent Races Helper =====

import { addRecentRace, getTodaysRecentRaces, type RecentRace } from './recentRaces';

/**
 * Fetch today's races from API with localStorage fallback
 */
export async function fetchTodaysRaces(): Promise<RecentRace[]> {
  // Try API if authenticated
  if (hasAuthToken()) {
    const result = await fetchRaces();

    if (result.ok && result.data?.races) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();

      const todaysRaces = result.data.races
        .filter(race => race.lastUpdated && race.lastUpdated >= todayStart)
        .map(race => ({
          raceId: race.raceId,
          createdAt: race.lastUpdated || Date.now(),
          lastUpdated: race.lastUpdated || Date.now(),
          entryCount: race.entryCount,
        }))
        .slice(0, 5);

      // Update localStorage cache
      todaysRaces.forEach(race => {
        addRecentRace(race.raceId, race.lastUpdated, race.entryCount);
      });

      return todaysRaces;
    }
  }

  // Fallback to localStorage
  return getTodaysRecentRaces();
}
