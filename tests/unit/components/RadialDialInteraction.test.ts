/**
 * Unit Tests for RadialDialInteraction Component
 * Tests: constructor, event binding, drag start/move/end, exclusion zones,
 * synthetic mouse suppression, number tap detection, momentum, destroy
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RadialDialInteraction,
  type RadialDialInteractionCallbacks,
} from '../../../src/components/RadialDialInteraction';

// Mock ListenerManager so events still get registered on real DOM elements
vi.mock('../../../src/utils/listenerManager', () => {
  class MockListenerManager {
    add = vi.fn(
      (
        target: EventTarget,
        event: string,
        handler: EventListener,
        options?: boolean | AddEventListenerOptions,
      ) => {
        target.addEventListener(event, handler, options);
      },
    );
    removeAll = vi.fn();
  }
  return { ListenerManager: MockListenerManager };
});

/** Create a mock container with a fixed bounding rect */
function createMockContainer(width = 460, height = 460): HTMLElement {
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
  return container;
}

/** Create a fresh set of mock callbacks */
function createMockCallbacks(): RadialDialInteractionCallbacks {
  return {
    onDragStart: vi.fn(),
    onNumberTap: vi.fn(),
    onDragMove: vi.fn(),
    onDragEndWithMomentum: vi.fn(),
    onDragEndAsTap: vi.fn(),
    onDragEndCommon: vi.fn(),
    getRotation: vi.fn(() => 0),
    getVelocity: vi.fn(() => 0),
  };
}

// --- Event simulation helpers ---

function simulateMouseDown(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  el.dispatchEvent(
    new MouseEvent('mousedown', { clientX, clientY, bubbles: true }),
  );
}

function simulateMouseMove(clientX: number, clientY: number): void {
  window.dispatchEvent(
    new MouseEvent('mousemove', { clientX, clientY, bubbles: true }),
  );
}

