/**
 * Unit Tests for Toast Component
 * Tests: show, queue, types, escape HTML, clear
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Toast, getToast, showToast } from '../../../src/components/Toast';

describe('Toast Component', () => {
  let container: HTMLElement | null;

  beforeEach(() => {
    vi.useFakeTimers();
    // Clean up any existing toast containers
    container = document.getElementById('toast-container');
    if (container) {
      container.remove();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    container = document.getElementById('toast-container');
    if (container) {
      container.remove();
    }
  });

  describe('constructor', () => {
    it('should create container element', () => {
      const toast = new Toast();

      const containerEl = document.getElementById('toast-container');
      expect(containerEl).not.toBeNull();

      toast.clear();
    });

    it('should set accessibility attributes', () => {
      const toast = new Toast();

      const containerEl = document.getElementById('toast-container');
      expect(containerEl?.getAttribute('role')).toBe('status');
      expect(containerEl?.getAttribute('aria-live')).toBe('polite');

      toast.clear();
    });
  });

  describe('show', () => {
    it('should show a toast', () => {
      const toast = new Toast();
      toast.show('Test message');

      // Process queue
      vi.advanceTimersByTime(0);

      const toastEl = document.querySelector('.toast');
      expect(toastEl).not.toBeNull();

      toast.clear();
    });

    it('should show toast with different types', () => {
      const toast = new Toast();

      toast.show('Success', { type: 'success' });
      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast-success')).not.toBeNull();

      vi.advanceTimersByTime(3200);

      toast.show('Error', { type: 'error' });
      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast-error')).not.toBeNull();

      toast.clear();
    });

    it('should auto-dismiss after duration', () => {
      const toast = new Toast();
      toast.show('Test message', { duration: 1000 });

      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast')).not.toBeNull();

      vi.advanceTimersByTime(1200);
      expect(document.querySelector('.toast')).toBeNull();

      toast.clear();
    });

    it('should use default duration', () => {
      const toast = new Toast();
      toast.show('Test message');

      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast')).not.toBeNull();

      vi.advanceTimersByTime(3200);
      expect(document.querySelector('.toast')).toBeNull();

      toast.clear();
    });

    it('should escape HTML in message', () => {
      const toast = new Toast();
      toast.show('<script>alert("xss")</script>');

      vi.advanceTimersByTime(0);

      const toastEl = document.querySelector('.toast');
      expect(toastEl?.innerHTML).not.toContain('<script>');

      toast.clear();
    });
  });

  describe('queue', () => {
    it('should queue multiple toasts', () => {
      const toast = new Toast();
      toast.show('Message 1');
      toast.show('Message 2');
      toast.show('Message 3');

      vi.advanceTimersByTime(0);

      // Only first toast should be visible
      const toasts = document.querySelectorAll('.toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('Message 1');

      toast.clear();
    });

    it('should process queue sequentially', () => {
      const toast = new Toast();
      toast.show('Message 1', { duration: 1000 });
      toast.show('Message 2', { duration: 1000 });

      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast')?.textContent).toContain('Message 1');

      // First toast dismisses
      vi.advanceTimersByTime(1200);

      // Second toast appears
      vi.advanceTimersByTime(0);
      expect(document.querySelector('.toast')?.textContent).toContain('Message 2');

      toast.clear();
    });
  });

  describe('clear', () => {
    it('should clear all toasts', () => {
      const toast = new Toast();
      toast.show('Message 1');
      toast.show('Message 2');

      vi.advanceTimersByTime(0);

      toast.clear();

      expect(document.querySelector('.toast')).toBeNull();
    });

    it('should clear queue', () => {
      const toast = new Toast();
      toast.show('Message 1');
      toast.show('Message 2');
      toast.show('Message 3');

      toast.clear();

      // Advance time - no new toasts should appear
      vi.advanceTimersByTime(5000);
      expect(document.querySelector('.toast')).toBeNull();
    });
  });

  describe('custom event listener', () => {
    it('should show toast on custom event', () => {
      const toast = new Toast();

      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: 'Event message', type: 'info' }
      }));

      vi.advanceTimersByTime(0);

      expect(document.querySelector('.toast')?.textContent).toContain('Event message');

      toast.clear();
    });
  });

  describe('getToast', () => {
    it('should return singleton instance', () => {
      const toast1 = getToast();
      const toast2 = getToast();

      expect(toast1).toBe(toast2);
    });
  });

  describe('showToast helper', () => {
    it('should be a function', () => {
      expect(typeof showToast).toBe('function');
    });

    it('should accept message and type parameters', () => {
      // Just verify the function can be called without throwing
      expect(() => showToast('Test message')).not.toThrow();
      expect(() => showToast('Test message', 'warning')).not.toThrow();
      expect(() => showToast('Test message', 'error', 1000)).not.toThrow();
    });
  });
});
