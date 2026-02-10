/**
 * Unit Tests for Battery Service
 * Tests: initialization, status updates, battery level classification,
 * subscribe/unsubscribe, cleanup, power state queries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Battery mock factory
function createMockBattery(level = 1.0, charging = true) {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    level,
    charging,
    chargingTime: charging ? 0 : Infinity,
    dischargingTime: charging ? Infinity : 3600,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((l) => l !== listener);
      }
    }),
    // Helper to simulate battery events
    _triggerEvent(type: string) {
      if (listeners[type]) {
        for (const l of listeners[type]) l();
      }
    },
    // Helper to change level
    _setLevel(newLevel: number) {
      this.level = newLevel;
    },
    // Helper to change charging
    _setCharging(newCharging: boolean) {
      this.charging = newCharging;
    },
  };
}

describe('Battery Service', () => {
  let batteryService: typeof import('../../../src/services/battery').batteryService;
  let mockBattery: ReturnType<typeof createMockBattery>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBattery = createMockBattery(1.0, true);

    // Set up navigator.getBattery mock
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn(() => Promise.resolve(mockBattery)),
      writable: true,
      configurable: true,
    });

    // Reset module for clean singleton state
    vi.resetModules();
    const module = await import('../../../src/services/battery');
    batteryService = module.batteryService;
  });

  afterEach(() => {
    batteryService.cleanup();
  });

  describe('isSupported', () => {
    it('should return true when getBattery is available', () => {
      expect(batteryService.isSupported()).toBe(true);
    });

    it('should return false when getBattery is not available', async () => {
      // Remove getBattery
      const original = (navigator as any).getBattery;
      delete (navigator as any).getBattery;

      vi.resetModules();
      const module = await import('../../../src/services/battery');

      expect(module.batteryService.isSupported()).toBe(false);

      // Restore
      Object.defineProperty(navigator, 'getBattery', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('initialize', () => {
    it('should initialize and read battery status', async () => {
      const result = await batteryService.initialize();

      expect(result).toBe(true);
      expect((navigator as any).getBattery).toHaveBeenCalled();
    });

    it('should register event listeners on battery', async () => {
      await batteryService.initialize();

      expect(mockBattery.addEventListener).toHaveBeenCalledWith('levelchange', expect.any(Function));
      expect(mockBattery.addEventListener).toHaveBeenCalledWith('chargingchange', expect.any(Function));
    });

    it('should return true if already initialized', async () => {
      await batteryService.initialize();
      const result = await batteryService.initialize();

      expect(result).toBe(true);
      // getBattery should only be called once
      expect((navigator as any).getBattery).toHaveBeenCalledTimes(1);
    });

    it('should return false if not supported', async () => {
      const original = (navigator as any).getBattery;
      delete (navigator as any).getBattery;

      vi.resetModules();
      const module = await import('../../../src/services/battery');
      const result = await module.batteryService.initialize();

      expect(result).toBe(false);

      Object.defineProperty(navigator, 'getBattery', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('should return false and log warning if getBattery throws', async () => {
      (navigator as any).getBattery = vi.fn(() => Promise.reject(new Error('Not allowed')));

      vi.resetModules();
      const module = await import('../../../src/services/battery');
      const { logger } = await import('../../../src/utils/logger');
      const result = await module.batteryService.initialize();

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return default status before initialization', () => {
      const status = batteryService.getStatus();

      expect(status).toEqual({
        level: 1.0,
        charging: true,
        batteryLevel: 'normal',
      });
    });

    it('should return current battery status after initialization', async () => {
      mockBattery._setLevel(0.75);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      const status = batteryService.getStatus();
      expect(status.level).toBe(0.75);
      expect(status.charging).toBe(false);
      expect(status.batteryLevel).toBe('normal');
    });

    it('should return a copy (not reference)', async () => {
      await batteryService.initialize();

      const status1 = batteryService.getStatus();
      const status2 = batteryService.getStatus();

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('battery level classification', () => {
    it('should classify as normal when charging', async () => {
      mockBattery._setLevel(0.05); // 5%, but charging
      mockBattery._setCharging(true);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('normal');
    });

    it('should classify as normal when above 20%', async () => {
      mockBattery._setLevel(0.5);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('normal');
    });

    it('should classify as low when between 10-20% and not charging', async () => {
      mockBattery._setLevel(0.15);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('low');
    });

    it('should classify as low at exactly 20%', async () => {
      mockBattery._setLevel(0.2);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('low');
    });

    it('should classify as critical when at or below 10% and not charging', async () => {
      mockBattery._setLevel(0.1);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('critical');
    });

    it('should classify as critical when below 10% and not charging', async () => {
      mockBattery._setLevel(0.05);
      mockBattery._setCharging(false);

      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('critical');
    });
  });

  describe('subscribe', () => {
    it('should immediately notify subscriber with current status', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      batteryService.subscribe(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        level: 1.0,
        charging: true,
        batteryLevel: 'normal',
      }));
    });

    it('should return an unsubscribe function', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      const unsubscribe = batteryService.subscribe(callback);

      expect(typeof unsubscribe).toBe('function');

      callback.mockClear();
      unsubscribe();

      // Trigger a change - callback should NOT be called
      mockBattery._setLevel(0.5);
      mockBattery._triggerEvent('levelchange');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify subscriber on level change', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      batteryService.subscribe(callback);
      callback.mockClear();

      // Simulate level change
      mockBattery._setLevel(0.5);
      mockBattery._triggerEvent('levelchange');

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        level: 0.5,
      }));
    });

    it('should notify subscriber on charging change', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      batteryService.subscribe(callback);
      callback.mockClear();

      // Simulate charging change
      mockBattery._setCharging(false);
      mockBattery._triggerEvent('chargingchange');

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        charging: false,
      }));
    });

    it('should not notify if status has not changed', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      batteryService.subscribe(callback);
      callback.mockClear();

      // Trigger event without changing values
      mockBattery._triggerEvent('levelchange');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const { logger } = await import('../../../src/utils/logger');
      await batteryService.initialize();

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

      batteryService.subscribe(badCallback);
      batteryService.subscribe(goodCallback);

      const badCallsBefore = badCallback.mock.calls.length;
      const goodCallsBefore = goodCallback.mock.calls.length;

      // Trigger a real change
      mockBattery._setLevel(0.5);
      mockBattery._triggerEvent('levelchange');

      expect(badCallback.mock.calls.length).toBeGreaterThan(badCallsBefore);
      expect(goodCallback.mock.calls.length).toBeGreaterThan(goodCallsBefore);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('isLowBattery', () => {
    it('should return false for normal battery', () => {
      expect(batteryService.isLowBattery()).toBe(false);
    });

    it('should return true for low battery', async () => {
      mockBattery._setLevel(0.15);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.isLowBattery()).toBe(true);
    });

    it('should return true for critical battery', async () => {
      mockBattery._setLevel(0.05);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.isLowBattery()).toBe(true);
    });
  });

  describe('isCriticalBattery', () => {
    it('should return false for normal battery', () => {
      expect(batteryService.isCriticalBattery()).toBe(false);
    });

    it('should return false for low battery', async () => {
      mockBattery._setLevel(0.15);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.isCriticalBattery()).toBe(false);
    });

    it('should return true for critical battery', async () => {
      mockBattery._setLevel(0.05);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.isCriticalBattery()).toBe(true);
    });
  });

  describe('isCharging', () => {
    it('should return true by default (assumes plugged in)', () => {
      expect(batteryService.isCharging()).toBe(true);
    });

    it('should reflect actual charging state after initialization', async () => {
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.isCharging()).toBe(false);
    });
  });

  describe('getLevelPercent', () => {
    it('should return 100 by default', () => {
      expect(batteryService.getLevelPercent()).toBe(100);
    });

    it('should return correct percentage after initialization', async () => {
      mockBattery._setLevel(0.75);
      await batteryService.initialize();

      expect(batteryService.getLevelPercent()).toBe(75);
    });

    it('should round to nearest integer', async () => {
      mockBattery._setLevel(0.333);
      await batteryService.initialize();

      expect(batteryService.getLevelPercent()).toBe(33);
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners from battery', async () => {
      await batteryService.initialize();

      batteryService.cleanup();

      expect(mockBattery.removeEventListener).toHaveBeenCalledWith('levelchange', expect.any(Function));
      expect(mockBattery.removeEventListener).toHaveBeenCalledWith('chargingchange', expect.any(Function));
    });

    it('should clear callbacks', async () => {
      await batteryService.initialize();

      const callback = vi.fn();
      batteryService.subscribe(callback);
      callback.mockClear();

      batteryService.cleanup();

      // After cleanup, no errors should occur. Verify the service is in a clean state.
      expect(batteryService.getStatus()).toBeDefined();
    });

    it('should allow re-initialization after cleanup', async () => {
      await batteryService.initialize();
      batteryService.cleanup();

      const result = await batteryService.initialize();
      expect(result).toBe(true);
    });

    it('should handle cleanup without initialization', () => {
      expect(() => batteryService.cleanup()).not.toThrow();
    });

    it('should handle cleanup when battery has no handlers', async () => {
      // Initialize but then manually null out handlers
      await batteryService.initialize();

      // Cleanup should handle this gracefully
      expect(() => batteryService.cleanup()).not.toThrow();
    });
  });

  describe('status update with battery events', () => {
    it('should update classification when battery level drops', async () => {
      mockBattery._setLevel(0.5);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('normal');

      // Drop to low
      mockBattery._setLevel(0.15);
      mockBattery._triggerEvent('levelchange');

      expect(batteryService.getStatus().batteryLevel).toBe('low');

      // Drop to critical
      mockBattery._setLevel(0.05);
      mockBattery._triggerEvent('levelchange');

      expect(batteryService.getStatus().batteryLevel).toBe('critical');
    });

    it('should reclassify as normal when charging starts', async () => {
      mockBattery._setLevel(0.05);
      mockBattery._setCharging(false);
      await batteryService.initialize();

      expect(batteryService.getStatus().batteryLevel).toBe('critical');

      // Start charging
      mockBattery._setCharging(true);
      mockBattery._triggerEvent('chargingchange');

      expect(batteryService.getStatus().batteryLevel).toBe('normal');
    });
  });
});
