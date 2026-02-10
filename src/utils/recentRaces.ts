/**
 * Recent Races utility
 * Tracks recently synced races for quick-select functionality
 */

import { logger } from './logger';

const STORAGE_KEY = 'skiTimerRecentRaces';
const MAX_RACES = 10;

export interface RecentRace {
  raceId: string;
  createdAt: number;
  lastUpdated: number;
  entryCount?: number;
}

/**
 * Get all recent races from localStorage
 */
export function getRecentRaces(): RecentRace[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add or update a race in the recent races list
 */
export function addRecentRace(
  raceId: string,
  lastUpdated: number,
  entryCount?: number,
): void {
  try {
    const races = getRecentRaces();
    const normalizedId = raceId.toLowerCase();

    // Find existing or create new
    const existingIndex = races.findIndex(
      (r) => r.raceId.toLowerCase() === normalizedId,
    );

    if (existingIndex >= 0) {
      // Update existing
      races[existingIndex].lastUpdated = lastUpdated;
      if (entryCount !== undefined) {
        races[existingIndex].entryCount = entryCount;
      }
    } else {
      // Add new
      races.unshift({
        raceId,
        createdAt: Date.now(),
        lastUpdated,
        entryCount,
      });
    }

    // Keep only MAX_RACES, sorted by lastUpdated desc
    races.sort((a, b) => b.lastUpdated - a.lastUpdated);
    const trimmed = races.slice(0, MAX_RACES);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    logger.error('Failed to save recent race:', error);
  }
}

/**
 * Get recent races filtered to today only
 * Returns races where createdAt OR lastUpdated is today
 */
export function getTodaysRecentRaces(limit = 5): RecentRace[] {
  const races = getRecentRaces();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return races
    .filter((race) => {
      // Show if createdAt OR lastUpdated is today
      return race.createdAt >= todayStart || race.lastUpdated >= todayStart;
    })
    .slice(0, limit);
}

/**
 * Clear all recent races (for testing or reset)
 */
export function clearRecentRaces(): void {
  localStorage.removeItem(STORAGE_KEY);
}
