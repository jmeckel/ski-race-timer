/**
 * Unit Tests for main.ts (Application Entry Point)
 *
 * Tests the side-effect-driven initialization sequence:
 * 1. Global error handlers, storage logging, toast init
 * 2. DOM-ready gating for initApp
 * 3. Battery service initialization and power-saver class toggling
 * 4. Cleanup on beforeunload
 *
 * Since main.ts executes side effects on import, each test group uses
 * vi.resetModules() + dynamic import() to re-trigger the module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatteryStatus } from '../../src/services/battery';

// ── Mock function references ─────────────────────────────────────────────────
const mockInitGlobalErrorHandlers = vi.fn();
const mockLogStorageUsage = vi.fn();
const mockGetToast = vi.fn();
const mockInitApp = vi.fn();
const mockBatteryUnsubscribe = vi.fn();
let batterySubscribeCallback: ((status: BatteryStatus) => void) | null = null;
let batteryInitializeResult: Promise<boolean> = Promise.resolve(true);

// Track beforeunload handlers added by each import of main.ts so we can clean up
const beforeUnloadHandlers: EventListenerOrEventListenerObject[] = [];
const originalWindowAddEventListener = window.addEventListener.bind(window);
const originalWindowRemoveEventListener =
  window.removeEventListener.bind(window);

// ── Module mocks (hoisted before any import of main.ts) ─────────────────────

vi.mock('../../src/utils/errorBoundary', () => ({
  initGlobalErrorHandlers: (...args: unknown[]) =>
    mockInitGlobalErrorHandlers(...args),
}));

vi.mock('../../src/utils/storageQuota', () => ({
  logStorageUsage: (...args: unknown[]) => mockLogStorageUsage(...args),
}));

vi.mock('../../src/components/Toast', () => ({
  getToast: (...args: unknown[]) => mockGetToast(...args),
}));

vi.mock('../../src/app', () => ({
  initApp: (...args: unknown[]) => mockInitApp(...args),
}));

vi.mock('../../src/services/battery', () => ({
  batteryService: {
    initialize: vi.fn(() => batteryInitializeResult),
    subscribe: vi.fn((cb: (status: BatteryStatus) => void) => {
      batterySubscribeCallback = cb;
      return mockBatteryUnsubscribe;
    }),
  },
}));

// Mock CSS imports (jsdom does not handle CSS)
vi.mock('../../src/styles/main.css', () => ({}));
vi.mock('../../src/styles/modals.css', () => ({}));
vi.mock('../../src/styles/timer.css', () => ({}));
vi.mock('../../src/styles/gate-judge.css', () => ({}));
vi.mock('../../src/styles/chief-judge.css', () => ({}));
vi.mock('../../src/styles/settings.css', () => ({}));
vi.mock('../../src/styles/results.css', () => ({}));
vi.mock('../../src/styles/onboarding.css', () => ({}));
vi.mock('../../src/styles/glass.css', () => ({}));
vi.mock('../../src/styles/animations.css', () => ({}));
vi.mock('../../src/styles/radial-dial.css', () => ({}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Flush the microtask queue so .then()/.catch() chains run */
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Create a rejected promise that is pre-caught to avoid Node's
 * unhandled rejection warning, while still rejecting for the consumer.
 */
function createRejectedPromise(error: Error): Promise<boolean> {
  const p = Promise.reject(error);
  // Attach a no-op catch to suppress the unhandled rejection warning.
  // The actual .catch() in main.ts will still work because Promise chains
  // are separate from the original promise's rejection handler.
  p.catch(() => {});
  return p;
}

/** Dynamically import main.ts to trigger its side effects */
const importMain = () => import('../../src/main');

// ── Test suites ──────────────────────────────────────────────────────────────

