/**
 * Unit Tests for Modal Context Utility
 * Tests: setModalContext(), getModalContext(), clearModalContext()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setModalContext,
  getModalContext,
  clearModalContext,
} from '../../../src/utils/modalContext';

describe('Modal Context Utility', () => {
  let modal: HTMLElement;

  beforeEach(() => {
    modal = document.createElement('div');
  });

  describe('setModalContext', () => {
    it('should store context for a modal element', () => {
      const ctx = { faultId: 'abc-123', mode: 'edit' };
      setModalContext(modal, ctx);

      const result = getModalContext(modal);
      expect(result).toEqual(ctx);
    });

    it('should overwrite previous context for the same modal', () => {
      setModalContext(modal, { first: true });
      setModalContext(modal, { second: true });

      const result = getModalContext(modal);
      expect(result).toEqual({ second: true });
    });

    it('should store different contexts for different modals', () => {
      const modal2 = document.createElement('div');
      setModalContext(modal, { id: 'modal1' });
      setModalContext(modal2, { id: 'modal2' });

      expect(getModalContext(modal)).toEqual({ id: 'modal1' });
      expect(getModalContext(modal2)).toEqual({ id: 'modal2' });
    });

    it('should store complex nested objects', () => {
      const ctx = {
        fault: { bib: '001', gate: 5, type: 'MG' },
        flags: { isNew: true, requiresApproval: false },
      };
      setModalContext(modal, ctx);

      const result = getModalContext(modal);
      expect(result).toEqual(ctx);
    });
  });

  describe('getModalContext', () => {
    it('should return null for a modal with no context', () => {
      const result = getModalContext(modal);
      expect(result).toBeNull();
    });

    it('should return stored context', () => {
      const ctx = { entryId: '42' };
      setModalContext(modal, ctx);

      expect(getModalContext(modal)).toEqual(ctx);
    });

    it('should return null for a different modal that has no context', () => {
      const modal2 = document.createElement('div');
      setModalContext(modal, { data: 'yes' });

      expect(getModalContext(modal2)).toBeNull();
    });

    it('should return typed context', () => {
      interface EditContext {
        entryId: string;
        field: string;
      }
      const ctx: EditContext = { entryId: 'e-1', field: 'bib' };
      setModalContext(modal, ctx);

      const result = getModalContext<EditContext>(modal);
      expect(result?.entryId).toBe('e-1');
      expect(result?.field).toBe('bib');
    });
  });

  describe('clearModalContext', () => {
    it('should remove context for a modal', () => {
      setModalContext(modal, { temp: true });
      expect(getModalContext(modal)).not.toBeNull();

      clearModalContext(modal);
      expect(getModalContext(modal)).toBeNull();
    });

    it('should not affect other modals', () => {
      const modal2 = document.createElement('div');
      setModalContext(modal, { id: '1' });
      setModalContext(modal2, { id: '2' });

      clearModalContext(modal);

      expect(getModalContext(modal)).toBeNull();
      expect(getModalContext(modal2)).toEqual({ id: '2' });
    });

    it('should be safe to clear context that does not exist', () => {
      expect(() => clearModalContext(modal)).not.toThrow();
    });

    it('should be safe to clear context multiple times', () => {
      setModalContext(modal, { data: 'test' });
      clearModalContext(modal);
      expect(() => clearModalContext(modal)).not.toThrow();
      expect(getModalContext(modal)).toBeNull();
    });
  });
});
