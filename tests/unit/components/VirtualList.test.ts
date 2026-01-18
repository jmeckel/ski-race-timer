/**
 * Unit Tests for VirtualList Component
 * Tests: initialization, rendering, filtering, scrolling, item interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Entry } from '../../../src/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null)
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    // Trigger callback with mock entries
    this.callback([], this);
  }

  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: MockResizeObserver,
  writable: true
});

// Helper to create entries
function createEntry(index: number): Entry {
  return {
    id: `dev_test-${1704067200000 + index}-entry${index}`,
    bib: String(index).padStart(3, '0'),
    point: 'F',
    timestamp: new Date(1704067200000 + index * 1000).toISOString(),
    status: 'ok',
    deviceId: 'dev_test',
    deviceName: 'Timer 1'
  };
}

describe('VirtualList Component', () => {
  let VirtualList: typeof import('../../../src/components/VirtualList').VirtualList;
  let container: HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Create container
    container = document.createElement('div');
    container.style.height = '500px'; // Set height for virtual scrolling
    document.body.appendChild(container);

    // Reset modules
    vi.resetModules();
    const module = await import('../../../src/components/VirtualList');
    VirtualList = module.VirtualList;
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  describe('constructor', () => {
    it('should create scroll container', () => {
      const list = new VirtualList({ container });

      expect(container.querySelector('.virtual-scroll-container')).not.toBeNull();

      list.destroy();
    });

    it('should create content container', () => {
      const list = new VirtualList({ container });

      expect(container.querySelector('.virtual-scroll-content')).not.toBeNull();

      list.destroy();
    });
  });

  describe('setEntries', () => {
    it('should set entries and render', () => {
      const list = new VirtualList({ container });
      const entries = [createEntry(1), createEntry(2), createEntry(3)];

      list.setEntries(entries);

      expect(list.getVisibleCount()).toBe(3);

      list.destroy();
    });

    it('should update content height based on entries', () => {
      const list = new VirtualList({ container });
      const entries = Array.from({ length: 100 }, (_, i) => createEntry(i));

      list.setEntries(entries);

      const content = container.querySelector('.virtual-scroll-content') as HTMLElement;
      expect(parseInt(content.style.height)).toBe(100 * 72); // ITEM_HEIGHT = 72

      list.destroy();
    });

    it('should invalidate cache when entry photo is added', () => {
      const list = new VirtualList({ container });
      const entry = createEntry(1);

      list.setEntries([entry]);

      // Verify no photo button initially
      expect(container.querySelector('.result-photo-btn')).toBeNull();

      // Update entry with photo
      const updatedEntry = { ...entry, photo: 'base64data' };
      list.setEntries([updatedEntry]);

      // Verify photo button now exists
      expect(container.querySelector('.result-photo-btn')).not.toBeNull();

      list.destroy();
    });

    it('should invalidate cache when entry photo is removed', () => {
      const list = new VirtualList({ container });
      const entry = { ...createEntry(1), photo: 'base64data' };

      list.setEntries([entry]);

      // Verify photo button exists
      expect(container.querySelector('.result-photo-btn')).not.toBeNull();

      // Update entry without photo
      const updatedEntry = { ...entry, photo: undefined };
      list.setEntries([updatedEntry]);

      // Verify photo button is gone
      expect(container.querySelector('.result-photo-btn')).toBeNull();

      list.destroy();
    });

    it('should invalidate cache when entry status changes', () => {
      const list = new VirtualList({ container });
      const entry = createEntry(1);

      list.setEntries([entry]);

      // Verify no status badge initially (status is 'ok')
      expect(container.querySelector('.result-status')).toBeNull();

      // Update entry with DNS status
      const updatedEntry = { ...entry, status: 'dns' as const };
      list.setEntries([updatedEntry]);

      // Verify status badge now exists
      const statusBadge = container.querySelector('.result-status');
      expect(statusBadge).not.toBeNull();
      expect(statusBadge?.textContent).toContain('DNS');

      list.destroy();
    });
  });

  describe('applyFilters', () => {
    it('should filter by search term', () => {
      const list = new VirtualList({ container });
      const entries = [
        createEntry(1),
        createEntry(12),
        createEntry(123)
      ];

      list.setEntries(entries);
      list.applyFilters('001');

      expect(list.getVisibleCount()).toBe(1);

      list.destroy();
    });

    it('should filter by point', () => {
      const list = new VirtualList({ container });
      const entries = [
        { ...createEntry(1), point: 'S' as const },
        { ...createEntry(2), point: 'F' as const },
        { ...createEntry(3), point: 'I1' as const }
      ];

      list.setEntries(entries);
      list.applyFilters(undefined, 'F');

      expect(list.getVisibleCount()).toBe(1);

      list.destroy();
    });

    it('should filter by status', () => {
      const list = new VirtualList({ container });
      const entries = [
        { ...createEntry(1), status: 'ok' as const },
        { ...createEntry(2), status: 'dns' as const },
        { ...createEntry(3), status: 'dnf' as const }
      ];

      list.setEntries(entries);
      list.applyFilters(undefined, undefined, 'dns');

      expect(list.getVisibleCount()).toBe(1);

      list.destroy();
    });

    it('should combine multiple filters', () => {
      const list = new VirtualList({ container });
      const entries = [
        { ...createEntry(1), point: 'F' as const, status: 'ok' as const },
        { ...createEntry(2), point: 'F' as const, status: 'dns' as const },
        { ...createEntry(3), point: 'S' as const, status: 'ok' as const }
      ];

      list.setEntries(entries);
      list.applyFilters(undefined, 'F', 'ok');

      expect(list.getVisibleCount()).toBe(1);

      list.destroy();
    });

    it('should show all with "all" filter', () => {
      const list = new VirtualList({ container });
      const entries = [createEntry(1), createEntry(2), createEntry(3)];

      list.setEntries(entries);
      list.applyFilters(undefined, 'all', 'all');

      expect(list.getVisibleCount()).toBe(3);

      list.destroy();
    });
  });

  describe('rendering', () => {
    it('should render visible items', () => {
      const list = new VirtualList({ container });
      const entries = Array.from({ length: 10 }, (_, i) => createEntry(i));

      list.setEntries(entries);

      // Should have rendered items
      const items = container.querySelectorAll('.result-item');
      expect(items.length).toBeGreaterThan(0);

      list.destroy();
    });

    it('should render empty state when no entries', () => {
      const list = new VirtualList({ container });

      list.setEntries([]);

      const emptyState = container.querySelector('.empty-state');
      expect(emptyState).not.toBeNull();

      list.destroy();
    });

    it('should render item with correct data', () => {
      const list = new VirtualList({ container });
      const entry = createEntry(42);

      list.setEntries([entry]);

      const item = container.querySelector('.result-item');
      expect(item?.textContent).toContain('042');
      expect(item?.textContent).toContain('F');

      list.destroy();
    });

    it('should render photo button when entry has photo', () => {
      const list = new VirtualList({ container });
      const entry = { ...createEntry(1), photo: 'base64data' };

      list.setEntries([entry]);

      const photoBtn = container.querySelector('.result-photo-btn');
      expect(photoBtn).not.toBeNull();

      list.destroy();
    });

    it('should not render photo button when entry has no photo', () => {
      const list = new VirtualList({ container });
      const entry = createEntry(1);

      list.setEntries([entry]);

      const photoBtn = container.querySelector('.result-photo-btn');
      expect(photoBtn).toBeNull();

      list.destroy();
    });

    it('should render status badge for non-ok status', () => {
      const list = new VirtualList({ container });
      const entry = { ...createEntry(1), status: 'dns' as const };

      list.setEntries([entry]);

      const status = container.querySelector('.result-status');
      expect(status?.textContent).toContain('DNS');

      list.destroy();
    });
  });

  describe('callbacks', () => {
    it('should call onItemClick', () => {
      const onItemClick = vi.fn();
      const list = new VirtualList({ container, onItemClick });
      const entry = createEntry(1);

      list.setEntries([entry]);

      const item = container.querySelector('.result-item') as HTMLElement;
      item.click();

      expect(onItemClick).toHaveBeenCalledWith(entry, expect.any(MouseEvent));

      list.destroy();
    });

    it('should call onItemDelete', () => {
      const onItemDelete = vi.fn();
      const list = new VirtualList({ container, onItemDelete });
      const entry = createEntry(1);

      list.setEntries([entry]);

      const deleteBtn = container.querySelector('.result-delete') as HTMLElement;
      deleteBtn.click();

      expect(onItemDelete).toHaveBeenCalledWith(entry);

      list.destroy();
    });

    it('should call onItemSelect', () => {
      const onItemSelect = vi.fn();
      const list = new VirtualList({ container, onItemSelect });
      const entry = createEntry(1);

      list.setEntries([entry]);

      const checkbox = container.querySelector('.result-checkbox') as HTMLInputElement;
      checkbox.click();

      expect(onItemSelect).toHaveBeenCalledWith(entry, true);

      list.destroy();
    });

    it('should call onViewPhoto when photo button is clicked', () => {
      const onViewPhoto = vi.fn();
      const list = new VirtualList({ container, onViewPhoto });
      const entry = { ...createEntry(1), photo: 'base64data' };

      list.setEntries([entry]);

      const photoBtn = container.querySelector('.result-photo-btn') as HTMLElement;
      photoBtn.click();

      expect(onViewPhoto).toHaveBeenCalledWith(entry);

      list.destroy();
    });

    it('should not propagate click event from photo button to item', () => {
      const onItemClick = vi.fn();
      const onViewPhoto = vi.fn();
      const list = new VirtualList({ container, onItemClick, onViewPhoto });
      const entry = { ...createEntry(1), photo: 'base64data' };

      list.setEntries([entry]);

      const photoBtn = container.querySelector('.result-photo-btn') as HTMLElement;
      photoBtn.click();

      expect(onViewPhoto).toHaveBeenCalledWith(entry);
      expect(onItemClick).not.toHaveBeenCalled();

      list.destroy();
    });
  });

  describe('scrolling', () => {
    it('should scroll to top', () => {
      const list = new VirtualList({ container });
      const entries = Array.from({ length: 100 }, (_, i) => createEntry(i));

      list.setEntries(entries);

      const scrollContainer = container.querySelector('.virtual-scroll-container') as HTMLElement;
      // Mock scrollTo since jsdom doesn't implement it
      scrollContainer.scrollTo = vi.fn();

      list.scrollToTop();

      expect(scrollContainer.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

      list.destroy();
    });

    it('should scroll to entry', () => {
      const list = new VirtualList({ container });
      const entries = Array.from({ length: 100 }, (_, i) => createEntry(i));

      list.setEntries(entries);

      const scrollContainer = container.querySelector('.virtual-scroll-container') as HTMLElement;
      // Mock scrollTo since jsdom doesn't implement it
      scrollContainer.scrollTo = vi.fn();

      // Find entry and scroll to it
      list.scrollToEntry(entries[50].id);

      expect(scrollContainer.scrollTo).toHaveBeenCalled();

      list.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear container', () => {
      const list = new VirtualList({ container });
      list.setEntries([createEntry(1)]);

      list.destroy();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('getVisibleCount', () => {
    it('should return filtered count', () => {
      const list = new VirtualList({ container });
      const entries = Array.from({ length: 50 }, (_, i) => createEntry(i));

      list.setEntries(entries);

      expect(list.getVisibleCount()).toBe(50);

      list.destroy();
    });
  });
});
