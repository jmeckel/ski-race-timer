/**
 * Race Management Feature Module
 * Handles race ID management, cloud sync setup, and race-related operations
 */

import type { AppState, Language } from '../types';
import { escapeHtml } from '../utils/format';
import { t } from '../i18n/translations';
import { fetchWithTimeout } from '../utils/errors';

// Types
export interface RaceInfo {
  raceId: string;
  entryCount: number;
  deviceCount: number;
  lastUpdated: number | null;
}

export interface RecentRace {
  raceId: string;
  label: string;
  lastSynced: number;
  entryCount?: number;
}

// Dependencies interface
export interface RaceManagementDependencies {
  getState: () => AppState;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  feedbackTap: () => void;
  feedbackSuccess: () => void;
  getAuthHeaders: () => HeadersInit;
  hasAuthToken: () => boolean;
}

let deps: RaceManagementDependencies | null = null;

/**
 * Initialize the Race Management module with dependencies
 */
export function initRaceManagement(dependencies: RaceManagementDependencies): void {
  deps = dependencies;
}

/**
 * Fetch races from the admin API
 */
export async function fetchRacesFromApi(): Promise<RaceInfo[]> {
  if (!deps) return [];

  if (!deps.hasAuthToken()) {
    return [];
  }

  try {
    const response = await fetchWithTimeout('/api/v1/admin/races', {
      headers: deps.getAuthHeaders()
    }, 10000);

    if (!response.ok) {
      if (response.status === 401) {
        return [];
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.races || [];
  } catch (error) {
    console.error('Failed to fetch races:', error);
    return [];
  }
}

/**
 * Delete a race via the admin API
 */
export async function deleteRaceFromApi(raceId: string): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'Not initialized' };

  try {
    const response = await fetchWithTimeout(`/api/v1/admin/races?raceId=${encodeURIComponent(raceId)}`, {
      method: 'DELETE',
      headers: deps.getAuthHeaders()
    }, 10000);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || `Delete failed: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete race:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Format race ID for display
 */
export function formatRaceIdDisplay(raceId: string): string {
  return escapeHtml(raceId.toUpperCase());
}

/**
 * Format last updated timestamp for display
 */
export function formatLastUpdated(timestamp: number | null, lang: Language): string {
  if (!timestamp) return '-';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return t('justNow', lang);
  } else if (diffMins < 60) {
    return `${diffMins} ${t('minutesAgo', lang)}`;
  } else if (diffHours < 24) {
    return `${diffHours} ${t('hoursAgo', lang)}`;
  } else if (diffDays < 7) {
    return `${diffDays} ${t('daysAgo', lang)}`;
  } else {
    return date.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US');
  }
}

/**
 * Validate race ID format
 */
export function isValidRaceId(raceId: string): boolean {
  if (!raceId || typeof raceId !== 'string') return false;
  // Allow alphanumeric, hyphens, underscores, 1-50 chars
  return /^[a-zA-Z0-9_-]{1,50}$/.test(raceId);
}

/**
 * Normalize race ID (lowercase)
 */
export function normalizeRaceId(raceId: string): string {
  return raceId.toLowerCase().trim();
}

/**
 * Create race info HTML for display in lists
 */
export function createRaceInfoHtml(race: RaceInfo, lang: Language): string {
  const deviceLabel = race.deviceCount === 1 ? t('device', lang) : t('devices', lang);
  const entryLabel = race.entryCount === 1 ? t('entry', lang) : t('entries', lang);
  const lastUpdatedStr = formatLastUpdated(race.lastUpdated, lang);

  return `
    <div class="race-item-header">
      <span class="race-item-id">${formatRaceIdDisplay(race.raceId)}</span>
      <span class="race-item-devices">${race.deviceCount} ${deviceLabel}</span>
    </div>
    <div class="race-item-details">
      <span class="race-item-entries">${race.entryCount} ${entryLabel}</span>
      <span class="race-item-updated">${escapeHtml(lastUpdatedStr)}</span>
    </div>
  `;
}

/**
 * Get recent races from localStorage
 */
export function getRecentRaces(): RecentRace[] {
  try {
    const stored = localStorage.getItem('skiTimerRecentRaces');
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Add a race to recent races
 */
export function addToRecentRaces(raceId: string, entryCount?: number): void {
  const races = getRecentRaces();
  const normalized = normalizeRaceId(raceId);

  // Remove existing entry if present
  const filtered = races.filter(r => normalizeRaceId(r.raceId) !== normalized);

  // Add to front
  filtered.unshift({
    raceId,
    label: raceId.toUpperCase(),
    lastSynced: Date.now(),
    entryCount
  });

  // Keep only last 10
  const trimmed = filtered.slice(0, 10);

  try {
    localStorage.setItem('skiTimerRecentRaces', JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Remove a race from recent races
 */
export function removeFromRecentRaces(raceId: string): void {
  const races = getRecentRaces();
  const normalized = normalizeRaceId(raceId);
  const filtered = races.filter(r => normalizeRaceId(r.raceId) !== normalized);

  try {
    localStorage.setItem('skiTimerRecentRaces', JSON.stringify(filtered));
  } catch {
    // Ignore storage errors
  }
}
