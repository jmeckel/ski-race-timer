/**
 * Unit Tests for PullToRefresh Component
 * Tests: initialization, pull gesture, refresh callback, reset
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PullToRefresh } from '../../../src/components/PullToRefresh';

describe('PullToRefresh Component', () => {
  let container: HTMLElement;
  let scrollableParent: HTMLElement;
  let onRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create scrollable parent
    scrollableParent = document.createElement('div');
    scrollableParent.style.overflowY = 'auto';
    scrollableParent.style.height = '500px';
    document.body.appendChild(scrollableParent);

    // Create container
    container = document.createElement('div');
    container.style.height = '1000px';
    scrollableParent.appendChild(container);

    onRefresh = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    scrollableParent.remove();
  });

  describe('constructor', () => {
    it('should create pull indicator', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      expect(container.querySelector('.pull-indicator')).not.toBeNull();

      ptr.destroy();
    });

    it('should insert indicator as first child', () => {
      container.innerHTML = '<div>Content</div>';
      const ptr = new PullToRefresh({ container, onRefresh });

      expect(container.firstChild).toBe(container.querySelector('.pull-indicator'));

      ptr.destroy();
    });
  });

  describe('pull gesture', () => {
    it('should handle touch start', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch]
      });

      container.dispatchEvent(touchStart);

      // No error should be thrown
      ptr.destroy();
    });

    it('should update indicator on pull', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      scrollableParent.scrollTop = 0;

      // Start touch
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch]
      }));

      // Move down
      container.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 200 } as Touch]
      }));

      const indicator = container.querySelector('.pull-indicator') as HTMLElement;
      expect(indicator.style.transform).not.toBe('translateY(0)');

      ptr.destroy();
    });

    it('should not trigger when scrolled down', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      scrollableParent.scrollTop = 100;

      // Start touch
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch]
      }));

      // Move down
      container.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 200 } as Touch]
      }));

      const indicator = container.querySelector('.pull-indicator') as HTMLElement;
      // Indicator should not have moved or should be at initial position
      // Initial position is empty string or translateY(0px) or translateY(0)
      expect(['', 'translateY(0)', 'translateY(0px)']).toContain(indicator.style.transform);

      ptr.destroy();
    });
  });

  describe('refresh trigger', () => {
    it('should trigger refresh when pulled past threshold', async () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      scrollableParent.scrollTop = 0;

      // Start touch
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 0 } as Touch]
      }));

      // Pull down past threshold (80px * resistance 2.5 = 200px)
      container.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 250 } as Touch]
      }));

      // Release
      container.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      await vi.advanceTimersByTimeAsync(100);

      expect(onRefresh).toHaveBeenCalled();

      ptr.destroy();
    });

    it('should not trigger refresh when not pulled enough', async () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      scrollableParent.scrollTop = 0;

      // Start touch
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 0 } as Touch]
      }));

      // Small pull
      container.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 50 } as Touch]
      }));

      // Release
      container.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      await vi.advanceTimersByTimeAsync(100);

      expect(onRefresh).not.toHaveBeenCalled();

      ptr.destroy();
    });
  });

  describe('indicator text', () => {
    it('should show pull message initially', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      const text = container.querySelector('.pull-text');
      // Store defaults to German - check for localized text
      expect(text?.textContent).toBe('Zum Aktualisieren ziehen');

      ptr.destroy();
    });

    it('should show release message when pulled enough', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      scrollableParent.scrollTop = 0;

      // Start touch
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 0 } as Touch]
      }));

      // Pull down past threshold
      container.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 250 } as Touch]
      }));

      const text = container.querySelector('.pull-text');
      // Store defaults to German - check for localized text
      expect(text?.textContent).toBe('Loslassen zum Aktualisieren');

      ptr.destroy();
    });
  });

  describe('destroy', () => {
    it('should remove indicator', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      ptr.destroy();

      expect(container.querySelector('.pull-indicator')).toBeNull();
    });

    it('should remove event listeners', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      ptr.destroy();

      // Trigger events - should not cause errors
      container.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch]
      }));
      container.dispatchEvent(new TouchEvent('touchend', { touches: [] }));

      expect(onRefresh).not.toHaveBeenCalled();
    });
  });
});
