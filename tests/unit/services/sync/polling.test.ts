/**
 * Unit Tests for Polling Module
 * Tests: PollingManager lifecycle, adaptive polling, battery/network awareness,
 *        tab visibility, error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock battery service
const mockBatterySubscribe = vi.fn(() => vi.fn());
vi.mock('../../../../src/services/battery', () => ({
  batteryService: {
    subscribe: (...args: unknown[]) => mockBatterySubscribe(...args),
  },
}));

// Mock network monitor
const mockIsMetered = vi.fn(() => false);
const mockGetQuality = vi.fn(() => 'good' as const);
const mockOnMeteredChange = vi.fn(() => vi.fn());
const mockOnQualityChange = vi.fn(() => vi.fn());

vi.mock('../../../../src/services/sync/networkMonitor', () => ({
  networkMonitor: {
    isMeteredConnection: () => mockIsMetered(),
    getConnectionQuality: () => mockGetQuality(),
    onMeteredChange: (...args: unknown[]) => mockOnMeteredChange(...args),
    onQualityChange: (...args: unknown[]) => mockOnQualityChange(...args),
  },
}));

import { pollingManager } from '../../../../src/services/sync/polling';

describe('Polling Module', () => {
  let pollCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pollCallback = vi.fn();

    // Reset mock return values (Vitest 4: clearAllMocks no longer clears
    // mockReturnValue/mockImplementation — only call history)
    mockIsMetered.mockReturnValue(false);
    mockGetQuality.mockReturnValue('good' as const);
    mockBatterySubscribe.mockReturnValue(vi.fn());
    mockOnMeteredChange.mockReturnValue(vi.fn());
    mockOnQualityChange.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    pollingManager.cleanup();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should store callback and subscribe to battery/network', () => {
      pollingManager.initialize(pollCallback);

      expect(mockBatterySubscribe).toHaveBeenCalled();
      expect(mockOnMeteredChange).toHaveBeenCalled();
      expect(mockOnQualityChange).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should call callback immediately', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      expect(pollCallback).toHaveBeenCalledTimes(1);
    });

    it('should set up interval polling', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      expect(pollingManager.isPolling()).toBe(true);
    });

    it('should poll at regular intervals', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      pollCallback.mockClear();

      // Advance by normal poll interval (15s = 15000ms)
      vi.advanceTimersByTime(15000);
      expect(pollCallback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(15000);
      expect(pollCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('should stop polling', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      pollingManager.stop();

      expect(pollingManager.isPolling()).toBe(false);
    });

    it('should not call callback after stop', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();
      pollingManager.stop();

      pollCallback.mockClear();
      vi.advanceTimersByTime(60000);

      expect(pollCallback).not.toHaveBeenCalled();
    });
  });

  describe('isPolling', () => {
    it('should return false before start', () => {
      expect(pollingManager.isPolling()).toBe(false);
    });

    it('should return true after start', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      expect(pollingManager.isPolling()).toBe(true);
    });
  });

  describe('getPollingConfig', () => {
    it('should return normal config by default', () => {
      pollingManager.initialize(pollCallback);

      const config = pollingManager.getPollingConfig();
      expect(config.baseInterval).toBe(15000); // POLL_INTERVAL_NORMAL
    });

    it('should return offline config when connection quality is offline', () => {
      mockGetQuality.mockReturnValue('offline');
      pollingManager.initialize(pollCallback);

      const config = pollingManager.getPollingConfig();
      expect(config.baseInterval).toBe(60000); // POLL_INTERVAL_OFFLINE
    });

    it('should return slow config when connection quality is slow', () => {
      mockGetQuality.mockReturnValue('slow');
      pollingManager.initialize(pollCallback);

      const config = pollingManager.getPollingConfig();
      expect(config.baseInterval).toBe(30000); // POLL_INTERVAL_SLOW
    });

    it('should return metered config on metered connection', () => {
      mockIsMetered.mockReturnValue(true);
      pollingManager.initialize(pollCallback);

      const config = pollingManager.getPollingConfig();
      expect(config.baseInterval).toBe(30000); // POLL_INTERVAL_METERED_BASE
    });
  });

  describe('adjustPollingInterval', () => {
    it('should reset error counter on success', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      // Generate errors
      pollingManager.adjustPollingInterval(false);
      pollingManager.adjustPollingInterval(false);
      pollingManager.adjustPollingInterval(false);

      // Then succeed
      pollingManager.adjustPollingInterval(true, true);

      // Should be back to normal polling
    });

    it('should slow down after consecutive errors', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      // Generate more than 2 errors
      pollingManager.adjustPollingInterval(false);
      pollingManager.adjustPollingInterval(false);
      pollingManager.adjustPollingInterval(false);

      // The interval should now be the error interval (30000ms)
      pollCallback.mockClear();
      vi.advanceTimersByTime(15000);
      expect(pollCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(15000);
      expect(pollCallback).toHaveBeenCalledTimes(1);
    });

    it('should reset to fast polling on changes detected', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      pollingManager.adjustPollingInterval(true, true);

      // Should poll normally at 15s
      pollCallback.mockClear();
      vi.advanceTimersByTime(15000);
      expect(pollCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetToFastPolling', () => {
    it('should reset idle counters and restart at base interval', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      // Build up some no-change count
      for (let i = 0; i < 20; i++) {
        pollingManager.adjustPollingInterval(true, false);
      }

      pollingManager.resetToFastPolling();

      // Should be back at base interval
      pollCallback.mockClear();
      vi.advanceTimersByTime(15000);
      expect(pollCallback).toHaveBeenCalledTimes(1);
    });

    it('should not throw when not polling', () => {
      pollingManager.initialize(pollCallback);
      expect(() => pollingManager.resetToFastPolling()).not.toThrow();
    });
  });

  describe('setTabHidden', () => {
    it('should trigger immediate poll when becoming visible', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      pollCallback.mockClear();

      pollingManager.setTabHidden(true);
      pollingManager.setTabHidden(false);

      expect(pollCallback).toHaveBeenCalledTimes(1);
    });

    it('should not trigger if tab is already in same state', () => {
      pollingManager.initialize(pollCallback);
      pollingManager.start();

      pollingManager.setTabHidden(false); // Already visible
      pollCallback.mockClear();

      pollingManager.setTabHidden(false); // No change
      expect(pollCallback).not.toHaveBeenCalled();
    });

    it('should not throw when not polling', () => {
      pollingManager.initialize(pollCallback);
      expect(() => pollingManager.setTabHidden(true)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should stop polling and unsubscribe from services', () => {
      const unsubBattery = vi.fn();
      const unsubMetered = vi.fn();
      const unsubQuality = vi.fn();
      mockBatterySubscribe.mockReturnValue(unsubBattery);
      mockOnMeteredChange.mockReturnValue(unsubMetered);
      mockOnQualityChange.mockReturnValue(unsubQuality);

      pollingManager.initialize(pollCallback);
      pollingManager.start();
      pollingManager.cleanup();

      expect(pollingManager.isPolling()).toBe(false);
      expect(unsubBattery).toHaveBeenCalled();
      expect(unsubMetered).toHaveBeenCalled();
      expect(unsubQuality).toHaveBeenCalled();
    });

    it('should not throw when called multiple times', () => {
      pollingManager.initialize(pollCallback);
      expect(() => {
        pollingManager.cleanup();
        pollingManager.cleanup();
      }).not.toThrow();
    });
  });
});
