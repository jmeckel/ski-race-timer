/**
 * Unit Tests for RadialDialInteraction Component
 * Tests: constructor, event binding, drag start/move/end, exclusion zones,
 * synthetic mouse suppression, number tap detection, momentum, destroy,
 * touch events, multi-touch, preventDefault, drag state machine, edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RadialDialInteraction,
  type RadialDialInteractionCallbacks,
} from '../../../src/components/RadialDialInteraction';

// Mock ListenerManager — tracks add/removeAll calls while also registering real DOM listeners
vi.mock('../../../src/utils/listenerManager', () => {
  class MockListenerManager {
    private tracked: Array<
      [EventTarget, string, EventListener, boolean | AddEventListenerOptions | undefined]
    > = [];

    add = vi.fn(
      (
        target: EventTarget,
        event: string,
        handler: EventListener,
        options?: boolean | AddEventListenerOptions,
      ) => {
        target.addEventListener(event, handler, options);
        this.tracked.push([target, event, handler, options]);
      },
    );

    removeAll = vi.fn(() => {
      for (const [target, event, handler, options] of this.tracked) {
        target.removeEventListener(event, handler, options);
      }
      this.tracked = [];
    });
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

function simulateTouchMove(
  clientX: number,
  clientY: number,
  target: HTMLElement = document.body,
): void {
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

/**
 * Helper: calculate the (x, y) position for a number on the dial.
 * Numbers are arranged at indices 0-9 mapping to digits 1,2,...,9,0.
 * Each number is at angle = (index * 36 - 90) degrees from center.
 * Uses a radius of 170px from the center of a 460px container.
 */
