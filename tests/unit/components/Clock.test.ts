/**
 * Unit Tests for Clock Component
 * Tests: initialization, start/stop, time updates, GPS integration
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

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

let mockRequestAnimationFrame: ReturnType<typeof vi.fn>;
let mockCancelAnimationFrame: ReturnType<typeof vi.fn>;

describe('Clock Component', () => {
  let Clock: typeof import('../../../src/components/Clock').Clock;
  let container: HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    rafCallback = null;
    rafId = 0;

    // Set up RAF mocks in each test (re-applied after vi.resetModules)
    mockRequestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return ++rafId;
    });
    mockCancelAnimationFrame = vi.fn((id: number) => {
      if (id === rafId) {
        rafCallback = null;
      }
    });
    globalThis.requestAnimationFrame =
      mockRequestAnimationFrame as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame =
      mockCancelAnimationFrame as unknown as typeof cancelAnimationFrame;

    // jsdom 25+ reports document.hidden as true by default.
    // Override so Clock.start() doesn't immediately cancel the RAF.
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });

    // Create container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Reset modules
    vi.resetModules();
    const module = await import('../../../src/components/Clock');
    Clock = module.Clock;
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  describe('constructor', () => {
    it('should create time and date elements', () => {
      const clock = new Clock(container);

      expect(container.querySelector('.clock-time')).not.toBeNull();
      expect(container.querySelector('.clock-date')).not.toBeNull();

      clock.destroy();
    });

    it('should create digit spans', () => {
      const clock = new Clock(container);

      const digits = container.querySelectorAll('.clock-digit');
      expect(digits.length).toBe(12); // HH:MM:SS.mmm

      clock.destroy();
    });

    it('should set accessibility attributes', () => {
      const clock = new Clock(container);

      const timeElement = container.querySelector('.clock-time');
      expect(timeElement?.getAttribute('role')).toBe('timer');
      expect(timeElement?.getAttribute('aria-live')).toBe('polite');

      clock.destroy();
    });
  });

  describe('start', () => {
    it('should start the clock', () => {
      const clock = new Clock(container);
      clock.start();

      expect(mockRequestAnimationFrame).toHaveBeenCalled();

      clock.destroy();
    });

    it('should not start twice', () => {
      const clock = new Clock(container);
      const initialCallCount = mockRequestAnimationFrame.mock.calls.length;

      clock.start();
      const afterFirstStart = mockRequestAnimationFrame.mock.calls.length;

      clock.start();
      const afterSecondStart = mockRequestAnimationFrame.mock.calls.length;

      // Second start should not add more RAF calls than the first
      expect(afterSecondStart - afterFirstStart).toBeLessThanOrEqual(
        afterFirstStart - initialCallCount,
      );

      clock.destroy();
    });

    it('should update time on tick', () => {
      const clock = new Clock(container);
      clock.start();

      // Execute the RAF callback
      if (rafCallback) {
        rafCallback(performance.now());
      }

      const digits = container.querySelectorAll('.clock-digit');
      // At least some digits should have content
      const hasContent = Array.from(digits).some((d) => d.textContent !== '');
      expect(hasContent).toBe(true);

      clock.destroy();
    });
  });

  describe('stop', () => {
    it('should stop the clock', () => {
      const clock = new Clock(container);
      clock.start();
      clock.stop();

      expect(mockCancelAnimationFrame).toHaveBeenCalledWith(rafId);

      clock.destroy();
    });

    it('should handle stop when not running', () => {
      const clock = new Clock(container);

      expect(() => clock.stop()).not.toThrow();

      clock.destroy();
    });
  });

  describe('getCurrentTime', () => {
    it('should return current time string', () => {
      const clock = new Clock(container);
      clock.start();

      // Execute tick
      if (rafCallback) {
        rafCallback(performance.now());
      }

      const time = clock.getCurrentTime();
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

      clock.destroy();
    });

    it('should return empty string before tick', () => {
      const clock = new Clock(container);

      expect(clock.getCurrentTime()).toBe('');

      clock.destroy();
    });
  });

  describe('getTimestamp', () => {
    it('should return current timestamp as Date', () => {
      const clock = new Clock(container);

      const timestamp = clock.getTimestamp();
      expect(timestamp).toBeInstanceOf(Date);

      clock.destroy();
    });
  });

  describe('destroy', () => {
    it('should stop clock and clear container', () => {
      const clock = new Clock(container);
      clock.start();
      clock.destroy();

      expect(container.innerHTML).toBe('');
      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('digit updates', () => {
    it('should only update changed digits', () => {
      const clock = new Clock(container);
      clock.start();

      // First tick
      if (rafCallback) {
        rafCallback(performance.now());
      }

      const digits = container.querySelectorAll('.clock-digit');
      const initialValues = Array.from(digits).map((d) => d.textContent);

      // Advance time and tick again
      vi.advanceTimersByTime(100);
      if (rafCallback) {
        rafCallback(performance.now());
      }

      // Only millisecond digits should have changed
      const newValues = Array.from(digits).map((d) => d.textContent);

      // Hour and minute digits should be the same (most of the time)
      expect(initialValues.slice(0, 6)).toEqual(newValues.slice(0, 6));

      clock.destroy();
    });
  });
});
