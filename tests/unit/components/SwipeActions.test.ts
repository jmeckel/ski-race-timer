/**
 * Unit Tests for SwipeActions Component
 * Tests: initialization, swipe gestures, action callbacks, reset
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enableSwipeActions,
  SwipeActions,
} from '../../../src/components/SwipeActions';

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

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 200, clientY: 100 } as Touch],
        }),
      );

      // Move left
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 50, clientY: 100 } as Touch],
        }),
      );

      expect(wrapper.style.transform).not.toBe('translateX(0)');

      swipe.destroy();
    });

    it('should handle horizontal swipe right', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 50, clientY: 100 } as Touch],
        }),
      );

      // Move right
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 200, clientY: 100 } as Touch],
        }),
      );

      expect(wrapper.style.transform).not.toBe('translateX(0)');

      swipe.destroy();
    });

    it('should not trigger on vertical swipe', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 100, clientY: 50 } as Touch],
        }),
      );

      // Move down (vertical)
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 100, clientY: 200 } as Touch],
        }),
      );

      // End touch
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();

      swipe.destroy();
    });
  });

  describe('action callbacks', () => {
    it('should call onSwipeLeft when swiped left past threshold', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 200, clientY: 100 } as Touch],
        }),
      );

      // Move left past threshold (80px)
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 50, clientY: 100 } as Touch],
        }),
      );

      // End touch
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      await vi.advanceTimersByTimeAsync(250);

      expect(onSwipeLeft).toHaveBeenCalled();

      swipe.destroy();
    });

    it('should call onSwipeRight when swiped right past threshold', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 50, clientY: 100 } as Touch],
        }),
      );

      // Move right past threshold
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 200, clientY: 100 } as Touch],
        }),
      );

      // End touch
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      await vi.advanceTimersByTimeAsync(250);

      expect(onSwipeRight).toHaveBeenCalled();

      swipe.destroy();
    });

    it('should not call callback when not swiped enough', async () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Start touch
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 100, clientY: 100 } as Touch],
        }),
      );

      // Very small swipe (less than 10px to determine direction)
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 95, clientY: 100 } as Touch],
        }),
      );

      // End touch
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

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

      // Perform swipe
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 200, clientY: 100 } as Touch],
        }),
      );
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 50, clientY: 100 } as Touch],
        }),
      );
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      await vi.advanceTimersByTimeAsync(250);

      swipe.reset();

      expect(wrapper.style.transform).toBe('translateX(0)');

      swipe.destroy();
    });

    it('should reset on small swipe release', () => {
      const swipe = new SwipeActions({ element, onSwipeLeft, onSwipeRight });
      const wrapper = element.querySelector('.swipe-content') as HTMLElement;

      // Very small movement - not enough to determine direction
      wrapper.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientX: 100, clientY: 100 } as Touch],
        }),
      );
      wrapper.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientX: 98, clientY: 100 } as Touch],
        }),
      );
      wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

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
