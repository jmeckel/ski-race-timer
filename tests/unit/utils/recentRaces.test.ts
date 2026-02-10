/**
 * Unit Tests for Recent Races Utility
 * Tests: getRecentRaces, addRecentRace, getTodaysRecentRaces, clearRecentRaces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRecentRaces,
  addRecentRace,
  getTodaysRecentRaces,
  clearRecentRaces
} from '../../../src/utils/recentRaces';

describe('Recent Races Utility', () => {
  const STORAGE_KEY = 'skiTimerRecentRaces';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('getRecentRaces', () => {
    it('should return empty array when no races stored', () => {
      expect(getRecentRaces()).toEqual([]);
    });

    it('should return stored races', () => {
      const races = [
        { raceId: 'RACE-001', createdAt: Date.now(), lastUpdated: Date.now() }
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(races));
      expect(getRecentRaces()).toEqual(races);
    });

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json');
      expect(getRecentRaces()).toEqual([]);
    });
  });

  describe('addRecentRace', () => {
    it('should add new race to storage', () => {
      addRecentRace('RACE-001', Date.now(), 10);
      const races = getRecentRaces();
      expect(races.length).toBe(1);
      expect(races[0].raceId).toBe('RACE-001');
      expect(races[0].entryCount).toBe(10);
    });

    it('should update existing race (case-insensitive match)', () => {
      addRecentRace('RACE-001', Date.now() - 1000, 5);
      addRecentRace('race-001', Date.now(), 15); // Same ID, different case

      const races = getRecentRaces();
      expect(races.length).toBe(1);
      expect(races[0].entryCount).toBe(15);
    });

    it('should sort races by lastUpdated descending', () => {
      const now = Date.now();
      addRecentRace('OLD-RACE', now - 10000, 5);
      addRecentRace('NEW-RACE', now, 10);

      const races = getRecentRaces();
      expect(races[0].raceId).toBe('NEW-RACE');
      expect(races[1].raceId).toBe('OLD-RACE');
    });

    it('should limit to 50 races', () => {
      const now = Date.now();
      for (let i = 0; i < 55; i++) {
        addRecentRace(`RACE-${i}`, now - i * 1000, i);
      }

      const races = getRecentRaces();
      expect(races.length).toBe(50);
    });

    it('should set createdAt for new races', () => {
      const before = Date.now();
      addRecentRace('NEW-RACE', Date.now());
      const after = Date.now();

      const races = getRecentRaces();
      expect(races[0].createdAt).toBeGreaterThanOrEqual(before);
      expect(races[0].createdAt).toBeLessThanOrEqual(after);
    });

    it('should preserve createdAt when updating existing race', () => {
      const originalCreatedAt = Date.now() - 10000;
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { raceId: 'RACE-001', createdAt: originalCreatedAt, lastUpdated: originalCreatedAt }
      ]));

      addRecentRace('RACE-001', Date.now(), 20);

      const races = getRecentRaces();
      expect(races[0].createdAt).toBe(originalCreatedAt);
    });
  });

  describe('getTodaysRecentRaces', () => {
    it('should return empty array when no races', () => {
      expect(getTodaysRecentRaces()).toEqual([]);
    });

    it('should return races created today', () => {
      const now = Date.now();
      addRecentRace('TODAY-RACE', now);

      const todaysRaces = getTodaysRecentRaces();
      expect(todaysRaces.length).toBe(1);
      expect(todaysRaces[0].raceId).toBe('TODAY-RACE');
    });

    it('should return races updated today (even if created earlier)', () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000 - 1000;
      const now = Date.now();

      // Manually set a race with yesterday's createdAt but today's lastUpdated
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { raceId: 'UPDATED-TODAY', createdAt: yesterday, lastUpdated: now }
      ]));

      const todaysRaces = getTodaysRecentRaces();
      expect(todaysRaces.length).toBe(1);
    });

    it('should filter out races from previous days', () => {
      // Create a race from 2 days ago (definitely yesterday)
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);

      // Store race created 2 days ago with lastUpdated also 2 days ago
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { raceId: 'OLD-RACE', createdAt: twoDaysAgo, lastUpdated: twoDaysAgo }
      ]));

      const todaysRaces = getTodaysRecentRaces();
      expect(todaysRaces.length).toBe(0);
    });

    it('should respect limit parameter', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        addRecentRace(`RACE-${i}`, now - i * 1000);
      }

      expect(getTodaysRecentRaces(3).length).toBe(3);
      expect(getTodaysRecentRaces(5).length).toBe(5);
    });

    it('should default limit to 5', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        addRecentRace(`RACE-${i}`, now - i * 1000);
      }

      expect(getTodaysRecentRaces().length).toBe(5);
    });
  });

  describe('clearRecentRaces', () => {
    it('should remove all stored races', () => {
      addRecentRace('RACE-001', Date.now());
      addRecentRace('RACE-002', Date.now());

      clearRecentRaces();

      expect(getRecentRaces()).toEqual([]);
    });

    it('should handle already empty storage', () => {
      expect(() => clearRecentRaces()).not.toThrow();
      expect(getRecentRaces()).toEqual([]);
    });
  });
});