describe('main.ts — application entry point', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    batterySubscribeCallback = null;
    batteryInitializeResult = Promise.resolve(true);
    document.body.classList.remove('power-saver');

    // Intercept window.addEventListener to track beforeunload handlers
    window.addEventListener = vi.fn(
      (
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'beforeunload') {
          beforeUnloadHandlers.push(handler);
        }
        originalWindowAddEventListener(type, handler, options);
      },
    );

    // Default: DOM is already ready
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Remove all beforeunload handlers that were added by main.ts imports
    for (const handler of beforeUnloadHandlers) {
      originalWindowRemoveEventListener('beforeunload', handler);
    }
    beforeUnloadHandlers.length = 0;

    // Restore real addEventListener
    window.addEventListener = originalWindowAddEventListener;

    // Restore readyState to default
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      writable: true,
      configurable: true,
    });
  });

  // ── Immediate side effects ───────────────────────────────────────────────

  describe('immediate side effects on import', () => {
    it('calls initGlobalErrorHandlers on import', async () => {
      await importMain();
      expect(mockInitGlobalErrorHandlers).toHaveBeenCalledTimes(1);
    });

    it('calls logStorageUsage on import', async () => {
      await importMain();
      expect(mockLogStorageUsage).toHaveBeenCalledTimes(1);
    });

    it('calls getToast on import to initialize the toast system', async () => {
      await importMain();
      expect(mockGetToast).toHaveBeenCalledTimes(1);
    });

    it('calls initGlobalErrorHandlers before logStorageUsage and getToast', async () => {
      const callOrder: string[] = [];
      mockInitGlobalErrorHandlers.mockImplementation(() =>
        callOrder.push('errorHandlers'),
      );
      mockLogStorageUsage.mockImplementation(() =>
        callOrder.push('storageUsage'),
      );
      mockGetToast.mockImplementation(() => callOrder.push('toast'));

      await importMain();

      expect(callOrder).toEqual(['errorHandlers', 'storageUsage', 'toast']);
    });
  });

  // ── DOM-ready gating ─────────────────────────────────────────────────────

  describe('DOM-ready gating for initApp', () => {
    it('calls initApp immediately when readyState is "complete"', async () => {
      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        writable: true,
        configurable: true,
      });

      await importMain();

      expect(mockInitApp).toHaveBeenCalledTimes(1);
    });

    it('calls initApp immediately when readyState is "interactive"', async () => {
      Object.defineProperty(document, 'readyState', {
        value: 'interactive',
        writable: true,
        configurable: true,
      });

      await importMain();

      expect(mockInitApp).toHaveBeenCalledTimes(1);
    });

    it('defers initApp to DOMContentLoaded when readyState is "loading"', async () => {
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        writable: true,
        configurable: true,
      });

      await importMain();

      // initApp should NOT have been called yet
      expect(mockInitApp).not.toHaveBeenCalled();

      // Simulate the browser finishing DOM parsing
      document.dispatchEvent(new Event('DOMContentLoaded'));

      expect(mockInitApp).toHaveBeenCalledTimes(1);
    });
  });

  // ── Battery service and power-saver ──────────────────────────────────────

  describe('battery service initialization', () => {
    it('calls batteryService.initialize() on import', async () => {
      await importMain();
      await flushPromises();

      const { batteryService } = await import('../../src/services/battery');
      expect(batteryService.initialize).toHaveBeenCalledTimes(1);
    });

    it('subscribes to battery changes after successful initialization', async () => {
      await importMain();
      await flushPromises();

      const { batteryService } = await import('../../src/services/battery');
      expect(batteryService.subscribe).toHaveBeenCalledTimes(1);
      expect(batterySubscribeCallback).toBeTypeOf('function');
    });
  });

  describe('power-saver class toggling', () => {
    it('adds power-saver class when batteryLevel is "low"', async () => {
      await importMain();
      await flushPromises();

      expect(batterySubscribeCallback).not.toBeNull();
      batterySubscribeCallback!({
        level: 0.1,
        charging: false,
        batteryLevel: 'low',
      });

      expect(document.body.classList.contains('power-saver')).toBe(true);
    });

    it('adds power-saver class when batteryLevel is "medium"', async () => {
      await importMain();
      await flushPromises();

      batterySubscribeCallback!({
        level: 0.25,
        charging: false,
        batteryLevel: 'medium',
      });

      expect(document.body.classList.contains('power-saver')).toBe(true);
    });

    it('adds power-saver class when batteryLevel is "critical"', async () => {
      await importMain();
      await flushPromises();

      batterySubscribeCallback!({
        level: 0.03,
        charging: false,
        batteryLevel: 'critical',
      });

      expect(document.body.classList.contains('power-saver')).toBe(true);
    });

    it('does NOT add power-saver class when batteryLevel is "normal"', async () => {
      await importMain();
      await flushPromises();

      batterySubscribeCallback!({
        level: 0.8,
        charging: false,
        batteryLevel: 'normal',
      });

      expect(document.body.classList.contains('power-saver')).toBe(false);
    });

    it('removes power-saver class when batteryLevel transitions from low to normal', async () => {
      await importMain();
      await flushPromises();

      // First: low battery -> class added
      batterySubscribeCallback!({
        level: 0.1,
        charging: false,
        batteryLevel: 'low',
      });
      expect(document.body.classList.contains('power-saver')).toBe(true);

      // Then: plugged in, back to normal -> class removed
      batterySubscribeCallback!({
        level: 0.8,
        charging: true,
        batteryLevel: 'normal',
      });
      expect(document.body.classList.contains('power-saver')).toBe(false);
    });
  });

  // ── Graceful degradation ─────────────────────────────────────────────────

  describe('graceful degradation when battery API unavailable', () => {
    it('does not throw when batteryService.initialize() rejects', async () => {
      batteryInitializeResult = createRejectedPromise(
        new Error('Not supported'),
      );

      // Should not throw
      await importMain();
      await flushPromises();

      // Module loaded without error
      expect(mockInitGlobalErrorHandlers).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe to battery when initialize() rejects', async () => {
      batteryInitializeResult = createRejectedPromise(
        new Error('Not supported'),
      );

      await importMain();
      await flushPromises();

      const { batteryService } = await import('../../src/services/battery');
      expect(batteryService.subscribe).not.toHaveBeenCalled();
      expect(batterySubscribeCallback).toBeNull();
    });

    it('never toggles power-saver class when initialize() rejects', async () => {
      batteryInitializeResult = createRejectedPromise(
        new Error('Not supported'),
      );

      await importMain();
      await flushPromises();

      // No callback was registered, so power-saver should never appear
      expect(document.body.classList.contains('power-saver')).toBe(false);
    });
  });

  // ── Cleanup on beforeunload ──────────────────────────────────────────────

  describe('beforeunload cleanup', () => {
    it('calls battery unsubscribe on beforeunload', async () => {
      await importMain();
      await flushPromises();

      // Battery should be subscribed
      expect(mockBatteryUnsubscribe).not.toHaveBeenCalled();

      // Trigger beforeunload
      window.dispatchEvent(new Event('beforeunload'));

      expect(mockBatteryUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not throw on beforeunload if battery was never initialized', async () => {
      batteryInitializeResult = createRejectedPromise(
        new Error('Not supported'),
      );

      await importMain();
      await flushPromises();

      // Battery unsubscribe was never set, so beforeunload should be safe
      expect(() => {
        window.dispatchEvent(new Event('beforeunload'));
      }).not.toThrow();

      expect(mockBatteryUnsubscribe).not.toHaveBeenCalled();
    });

    it('only calls unsubscribe once even if beforeunload fires multiple times', async () => {
      await importMain();
      await flushPromises();

      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('beforeunload'));

      // The code sets batteryUnsubscribe = null after first call,
      // so the second beforeunload should not call it again
      expect(mockBatteryUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