function numberPosition(
  digitIndex: number,
  radius = 170,
  center = 230,
): { x: number; y: number } {
  const angleDeg = (digitIndex * 36 - 90 + 360) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleRad),
    y: center + radius * Math.sin(angleRad),
  };
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
    vi.useRealTimers();
  });

  // -------------------------------------------------------
  // 1. Constructor & Setup
  // -------------------------------------------------------
  describe('constructor & setup', () => {
    it('should create instance with container and callbacks', () => {
      interaction = new RadialDialInteraction(container, callbacks);

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should attach mouse and touch listeners via bindEvents', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      // Verify listeners are active by triggering a valid ring click
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalled();
    });

    it('should not respond to events before bindEvents is called', () => {
      interaction = new RadialDialInteraction(container, callbacks);

      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should remove all listeners via destroy', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      interaction.destroy();

      // After destroy with real removal, events should not trigger callbacks
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 2. Touch Events
  // -------------------------------------------------------
  describe('touch events', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should start drag on touchstart in ring area', () => {
      simulateTouchStart(container, 380, 230);

      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
      expect(interaction.getDragState().isDragging).toBe(true);
    });

    it('should reject touchstart in center exclusion zone', () => {
      // Center is (230, 230), exclusion zone < 0.27 * 460 = 124.2
      simulateTouchStart(container, 230, 230);

      expect(callbacks.onDragStart).not.toHaveBeenCalled();
      expect(interaction.getDragState().isDragging).toBe(false);
    });

    it('should handle touchmove updating drag with angle delta', () => {
      simulateTouchStart(container, 380, 230);
      // Move > 10px to exceed threshold
      simulateTouchMove(380, 260, container);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(true);
    });

    it('should fire onNumberTap on touchend with minimal movement', () => {
      // Tap at number 1 position (index 0, angle 270 degrees -> top of dial)
      const pos = numberPosition(0);
      simulateTouchStart(container, pos.x, pos.y);
      simulateTouchEnd(container);

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(1);
      expect(callbacks.onDragEndAsTap).toHaveBeenCalled();
    });

    it('should fire onDragEndWithMomentum on touchend after significant drag', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(2.0);

      simulateTouchStart(container, 380, 230);
      simulateTouchMove(380, 260, container);
      simulateTouchEnd(container);

      expect(callbacks.onDragStart).toHaveBeenCalled();
      expect(callbacks.onDragMove).toHaveBeenCalled();
      expect(callbacks.onDragEndWithMomentum).toHaveBeenCalled();
    });

    it('should set lastTouchTime to suppress subsequent synthetic mouse events', () => {
      simulateTouchStart(container, 380, 230);
      simulateTouchEnd(container);

      // Immediate mouse event should be suppressed
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1); // only touch
    });
  });

  // -------------------------------------------------------
  // 3. Mouse Events
  // -------------------------------------------------------
  describe('mouse events', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should initiate drag on mousedown in ring area', () => {
      simulateMouseDown(container, 380, 230);

      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
      expect(interaction.getDragState().isDragging).toBe(true);
    });

    it('should call onDragMove during mousemove after significant movement', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(395, 230); // > 10px horizontal

      expect(callbacks.onDragMove).toHaveBeenCalled();
    });

    it('should end drag on mouseup', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();

      expect(interaction.getDragState().isDragging).toBe(false);
    });

    it('should suppress mouse events within 500ms after touch (synthetic event guard)', () => {
      vi.useFakeTimers();

      simulateTouchStart(container, 380, 230);
      simulateTouchEnd(container);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      // Synthetic mouse arrives within 500ms
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      // After 500ms, mouse events accepted again
      vi.advanceTimersByTime(501);
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(2);
    });

    it('should not suppress mouse events that arrive at exactly 500ms', () => {
      vi.useFakeTimers();

      simulateTouchStart(container, 380, 230);
      simulateTouchEnd(container);

      // At exactly 500ms: Date.now() - lastTouchTime = 500, which is NOT < 500
      vi.advanceTimersByTime(500);
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------
  // 4. Number Tap Detection
  // -------------------------------------------------------
  describe('number tap detection', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should detect number 1 at top of dial (index 0, angle 270)', () => {
      const pos = numberPosition(0);
      simulateMouseDown(container, pos.x, pos.y);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(1);
    });

    it('should detect number 5 at the right-bottom of dial (index 4, angle 54)', () => {
      const pos = numberPosition(4);
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(5);
    });

    it('should detect number 6 (index 5, angle 90 - bottom)', () => {
      const pos = numberPosition(5);
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(6);
    });

    it('should detect number 0 at left-bottom of dial (index 9, angle 234)', () => {
      const pos = numberPosition(9);
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(0);
    });

    it('should detect number 3 at its correct angle position (index 2)', () => {
      const pos = numberPosition(2);
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(3);
    });

    it('should detect number 8 (index 7, angle 162)', () => {
      const pos = numberPosition(7);
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(8);
    });

    it('should adjust tap angle for current dial rotation', () => {
      // Rotate dial by 36 degrees. Number 1 (normally at 270) requires tap at 270+36 = 306 physical.
      (callbacks.getRotation as ReturnType<typeof vi.fn>).mockReturnValue(36);

      // Physical angle 306: cos(306) = 0.5878, sin(306) = -0.8090
      const angleRad = (306 * Math.PI) / 180;
      const x = 230 + 170 * Math.cos(angleRad);
      const y = 230 + 170 * Math.sin(angleRad);
      simulateMouseDown(container, Math.round(x), Math.round(y));
      simulateMouseUp();

      // adjusted angle = 306 - 36 = 270, which matches number 1
      expect(callbacks.onNumberTap).toHaveBeenCalledWith(1);
    });

    it('should detect a number near midpoint between two numbers (20deg tolerance)', () => {
      // The 20-degree tolerance covers the full 36-degree spacing between numbers.
      // Midpoint between num1@270 and num2@306 is 288. Closest is num2 at diff=18.
      // Physical (283, 68) is near angle 288 from center.
      simulateMouseDown(container, 283, 68);
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(2);
    });

    it('should use numbers positioned at radius = containerSize * 0.38', () => {
      // The tap detection works within the ring (0.27w to 0.5w from center).
      // Numbers are rendered at 0.38w radius. A tap at exactly that radius should work.
      // radius = 0.38 * 460 = 174.8, tap at number 6 position (angle 90, bottom)
      const radius = 0.38 * 460;
      const x = 230 + radius * Math.cos(Math.PI / 2);
      const y = 230 + radius * Math.sin(Math.PI / 2);
      simulateMouseDown(container, Math.round(x), Math.round(y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(6);
    });
  });

  // -------------------------------------------------------
  // 5. Center Exclusion Zone
  // -------------------------------------------------------
  describe('center exclusion zone', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should reject mouse click at dead center (dist = 0)', () => {
      simulateMouseDown(container, 230, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should reject mouse click at edge of center zone (dist < 0.27 * 460 = 124.2)', () => {
      // Click at (340, 230) -> dist from center = 110
      simulateMouseDown(container, 340, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should reject touch at dead center', () => {
      simulateTouchStart(container, 230, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should reject events outside the dial (dist > 0.5 * width)', () => {
      // Click at (0, 0) -> dist = sqrt(230^2 + 230^2) = ~325
      simulateMouseDown(container, 0, 0);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should accept click just outside center zone (dist > 124.2)', () => {
      // Click at (356, 230) -> dist from center = 126 > 124.2
      simulateMouseDown(container, 356, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    });

    it('should accept click just inside outer boundary', () => {
      // Click at (459, 230) -> dist = 229 < 230
      simulateMouseDown(container, 459, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // 6. Drag State Machine
  // -------------------------------------------------------
  describe('drag state machine', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should be in initial state (not dragging) before any interaction', () => {
      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should transition to isDragging after drag start', () => {
      simulateMouseDown(container, 380, 230);
      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should transition to hasDraggedSignificantly after > 10px movement', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260); // 30px vertical move

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
      expect(state.hasDraggedSignificantly).toBe(true);
    });

    it('should not transition to hasDraggedSignificantly with < 10px movement', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(385, 233); // ~6px move

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(true);
      expect(state.hasDraggedSignificantly).toBe(false);
    });

    it('should reset to initial state after drag end', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      const state = interaction.getDragState();
      expect(state.isDragging).toBe(false);
    });

    it('should reset hasDraggedSignificantly between separate drags', () => {
      // First drag with significant movement
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(true);
      simulateMouseUp();

      // Second drag without significant movement
      simulateMouseDown(container, 380, 230);
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(false);
      simulateMouseUp();

      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // 7. handleDragMove - angle calculation and wrap-around
  // -------------------------------------------------------
  describe('handleDragMove - angle calculation', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should pass deltaAngle and deltaTime to onDragMove callback', () => {
      simulateMouseDown(container, 400, 230);
      simulateMouseMove(400, 250); // > 10px to exceed threshold

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle, deltaTime] = (
        callbacks.onDragMove as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(typeof deltaAngle).toBe('number');
      expect(typeof deltaTime).toBe('number');
      expect(deltaTime).toBeGreaterThan(0);
    });

    it('should handle wrap-around when angle crosses 180/-180 boundary', () => {
      // Start near the left side (angle ~180)
      // Center is (230, 230). Click at (100, 231) -> dist = 130, in ring
      simulateMouseDown(container, 100, 231);

      // Move across the boundary: (100, 210) -> dist from start = 21px > 10px
      simulateMouseMove(100, 210);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      // Should be a small angle, not a ~360 degree jump
      expect(Math.abs(deltaAngle)).toBeLessThan(180);
    });

    it('should calculate ~90 degree delta moving from right to bottom', () => {
      // Start at right (angle 0): (400, 230) -> dist = 170
      simulateMouseDown(container, 400, 230);
      // Move to bottom (angle 90): (230, 400)
      simulateMouseMove(230, 400);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(deltaAngle).toBeCloseTo(90, 0);
    });

    it('should calculate ~-90 degree delta moving from bottom to right', () => {
      simulateMouseDown(container, 230, 400);
      simulateMouseMove(400, 230);

      expect(callbacks.onDragMove).toHaveBeenCalled();
      const [deltaAngle] = (callbacks.onDragMove as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(deltaAngle).toBeCloseTo(-90, 0);
    });

    it('should call preventDefault on the move event when movement is significant', () => {
      simulateMouseDown(container, 380, 230);

      // Create a mousemove event we can spy on
      const moveEvent = new MouseEvent('mousemove', {
        clientX: 395,
        clientY: 230,
        bubbles: true,
      });
      const preventSpy = vi.spyOn(moveEvent, 'preventDefault');
      window.dispatchEvent(moveEvent);

      expect(preventSpy).toHaveBeenCalled();
    });

    it('should not call preventDefault when movement is below threshold', () => {
      simulateMouseDown(container, 380, 230);

      const moveEvent = new MouseEvent('mousemove', {
        clientX: 383,
        clientY: 231,
        bubbles: true,
      });
      const preventSpy = vi.spyOn(moveEvent, 'preventDefault');
      window.dispatchEvent(moveEvent);

      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 8. handleDragEnd - tap vs momentum vs common
  // -------------------------------------------------------
  describe('handleDragEnd', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should call onDragEndAsTap when drag was not significant', () => {
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();

      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
      expect(callbacks.onDragEndCommon).not.toHaveBeenCalled();
    });

    it('should call onDragEndWithMomentum when velocity > 0.5', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(1.5);

      simulateMouseDown(container, 380, 230);
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

    it('should use momentum for negative velocity exceeding threshold', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(
        -0.8,
      );

      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      // Math.abs(-0.8) > 0.5
      expect(callbacks.onDragEndWithMomentum).toHaveBeenCalledTimes(1);
    });

    it('should call onDragEndCommon at exactly velocity = 0.5', () => {
      (callbacks.getVelocity as ReturnType<typeof vi.fn>).mockReturnValue(0.5);

      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      // 0.5 > 0.5 is false, so onDragEndCommon
      expect(callbacks.onDragEndCommon).toHaveBeenCalledTimes(1);
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
    });

    it('should not fire any end callback when not dragging', () => {
      simulateMouseUp();

      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
      expect(callbacks.onDragEndCommon).not.toHaveBeenCalled();
      expect(callbacks.onDragEndWithMomentum).not.toHaveBeenCalled();
    });

    it('should call detectNumberTap on tap and then onDragEndAsTap', () => {
      const pos = numberPosition(4); // number 5
      simulateMouseDown(container, Math.round(pos.x), Math.round(pos.y));
      simulateMouseUp();

      expect(callbacks.onNumberTap).toHaveBeenCalledWith(5);
      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // 9. Destroy
  // -------------------------------------------------------
  describe('destroy', () => {
    it('should be safe to call destroy twice (double-destroy guard)', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      interaction.destroy();
      expect(() => interaction.destroy()).not.toThrow();
    });

    it('should stop responding to events after destroy', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      interaction.destroy();

      // Events after destroy should be ignored
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();

      simulateTouchStart(container, 380, 230);
      expect(callbacks.onDragStart).not.toHaveBeenCalled();
    });

    it('should stop responding to mousemove/mouseup on window after destroy', () => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();

      // Start a drag, then destroy mid-drag
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      interaction.destroy();

      // These should not trigger callbacks
      simulateMouseMove(380, 260);
      expect(callbacks.onDragMove).not.toHaveBeenCalled();

      simulateMouseUp();
      expect(callbacks.onDragEndAsTap).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 10. Edge Cases
  // -------------------------------------------------------
  describe('edge cases', () => {
    beforeEach(() => {
      interaction = new RadialDialInteraction(container, callbacks);
      interaction.bindEvents();
    });

    it('should handle multiple sequential drags correctly', () => {
      // First drag (tap)
      simulateMouseDown(container, 380, 230);
      simulateMouseUp();
      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);

      // Second drag (significant movement)
      simulateMouseDown(container, 380, 230);
      simulateMouseMove(380, 260);
      simulateMouseUp();

      expect(callbacks.onDragEndAsTap).toHaveBeenCalledTimes(1);
      expect(
        (callbacks.onDragEndCommon as ReturnType<typeof vi.fn>).mock.calls
          .length +
          (callbacks.onDragEndWithMomentum as ReturnType<typeof vi.fn>).mock
            .calls.length,
      ).toBe(1);
    });

    it('should handle rapid touch-then-mouse sequence (synthetic event suppression)', () => {
      vi.useFakeTimers();

      // Quick touch
      simulateTouchStart(container, 380, 230);
      simulateTouchEnd(container);

      // Synthetic mouse at 100ms - suppressed
      vi.advanceTimersByTime(100);
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      // Second synthetic at 400ms - still suppressed
      vi.advanceTimersByTime(300);
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

      // After 500ms total - accepted
      vi.advanceTimersByTime(101);
      simulateMouseDown(container, 380, 230);
      expect(callbacks.onDragStart).toHaveBeenCalledTimes(2);
    });

    it('should ignore mousemove when not dragging', () => {
      simulateMouseMove(400, 300);
      expect(callbacks.onDragMove).not.toHaveBeenCalled();
    });

    it('should handle container with non-square dimensions', () => {
      container.remove();
      const rectContainer = createMockContainer(400, 300);
      document.body.appendChild(rectContainer);

      const rectCallbacks = createMockCallbacks();
      const rectInteraction = new RadialDialInteraction(
        rectContainer,
        rectCallbacks,
      );
      rectInteraction.bindEvents();

      // Center is (200, 150). Ring area: 0.27*400=108 to 0.5*400=200
      // Click at (330, 150) -> dist = 130, within ring
      simulateMouseDown(rectContainer, 330, 150);
      expect(rectCallbacks.onDragStart).toHaveBeenCalledTimes(1);

      rectInteraction.destroy();
      rectContainer.remove();
    });

    it('should handle container positioned with offset (non-zero left/top)', () => {
      container.remove();
      const offsetContainer = document.createElement('div');
      vi.spyOn(offsetContainer, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 50,
        right: 560,
        bottom: 510,
        width: 460,
        height: 460,
        x: 100,
        y: 50,
        toJSON: () => {},
      });
      document.body.appendChild(offsetContainer);

      const offsetCallbacks = createMockCallbacks();
      const offsetInteraction = new RadialDialInteraction(
        offsetContainer,
        offsetCallbacks,
      );
      offsetInteraction.bindEvents();

      // Center is (100+230, 50+230) = (330, 280)
      // Ring area: dist from center between 124.2 and 230
      // Click at (480, 280) -> dist from center = 150, within ring
      simulateMouseDown(offsetContainer, 480, 280);
      expect(offsetCallbacks.onDragStart).toHaveBeenCalledTimes(1);

      offsetInteraction.destroy();
      offsetContainer.remove();
    });

    it('should not move to drag state with exactly 10px movement', () => {
      simulateMouseDown(container, 380, 230);
      // Move exactly 10px horizontally
      simulateMouseMove(390, 230);

      // 10px is exactly the threshold: moveDistance > 10 is false for 10
      expect(interaction.getDragState().hasDraggedSignificantly).toBe(false);
      expect(callbacks.onDragMove).not.toHaveBeenCalled();
    });

    it('should transition to significant drag at just over 10px', () => {
      simulateMouseDown(container, 380, 230);
      // Move 11px
      simulateMouseMove(391, 230);

      expect(interaction.getDragState().hasDraggedSignificantly).toBe(true);
      expect(callbacks.onDragMove).toHaveBeenCalled();
    });

    it('should handle getDragState returning a snapshot, not a live reference', () => {
      const stateBefore = interaction.getDragState();
      simulateMouseDown(container, 380, 230);
      const stateAfter = interaction.getDragState();

      // stateBefore should not have been mutated
      expect(stateBefore.isDragging).toBe(false);
      expect(stateAfter.isDragging).toBe(true);
    });
  });
});