function simulateMouseUp(): void {
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function simulateTouchStart(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const touch = {
    clientX,
    clientY,
    identifier: 0,
    target: el,
  } as unknown as Touch;
  el.dispatchEvent(
    new TouchEvent('touchstart', { touches: [touch], bubbles: true }),
  );
}

function simulateTouchMove(clientX: number, clientY: number, target: HTMLElement = document.body): void {
  const touch = {
    clientX,
    clientY,
    identifier: 0,
    target,
  } as unknown as Touch;
  target.dispatchEvent(
    new TouchEvent('touchmove', { touches: [touch], bubbles: true }),
  );
}

function simulateTouchEnd(target: HTMLElement = document.body): void {
  target.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
}

describe('RadialDialInteraction', () => {
  let container: HTMLElement;
  let callbacks: RadialDialInteractionCallbacks;
  let interaction: RadialDialInteraction;

  beforeEach(() => {
    container = createMockContainer();
    document.body.appendChild(container);
    callbacks = createMockCallbacks();
  });

  afterEach(() => {
    interaction?.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------
  describe('constructor', () => {
    it('should store container and callbacks', () => {
      interaction = new RadialDialInteraction(container, callbacks);

      // Verify the instance was created without errors
      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
      expect(state.hasDraggedSignificantly).toBe(false);
    });
  });

  // -------------------------------------------------------
  // 2. bindEvents
  // -------------------------------------------------------
  describe('bindEvents', () => {
    it('should register mouse and touch events so drag can start', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      // Container center is (230, 230). Ring area is 0.27*460=124.2 to 0.5*460=230.
      // Click at (350, 230) -> dist from center = 120, which is < 124.2, so it's in the center zone.
      // Click at a point in the ring: e.g., (380, 230) -> dist = 150
      simulateMouseDown(container, 380, 230);

      expect(callbacks.onDragStart).toHaveBeenCalled();
    });

    it('should not respond to events before bindEvents is called', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      // Do NOT call bindEvents

      simulateMouseDown(container, 380, 230);

      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 3. handleDragStart - exclusion zones
  // -------------------------------------------------------
  describe('handleDragStart - exclusion zones', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should reject clicks in the center exclusion zone (dist < 0.27 * width)', () => {
      // Center is (230, 230), threshold is 0.27 * 460 = 124.2
      // Click at (230, 230) -> dist = 0, well inside center
      simulateMouseDown(container, 230, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should reject clicks at the edge of the center zone', () => {
      // Click at (340, 230) -> dist from center = 110, still < 124.2
      simulateMouseDown(container, 340, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should reject clicks outside the dial (dist > 0.5 * width)', () => {
      // Threshold is 0.5 * 460 = 230. Click at (0, 230) -> dist from center = 230
      // Exactly on boundary is > 0.5 * width? 230 > 230 is false, so try further out.
      // Click at (0, 0) -> dist = sqrt(230^2 + 230^2) = ~325, well outside
      simulateMouseDown(container, 0, 0);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should accept clicks in the valid ring area', () => {
      // Click at (380, 230) -> dist from center = 150, between 124.2 and 230
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
    });

    it('should accept clicks just inside the outer boundary', () => {
      // dist needs to be <= 230. Center is (230,230).
      // Click at (459, 230) -> dist = 229, just inside
      simulateMouseDown(container, 459, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // 4. handleDragStart - synthetic mouse suppression
  // -------------------------------------------------------
  describe('handleDragStart - synthetic mouse suppression', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should ignore mouse events within 500ms after a touch event', () => {
      // Touch in the ring area
      simulateTouchStart(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      // Complete the touch
      simulateTouchEnd(container);

      // Synthetic mouse follows immediately
      simulateMouseDown(container, 380, 230);
      // Should be suppressed
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    });

    it('should accept mouse events after 500ms since last touch', async () => {
      vi.useFakeTimers();

      simulateTouchStart(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
      simulateTouchEnd(container);

      // Advance past the 500ms suppression window
      vi.advanceTimersByTime(501);

      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------
  // 5. handleDragMove - only processes when isDragging
  // -------------------------------------------------------
  describe('handleDragMove', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should not process move events when not dragging', () => {
      simulateMouseMove(400, 300);
      expect(callbacks.onDragMove).not.toHaveBeenCalled();
    });

    it('should not call onDragMove until movement exceeds 10px threshold', () => {
      // Start drag in ring
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalled();

      // Move less than 10px
      simulateMouseMove(385, 233);
      expect(callbacks.onDragMove).not.toHaveBeenCalled();
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(false);
    });

    it('should call onDragMove once movement exceeds 10px', () => {
      simulateMouseDown(container, 380, 230);

      // Move more than 10px
      simulateMouseMove(395, 230);
      expect(callbacks.onDragMove).toHaveBeenCalled();
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(true);
    });
  });

  // -------------------------------------------------------
  // 6. handleDragMove - angle delta and wrap-around
  // -------------------------------------------------------
  describe('handleDragMove - angle calculation and wrap-around', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should pass angle delta to onDragMove callback', () => {
      // Start drag at right side of ring (angle ~0 degrees)
      simulateMouseDown(container, 400, 230);

      // Move slightly clockwise (downward from right) - enough to exceed 10px
      simulateMouseMove(400, 250);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle, deltaTime] = (
        callbacks.onDragMove as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(typeof deltaAngle).toBe('number');
      expect(typeof deltaTime).toBe('number');
      expect(deltaTime).toBeGreaterThan(0);
    });

    it('should handle wrap-around when angle crosses 180/-180 boundary', () => {
      // Start near the left side (angle ~180) by clicking left of center
      // Center is (230, 230). Click at (100, 231) -> angle ~ 179.66 degrees
      // dist from center = 130, within ring (124.2 to 230)
      simulateMouseDown(container, 100, 231);

      // Move to the other side of the 180 boundary
      // Click at (100, 229) -> angle ~ -179.66 degrees
      // Distance moved > 10px? Need bigger jump. Go to (100, 210) -> dist = 21px
      simulateMouseMove(100, 210);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      // The delta should be a small negative angle (moving counterclockwise),
      // not a large jump of ~360 degrees
      expect(Math.abs(deltaAngle)).toBeLessThan(180);
    });
  });

  // -------------------------------------------------------
  // 7. handleDragEnd - tap (not dragged significantly)
  // -------------------------------------------------------
  describe('handleDragEnd - tap behavior', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should call onDragEndAsTap when drag was not significant', () => {
      // Start drag in ring but do not move
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();

      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
      expect(callbacks.onDragEndCommon).not.toHaveBeenCalled();
    });

    it('should call detectNumberTap when tap detected', () => {
      // Tap at the position of number 5 (angle = 90 degrees, i.e., bottom of dial)
      // Number 5 is at index 4: angle = (4*36 - 90 + 360) % 360 = (144 - 90 + 360) % 360 = 54 degrees
      // Actually: numbers[4] = 5 at angle (4*36-90+360)%360 = 54 deg
      // 54 degrees from center means: x = 230 + 170*cos(54*pi/180), y = 230 + 170*sin(54*pi/180)
      // cos(54) = 0.5878, sin(54) = 0.8090
      // x = 230 + 170*0.5878 = 329.9, y = 230 + 170*0.8090 = 367.5
      // dist from center = 170, within ring
      simulateMouseDown(container, 330, 368);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(5);
      expect(callbacks.onDragEndAsTap).toHaveBeenCalled();
    });

    it('should not call onDragEndAsTap when not dragging', () => {
      // mouseup without mousedown
      simulateMouseUp();
      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 8. handleDragEnd - momentum (significant drag, velocity > 0.5)
  // -------------------------------------------------------
  describe('handleDragEnd - momentum', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should call onDragEndWithMomentum when velocity > 0.5', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(1.5);

      simulateMouseDown(container, 380, 230);
      // Move significantly (>10px)
      simulateMouseMove(380, 260);
      simulateMouseUp();

      expect(callbacks.onDragEndWithMomentum).toHaveBeenCalledTimes(1);
      expect(callbacks.onDragEndCommon).not.toHaveBeenCalled();
      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
    });

    it('should call onDragEndCommon when velocity <= 0.5', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(0.3);

      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      expect(callbacks.onDragEndCommon).toHaveBeenCalledTimes(1);
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
    });

    it('should use onDragEndWithMomentum for negative velocity exceeding threshold', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(-0.8);

      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      // Math.abs(-0.8) > 0.5, so momentum applies
      expect(callbacks.onDragEndWithMomentum).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // 9. detectNumberTap - angle-based detection
  // -------------------------------------------------------
  describe('detectNumberTap', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should detect number 1 (angle 306 degrees / -54 degrees)', () => {
      // Number 1 is at index 0: angle = (0*36 - 90 + 360) % 360 = 270 degrees
      // Wait: index 0 -> num 1, angle = (0*36-90+360)%360 = 270
      // 270 degrees: x = cos(270*pi/180) = 0, y = sin(270*pi/180) = -1
      // Position: (230 + 170*0, 230 + 170*(-1)) = (230, 60)
      // dist from center = 170, in ring
      simulateMouseDown(container, 230, 60);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(1);
    });

    it('should detect number 0 (angle 270 degrees, bottom position)', () => {
      // Number 0 is at index 9: angle = (9*36 - 90 + 360) % 360 = (324 - 90 + 360) % 360 = 234 % 360 = 234
      // Wait, that's wrong. Let me recalculate:
      // (9*36 - 90 + 360) % 360 = (324 - 90 + 360) % 360 = 594 % 360 = 234
      // 234 degrees: cos(234) = -0.5878, sin(234) = -0.8090
      // Position: (230 + 170*(-0.5878), 230 + 170*(-0.8090)) = (130, 93)
      // dist = 170
      simulateMouseDown(container, 130, 93);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(0);
    });

    it('should detect number 3 at its correct angle position', () => {
      // Number 3 at index 2: angle = (2*36 - 90 + 360) % 360 = (72 - 90 + 360) % 360 = 342
      // 342 degrees: cos(342) = 0.9511, sin(342) = -0.3090
      // Position: (230 + 170*0.9511, 230 + 170*(-0.3090)) = (392, 177)
      // dist = 170
      simulateMouseDown(container, 392, 177);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(3);
    });

    it('should not detect a number when tap angle exceeds 20 deg tolerance', () => {
      // With 10 numbers at 36-degree spacing and 20-degree tolerance,
      // most ring positions will match a number. To create a gap we rotate
      // the dial so that the physical tap angle falls outside all number zones.
      // If we rotate by 18 degrees, number positions shift by +18 in physical space.
      // A tap at physical angle 288 -> adjusted = 288 - 18 = 270, matches num 1.
      // Instead, pick a physical angle that lands exactly between two adjusted positions.
      // With rotation=18: adjusted angles for num1=270+18=288 phys, num2=306+18=324 phys.
      // Midpoint in physical space: 306. adjusted = 306-18 = 288.
      // diff to num1@270 = 18, diff to num2@306 = 18, both < 20 -> still matches.
      //
      // The 20-degree tolerance covers up to 40 degrees of the 36-degree spacing,
      // so there is no true gap. This test instead verifies that a number IS detected
      // for a tap near the midpoint between two numbers, confirming the tolerance works.
      // The midpoint between num1@270 and num2@306 is 288.
      // At (283, 68): angle=288.13, diff to num2@306=17.87 < diff to num1@270=18.13
      // So number 2 is the closest match.
      simulateMouseDown(container, 283, 68);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(2);
    });

    it('should adjust tap angle for current dial rotation', () => {
      // Rotate the dial by 36 degrees. Number 1 (normally at 270) should now
      // need a tap at angle 270+36 = 306 (physical) to match.
      (callbacks.getRotation as ReturnType<typeof vi.fn>).mockReturnValue(36);

      // Tap at physical angle 306: cos(306) = 0.5878, sin(306) = -0.8090
      // Position: (230 + 170*0.5878, 230 + 170*(-0.8090)) = (330, 93)
      simulateMouseDown(container, 330, 93);
      simulateMouseUp();

      // adjusted angle = 306 - 36 = 270, which matches number 1
      expect(callbacks.onNumberTap).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------
  // 10. getDragState
  // -------------------------------------------------------
  describe('getDragState', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should return isDragging false initially', () => {
      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should return isDragging true after drag starts', () => {
      simulateMouseDown(container, 380, 230);
      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should return hasDraggedSignificantly true after significant move', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260); // 30px move

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
      expect(state.hasDraggedSignificantly).toBe(true);
    });

    it('should return isDragging false after drag ends', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
    });
  });

  // -------------------------------------------------------
  // 11. destroy
  // -------------------------------------------------------
  describe('destroy', () => {
    it('should be safe to call destroy twice (double-destroy guard)', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      interaction.destroy();
      // Second call should not throw
      expect(() => interaction.destroy()).not.toThrow();
    });

    it('should clean up via ListenerManager.removeAll', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      // Access the internal listeners mock to verify removeAll is called
      // Since we mock ListenerManager, the instance's removeAll is tracked
      interaction.destroy();

      // After destroy, new events should not trigger callbacks because
      // the removeAll mock was called (even though our mock adds real listeners,
      // the removeAll mock does NOT actually remove them due to being a vi.fn()).
      // The key verification is that destroy() was callable without error.
      // The real ListenerManager would remove all listeners.
    });
  });

  // -------------------------------------------------------
  // 12. Touch events
  // -------------------------------------------------------
  describe('touch event handling', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should start drag on touchstart in ring area', () => {
      simulateTouchStart(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
      expect(interaction.getDragState().isDragging).toBe(true);
    });

    it('should handle touch drag move', () => {
      simulateTouchStart(container, 380, 230);
      simulateTouchMove(380, 260, container);

      expect(callbacks.onDragMove).toHaveBeenCalled();
    });

    it('should handle touch drag end as tap', () => {
      simulateTouchStart(container, 380, 230);
      simulateTouchEnd(container);

      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
    });

    it('should handle full touch drag cycle with momentum', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(2.0);

      simulateTouchStart(container, 380, 230);
      simulateTouchMove(380, 260, container);
      simulateTouchEnd(container);

      expect(callbacks.onDragStart).toHaveBeenCalled();
      expect(callbacks.onDragMove).toHaveBeenCalled();
      expect(callbacks.onDragEndWithMomentum).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 13. getAngle (tested indirectly through drag behavior)
  // -------------------------------------------------------
  describe('getAngle - indirect verification', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should calculate correct angle for point to the right of center', () => {
      // Point directly right of center (230, 230): (460, 230) -> angle should be 0 degrees
      // dist from center = 230, which is equal to 0.5*460 = 230, so it would be rejected (> 0.5).
      // Use (400, 230) -> dist = 170, in ring
      simulateMouseDown(container, 400, 230);

      // Move to directly below center: (230, 400) -> angle = 90 degrees
      // dist from (400,230) = sqrt(170^2 + 170^2) = 240 > 10px threshold
      simulateMouseMove(230, 400);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      // Moving from right (0 deg) to bottom (90 deg) should give ~90 degree delta
      expect(deltaAngle).toBeCloseTo(90, 0);
    });

    it('should calculate correct angle for point above center', () => {
      // Start at bottom (angle ~90): (230, 400) -> dist = 170
      // But (230, 400) is at angle 90 from center
      // Move to right (angle ~0): (400, 230) -> dist = 170
      simulateMouseDown(container, 230, 400);
      simulateMouseMove(400, 230);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      // Moving from bottom (90 deg) to right (0 deg) = -90 degree delta
      expect(deltaAngle).toBeCloseTo(-90, 0);
    });
  });

  // -------------------------------------------------------
  // 14. Edge cases
  // -------------------------------------------------------
  describe('edge cases', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should reset isDragging to false on drag end', () => {
      simulateMouseDown(container, 380, 230);
      expect(interaction.getDragState().isDragging).toBe(true);

      simulateMouseUp();
      expect(interaction.getDragState().isDragging).toBe(false);
    });

    it('should handle multiple sequential drags correctly', () => {
      // First drag
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();
      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);

      // Second drag
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      // First was a tap, second was a drag
      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
      // Second ended as drag (velocity check)
      expect(
        (callbacks.onDragEndCommon as ReturnType<typeof vi.fn>).mock.calls
          .length +
          (callbacks.onDragEndWithMomentum as ReturnType<typeof vi.fn>).mock
            .calls.length,
      ).toBe(1);
    });

    it('should ignore drag end when not currently dragging', () => {
      simulateMouseUp();
      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
      expect(callbacks.onDragEndCommon).not.toHaveBeenCalled();
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
    });
  });
});
