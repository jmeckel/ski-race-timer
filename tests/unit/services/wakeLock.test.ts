/**
 * Unit Tests for Wake Lock Service
 * Tests: enable/disable, wake lock acquisition/release, visibility handling,
 * idle timeout, error handling, cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock store
vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'en',
    })),
    subscribe: vi.fn(() => () => {}),
  },
}));

// Mock showToast
vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
  clearToasts: vi.fn(),
}));

// Mock i18n
vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Wake lock sentinel mock factory
function createMockWakeLockSentinel() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    released: false,
    type: 'screen' as const,
    release: vi.fn(async function (this: any) {
      this.released = true;
      // Trigger release event
      if (listeners['release']) {
        for (const l of listeners['release']) l();
      }
    }),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    onrelease: null as (() => void) | null,
    // Helper to simulate browser releasing the lock
    _simulateRelease() {
      if (listeners['release']) {
        for (const l of listeners['release']) l();
      }
    },
  };
}

describe('Wake Lock Service', () => {
  let wakeLockService: typeof import('../../../src/services/wakeLock').wakeLockService;
  let mockSentinel: ReturnType<typeof createMockWakeLockSentinel>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockSentinel = createMockWakeLockSentinel();

    // Set up navigator.wakeLock mock
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn(() => Promise.resolve(mockSentinel)),
      },
      writable: true,
      configurable: true,
    });

    // Reset module for clean singleton state
    vi.resetModules();
    const module = await import('../../../src/services/wakeLock');
    wakeLockService = module.wakeLockService;
  });

  afterEach(async () => {
    await wakeLockService.disable();
    vi.useRealTimers();
  });

  describe('isSupported', () => {
    it('should return true when wakeLock is in navigator', () => {
      expect(wakeLockService.isSupported()).toBe(true);
    });

    it('should return false when wakeLock is not in navigator', async () => {
      const original = (navigator as any).wakeLock;
      delete (navigator as any).wakeLock;

      vi.resetModules();
      const module = await import('../../../src/services/wakeLock');

      expect(module.wakeLockService.isSupported()).toBe(false);

      // Restore
      Object.defineProperty(navigator, 'wakeLock', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('enable', () => {
    it('should request wake lock and return true', async () => {
      const result = await wakeLockService.enable();

      expect(result).toBe(true);
      expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    });

    it('should return true if already enabled', async () => {
      await wakeLockService.enable();
      const result = await wakeLockService.enable();

      expect(result).toBe(true);
      // request should only be called once since it was already enabled
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it('should return false if not supported', async () => {
      const original = (navigator as any).wakeLock;
      delete (navigator as any).wakeLock;

      vi.resetModules();
      const module = await import('../../../src/services/wakeLock');
      const result = await module.wakeLockService.enable();

      expect(result).toBe(false);

      Object.defineProperty(navigator, 'wakeLock', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('should add visibility change handler', async () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      await wakeLockService.enable();

      expect(addEventSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );

      addEventSpy.mockRestore();
    });

    it('should start idle tracking with interaction listeners', async () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      await wakeLockService.enable();

      expect(addEventSpy).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        { passive: true },
      );
      expect(addEventSpy).toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
      );
      expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventSpy.mockRestore();
    });

    it('should register release listener on the sentinel', async () => {
      await wakeLockService.enable();

      expect(mockSentinel.addEventListener).toHaveBeenCalledWith(
        'release',
        expect.any(Function),
      );
    });
  });

  describe('disable', () => {
    it('should release wake lock', async () => {
      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(mockSentinel.release).toHaveBeenCalled();
    });

    it('should remove visibility handler', async () => {
      const removeEventSpy = vi.spyOn(document, 'removeEventListener');

      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(removeEventSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it('should stop idle tracking', async () => {
      const removeEventSpy = vi.spyOn(document, 'removeEventListener');

      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(removeEventSpy).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
      );
      expect(removeEventSpy).toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
      );
      expect(removeEventSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it('should handle disable when not enabled', async () => {
      await expect(wakeLockService.disable()).resolves.not.toThrow();
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(wakeLockService.isActive()).toBe(false);
    });

    it('should return true after enabling', async () => {
      await wakeLockService.enable();

      expect(wakeLockService.isActive()).toBe(true);
    });

    it('should return false after disabling', async () => {
      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(wakeLockService.isActive()).toBe(false);
    });

    it('should return false when browser releases wake lock', async () => {
      await wakeLockService.enable();

      // Simulate browser releasing the lock (e.g., tab hidden)
      mockSentinel._simulateRelease();

      expect(wakeLockService.isActive()).toBe(false);
    });
  });

  describe('isWakeLockEnabled', () => {
    it('should return false initially', () => {
      expect(wakeLockService.isWakeLockEnabled()).toBe(false);
    });

    it('should return true after enabling', async () => {
      await wakeLockService.enable();

      expect(wakeLockService.isWakeLockEnabled()).toBe(true);
    });

    it('should return false after disabling', async () => {
      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(wakeLockService.isWakeLockEnabled()).toBe(false);
    });
  });

  describe('visibility handling', () => {
    it('should re-acquire wake lock when page becomes visible', async () => {
      await wakeLockService.enable();

      // Simulate browser releasing when hidden
      mockSentinel._simulateRelease();
      expect(wakeLockService.isActive()).toBe(false);

      // Create a new sentinel for the re-acquisition
      const newSentinel = createMockWakeLockSentinel();
      (
        navigator.wakeLock.request as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(newSentinel);

      // Simulate page becoming visible
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Need to flush microtasks for the async requestWakeLock
      await vi.advanceTimersByTimeAsync(0);

      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it('should not re-acquire when page is still hidden', async () => {
      await wakeLockService.enable();

      mockSentinel._simulateRelease();

      // Simulate page is hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      await vi.advanceTimersByTimeAsync(0);

      // Should only have the initial request
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);

      // Restore
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('idle timeout', () => {
    it('should release wake lock after 30 minutes of inactivity', async () => {
      await wakeLockService.enable();

      // Advance 30 minutes + check interval
      vi.advanceTimersByTime(30 * 60 * 1000 + 60 * 1000);

      expect(mockSentinel.release).toHaveBeenCalled();
    });

    it('should show toast when idle timeout triggers', async () => {
      const { showToast } = await import('../../../src/components');

      await wakeLockService.enable();

      vi.advanceTimersByTime(30 * 60 * 1000 + 60 * 1000);

      expect(showToast).toHaveBeenCalledWith(
        expect.any(String),
        'warning',
        5000,
      );
    });

    it('should not release if user interacts within timeout', async () => {
      await wakeLockService.enable();

      // Advance 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Simulate interaction
      wakeLockService.resetIdleTimer();

      // Advance another 20 minutes (40 from start, but only 20 from last interaction)
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Should not have been released (not yet 30 min from last interaction)
      expect(mockSentinel.release).not.toHaveBeenCalled();
    });

    it('should not check idle if disabled', async () => {
      await wakeLockService.enable();
      await wakeLockService.disable();

      // Reset mock call count after disable released it
      mockSentinel.release.mockClear();

      // Advance well past timeout
      vi.advanceTimersByTime(60 * 60 * 1000);

      // Should not release again since disabled
      expect(mockSentinel.release).not.toHaveBeenCalled();
    });
  });

  describe('resetIdleTimer', () => {
    it('should re-acquire wake lock if it was released due to idle', async () => {
      await wakeLockService.enable();

      // Release due to idle timeout
      vi.advanceTimersByTime(31 * 60 * 1000);
      expect(mockSentinel.release).toHaveBeenCalled();

      // Create a new sentinel for re-acquisition
      const newSentinel = createMockWakeLockSentinel();
      (
        navigator.wakeLock.request as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(newSentinel);

      // Reset idle timer (simulating user interaction)
      wakeLockService.resetIdleTimer();

      await vi.advanceTimersByTimeAsync(0);

      // Should have requested a new wake lock
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it('should not re-acquire if wake lock is still active', async () => {
      await wakeLockService.enable();

      wakeLockService.resetIdleTimer();

      await vi.advanceTimersByTimeAsync(0);

      // Should still only have the initial request
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle wake lock request failure gracefully', async () => {
      (
        navigator.wakeLock.request as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Permission denied'));
      const { showToast } = await import('../../../src/components');
      const { logger } = await import('../../../src/utils/logger');

      const result = await wakeLockService.enable();

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.any(String),
        'warning',
        2000,
      );
    });

    it('should handle non-Error rejection', async () => {
      (
        navigator.wakeLock.request as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce('some string error');
      const { logger } = await import('../../../src/utils/logger');

      const result = await wakeLockService.enable();

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Wake Lock request failed:',
        'Unknown error',
      );
    });

    it('should handle release error gracefully', async () => {
      mockSentinel.release.mockRejectedValueOnce(new Error('Already released'));
      const { logger } = await import('../../../src/utils/logger');

      await wakeLockService.enable();
      await wakeLockService.disable();

      expect(logger.warn).toHaveBeenCalledWith(
        'Wake Lock release error:',
        expect.any(Error),
      );
    });
  });

  describe('requestWakeLock internal (already holding lock)', () => {
    it('should not request again if already holding a wake lock', async () => {
      await wakeLockService.enable();

      // Force a resetIdleTimer call which might try to re-acquire
      // But since wakeLock is still held, it should not request again
      wakeLockService.resetIdleTimer();

      await vi.advanceTimersByTimeAsync(0);

      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    });
  });
});
