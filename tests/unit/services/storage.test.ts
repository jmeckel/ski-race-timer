/**
 * Unit Tests for Storage Service
 * Tests: get/set/remove, cache behavior, requestIdleCallback deferral,
 * fallback when requestIdleCallback unavailable, getRaw/setRaw, null handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to test with a fresh module for each test group,
// so we use dynamic imports and module reset.

describe('StorageService', () => {
  let storageService: typeof import('../../../src/services/storage');

  beforeEach(async () => {
    // Clear localStorage mock
    localStorage.clear();
    vi.resetModules();
    storageService = await import('../../../src/services/storage');
    storageService.storage.clearCache();
  });

  afterEach(() => {
    storageService.storage.clearCache();
  });

  describe('get/set with typed data', () => {
    it('should set and get a typed object', () => {
      const data = { name: 'Test Race', count: 42 };
      storageService.storage.set('testKey', data);
      storageService.storage.flush();

      const result = storageService.storage.get<{
        name: string;
        count: number;
      }>('testKey');
      expect(result).toEqual(data);
    });

    it('should set and get an array', () => {
      const data = [1, 2, 3, 4, 5];
      storageService.storage.set('testArr', data);
      storageService.storage.flush();

      const result = storageService.storage.get<number[]>('testArr');
      expect(result).toEqual(data);
    });

    it('should set and get a string value', () => {
      storageService.storage.set('testStr', 'hello');
      storageService.storage.flush();

      const result = storageService.storage.get<string>('testStr');
      expect(result).toBe('hello');
    });

    it('should set and get a boolean value', () => {
      storageService.storage.set('testBool', true);
      storageService.storage.flush();

      const result = storageService.storage.get<boolean>('testBool');
      expect(result).toBe(true);
    });

    it('should set and get a number value', () => {
      storageService.storage.set('testNum', 3.14);
      storageService.storage.flush();

      const result = storageService.storage.get<number>('testNum');
      expect(result).toBe(3.14);
    });
  });

  describe('null handling for missing keys', () => {
    it('should return null for a key that does not exist', () => {
      const result = storageService.storage.get<string>('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for getRaw with missing key', () => {
      const result = storageService.storage.getRaw('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('cache hit - no duplicate localStorage read', () => {
    it('should read from cache on second get without hitting localStorage again', () => {
      // First, put data in localStorage directly
      localStorage.setItem('cacheTest', JSON.stringify({ cached: true }));

      // First read - populates cache from localStorage
      const result1 = storageService.storage.get<{ cached: boolean }>(
        'cacheTest',
      );
      expect(result1).toEqual({ cached: true });

      // Spy on Storage.prototype.getItem AFTER the first read
      // (jsdom 28: direct localStorage.getItem assignment is ignored)
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      // Second read - should come from cache
      const result2 = storageService.storage.get<{ cached: boolean }>(
        'cacheTest',
      );
      expect(result2).toEqual({ cached: true });

      // localStorage.getItem should NOT have been called for the second read
      expect(getItemSpy).not.toHaveBeenCalled();

      getItemSpy.mockRestore();
    });

    it('should serve getRaw from cache after setRaw', () => {
      storageService.storage.setRaw('rawCache', 'hello');

      // Spy on Storage.prototype.getItem
      // (jsdom 28: direct localStorage.getItem assignment is ignored)
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      const result = storageService.storage.getRaw('rawCache');
      expect(result).toBe('hello');

      // Should not hit localStorage since it's in cache
      expect(getItemSpy).not.toHaveBeenCalled();

      getItemSpy.mockRestore();
    });
  });

  describe('remove', () => {
    it('should remove from cache and localStorage', () => {
      storageService.storage.set('toRemove', 'value');
      storageService.storage.flush();

      expect(storageService.storage.get<string>('toRemove')).toBe('value');

      storageService.storage.remove('toRemove');
      storageService.storage.flush();

      expect(storageService.storage.get<string>('toRemove')).toBeNull();
      expect(localStorage.getItem('toRemove')).toBeNull();
    });
  });

  describe('getRaw/setRaw', () => {
    it('should set and get raw string without JSON overhead', () => {
      storageService.storage.setRaw('rawKey', '{"already":"serialized"}');
      storageService.storage.flush();

      const result = storageService.storage.getRaw('rawKey');
      expect(result).toBe('{"already":"serialized"}');
    });

    it('should read raw string from localStorage if not in cache', () => {
      localStorage.setItem('existingRaw', 'raw-value');

      const result = storageService.storage.getRaw('existingRaw');
      expect(result).toBe('raw-value');
    });

    it('should write raw string to localStorage on flush', () => {
      storageService.storage.setRaw('flushRaw', 'test-value');
      storageService.storage.flush();

      expect(localStorage.getItem('flushRaw')).toBe('test-value');
    });
  });

  describe('requestIdleCallback deferral', () => {
    it('should defer writes and not immediately write to localStorage', () => {
      storageService.storage.set('deferred', 'value');

      // Writes should be pending (deferred via requestIdleCallback/setTimeout)
      expect(storageService.storage.hasPendingWrites()).toBe(true);

      // localStorage should not have the value yet
      expect(localStorage.getItem('deferred')).toBeNull();
    });

    it('should write to localStorage when flush is called', () => {
      storageService.storage.set('flushed', { key: 'value' });
      expect(storageService.storage.hasPendingWrites()).toBe(true);

      storageService.storage.flush();
      expect(storageService.storage.hasPendingWrites()).toBe(false);

      // Verify it was written to localStorage
      expect(localStorage.getItem('flushed')).toBe(
        JSON.stringify({ key: 'value' }),
      );
    });

    it('should batch multiple writes into a single flush', () => {
      storageService.storage.set('key1', 'value1');
      storageService.storage.set('key2', 'value2');
      storageService.storage.set('key3', 'value3');

      expect(storageService.storage.hasPendingWrites()).toBe(true);

      storageService.storage.flush();

      expect(localStorage.getItem('key1')).toBe(JSON.stringify('value1'));
      expect(localStorage.getItem('key2')).toBe(JSON.stringify('value2'));
      expect(localStorage.getItem('key3')).toBe(JSON.stringify('value3'));
    });
  });

  describe('backward compatibility', () => {
    it('should read existing localStorage data without migration', () => {
      // Simulate pre-existing data in localStorage
      localStorage.setItem('skiTimerDeviceId', 'dev_existing123');
      localStorage.setItem(
        'skiTimerSettings',
        JSON.stringify({ sync: true, gps: false }),
      );

      const deviceId = storageService.storage.getRaw('skiTimerDeviceId');
      expect(deviceId).toBe('dev_existing123');

      const settings = storageService.storage.get<{
        sync: boolean;
        gps: boolean;
      }>('skiTimerSettings');
      expect(settings).toEqual({ sync: true, gps: false });
    });

    it('should preserve localStorage key names', () => {
      storageService.storage.setRaw('skiTimerEntries', '[]');
      storageService.storage.flush();

      expect(localStorage.getItem('skiTimerEntries')).toBe('[]');
    });
  });

  describe('clearCache', () => {
    it('should clear cache but not localStorage', () => {
      storageService.storage.set('clearTest', 'value');
      storageService.storage.flush();

      // Verify data is in localStorage
      expect(localStorage.getItem('clearTest')).toBe(JSON.stringify('value'));

      // Clear cache
      storageService.storage.clearCache();

      // localStorage should still have data
      expect(localStorage.getItem('clearTest')).toBe(JSON.stringify('value'));

      // But next get should re-read from localStorage
      const result = storageService.storage.get<string>('clearTest');
      expect(result).toBe('value');
    });
  });

  describe('error handling', () => {
    it('should return null when localStorage throws on get', () => {
      const getItemSpy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('Storage access denied');
        });

      const result = storageService.storage.get<string>('errorKey');
      expect(result).toBeNull();

      getItemSpy.mockRestore();
    });

    it('should return null when getRaw throws', () => {
      const getItemSpy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('Storage access denied');
        });

      const result = storageService.storage.getRaw('errorKey');
      expect(result).toBeNull();

      getItemSpy.mockRestore();
    });

    it('should rethrow first error from flush for caller handling', () => {
      const setItemSpy = vi
        .spyOn(localStorage, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

      storageService.storage.set('quotaTest', 'value');
      // flush() rethrows the first error so callers (e.g., the store) can handle it
      expect(() => storageService.storage.flush()).toThrow(
        'QuotaExceededError',
      );

      setItemSpy.mockRestore();
    });
  });

  describe('overwrite behavior', () => {
    it('should overwrite previous value for same key', () => {
      storageService.storage.set('overwrite', 'first');
      storageService.storage.set('overwrite', 'second');
      storageService.storage.flush();

      expect(storageService.storage.get<string>('overwrite')).toBe('second');
      expect(localStorage.getItem('overwrite')).toBe(JSON.stringify('second'));
    });

    it('should handle set then remove before flush', () => {
      storageService.storage.set('setThenRemove', 'value');
      storageService.storage.remove('setThenRemove');
      storageService.storage.flush();

      expect(storageService.storage.get<string>('setThenRemove')).toBeNull();
      expect(localStorage.getItem('setThenRemove')).toBeNull();
    });
  });
});
