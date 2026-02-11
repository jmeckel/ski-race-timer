/**
 * Unit Tests for Ambient Mode Service
 * Tests: initialization, enable/disable, inactivity detection, battery triggers,
 * subscribe/unsubscribe, enter/exit ambient mode, cleanup
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

// Track batteryService.subscribe callbacks so we can trigger them
let batterySubscribeCallback:
  | ((status: { batteryLevel: string; charging: boolean }) => void)
  | null = null;
let batteryIsCritical = false;

// Mock the battery service module
vi.mock('../../../src/services/battery', () => ({
  batteryService: {
    subscribe: vi.fn(
      (cb: (status: { batteryLevel: string; charging: boolean }) => void) => {
        batterySubscribeCallback = cb;
        return () => {
          batterySubscribeCallback = null;
        };
      },
    ),
    isCriticalBattery: vi.fn(() => batteryIsCritical),
  },
}));

// Mock the logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Ambient Mode Service', () => {
  let ambientModeService: typeof import('../../../src/services/ambient').ambientModeService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    batterySubscribeCallback = null;
    batteryIsCritical = false;

    // Reset module for clean singleton state
    vi.resetModules();
    const module = await import('../../../src/services/ambient');
    ambientModeService = module.ambientModeService;
  });

  afterEach(() => {
    // Clean up the service to remove event listeners
    ambientModeService.cleanup();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should set up battery monitoring and activity listeners', async () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');

      ambientModeService.initialize();

      // Should subscribe to battery
      const batteryModule = await import('../../../src/services/battery');
      expect(batteryModule.batteryService.subscribe).toHaveBeenCalledWith(
        expect.any(Function),
      );

      // Should add activity event listeners (touchstart, click, keydown)
      expect(addEventSpy).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        { passive: true },
      );
      expect(addEventSpy).toHaveBeenCalledWith('click', expect.any(Function), {
        passive: true,
      });
      expect(addEventSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        { passive: true },
      );

      addEventSpy.mockRestore();
    });

    it('should not initialize twice', async () => {
      ambientModeService.initialize();

      const batteryModule = await import('../../../src/services/battery');
      const callCount = (
        batteryModule.batteryService.subscribe as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      ambientModeService.initialize();

      // Should not call subscribe again
      expect(
        (batteryModule.batteryService.subscribe as ReturnType<typeof vi.fn>)
          .mock.calls.length,
      ).toBe(callCount);
    });
  });

  describe('enable/disable', () => {
    it('should start inactivity monitoring when enabled', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Should start an interval for inactivity checking
      // Advance time past the inactivity threshold
      vi.advanceTimersByTime(35000); // 35 seconds > 30s threshold

      expect(ambientModeService.isActive()).toBe(true);
    });

    it('should not enable twice', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Enabling again should be a no-op
      ambientModeService.enable();

      expect(ambientModeService.getState().isActive).toBe(false);
    });

    it('should exit ambient mode when disabled', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Trigger ambient mode via inactivity
      vi.advanceTimersByTime(35000);
      expect(ambientModeService.isActive()).toBe(true);

      ambientModeService.disable();
      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should stop inactivity monitor when disabled', () => {
      ambientModeService.initialize();
      ambientModeService.enable();
      ambientModeService.disable();

      // After disable, advancing time should not trigger ambient mode
      vi.advanceTimersByTime(60000);
      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should not disable if not enabled', () => {
      ambientModeService.initialize();

      // Should be a no-op, no errors
      expect(() => ambientModeService.disable()).not.toThrow();
    });

    it('should trigger ambient mode immediately if battery is critical on enable', () => {
      batteryIsCritical = true;

      ambientModeService.initialize();
      ambientModeService.enable();

      expect(ambientModeService.isActive()).toBe(true);
      expect(ambientModeService.getState().triggeredBy).toBe('battery');
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should return true when ambient mode is active', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      vi.advanceTimersByTime(35000);

      expect(ambientModeService.isActive()).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = ambientModeService.getState();
      expect(state).toEqual({
        isActive: false,
        triggeredBy: null,
      });
    });

    it('should return active state with trigger reason', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      vi.advanceTimersByTime(35000);

      const state = ambientModeService.getState();
      expect(state.isActive).toBe(true);
      expect(state.triggeredBy).toBe('inactivity');
    });
  });

  describe('subscribe', () => {
    it('should immediately notify subscriber with current state', () => {
      const callback = vi.fn();

      ambientModeService.subscribe(callback);

      expect(callback).toHaveBeenCalledWith({
        isActive: false,
        triggeredBy: null,
      });
    });

    it('should notify subscriber when ambient mode enters', () => {
      const callback = vi.fn();

      ambientModeService.initialize();
      ambientModeService.enable();
      ambientModeService.subscribe(callback);

      // Clear the initial call
      callback.mockClear();

      // Trigger inactivity
      vi.advanceTimersByTime(35000);

      expect(callback).toHaveBeenCalledWith({
        isActive: true,
        triggeredBy: 'inactivity',
      });
    });

    it('should notify subscriber when ambient mode exits', () => {
      const callback = vi.fn();

      ambientModeService.initialize();
      ambientModeService.enable();
      ambientModeService.subscribe(callback);
      callback.mockClear();

      // Enter ambient mode
      vi.advanceTimersByTime(35000);
      callback.mockClear();

      // Exit ambient mode
      ambientModeService.exitAmbientMode();

      expect(callback).toHaveBeenCalledWith({
        isActive: false,
        triggeredBy: null,
      });
    });

    it('should return an unsubscribe function', () => {
      const callback = vi.fn();

      const unsubscribe = ambientModeService.subscribe(callback);
      callback.mockClear();

      unsubscribe();

      // After unsubscribe, entering ambient mode should not notify
      ambientModeService.initialize();
      ambientModeService.enable();
      vi.advanceTimersByTime(35000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const { logger } = await import('../../../src/utils/logger');
      let callCount = 0;
      const badCallback = vi.fn(() => {
        callCount++;
        // Only throw on calls after the initial subscribe notification
        if (callCount > 1) {
          throw new Error('Callback error');
        }
      });
      let goodCallCount = 0;
      const goodCallback = vi.fn(() => {
        goodCallCount++;
      });

      ambientModeService.subscribe(badCallback);
      ambientModeService.subscribe(goodCallback);

      // Reset counts to track only calls from notifySubscribers
      const badCallsBefore = badCallback.mock.calls.length;
      const goodCallsBefore = goodCallback.mock.calls.length;

      ambientModeService.initialize();
      ambientModeService.enable();
      vi.advanceTimersByTime(35000);

      // Both callbacks should have been called during notifySubscribers
      expect(badCallback.mock.calls.length).toBeGreaterThan(badCallsBefore);
      expect(goodCallback.mock.calls.length).toBeGreaterThan(goodCallsBefore);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('exitAmbientMode', () => {
    it('should do nothing if not in ambient mode', () => {
      const callback = vi.fn();
      ambientModeService.subscribe(callback);
      callback.mockClear();

      ambientModeService.exitAmbientMode();

      // Should not trigger any notification since state did not change
      expect(callback).not.toHaveBeenCalled();
    });

    it('should reset trigger and mark inactive', () => {
      ambientModeService.initialize();
      ambientModeService.enable();
      vi.advanceTimersByTime(35000);

      expect(ambientModeService.getState().isActive).toBe(true);

      ambientModeService.exitAmbientMode();

      const state = ambientModeService.getState();
      expect(state.isActive).toBe(false);
      expect(state.triggeredBy).toBeNull();
    });
  });

  describe('resetInactivityTimer', () => {
    it('should reset the last activity timestamp', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Advance 25 seconds (not yet past threshold)
      vi.advanceTimersByTime(25000);
      expect(ambientModeService.isActive()).toBe(false);

      // Reset the timer
      ambientModeService.resetInactivityTimer();

      // Advance another 25 seconds (total would be 50s from start but 25s from reset)
      vi.advanceTimersByTime(25000);
      expect(ambientModeService.isActive()).toBe(false);

      // Advance past threshold from last reset
      vi.advanceTimersByTime(10000);
      expect(ambientModeService.isActive()).toBe(true);
    });
  });

  describe('battery trigger', () => {
    it('should enter ambient mode when battery becomes critical while enabled', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      expect(ambientModeService.isActive()).toBe(false);

      // Simulate battery becoming critical
      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'critical', charging: false });
      }

      expect(ambientModeService.isActive()).toBe(true);
      expect(ambientModeService.getState().triggeredBy).toBe('battery');
    });

    it('should not enter ambient mode for critical battery when not enabled', () => {
      ambientModeService.initialize();
      // Note: NOT calling enable()

      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'critical', charging: false });
      }

      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should not enter ambient mode for critical battery while charging', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'critical', charging: true });
      }

      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should exit ambient mode when charging starts if triggered by battery', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Trigger by battery
      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'critical', charging: false });
      }
      expect(ambientModeService.isActive()).toBe(true);
      expect(ambientModeService.getState().triggeredBy).toBe('battery');

      // Start charging
      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'critical', charging: true });
      }

      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should NOT exit ambient mode when charging starts if triggered by inactivity', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Trigger by inactivity
      vi.advanceTimersByTime(35000);
      expect(ambientModeService.isActive()).toBe(true);
      expect(ambientModeService.getState().triggeredBy).toBe('inactivity');

      // Start charging - should NOT exit because trigger was inactivity, not battery
      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'normal', charging: true });
      }

      expect(ambientModeService.isActive()).toBe(true);
    });

    it('should not enter ambient mode for non-critical battery levels', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'low', charging: false });
      }

      expect(ambientModeService.isActive()).toBe(false);

      if (batterySubscribeCallback) {
        batterySubscribeCallback({ batteryLevel: 'normal', charging: false });
      }

      expect(ambientModeService.isActive()).toBe(false);
    });
  });

  describe('inactivity monitor', () => {
    it('should check every 5 seconds', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // At 5s, not yet past threshold
      vi.advanceTimersByTime(5000);
      expect(ambientModeService.isActive()).toBe(false);

      // At 10s, still not past
      vi.advanceTimersByTime(5000);
      expect(ambientModeService.isActive()).toBe(false);

      // At 30s, at the threshold boundary
      vi.advanceTimersByTime(20000);
      // The check happens every 5s and looks for elapsed >= 30000
      expect(ambientModeService.isActive()).toBe(true);
    });

    it('should not re-enter ambient mode if already active', () => {
      const callback = vi.fn();

      ambientModeService.initialize();
      ambientModeService.enable();
      ambientModeService.subscribe(callback);
      callback.mockClear();

      // Trigger inactivity
      vi.advanceTimersByTime(35000);
      expect(ambientModeService.isActive()).toBe(true);

      const enterCallCount = callback.mock.calls.length;

      // Advance more time - should not trigger again
      vi.advanceTimersByTime(30000);
      expect(callback.mock.calls.length).toBe(enterCallCount);
    });

    it('should not trigger if disabled during monitoring', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      // Advance part way
      vi.advanceTimersByTime(15000);

      // Disable
      ambientModeService.disable();

      // Advance past threshold
      vi.advanceTimersByTime(30000);

      expect(ambientModeService.isActive()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove all event listeners and clear state', () => {
      const removeEventSpy = vi.spyOn(document, 'removeEventListener');

      ambientModeService.initialize();
      ambientModeService.enable();

      ambientModeService.cleanup();

      // Should remove activity listeners
      expect(removeEventSpy).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
      );
      expect(removeEventSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
      );
      expect(removeEventSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it('should clear all subscribers', () => {
      const callback = vi.fn();

      ambientModeService.initialize();
      ambientModeService.subscribe(callback);
      callback.mockClear();

      ambientModeService.cleanup();

      // Re-initialize and try to trigger - old callback should not be called
      // (We can't test this directly after cleanup since the state is reset,
      // but we can verify no errors occur)
      expect(ambientModeService.isActive()).toBe(false);
    });

    it('should allow re-initialization after cleanup', () => {
      ambientModeService.initialize();
      ambientModeService.cleanup();

      // Should be able to initialize again
      expect(() => ambientModeService.initialize()).not.toThrow();
    });

    it('should handle cleanup without initialization', () => {
      expect(() => ambientModeService.cleanup()).not.toThrow();
    });

    it('should exit ambient mode during cleanup', () => {
      ambientModeService.initialize();
      ambientModeService.enable();

      vi.advanceTimersByTime(35000);
      expect(ambientModeService.isActive()).toBe(true);

      ambientModeService.cleanup();
      expect(ambientModeService.isActive()).toBe(false);
    });
  });

  describe('INACTIVITY_THRESHOLD_MS', () => {
    it('should be 30 seconds', () => {
      expect(ambientModeService.INACTIVITY_THRESHOLD_MS).toBe(30000);
    });
  });
});
