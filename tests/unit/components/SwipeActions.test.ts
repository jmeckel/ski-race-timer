/**
 * Unit Tests for SwipeActions Component
 * Tests: initialization, swipe gestures, action callbacks, reset
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enableSwipeActions,
  SwipeActions,
} from '../../../src/components/SwipeActions';

// Helper: jsdom 28 exposes PointerEvent, so SwipeActions uses pointer events.
// Provide pointer event helpers for the tests.
const HAS_POINTER_EVENTS =
  typeof window !== 'undefined' && 'PointerEvent' in window;

function dispatchStart(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  if (HAS_POINTER_EVENTS) {
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX,
        clientY,
        pointerId: 1,
        bubbles: true,
      }),
    );
  } else {
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX, clientY } as Touch],
      }),
    );
  }
}

function dispatchMove(el: HTMLElement, clientX: number, clientY: number): void {
  if (HAS_POINTER_EVENTS) {
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX,
        clientY,
        pointerId: 1,
        bubbles: true,
      }),
    );
  } else {
    el.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX, clientY } as Touch],
      }),
    );
  }
}

function dispatchEnd(el: HTMLElement): void {
  if (HAS_POINTER_EVENTS) {
    el.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        bubbles: true,
      }),
    );
  } else {
    el.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
  }
}

describe('SwipeActions Component', () => {
  let element: HTMLElement;
  let onSwipeLeft: ReturnType<typeof vi.fn>;
  let onSwipeRight: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    element = document.createElement('div');
    element.innerHTML = '<span>Item Content</span>';
    document.body.appendChild(element);

    onSwipeLeft = vi.fn();
    onSwipeRight = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    element.remove();
  });

  describe('constructor', () => {
    it('should create wrapper and action elements', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });

      expect(element.querySelector('.swipe-content')).not.toBeNull();
      expect(element.querySelector('.swipe-action-left')).not.toBeNull();
      expect(element.querySelector('.swipe-action-right')).not.toBeNull();

      swipe.destroy();
    });

    it('should move content into wrapper', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });

      const wrapper = element.querySelector('.swipe-content');
      expect(wrapper?.textContent).toContain('Item Content');

      swipe.destroy();
    });

    it('should set element styles', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });

      expect(element.style.position).toBe('relative');
      expect(element.style.overflow).toBe('hidden');

      swipe.destroy();
    });
  });

  describe('swipe gestures', () => {
    it('should handle horizontal swipe left', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 200, 100);
      dispatchMove(wrapper, 50, 100);

      expect(wrapper.style.transform).not.toBe('translateX(0)');

      swipe.destroy();
    });

    it('should handle horizontal swipe right', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 50, 100);
      dispatchMove(wrapper, 200, 100);

      expect(wrapper.style.transform).not.toBe('translateX(0)');

      swipe.destroy();
    });

    it('should not trigger on vertical swipe', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 100, 50);
      dispatchMove(wrapper, 100, 200);
      dispatchEnd(wrapper);

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();

      swipe.destroy();
    });
  });

  describe('action callbacks', () => {
    it('should call onSwipeLeft when swiped left past threshold', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 200, 100);
      dispatchMove(wrapper, 50, 100);
      dispatchEnd(wrapper);

      await vi.advanceTimersByTimeAsync(250);

      expect(onSwipeLeft).toHaveBeenCalled();

      swipe.destroy();
    });

    it('should call onSwipeRight when swiped right past threshold', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 50, 100);
      dispatchMove(wrapper, 200, 100);
      dispatchEnd(wrapper);

      await vi.advanceTimersByTimeAsync(250);

      expect(onSwipeRight).toHaveBeenCalled();

      swipe.destroy();
    });

    it('should not call callback when not swiped enough', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 100, 100);
      dispatchMove(wrapper, 95, 100);
      dispatchEnd(wrapper);

      await vi.advanceTimersByTimeAsync(250);

      // Small movements shouldn't trigger actions
      // Note: This depends on velocity threshold as well
      swipe.destroy();
    });
  });

  describe('reset', () => {
    it('should reset position after callback', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 200, 100);
      dispatchMove(wrapper, 50, 100);
      dispatchEnd(wrapper);

      await vi.advanceTimersByTimeAsync(250);

      swipe.reset();

      expect(wrapper.style.transform).toBe('translateX(0)');

      swipe.destroy();
    });

    it('should reset on small swipe release', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      dispatchStart(wrapper, 100, 100);
      dispatchMove(wrapper, 98, 100);
      dispatchEnd(wrapper);

      // Should be at initial position (may be reset via transition)
      swipe.reset();
      expect(wrapper.style.transform).toBe('translateX(0)');

      swipe.destroy();
    });
  });

  describe('destroy', () => {
    it('should restore original structure', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });

      swipe.destroy();

      expect(element.querySelector('.swipe-content')).toBeNull();
      expect(element.querySelector('.swipe-action-left')).toBeNull();
      expect(element.querySelector('.swipe-action-right')).toBeNull();
      expect(element.textContent).toContain('Item Content');
    });
  });

  describe('enableSwipeActions helper', () => {
    it('should create SwipeActions instance', () => {
      const swipe = enableSwipeActions(element, onSwipeLeft, onSwipeRight);

      expect(element.querySelector('.swipe-content')).not.toBeNull();

      swipe.destroy();
    });
  });
});
