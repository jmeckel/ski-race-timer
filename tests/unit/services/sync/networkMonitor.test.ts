/**
 * Unit Tests for Network Monitor Module
 * Tests: initialize, isMeteredConnection, getConnectionQuality,
 *        onMeteredChange, onQualityChange, registerOnlineHandlers, cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Network Monitor', () => {
  let networkMonitor: typeof import('../../../../src/services/sync/networkMonitor').networkMonitor;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default: online with no Network Information API
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Remove connection API by default
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const module = await import(
      '../../../../src/services/sync/networkMonitor'
    );
    networkMonitor = module.networkMonitor;
  });

  afterEach(() => {
    networkMonitor.cleanup();
  });

  describe('initialize', () => {
    it('should set quality to good when online', () => {
      networkMonitor.initialize();
      expect(networkMonitor.getConnectionQuality()).toBe('good');
    });

    it('should set quality to offline when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      networkMonitor.initialize();
      expect(networkMonitor.getConnectionQuality()).toBe('offline');
    });

    it('should not throw when connection API unavailable', () => {
      expect(() => networkMonitor.initialize()).not.toThrow();
    });
  });

  describe('isMeteredConnection', () => {
    it('should return false by default', () => {
      networkMonitor.initialize();
      expect(networkMonitor.isMeteredConnection()).toBe(false);
    });
  });

  describe('getConnectionQuality', () => {
    it('should return good when online without connection API', () => {
      networkMonitor.initialize();
      expect(networkMonitor.getConnectionQuality()).toBe('good');
    });
  });

  describe('onMeteredChange', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = networkMonitor.onMeteredChange(callback);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('onQualityChange', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = networkMonitor.onQualityChange(callback);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('registerOnlineHandlers', () => {
    it('should call onOffline when offline event fires', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();

      networkMonitor.initialize();
      networkMonitor.registerOnlineHandlers(onOnline, onOffline);

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));

      expect(onOffline).toHaveBeenCalled();
      expect(networkMonitor.getConnectionQuality()).toBe('offline');
    });

    it('should call onOnline when online event fires', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();

      networkMonitor.initialize();
      networkMonitor.registerOnlineHandlers(onOnline, onOffline);

      window.dispatchEvent(new Event('online'));

      expect(onOnline).toHaveBeenCalled();
    });

    it('should notify quality listeners when quality changes', () => {
      const qualityCallback = vi.fn();
      networkMonitor.onQualityChange(qualityCallback);

      const onOnline = vi.fn();
      const onOffline = vi.fn();
      networkMonitor.initialize();
      networkMonitor.registerOnlineHandlers(onOnline, onOffline);

      // Go offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));

      expect(qualityCallback).toHaveBeenCalledWith('offline');
    });
  });

  describe('cleanup', () => {
    it('should remove all event listeners', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();

      networkMonitor.initialize();
      networkMonitor.registerOnlineHandlers(onOnline, onOffline);

      networkMonitor.cleanup();

      // Events should no longer fire callbacks
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('offline'));

      expect(onOnline).not.toHaveBeenCalled();
      expect(onOffline).not.toHaveBeenCalled();
    });

    it('should clear all listeners', () => {
      const callback = vi.fn();
      networkMonitor.onMeteredChange(callback);
      networkMonitor.onQualityChange(callback);

      networkMonitor.cleanup();
      // Callbacks should be cleared
    });
  });
});
