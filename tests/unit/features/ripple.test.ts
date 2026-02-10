/**
 * Unit Tests for Ripple Effect Feature Module
 * Tests: createRipple, initRippleEffects, cleanupRippleEffects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createRipple,
  initRippleEffects,
  cleanupRippleEffects,
} from '../../../src/features/ripple';

describe('Ripple Feature Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  describe('createRipple', () => {
    it('should create a ripple span element in the target', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      // Mock getBoundingClientRect
      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', {
        clientX: 50,
        clientY: 25,
      });

      createRipple(event, element);

      const ripple = element.querySelector('.ripple');
      expect(ripple).not.toBeNull();
      expect(ripple?.tagName).toBe('SPAN');
    });

    it('should set ripple size based on element dimensions', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', {
        clientX: 50,
        clientY: 25,
      });

      createRipple(event, element);

      const ripple = element.querySelector('.ripple') as HTMLElement;
      // Size should be Math.max(100, 50) * 2 = 200
      expect(ripple.style.width).toBe('200px');
      expect(ripple.style.height).toBe('200px');
    });

    it('should position ripple centered on click point', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
        right: 110,
        bottom: 70,
        x: 10,
        y: 20,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', {
        clientX: 60, // 60 - 10 = 50 relative x
        clientY: 45, // 45 - 20 = 25 relative y
      });

      createRipple(event, element);

      const ripple = element.querySelector('.ripple') as HTMLElement;
      // Size = max(100, 50) * 2 = 200
      // left = x - size/2 = 50 - 100 = -50
      // top = y - size/2 = 25 - 100 = -75
      expect(ripple.style.left).toBe('-50px');
      expect(ripple.style.top).toBe('-75px');
    });

    it('should add variant class when provided', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element, 'primary');

      const ripple = element.querySelector('.ripple');
      expect(ripple?.classList.contains('ripple-primary')).toBe(true);
    });

    it('should add success variant class', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element, 'success');

      const ripple = element.querySelector('.ripple');
      expect(ripple?.classList.contains('ripple-success')).toBe(true);
    });

    it('should add secondary variant class', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element, 'secondary');

      const ripple = element.querySelector('.ripple');
      expect(ripple?.classList.contains('ripple-secondary')).toBe(true);
    });

    it('should not add variant class when not provided', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element);

      const ripple = element.querySelector('.ripple');
      expect(ripple?.classList.contains('ripple-primary')).toBe(false);
      expect(ripple?.classList.contains('ripple-success')).toBe(false);
      expect(ripple?.classList.contains('ripple-secondary')).toBe(false);
    });

    it('should remove ripple after 500ms timeout', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element);

      expect(element.querySelector('.ripple')).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(element.querySelector('.ripple')).toBeNull();
    });

    it('should use center fallback for non-mouse/touch events', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      // Create a generic Event (not MouseEvent or TouchEvent)
      const event = new Event('click') as unknown as MouseEvent;
      createRipple(event, element);

      const ripple = element.querySelector('.ripple') as HTMLElement;
      // Center fallback: x = 50, y = 25, size = 200
      // left = 50 - 100 = -50, top = 25 - 100 = -75
      expect(ripple.style.left).toBe('-50px');
      expect(ripple.style.top).toBe('-75px');
    });
  });

  describe('initRippleEffects', () => {
    it('should add ripple-container class to num-btn elements', () => {
      const btn = document.createElement('button');
      btn.classList.add('num-btn');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should add ripple-container class to timestamp-btn', () => {
      const btn = document.createElement('button');
      btn.classList.add('timestamp-btn');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should add ripple-container class to timing-point-btn elements', () => {
      const btn = document.createElement('button');
      btn.classList.add('timing-point-btn');
      btn.setAttribute('data-point', 'S');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should add ripple-container class to tab-btn elements', () => {
      const btn = document.createElement('button');
      btn.classList.add('tab-btn');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should add ripple-container class to action-btn elements', () => {
      const btn = document.createElement('button');
      btn.classList.add('action-btn');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should add ripple-container class to modal-btn elements', () => {
      const btn = document.createElement('button');
      btn.classList.add('modal-btn');
      container.appendChild(btn);

      initRippleEffects();
      expect(btn.classList.contains('ripple-container')).toBe(true);
    });

    it('should handle no matching elements gracefully', () => {
      expect(() => initRippleEffects()).not.toThrow();
    });
  });

  describe('cleanupRippleEffects', () => {
    it('should clean up without errors', () => {
      initRippleEffects();
      expect(() => cleanupRippleEffects()).not.toThrow();
    });

    it('should clean up active ripple timeouts', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      element.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      const event = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
      createRipple(event, element);

      // Should not throw even though there are pending timeouts
      expect(() => cleanupRippleEffects()).not.toThrow();
    });
  });
});
