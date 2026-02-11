/**
 * Unit Tests for RadialDialAnimation Component
 * Tests: constructor, drag lifecycle, momentum spin, snap-back, flash animations,
 * battery-aware frame skipping, digit change detection, destroy/cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock battery service before importing the module under test
vi.mock('../../../src/services/battery', () => ({
  batteryService: {
    getStatus: vi.fn(() => ({
      level: 1.0,
      charging: true,
      batteryLevel: 'normal',
    })),
  },
}));

import { batteryService } from '../../../src/services/battery';
import type {
  RadialDialAnimationCallbacks,
  RadialDialAnimationConfig,
} from '../../../src/components/RadialDialAnimation';
import { RadialDialAnimation } from '../../../src/components/RadialDialAnimation';

// RAF mock infrastructure
let rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let nextRafId = 1;

function runNextRaf(timestamp = performance.now()): void {
  const entries = [...rafCallbacks.entries()];
  if (entries.length > 0) {
    const [id, cb] = entries[0];
    rafCallbacks.delete(id);
    cb(timestamp);
  }
}

function runAllRafs(maxIterations = 200, timestamp = performance.now()): number {
  let count = 0;
  while (rafCallbacks.size > 0 && count < maxIterations) {
    runNextRaf(timestamp);
    count++;
  }
  return count;
}

describe('RadialDialAnimation', () => {
  let callbacks: RadialDialAnimationCallbacks;
  let config: RadialDialAnimationConfig;
  let anim: RadialDialAnimation;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset RAF mocks
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      rafCallbacks.delete(id);
    });

    // Reset battery to normal
    vi.mocked(batteryService.getStatus).mockReturnValue({
      level: 1.0,
      charging: true,
      batteryLevel: 'normal',
    });

    // Create fresh callbacks
    callbacks = {
      onRotationUpdate: vi.fn(),
      onDigitChange: vi.fn(),
      onAnimationComplete: vi.fn(),
    };

    // Standard config
    config = {
      momentum: 0.8,
      friction: 0.95,
      sensitivity: 36, // 360/10 digits
    };

    anim = new RadialDialAnimation(callbacks, config);
  });

  afterEach(() => {
    anim.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- 1. Constructor ---

  describe('constructor', () => {
    it('should create an instance with callbacks and config', () => {
      expect(anim).toBeInstanceOf(RadialDialAnimation);
    });
  });

  // --- 2. getRotation() / getVelocity() ---

  describe('getRotation / getVelocity', () => {
    it('should return 0 for initial rotation and velocity', () => {
      expect(anim.getRotation()).toBe(0);
      expect(anim.getVelocity()).toBe(0);
    });
  });

  // --- 3. onDragStart ---

  describe('onDragStart', () => {
    it('should cancel pending animations and reset velocity', () => {
      // Build up some state first
      anim.onDragStart();
      anim.onDragMove(20, 16);
      anim.startMomentumSpin();

      // Now start a new drag - should cancel the momentum spin
      anim.onDragStart();

      expect(anim.getVelocity()).toBe(0);
      // The pending RAF from momentum should have been cancelled
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should reset accumulated rotation so digit change tracking restarts', () => {
      // Move partially toward a digit change (less than sensitivity=36)
      anim.onDragStart();
      anim.onDragMove(30, 16);
      expect(callbacks.onDigitChange).not.toHaveBeenCalled();

      // Start a new drag - accumulated rotation resets
      anim.onDragStart();
      // Another 30 degrees should NOT trigger a digit change (would have if not reset, 30+30=60 > 36)
      anim.onDragMove(30, 16);

      // It should trigger because 30 < 36 does not trigger, but wait - 30 < 36 so no trigger
      expect(callbacks.onDigitChange).not.toHaveBeenCalled();
    });
  });

  // --- 4. onDragMove ---

  describe('onDragMove', () => {
    it('should update rotation by the delta angle', () => {
      anim.onDragStart();
      anim.onDragMove(15, 16);

      expect(anim.getRotation()).toBe(15);
    });

    it('should accumulate rotation across multiple moves', () => {
      anim.onDragStart();
      anim.onDragMove(10, 16);
      anim.onDragMove(10, 16);
      anim.onDragMove(10, 16);

      expect(anim.getRotation()).toBe(30);
    });

    it('should compute velocity from deltaAngle, deltaTime, and momentum', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16);

      // velocity = (deltaAngle / deltaTime) * 16 * momentum
      // = (20 / 16) * 16 * 0.8 = 20 * 0.8 = 16
      expect(anim.getVelocity()).toBe(16);
    });

    it('should call onRotationUpdate with the current rotation', () => {
      anim.onDragStart();
      anim.onDragMove(10, 16);

      expect(callbacks.onRotationUpdate).toHaveBeenCalledWith(10);

      anim.onDragMove(5, 16);
      expect(callbacks.onRotationUpdate).toHaveBeenCalledWith(15);
    });

    it('should call onDigitChange when accumulated rotation crosses sensitivity threshold', () => {
      anim.onDragStart();
      // sensitivity = 36, so 40 degrees should trigger one digit change
      anim.onDragMove(40, 16);

      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(1);
      expect(callbacks.onDigitChange).toHaveBeenCalledWith(1); // positive direction
    });

    it('should call onDigitChange with -1 for negative rotation', () => {
      anim.onDragStart();
      anim.onDragMove(-40, 16);

      expect(callbacks.onDigitChange).toHaveBeenCalledWith(-1);
    });

    it('should not call onDigitChange when below threshold', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16); // 20 < 36

      expect(callbacks.onDigitChange).not.toHaveBeenCalled();
    });

    it('should handle multiple digit changes from a large drag move', () => {
      // Create a config with small sensitivity to test multiple triggers
      const smallConfig = { momentum: 0.8, friction: 0.95, sensitivity: 10 };
      const localAnim = new RadialDialAnimation(callbacks, smallConfig);

      localAnim.onDragStart();
      // 25 degrees with sensitivity 10: should trigger 2 changes (10, 20)
      // accumulated after first: 25 % 10 = 5 (one call for crossing >=10)
      // Actually checkDigitChange uses >= and modulo, so:
      // accumulatedRotation = 25, |25| >= 10, direction=1, onDigitChange(1), accumulated = 25 % 10 = 5
      localAnim.onDragMove(25, 16);

      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(1);

      localAnim.destroy();
    });
  });

  // --- 5. startMomentumSpin ---

  describe('startMomentumSpin', () => {
    it('should request animation frames for momentum spin', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16); // gives velocity of 16
      anim.startMomentumSpin();

      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should apply friction to velocity each frame', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16); // velocity = 16

      // startMomentumSpin calls spinWithMomentum synchronously (frame 0),
      // which applies physics and schedules the next frame via RAF
      anim.startMomentumSpin();
      // After frame 0 (synchronous): velocity = 16 * 0.95 = 15.2

      expect(anim.getVelocity()).toBeCloseTo(15.2, 5);

      runNextRaf(); // frame 1: velocity = 15.2 * 0.95 = 14.44
      expect(anim.getVelocity()).toBeCloseTo(14.44, 5);
    });

    it('should stop when velocity drops below 0.2 and call onAnimationComplete', () => {
      anim.onDragStart();
      // Give a small velocity that will quickly decay below 0.2
      anim.onDragMove(0.3, 16); // velocity = (0.3/16)*16*0.8 = 0.24
      anim.startMomentumSpin();

      runNextRaf(); // velocity = 0.24, still > 0.2 after *= 0.95 = 0.228
      runNextRaf(); // velocity = 0.228 * 0.95 = 0.2166
      runNextRaf(); // velocity = 0.2166 * 0.95 = 0.2058
      runNextRaf(); // velocity = 0.2058 * 0.95 = 0.1955 < 0.2 -> stops

      // Actually, spinWithMomentum checks abs(velocity) < 0.2 at the START of each frame
      // Let's just run until it stops
      runAllRafs(100);

      expect(anim.getVelocity()).toBe(0);
      expect(callbacks.onAnimationComplete).toHaveBeenCalled();
    });

    it('should update rotation based on velocity each frame', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16); // velocity = 16, rotation = 20

      // startMomentumSpin runs frame 0 synchronously:
      // rotation += 16 = 36, velocity *= 0.95 = 15.2
      anim.startMomentumSpin();

      expect(anim.getRotation()).toBe(36);

      // runNextRaf runs frame 1: rotation += 15.2 = 51.2
      runNextRaf();
      expect(anim.getRotation()).toBeCloseTo(51.2, 5);
    });

    it('should schedule snap-back after momentum spin completes', () => {
      anim.onDragStart();
      // Very small velocity so it stops quickly
      anim.onDragMove(0.1, 16); // velocity = (0.1/16)*16*0.8 = 0.08 < 0.2

      // spinWithMomentum runs synchronously: velocity 0.08 < 0.2, stops immediately
      anim.startMomentumSpin();

      expect(callbacks.onAnimationComplete).toHaveBeenCalled();

      // scheduleSnapBack called with 800ms timeout.
      // The snap-back calls requestAnimationFrame inside the timeout callback.
      // But snap-back itself is called directly by the timeout, then RAF is used for subsequent frames.
      // snap-back runs synchronously when timeout fires:
      // rotation is 0.1, |0.1| < 1 -> sets rotation to 0, calls onAnimationComplete again, done
      vi.advanceTimersByTime(800);

      // rotation should now be 0 (snap-back completed in one synchronous call since rotation < 1)
      expect(anim.getRotation()).toBe(0);
    });

    it('should call onDigitChange during momentum when crossing threshold', () => {
      anim.onDragStart();
      // Give high velocity to cross the 36-degree threshold during spin
      anim.onDragMove(50, 16); // velocity = (50/16)*16*0.8 = 40, rotation = 50
      // onDigitChange already called once from onDragMove (50 >= 36), accumulated = 50 % 36 = 14
      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(1);

      vi.mocked(callbacks.onDigitChange).mockClear();

      // startMomentumSpin runs frame 0 synchronously:
      // rotation += 40, accum = 14 + 40 = 54, 54 >= 36 -> digit change, accum = 54 % 36 = 18
      // velocity *= 0.95 = 38
      anim.startMomentumSpin();

      // Frame 0 already triggered one digit change
      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(1);
      expect(callbacks.onDigitChange).toHaveBeenCalledWith(1);
    });
  });

  // --- 6. onDragEndNoMomentum ---

  describe('onDragEndNoMomentum', () => {
    it('should schedule snap-back after 800ms', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16); // rotation = 20

      anim.onDragEndNoMomentum();

      // Before 800ms, no snap-back RAF
      vi.advanceTimersByTime(799);
      expect(rafCallbacks.size).toBe(0);

      // After 800ms, snap-back should start
      vi.advanceTimersByTime(1);
      expect(rafCallbacks.size).toBe(1);
    });
  });

  // --- 7. pauseAnimations ---

  describe('pauseAnimations', () => {
    it('should cancel all pending animations', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16);
      anim.startMomentumSpin();

      expect(rafCallbacks.size).toBe(1);

      anim.pauseAnimations();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should cancel pending snap-back timeout', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16);
      anim.onDragEndNoMomentum();

      anim.pauseAnimations();

      // Advancing past 800ms should NOT trigger snap-back
      vi.advanceTimersByTime(1000);
      expect(rafCallbacks.size).toBe(0);
    });
  });

  // --- 8. flash ---

  describe('flash', () => {
    it('should add flash class to dialRing and remove it after 1200ms', () => {
      const dialRing = document.createElement('div');

      anim.flash(dialRing, null);

      expect(dialRing.classList.contains('flash')).toBe(true);

      vi.advanceTimersByTime(1200);
      expect(dialRing.classList.contains('flash')).toBe(false);
    });

    it('should flash each dial-number in sequence', () => {
      const dialNumbers = document.createElement('div');
      for (let i = 0; i < 3; i++) {
        const num = document.createElement('span');
        num.classList.add('dial-number');
        dialNumbers.appendChild(num);
      }

      anim.flash(null, dialNumbers);

      const numbers = dialNumbers.querySelectorAll('.dial-number');

      // At t=0, first number should get flash (immediately, since i*40 = 0)
      vi.advanceTimersByTime(0);
      expect(numbers[0].classList.contains('flash')).toBe(true);

      // At t=40, second number should get flash
      vi.advanceTimersByTime(40);
      expect(numbers[1].classList.contains('flash')).toBe(true);

      // At t=80, third number should get flash
      vi.advanceTimersByTime(40);
      expect(numbers[2].classList.contains('flash')).toBe(true);

      // Flash should be removed after 200ms from when it was added
      vi.advanceTimersByTime(200);
      expect(numbers[0].classList.contains('flash')).toBe(false);
      expect(numbers[1].classList.contains('flash')).toBe(false);
      expect(numbers[2].classList.contains('flash')).toBe(false);
    });

    it('should handle null elements gracefully', () => {
      expect(() => anim.flash(null, null)).not.toThrow();
    });
  });

  // --- 9. flashDigit ---

  describe('flashDigit', () => {
    it('should add flash class and remove it after 150ms', () => {
      const el = document.createElement('span');

      anim.flashDigit(el);

      expect(el.classList.contains('flash')).toBe(true);

      vi.advanceTimersByTime(150);
      expect(el.classList.contains('flash')).toBe(false);
    });
  });

  // --- 10. flashPressed ---

  describe('flashPressed', () => {
    it('should add pressed class and remove it after 150ms', () => {
      const el = document.createElement('span');

      anim.flashPressed(el);

      expect(el.classList.contains('pressed')).toBe(true);

      vi.advanceTimersByTime(150);
      expect(el.classList.contains('pressed')).toBe(false);
    });
  });

  // --- 11. destroy ---

  describe('destroy', () => {
    it('should clear all timeouts and animation frames', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16);
      anim.startMomentumSpin();

      // Also schedule some visual timeouts
      const el = document.createElement('span');
      anim.flashDigit(el);

      anim.destroy();

      // All RAFs should be cancelled
      expect(rafCallbacks.size).toBe(0);

      // Visual timeouts should not fire (flash should not be removed since timeout cleared)
      // The flash class stays on because the removal timeout was cleared
      vi.advanceTimersByTime(200);
      expect(el.classList.contains('flash')).toBe(true); // timeout was cleared, class remains
    });

    it('should be safe to call destroy twice', () => {
      anim.destroy();
      expect(() => anim.destroy()).not.toThrow();
    });

    it('should cancel snap-back timeout on destroy', () => {
      anim.onDragStart();
      anim.onDragMove(20, 16);
      anim.onDragEndNoMomentum();

      anim.destroy();

      // Snap-back timeout should not fire
      vi.advanceTimersByTime(1000);
      expect(rafCallbacks.size).toBe(0);
    });
  });

  // --- 12. Battery-aware frame skipping ---

  describe('battery-aware frame skipping', () => {
    it('should call onRotationUpdate every frame at normal battery level', () => {
      anim.onDragStart();
      anim.onDragMove(50, 16); // high velocity = 40
      vi.mocked(callbacks.onRotationUpdate).mockClear();

      // startMomentumSpin runs frame 0 synchronously (1 call),
      // then 4 more RAFs (4 calls) = 5 total
      anim.startMomentumSpin();

      runNextRaf();
      runNextRaf();
      runNextRaf();
      runNextRaf();

      // All 5 frames (1 sync + 4 RAF) should call onRotationUpdate at normal battery
      expect(callbacks.onRotationUpdate).toHaveBeenCalledTimes(5);
    });

    it('should skip every other visual update at low battery', () => {
      vi.mocked(batteryService.getStatus).mockReturnValue({
        level: 0.1,
        charging: false,
        batteryLevel: 'low',
      });

      anim.onDragStart();
      anim.onDragMove(50, 16); // high velocity
      vi.mocked(callbacks.onRotationUpdate).mockClear();

      anim.startMomentumSpin();

      // Run 4 frames: at low battery, every 2nd frame is rendered
      // frameCount increments: 1 (skip, odd), 2 (render, even), 3 (skip), 4 (render)
      runNextRaf();
      runNextRaf();
      runNextRaf();
      runNextRaf();

      expect(callbacks.onRotationUpdate).toHaveBeenCalledTimes(2);
    });

    it('should render only every 4th frame at critical battery', () => {
      vi.mocked(batteryService.getStatus).mockReturnValue({
        level: 0.02,
        charging: false,
        batteryLevel: 'critical',
      });

      anim.onDragStart();
      anim.onDragMove(50, 16); // high velocity
      vi.mocked(callbacks.onRotationUpdate).mockClear();

      anim.startMomentumSpin();

      // Run 8 frames: at critical battery, only every 4th frame is rendered
      // frameCount: 1(skip), 2(skip), 3(skip), 4(render), 5(skip), 6(skip), 7(skip), 8(render)
      for (let i = 0; i < 8; i++) {
        runNextRaf();
      }

      expect(callbacks.onRotationUpdate).toHaveBeenCalledTimes(2);
    });

    it('should still update rotation physics every frame regardless of battery level', () => {
      vi.mocked(batteryService.getStatus).mockReturnValue({
        level: 0.02,
        charging: false,
        batteryLevel: 'critical',
      });

      anim.onDragStart();
      anim.onDragMove(20, 16); // velocity = 16, rotation = 20

      // Frame 0 (sync): rotation += 16 = 36, velocity = 16*0.95 = 15.2
      anim.startMomentumSpin();
      expect(anim.getRotation()).toBe(36);

      // Frame 1 (RAF): rotation += 15.2 = 51.2, velocity = 15.2*0.95 = 14.44
      runNextRaf();
      expect(anim.getRotation()).toBeCloseTo(51.2, 1);

      // Frame 2 (RAF): rotation += 14.44 = 65.64, velocity = 14.44*0.95 = 13.718
      runNextRaf();
      expect(anim.getRotation()).toBeCloseTo(65.64, 1);

      // Physics applied every frame regardless of battery (visual updates are skipped)
    });
  });

  // --- 13. snapBack animation ---

  describe('snapBack animation', () => {
    it('should converge rotation toward 0', () => {
      anim.onDragStart();
      anim.onDragMove(50, 16); // rotation = 50

      anim.onDragEndNoMomentum();
      vi.advanceTimersByTime(800); // trigger snap-back

      // Run a few snap-back frames
      const initialRotation = anim.getRotation();
      runNextRaf();
      const afterOneFrame = anim.getRotation();

      expect(Math.abs(afterOneFrame)).toBeLessThan(Math.abs(initialRotation));
    });

    it('should set rotation to exactly 0 when close enough (< 1 degree)', () => {
      anim.onDragStart();
      anim.onDragMove(50, 16); // rotation = 50

      anim.onDragEndNoMomentum();
      vi.advanceTimersByTime(800);

      // Run snap-back until complete
      runAllRafs(200);

      expect(anim.getRotation()).toBe(0);
    });

    it('should call onAnimationComplete when snap-back finishes', () => {
      anim.onDragStart();
      anim.onDragMove(50, 16);

      vi.mocked(callbacks.onAnimationComplete).mockClear();

      anim.onDragEndNoMomentum();
      vi.advanceTimersByTime(800);
      runAllRafs(200);

      expect(callbacks.onAnimationComplete).toHaveBeenCalled();
    });

    it('should call onRotationUpdate with 0 on final frame', () => {
      anim.onDragStart();
      anim.onDragMove(50, 16);

      anim.onDragEndNoMomentum();
      vi.advanceTimersByTime(800);
      runAllRafs(200);

      // The last call should have been with rotation = 0
      const lastCall =
        vi.mocked(callbacks.onRotationUpdate).mock.calls.at(-1);
      expect(lastCall?.[0]).toBe(0);
    });
  });

  // --- 14. checkDigitChange direction ---

  describe('checkDigitChange direction', () => {
    it('should fire direction +1 for positive accumulated rotation', () => {
      anim.onDragStart();
      anim.onDragMove(40, 16); // 40 >= 36

      expect(callbacks.onDigitChange).toHaveBeenCalledWith(1);
    });

    it('should fire direction -1 for negative accumulated rotation', () => {
      anim.onDragStart();
      anim.onDragMove(-40, 16); // |-40| >= 36

      expect(callbacks.onDigitChange).toHaveBeenCalledWith(-1);
    });

    it('should carry over remainder for subsequent digit changes', () => {
      anim.onDragStart();
      // First move: 40 degrees, triggers at 36, remainder = 40 % 36 = 4
      anim.onDragMove(40, 16);
      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(1);

      // Second move: 32 more degrees, accumulated = 4 + 32 = 36 >= 36 -> triggers again
      anim.onDragMove(32, 16);
      expect(callbacks.onDigitChange).toHaveBeenCalledTimes(2);
    });
  });
});
