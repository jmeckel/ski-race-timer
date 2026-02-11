/**
 * Unit Tests for Camera Service
 * Note: Full camera tests require a browser environment. These tests
 * verify basic behavior that can be tested in jsdom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Camera Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('basic functionality', () => {
    it('should export cameraService singleton', async () => {
      const module = await import('../../../src/services/camera');
      expect(module.cameraService).toBeDefined();
    });

    it('should export captureTimingPhoto function', async () => {
      const module = await import('../../../src/services/camera');
      expect(typeof module.captureTimingPhoto).toBe('function');
    });

    it('should have isReady method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.isReady).toBe('function');
    });

    it('should have initialize method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.initialize).toBe('function');
    });

    it('should have capturePhoto method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.capturePhoto).toBe('function');
    });

    it('should have stop method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.stop).toBe('function');
    });

    it('should have toggle method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.toggle).toBe('function');
    });

    it('should have getError method', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(typeof module.cameraService.getError).toBe('function');
    });

    it('should return false for isReady initially', async () => {
      vi.resetModules();
      const module = await import('../../../src/services/camera');
      expect(module.cameraService.isReady()).toBe(false);
    });

    it('captureTimingPhoto should return null when photo capture is disabled', async () => {
      vi.resetModules();
      // Photo capture is disabled by default in settings
      const module = await import('../../../src/services/camera');
      const result = await module.captureTimingPhoto();
      expect(result).toBeNull();
    });
  });
});
