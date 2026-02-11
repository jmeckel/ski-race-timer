/**
 * Unit Tests for DOM Cache Utility
 * Tests: getElement(), getElementOrThrow(), invalidateElement(), clearElementCache(),
 *        preCacheElements(), getCacheStats()
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearElementCache,
  getCacheStats,
  getElement,
  getElementOrThrow,
  invalidateElement,
  preCacheElements,
} from '../../../src/utils/domCache';

describe('DOM Cache Utility', () => {
  beforeEach(() => {
    // Clear the cache before each test
    clearElementCache();
    // Clear DOM
    document.body.innerHTML = '';
  });

  describe('getElement', () => {
    it('should return element when it exists', () => {
      const div = document.createElement('div');
      div.id = 'test-el';
      document.body.appendChild(div);

      const result = getElement('test-el');
      expect(result).toBe(div);
    });

    it('should return null when element does not exist', () => {
      const result = getElement('non-existent');
      expect(result).toBeNull();
    });

    it('should cache the element on first lookup', () => {
      const div = document.createElement('div');
      div.id = 'cached-el';
      document.body.appendChild(div);

      // First call caches it
      getElement('cached-el');
      // Remove the element from DOM
      div.remove();

      // Second call should return cached reference (even though removed from DOM)
      const result = getElement('cached-el');
      expect(result).toBe(div);
    });

    it('should return the same cached reference on subsequent calls', () => {
      const div = document.createElement('div');
      div.id = 'ref-el';
      document.body.appendChild(div);

      const first = getElement('ref-el');
      const second = getElement('ref-el');
      expect(first).toBe(second);
    });
  });

  describe('getElementOrThrow', () => {
    it('should return element when it exists', () => {
      const div = document.createElement('div');
      div.id = 'throw-el';
      document.body.appendChild(div);

      const result = getElementOrThrow('throw-el');
      expect(result).toBe(div);
    });

    it('should throw when element does not exist', () => {
      expect(() => getElementOrThrow('missing')).toThrow(
        'Element with id "missing" not found',
      );
    });

    it('should include element id in error message', () => {
      expect(() => getElementOrThrow('my-special-id')).toThrow('my-special-id');
    });
  });

  describe('invalidateElement', () => {
    it('should remove element from cache', () => {
      const div = document.createElement('div');
      div.id = 'invalidate-el';
      document.body.appendChild(div);

      // Cache it
      getElement('invalidate-el');
      expect(getCacheStats().hits).toContain('invalidate-el');

      // Invalidate
      invalidateElement('invalidate-el');
      expect(getCacheStats().hits).not.toContain('invalidate-el');
    });

    it('should re-query DOM after invalidation', () => {
      const div1 = document.createElement('div');
      div1.id = 'swap-el';
      div1.className = 'original';
      document.body.appendChild(div1);

      // Cache the original
      getElement('swap-el');

      // Replace with new element of same ID
      div1.remove();
      const div2 = document.createElement('div');
      div2.id = 'swap-el';
      div2.className = 'replacement';
      document.body.appendChild(div2);

      // Still returns cached original
      expect(getElement('swap-el')?.className).toBe('original');

      // After invalidation, returns new element
      invalidateElement('swap-el');
      expect(getElement('swap-el')?.className).toBe('replacement');
    });

    it('should be safe to invalidate non-cached element', () => {
      expect(() => invalidateElement('never-cached')).not.toThrow();
    });
  });

  describe('clearElementCache', () => {
    it('should remove all entries from cache', () => {
      const div1 = document.createElement('div');
      div1.id = 'clear-1';
      const div2 = document.createElement('div');
      div2.id = 'clear-2';
      document.body.appendChild(div1);
      document.body.appendChild(div2);

      getElement('clear-1');
      getElement('clear-2');
      expect(getCacheStats().size).toBe(2);

      clearElementCache();
      expect(getCacheStats().size).toBe(0);
    });

    it('should be safe to call on empty cache', () => {
      expect(() => clearElementCache()).not.toThrow();
      expect(getCacheStats().size).toBe(0);
    });
  });

  describe('preCacheElements', () => {
    it('should pre-populate cache with existing elements', () => {
      const div1 = document.createElement('div');
      div1.id = 'pre-1';
      const div2 = document.createElement('div');
      div2.id = 'pre-2';
      document.body.appendChild(div1);
      document.body.appendChild(div2);

      preCacheElements(['pre-1', 'pre-2']);

      expect(getCacheStats().size).toBe(2);
      expect(getCacheStats().hits).toContain('pre-1');
      expect(getCacheStats().hits).toContain('pre-2');
    });

    it('should cache null for non-existent elements', () => {
      preCacheElements(['missing-el']);

      // Element is cached (as null)
      expect(getCacheStats().size).toBe(1);
      expect(getCacheStats().hits).toContain('missing-el');
      expect(getElement('missing-el')).toBeNull();
    });

    it('should not overwrite already-cached elements', () => {
      const div = document.createElement('div');
      div.id = 'pre-existing';
      div.className = 'first';
      document.body.appendChild(div);

      // Cache it
      getElement('pre-existing');

      // Replace in DOM
      div.remove();
      const div2 = document.createElement('div');
      div2.id = 'pre-existing';
      div2.className = 'second';
      document.body.appendChild(div2);

      // preCacheElements should NOT overwrite
      preCacheElements(['pre-existing']);
      expect(getElement('pre-existing')?.className).toBe('first');
    });

    it('should handle empty array', () => {
      expect(() => preCacheElements([])).not.toThrow();
      expect(getCacheStats().size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return size 0 for empty cache', () => {
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toEqual([]);
    });

    it('should return correct size after caching', () => {
      const div = document.createElement('div');
      div.id = 'stats-el';
      document.body.appendChild(div);

      getElement('stats-el');
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toContain('stats-el');
    });

    it('should list all cached element IDs', () => {
      const ids = ['el-a', 'el-b', 'el-c'];
      for (const id of ids) {
        const div = document.createElement('div');
        div.id = id;
        document.body.appendChild(div);
        getElement(id);
      }

      const stats = getCacheStats();
      expect(stats.size).toBe(3);
      for (const id of ids) {
        expect(stats.hits).toContain(id);
      }
    });
  });
});
