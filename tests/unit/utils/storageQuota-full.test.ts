/**
 * Unit Tests for Storage Quota Module - Extended Coverage
 * Tests: estimateLocalStorageUsage, checkLocalStorageQuota, logStorageUsage
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  checkLocalStorageQuota,
  estimateLocalStorageUsage,
  logStorageUsage,
} from '../../../src/utils/storageQuota';
import { logger } from '../../../src/utils/logger';

describe('Storage Quota Module - Extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('estimateLocalStorageUsage', () => {
    it('should return 0 when storage is empty', () => {
      expect(estimateLocalStorageUsage()).toBe(0);
    });

    it('should calculate correct byte size (UTF-16: 2 bytes per char)', () => {
      localStorage.setItem('key', 'value');
      // 'key' = 3 chars, 'value' = 5 chars = 8 chars total * 2 = 16 bytes
      expect(estimateLocalStorageUsage()).toBe(16);
    });

    it('should sum all items in storage', () => {
      localStorage.setItem('a', '1');
      localStorage.setItem('bb', '22');
      // 'a' + '1' = 2 chars, 'bb' + '22' = 4 chars = 6 total * 2 = 12 bytes
      expect(estimateLocalStorageUsage()).toBe(12);
    });

    it('should handle large values', () => {
      const largeValue = 'x'.repeat(10000);
      localStorage.setItem('key', largeValue);
      // 'key' = 3, largeValue = 10000 = 10003 * 2 = 20006
      expect(estimateLocalStorageUsage()).toBe(20006);
    });
  });

  describe('checkLocalStorageQuota', () => {
    it('should return correct result structure', () => {
      const result = checkLocalStorageQuota();
      expect(result).toHaveProperty('usageBytes');
      expect(result).toHaveProperty('estimatedQuota');
      expect(result).toHaveProperty('usagePercent');
      expect(result).toHaveProperty('warning');
    });

    it('should not warn when usage is low', () => {
      localStorage.setItem('small', 'data');
      const result = checkLocalStorageQuota();
      expect(result.warning).toBe(false);
      expect(result.usagePercent).toBeLessThan(80);
    });

    it('should have estimated quota of 5MB', () => {
      const result = checkLocalStorageQuota();
      expect(result.estimatedQuota).toBe(5 * 1024 * 1024);
    });

    it('should calculate usage percent correctly', () => {
      const result = checkLocalStorageQuota();
      expect(result.usagePercent).toBeGreaterThanOrEqual(0);
      expect(result.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('logStorageUsage', () => {
    it('should log storage usage to debug', () => {
      localStorage.setItem('test', 'data');
      logStorageUsage();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[Storage]'),
      );
    });

    it('should include KB usage in log message', () => {
      logStorageUsage();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('KB'),
      );
    });

    it('should include percentage in log message', () => {
      logStorageUsage();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('%'),
      );
    });
  });
});
