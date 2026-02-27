/**
 * Unit Tests for Feedback Service
 * Tests: battery-aware vibration scaling, AudioContext lifecycle,
 * vibrate(), playBeep(), cleanupFeedback(), resumeAudio(),
 * predefined feedback patterns
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock localStorage ---
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

// --- Mock store ---
let mockSettings = { haptic: true, sound: true };

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => ({ settings: mockSettings }),
  },
}));

// --- Mock battery service ---
let mockBatteryLevel: 'normal' | 'medium' | 'low' | 'critical' = 'normal';

vi.mock('../../../src/services/battery', () => ({
  batteryService: {
    getStatus: () => ({
      level: 1.0,
      charging: true,
      batteryLevel: mockBatteryLevel,
    }),
  },
}));

// --- Mock logger ---
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// --- navigator.vibrate mock ---
// Create a persistent spy that we reset between tests
const vibrateSpy = vi.fn(() => true);

// The source code checks `if (navigator.vibrate)` then calls `navigator.vibrate(pattern)`.
// We need navigator.vibrate to be a callable spy. Define it once as configurable.
// Since this runs before tests, and we never redefine the property itself (just mock.clear),
// there's no "Cannot redefine" issue.
vi.stubGlobal('navigator', new Proxy(globalThis.navigator, {
  get(target, prop, receiver) {
    if (prop === 'vibrate') {
      return vibrateSpy;
    }
    return Reflect.get(target, prop, receiver);
  },
}));

// --- AudioContext mock infrastructure ---
let mockOscillator: {
  connect: ReturnType<typeof vi.fn>;
  frequency: { value: number };
  type: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

let mockGainNode: {
  connect: ReturnType<typeof vi.fn>;
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
};

let mockAudioContextState: 'running' | 'suspended' | 'closed';
let mockResumeFn: ReturnType<typeof vi.fn>;
let mockSuspendFn: ReturnType<typeof vi.fn>;
let mockCloseFn: ReturnType<typeof vi.fn>;
let audioContextInstances: number;
let shouldAudioContextThrow = false;

function resetAudioMocks() {
  mockAudioContextState = 'running';
  mockResumeFn = vi.fn(() => Promise.resolve());
  mockSuspendFn = vi.fn(() => Promise.resolve());
  mockCloseFn = vi.fn(() => Promise.resolve());
  audioContextInstances = 0;
  shouldAudioContextThrow = false;
}

function createMockOscillator() {
  mockOscillator = {
    connect: vi.fn(),
    frequency: { value: 0 },
    type: '',
    start: vi.fn(),
    stop: vi.fn(),
  };
  return mockOscillator;
}

function createMockGainNode() {
  mockGainNode = {
    connect: vi.fn(),
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
  return mockGainNode;
}

function installAudioContextMock() {
  const MockAudioContext = function (this: Record<string, unknown>) {
    if (shouldAudioContextThrow) {
      throw new Error('AudioContext not supported');
    }
    audioContextInstances++;
    Object.defineProperty(this, 'state', {
      get() {
        return mockAudioContextState;
      },
    });
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = vi.fn(() => createMockOscillator());
    this.createGain = vi.fn(() => createMockGainNode());
    this.resume = (...args: unknown[]) => mockResumeFn(...args);
    this.suspend = (...args: unknown[]) => mockSuspendFn(...args);
    this.close = (...args: unknown[]) => mockCloseFn(...args);
  } as unknown as typeof AudioContext;

  vi.stubGlobal('AudioContext', MockAudioContext);
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).AudioContext =
      MockAudioContext;
  }
}

describe('Feedback Service', () => {
  let feedback: typeof import('../../../src/services/feedback');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    // Reset state
    mockSettings = { haptic: true, sound: true };
    mockBatteryLevel = 'normal';
    vibrateSpy.mockClear();
    vibrateSpy.mockReturnValue(true);
    resetAudioMocks();
    installAudioContextMock();

    // Import fresh module (module-level state resets via resetModules)
    feedback = await import('../../../src/services/feedback');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────────
  //  Battery-Aware Vibration Scaling (via vibrate())
  // ──────────────────────────────────────────────────────────

  describe('battery-aware vibration scaling', () => {
    it('should vibrate with full duration at normal battery', () => {
      mockBatteryLevel = 'normal';
      feedback.vibrate(100);
      expect(vibrateSpy).toHaveBeenCalledWith(100);
    });

    it('should vibrate with 75% duration at medium battery', () => {
      mockBatteryLevel = 'medium';
      feedback.vibrate(100);
      expect(vibrateSpy).toHaveBeenCalledWith(75);
    });

    it('should vibrate with 50% duration at low battery', () => {
      mockBatteryLevel = 'low';
      feedback.vibrate(100);
      expect(vibrateSpy).toHaveBeenCalledWith(50);
    });

    it('should disable vibration entirely at critical battery', () => {
      mockBatteryLevel = 'critical';
      feedback.vibrate(100);
      expect(vibrateSpy).not.toHaveBeenCalled();
    });

    it('should scale array patterns element-by-element at low battery', () => {
      mockBatteryLevel = 'low';
      feedback.vibrate([100, 50, 100]);
      expect(vibrateSpy).toHaveBeenCalledWith([50, 25, 50]);
    });

    it('should scale array patterns element-by-element at medium battery', () => {
      mockBatteryLevel = 'medium';
      feedback.vibrate([60, 40, 60]);
      expect(vibrateSpy).toHaveBeenCalledWith([45, 30, 45]);
    });

    it('should pass array patterns unscaled at normal battery', () => {
      mockBatteryLevel = 'normal';
      feedback.vibrate([100, 50, 100]);
      expect(vibrateSpy).toHaveBeenCalledWith([100, 50, 100]);
    });

    it('should skip array vibration at critical battery', () => {
      mockBatteryLevel = 'critical';
      feedback.vibrate([100, 50, 100]);
      expect(vibrateSpy).not.toHaveBeenCalled();
    });

    it('should round scaled values correctly', () => {
      mockBatteryLevel = 'medium';
      // 35 * 0.75 = 26.25 -> rounds to 26
      feedback.vibrate(35);
      expect(vibrateSpy).toHaveBeenCalledWith(26);
    });

    it('should round scaled array values correctly', () => {
      mockBatteryLevel = 'low';
      // 35 * 0.5 = 17.5 -> rounds to 18
      feedback.vibrate([35, 35]);
      expect(vibrateSpy).toHaveBeenCalledWith([18, 18]);
    });
  });

  // ──────────────────────────────────────────────────────────
  //  vibrate() function
  // ──────────────────────────────────────────────────────────

  describe('vibrate()', () => {
    it('should skip if haptic setting is disabled', () => {
      mockSettings = { haptic: false, sound: true };
      feedback.vibrate(100);
      expect(vibrateSpy).not.toHaveBeenCalled();
    });

    it('should call navigator.vibrate when haptic is enabled', () => {
      mockSettings = { haptic: true, sound: true };
      feedback.vibrate(100);
      expect(vibrateSpy).toHaveBeenCalledWith(100);
    });

    it('should catch errors from navigator.vibrate', () => {
      vibrateSpy.mockImplementation(() => {
        throw new Error('Vibration API error');
      });
      // Should not throw even though vibrate throws
      expect(() => feedback.vibrate(100)).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────
  //  AudioContext management
  // ──────────────────────────────────────────────────────────

  describe('AudioContext management', () => {
    it('should create AudioContext lazily on first playBeep', () => {
      expect(audioContextInstances).toBe(0);
      feedback.playBeep(880, 100);
      expect(audioContextInstances).toBe(1);
    });

    it('should reuse same AudioContext on subsequent playBeep calls', () => {
      feedback.playBeep(880, 100);
      feedback.playBeep(440, 200);
      expect(audioContextInstances).toBe(1);
    });

    it('should return null and skip if AudioContext constructor throws', async () => {
      vi.resetModules();
      shouldAudioContextThrow = true;
      installAudioContextMock();

      const freshFeedback = await import('../../../src/services/feedback');
      // Should not throw - gracefully handles missing AudioContext
      expect(() => freshFeedback.playBeep(880, 100)).not.toThrow();
      expect(audioContextInstances).toBe(0);
    });

    it('should schedule AudioContext suspension after playBeep', () => {
      feedback.playBeep(880, 100);

      // Advance just under 5 seconds - should not suspend yet
      vi.advanceTimersByTime(4999);
      expect(mockSuspendFn).not.toHaveBeenCalled();

      // Advance past 5 seconds
      vi.advanceTimersByTime(1);
      expect(mockSuspendFn).toHaveBeenCalledTimes(1);
    });

    it('should reset suspend timer on each playBeep call', () => {
      feedback.playBeep(880, 100);

      // Advance 3 seconds
      vi.advanceTimersByTime(3000);
      expect(mockSuspendFn).not.toHaveBeenCalled();

      // Play another beep - resets the timer
      feedback.playBeep(440, 100);

      // Advance another 3 seconds (6s from first, 3s from second)
      vi.advanceTimersByTime(3000);
      expect(mockSuspendFn).not.toHaveBeenCalled();

      // Advance to 5s from second call
      vi.advanceTimersByTime(2000);
      expect(mockSuspendFn).toHaveBeenCalledTimes(1);
    });

    it('should not suspend if context state is not running', () => {
      feedback.playBeep(880, 100);

      // Simulate context already suspended
      mockAudioContextState = 'suspended';

      vi.advanceTimersByTime(5000);
      expect(mockSuspendFn).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  //  playBeep() function
  // ──────────────────────────────────────────────────────────

  describe('playBeep()', () => {
    it('should skip if sound setting is disabled', () => {
      mockSettings = { haptic: true, sound: false };
      feedback.playBeep(880, 100);
      expect(audioContextInstances).toBe(0);
    });

    it('should create oscillator with correct frequency', () => {
      feedback.playBeep(880, 100);
      expect(mockOscillator.frequency.value).toBe(880);
    });

    it('should create oscillator with custom frequency', () => {
      feedback.playBeep(440, 200);
      expect(mockOscillator.frequency.value).toBe(440);
    });

    it('should set oscillator type to sine', () => {
      feedback.playBeep(880, 100);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should connect oscillator -> gain -> destination', () => {
      feedback.playBeep(880, 100);
      expect(mockOscillator.connect).toHaveBeenCalledWith(mockGainNode);
      expect(mockGainNode.connect).toHaveBeenCalled();
    });

    it('should apply gain envelope (fade out to avoid clicks)', () => {
      feedback.playBeep(880, 100);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
      expect(
        mockGainNode.gain.exponentialRampToValueAtTime,
      ).toHaveBeenCalledWith(0.01, 0.1); // duration/1000 = 100/1000 = 0.1
    });

    it('should start and stop oscillator with correct timing', () => {
      feedback.playBeep(880, 100);
      expect(mockOscillator.start).toHaveBeenCalledWith(0);
      expect(mockOscillator.stop).toHaveBeenCalledWith(0.1);
    });

    it('should use default frequency 880 and duration 100 when not specified', () => {
      feedback.playBeep();
      expect(mockOscillator.frequency.value).toBe(880);
      expect(mockOscillator.stop).toHaveBeenCalledWith(0.1);
    });

    it('should resume suspended context before playing', () => {
      // First call creates context in running state
      feedback.playBeep(880, 100);

      // Simulate context becoming suspended
      mockAudioContextState = 'suspended';
      mockResumeFn.mockImplementation(() => {
        mockAudioContextState = 'running';
        return Promise.resolve();
      });

      feedback.playBeep(440, 200);
      expect(mockResumeFn).toHaveBeenCalled();
    });

    it('should schedule oscillator after resume resolves', async () => {
      // First call creates context
      feedback.playBeep(880, 100);
      expect(mockOscillator.frequency.value).toBe(880);

      // Simulate suspended context
      mockAudioContextState = 'suspended';

      let resolveResume!: () => void;
      mockResumeFn.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveResume = resolve;
          }),
      );

      feedback.playBeep(440, 200);

      // Before resume resolves, the oscillator frequency is still from the first call
      expect(mockOscillator.frequency.value).toBe(880);

      // Resolve resume to trigger then() callback
      resolveResume();
      await vi.runAllTimersAsync();

      // Now the second oscillator has been scheduled
      expect(mockOscillator.frequency.value).toBe(440);
    });

    it('should handle duration correctly for longer beeps', () => {
      feedback.playBeep(220, 300);
      expect(mockOscillator.stop).toHaveBeenCalledWith(0.3);
      expect(
        mockGainNode.gain.exponentialRampToValueAtTime,
      ).toHaveBeenCalledWith(0.01, 0.3);
    });
  });

  // ──────────────────────────────────────────────────────────
  //  cleanupFeedback()
  // ──────────────────────────────────────────────────────────

  describe('cleanupFeedback()', () => {
    it('should close AudioContext if it exists', () => {
      feedback.playBeep(880, 100);
      feedback.cleanupFeedback();
      expect(mockCloseFn).toHaveBeenCalledTimes(1);
    });

    it('should clear idle timeout', () => {
      feedback.playBeep(880, 100);
      feedback.cleanupFeedback();

      // After cleanup, advancing timers should NOT trigger suspend
      vi.advanceTimersByTime(10000);
      expect(mockSuspendFn).not.toHaveBeenCalled();
    });

    it('should cancel speechSynthesis if available', () => {
      const cancelFn = vi.fn();
      vi.stubGlobal('speechSynthesis', { cancel: cancelFn });

      feedback.cleanupFeedback();
      expect(cancelFn).toHaveBeenCalled();

      vi.unstubAllGlobals();
      // Re-stub navigator for remaining tests
      vi.stubGlobal('navigator', new Proxy(globalThis.navigator ?? {}, {
        get(target, prop) {
          if (prop === 'vibrate') return vibrateSpy;
          return Reflect.get(target, prop);
        },
      }));
    });

    it('should not throw if speechSynthesis is undefined', () => {
      // speechSynthesis is not defined by default in Node
      expect(() => feedback.cleanupFeedback()).not.toThrow();
    });

    it('should not throw if no AudioContext was ever created', () => {
      expect(() => feedback.cleanupFeedback()).not.toThrow();
    });

    it('should handle speechSynthesis.cancel() throwing', () => {
      vi.stubGlobal('speechSynthesis', {
        cancel: () => {
          throw new Error('Not supported');
        },
      });

      expect(() => feedback.cleanupFeedback()).not.toThrow();

      vi.unstubAllGlobals();
      vi.stubGlobal('navigator', new Proxy(globalThis.navigator ?? {}, {
        get(target, prop) {
          if (prop === 'vibrate') return vibrateSpy;
          return Reflect.get(target, prop);
        },
      }));
    });

    it('should allow a new AudioContext to be created after cleanup', async () => {
      feedback.playBeep(880, 100);
      expect(audioContextInstances).toBe(1);

      feedback.cleanupFeedback();

      // Need fresh module since module-level audioContext is now null
      vi.resetModules();
      resetAudioMocks();
      installAudioContextMock();

      const freshFeedback = await import('../../../src/services/feedback');
      freshFeedback.playBeep(880, 100);
      expect(audioContextInstances).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  //  resumeAudio()
  // ──────────────────────────────────────────────────────────

  describe('resumeAudio()', () => {
    it('should resume a suspended AudioContext', async () => {
      feedback.playBeep(880, 100);
      mockAudioContextState = 'suspended';
      await feedback.resumeAudio();
      expect(mockResumeFn).toHaveBeenCalled();
    });

    it('should not call resume if context is already running', async () => {
      feedback.playBeep(880, 100);
      // State is 'running' by default
      await feedback.resumeAudio();
      expect(mockResumeFn).not.toHaveBeenCalled();
    });

    it('should handle resume errors gracefully', async () => {
      feedback.playBeep(880, 100);
      mockAudioContextState = 'suspended';
      mockResumeFn.mockRejectedValueOnce(new Error('Resume failed'));

      await expect(feedback.resumeAudio()).resolves.not.toThrow();
    });

    it('should create AudioContext lazily if none exists', async () => {
      mockAudioContextState = 'suspended';
      await feedback.resumeAudio();
      expect(audioContextInstances).toBe(1);
      expect(mockResumeFn).toHaveBeenCalled();
    });

    it('should do nothing if AudioContext cannot be created', async () => {
      vi.resetModules();
      shouldAudioContextThrow = true;
      installAudioContextMock();
      if (typeof window !== 'undefined') {
        delete (window as unknown as Record<string, unknown>)
          .webkitAudioContext;
      }

      const freshFeedback = await import('../../../src/services/feedback');
      await expect(freshFeedback.resumeAudio()).resolves.not.toThrow();
      expect(audioContextInstances).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  //  Predefined feedback patterns
  // ──────────────────────────────────────────────────────────

  describe('predefined feedback patterns', () => {
    it('feedbackSuccess should vibrate(40) and playBeep(880, 100)', () => {
      feedback.feedbackSuccess();
      expect(vibrateSpy).toHaveBeenCalledWith(40);
      expect(mockOscillator.frequency.value).toBe(880);
    });

    it('feedbackWarning should vibrate([60, 40, 60]) and playBeep(440, 200)', () => {
      feedback.feedbackWarning();
      expect(vibrateSpy).toHaveBeenCalledWith([60, 40, 60]);
      expect(mockOscillator.frequency.value).toBe(440);
    });

    it('feedbackError should vibrate([100, 50, 100]) and playBeep(220, 300)', () => {
      feedback.feedbackError();
      expect(vibrateSpy).toHaveBeenCalledWith([100, 50, 100]);
      expect(mockOscillator.frequency.value).toBe(220);
    });

    it('feedbackTap should vibrate(30) and not play audio', () => {
      feedback.feedbackTap();
      expect(vibrateSpy).toHaveBeenCalledWith(30);
      expect(audioContextInstances).toBe(0);
    });

    it('feedbackDialTap should vibrate(10)', () => {
      feedback.feedbackDialTap();
      expect(vibrateSpy).toHaveBeenCalledWith(10);
      expect(audioContextInstances).toBe(0);
    });

    it('feedbackDialDetent should vibrate(20)', () => {
      feedback.feedbackDialDetent();
      expect(vibrateSpy).toHaveBeenCalledWith(20);
      expect(audioContextInstances).toBe(0);
    });

    it('feedbackSelect should vibrate(35)', () => {
      feedback.feedbackSelect();
      expect(vibrateSpy).toHaveBeenCalledWith(35);
      expect(audioContextInstances).toBe(0);
    });

    it('feedbackDelete should vibrate([40, 30, 40]) and playBeep(330, 150)', () => {
      feedback.feedbackDelete();
      expect(vibrateSpy).toHaveBeenCalledWith([40, 30, 40]);
      expect(mockOscillator.frequency.value).toBe(330);
    });

    it('feedbackUndo should vibrate([35, 35]) and playBeep(660, 100)', () => {
      feedback.feedbackUndo();
      expect(vibrateSpy).toHaveBeenCalledWith([35, 35]);
      expect(mockOscillator.frequency.value).toBe(660);
    });

    it('feedbackExport should vibrate(45) and playBeep(660, 150)', () => {
      feedback.feedbackExport();
      expect(vibrateSpy).toHaveBeenCalledWith(45);
      expect(mockOscillator.frequency.value).toBe(660);
    });

    it('feedbackSync should vibrate(30) and playBeep(550, 80)', () => {
      feedback.feedbackSync();
      expect(vibrateSpy).toHaveBeenCalledWith(30);
      expect(mockOscillator.frequency.value).toBe(550);
    });

    it('feedbackSuccess should scale vibration at low battery', () => {
      mockBatteryLevel = 'low';
      feedback.feedbackSuccess();
      expect(vibrateSpy).toHaveBeenCalledWith(20); // 40 * 0.5
    });

    it('feedbackWarning should scale vibration pattern at medium battery', () => {
      mockBatteryLevel = 'medium';
      feedback.feedbackWarning();
      expect(vibrateSpy).toHaveBeenCalledWith([45, 30, 45]); // [60,40,60] * 0.75
    });

    it('feedbackError should skip vibration at critical battery', () => {
      mockBatteryLevel = 'critical';
      feedback.feedbackError();
      expect(vibrateSpy).not.toHaveBeenCalled();
      // Audio should still play
      expect(mockOscillator.frequency.value).toBe(220);
    });
  });

  // ──────────────────────────────────────────────────────────
  //  Combined haptic + sound setting interactions
  // ──────────────────────────────────────────────────────────

  describe('settings interactions', () => {
    it('should skip both vibration and audio when both disabled', () => {
      mockSettings = { haptic: false, sound: false };
      feedback.feedbackSuccess();
      expect(vibrateSpy).not.toHaveBeenCalled();
      expect(audioContextInstances).toBe(0);
    });

    it('should vibrate but not play audio when only haptic enabled', () => {
      mockSettings = { haptic: true, sound: false };
      feedback.feedbackSuccess();
      expect(vibrateSpy).toHaveBeenCalledWith(40);
      expect(audioContextInstances).toBe(0);
    });

    it('should play audio but not vibrate when only sound enabled', () => {
      mockSettings = { haptic: false, sound: true };
      feedback.feedbackSuccess();
      expect(vibrateSpy).not.toHaveBeenCalled();
      expect(audioContextInstances).toBe(1);
    });
  });
});
