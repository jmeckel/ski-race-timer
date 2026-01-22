/**
 * Unit Tests for Modal Feature Module
 * Tests: openModal, closeModal, closeAllModalsAnimated, isAnyModalOpen, getOpenModal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openModal,
  closeModal,
  closeAllModalsAnimated,
  isAnyModalOpen,
  getOpenModal
} from '../../../src/features/modals';

describe('Modal Feature Module', () => {
  let container: HTMLDivElement;
  let modal1: HTMLDivElement;
  let modal2: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create test container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create test modals
    modal1 = document.createElement('div');
    modal1.classList.add('modal-overlay');
    modal1.id = 'test-modal-1';
    container.appendChild(modal1);

    modal2 = document.createElement('div');
    modal2.classList.add('modal-overlay');
    modal2.id = 'test-modal-2';
    container.appendChild(modal2);
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  describe('openModal', () => {
    it('should add "show" class to modal', () => {
      openModal(modal1);
      expect(modal1.classList.contains('show')).toBe(true);
    });

    it('should handle null modal gracefully', () => {
      expect(() => openModal(null)).not.toThrow();
    });

    it('should not add duplicate "show" class', () => {
      modal1.classList.add('show');
      openModal(modal1);
      // Should still have exactly one 'show' class
      expect(modal1.className).toBe('modal-overlay show');
    });
  });

  describe('focus management', () => {
    beforeEach(() => {
      modal1.innerHTML = `
        <div class="modal-content">
          <button id="first-btn">First</button>
          <button id="last-btn">Last</button>
        </div>
      `;
    });

    it('should move focus to first focusable element on open', () => {
      openModal(modal1);
      vi.runAllTimers();
      const first = modal1.querySelector('#first-btn');
      expect(document.activeElement).toBe(first);
    });

    it('should wrap focus with Tab and Shift+Tab', () => {
      openModal(modal1);
      vi.runAllTimers();
      const first = modal1.querySelector('#first-btn');
      const last = modal1.querySelector('#last-btn');

      (last as HTMLElement).focus();
      last?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      expect(document.activeElement).toBe(first);

      (first as HTMLElement).focus();
      first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      expect(document.activeElement).toBe(last);
    });

    it('should close modal on Escape', () => {
      openModal(modal1);
      vi.runAllTimers();
      modal1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modal1.classList.contains('closing')).toBe(true);
    });
  });

  describe('closeModal', () => {
    it('should add "closing" class immediately', () => {
      modal1.classList.add('show');
      closeModal(modal1);
      expect(modal1.classList.contains('closing')).toBe(true);
    });

    it('should remove "show" and "closing" classes after animation', () => {
      modal1.classList.add('show');
      closeModal(modal1);

      // Before timeout
      expect(modal1.classList.contains('show')).toBe(true);
      expect(modal1.classList.contains('closing')).toBe(true);

      // After animation timeout (150ms)
      vi.advanceTimersByTime(150);
      expect(modal1.classList.contains('show')).toBe(false);
      expect(modal1.classList.contains('closing')).toBe(false);
    });

    it('should handle null modal gracefully', () => {
      expect(() => closeModal(null)).not.toThrow();
    });

    it('should not close modal that is not open', () => {
      // Modal without 'show' class
      closeModal(modal1);
      expect(modal1.classList.contains('closing')).toBe(false);
    });
  });

  describe('closeAllModalsAnimated', () => {
    it('should close all open modals', () => {
      modal1.classList.add('show');
      modal2.classList.add('show');

      closeAllModalsAnimated();

      // Both should have closing class
      expect(modal1.classList.contains('closing')).toBe(true);
      expect(modal2.classList.contains('closing')).toBe(true);

      // After animation
      vi.advanceTimersByTime(150);
      expect(modal1.classList.contains('show')).toBe(false);
      expect(modal2.classList.contains('show')).toBe(false);
    });

    it('should only close open modals', () => {
      modal1.classList.add('show');
      // modal2 is not open

      closeAllModalsAnimated();

      expect(modal1.classList.contains('closing')).toBe(true);
      expect(modal2.classList.contains('closing')).toBe(false);
    });

    it('should handle no open modals', () => {
      expect(() => closeAllModalsAnimated()).not.toThrow();
    });
  });

  describe('isAnyModalOpen', () => {
    it('should return true when modal is open', () => {
      modal1.classList.add('show');
      expect(isAnyModalOpen()).toBe(true);
    });

    it('should return false when no modals are open', () => {
      expect(isAnyModalOpen()).toBe(false);
    });

    it('should return true when multiple modals are open', () => {
      modal1.classList.add('show');
      modal2.classList.add('show');
      expect(isAnyModalOpen()).toBe(true);
    });
  });

  describe('getOpenModal', () => {
    it('should return the open modal element', () => {
      modal1.classList.add('show');
      const result = getOpenModal();
      expect(result).toBe(modal1);
    });

    it('should return null when no modals are open', () => {
      const result = getOpenModal();
      expect(result).toBeNull();
    });

    it('should return first open modal when multiple are open', () => {
      modal1.classList.add('show');
      modal2.classList.add('show');
      const result = getOpenModal();
      // querySelector returns first match
      expect(result).toBe(modal1);
    });
  });
});
