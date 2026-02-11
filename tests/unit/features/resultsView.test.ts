/**
 * Unit Tests for Results View Module
 * Tests: getVirtualList, updateStats, updateEntryCountBadge,
 *        applyFilters, cleanupResultsView, cleanupSearchTimeout
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../src/components', () => ({
  PullToRefresh: vi.fn(() => ({
    destroy: vi.fn(),
  })),
  showToast: vi.fn(),
  VirtualList: vi.fn(() => ({
    setEntries: vi.fn(),
    applyFilters: vi.fn(),
    destroy: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  })),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackUndo: vi.fn(),
  syncService: {
    forceRefresh: vi.fn(() => Promise.resolve()),
    deleteEntryFromCloud: vi.fn(),
  },
}));

const mockGetState = vi.fn();
const mockCanUndo = vi.fn(() => false);
const mockPeekUndo = vi.fn(() => null);
const mockUndo = vi.fn(() => null);
const mockToggleEntrySelection = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    canUndo: () => mockCanUndo(),
    peekUndo: () => mockPeekUndo(),
    undo: () => mockUndo(),
    toggleEntrySelection: (...args: unknown[]) =>
      mockToggleEntrySelection(...args),
  },
}));

vi.mock('../../../src/utils', () => ({
  getElement: vi.fn((id: string) => document.getElementById(id)),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../../src/features/export', () => ({
  exportResults: vi.fn(),
}));

vi.mock('../../../src/features/faults', () => ({
  openFaultEditModal: vi.fn(),
  openMarkDeletionModal: vi.fn(),
}));

vi.mock('../../../src/features/photoViewer', () => ({
  openPhotoViewer: vi.fn(),
}));

import {
  applyFilters,
  cleanupResultsView,
  cleanupSearchTimeout,
  getVirtualList,
  updateEntryCountBadge,
  updateStats,
} from '../../../src/features/resultsView';

describe('Results View Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentView: 'results',
      currentLang: 'en',
      entries: [],
      selectedEntries: new Set(),
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('getVirtualList', () => {
    it('should return null before initialization', () => {
      expect(getVirtualList()).toBeNull();
    });
  });

  describe('updateStats', () => {
    it('should show zero stats when no entries', () => {
      const totalEl = document.createElement('span');
      totalEl.id = 'stat-total';
      const racersEl = document.createElement('span');
      racersEl.id = 'stat-racers';
      const finishedEl = document.createElement('span');
      finishedEl.id = 'stat-finished';
      container.appendChild(totalEl);
      container.appendChild(racersEl);
      container.appendChild(finishedEl);

      updateStats();

      expect(totalEl.textContent).toBe('0');
      expect(racersEl.textContent).toBe('0');
      expect(finishedEl.textContent).toBe('0');
    });

    it('should count entries correctly', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: 'e1',
            bib: '042',
            point: 'S',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
          {
            id: 'e2',
            bib: '042',
            point: 'F',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
          {
            id: 'e3',
            bib: '043',
            point: 'S',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
        ],
      });

      const totalEl = document.createElement('span');
      totalEl.id = 'stat-total';
      const racersEl = document.createElement('span');
      racersEl.id = 'stat-racers';
      const finishedEl = document.createElement('span');
      finishedEl.id = 'stat-finished';
      container.appendChild(totalEl);
      container.appendChild(racersEl);
      container.appendChild(finishedEl);

      updateStats();

      expect(totalEl.textContent).toBe('3');
      expect(racersEl.textContent).toBe('2');
      expect(finishedEl.textContent).toBe('1'); // Only bib 042 has a finish
    });

    it('should not count DNF/DNS/DSQ as finished', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: 'e1',
            bib: '042',
            point: 'F',
            run: 1,
            status: 'dnf',
            deviceId: 'dev_1',
          },
          {
            id: 'e2',
            bib: '043',
            point: 'F',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
        ],
      });

      const finishedEl = document.createElement('span');
      finishedEl.id = 'stat-finished';
      container.appendChild(finishedEl);

      updateStats();

      expect(finishedEl.textContent).toBe('1');
    });

    it('should detect cross-device duplicates', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: 'e1',
            bib: '042',
            point: 'S',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
          {
            id: 'e2',
            bib: '042',
            point: 'S',
            run: 1,
            status: 'ok',
            deviceId: 'dev_2',
          },
        ],
      });

      const duplicatesEl = document.createElement('span');
      duplicatesEl.id = 'stat-duplicates';
      const duplicatesItem = document.createElement('div');
      duplicatesItem.id = 'stat-duplicates-item';
      duplicatesItem.style.display = 'none';
      container.appendChild(duplicatesEl);
      container.appendChild(duplicatesItem);

      updateStats();

      expect(duplicatesEl.textContent).toBe('1');
      expect(duplicatesItem.style.display).toBe('');
    });

    it('should hide duplicates item when no duplicates', () => {
      mockGetState.mockReturnValue({
        entries: [
          {
            id: 'e1',
            bib: '042',
            point: 'S',
            run: 1,
            status: 'ok',
            deviceId: 'dev_1',
          },
        ],
      });

      const duplicatesItem = document.createElement('div');
      duplicatesItem.id = 'stat-duplicates-item';
      container.appendChild(duplicatesItem);

      updateStats();

      expect(duplicatesItem.style.display).toBe('none');
    });

    it('should handle missing DOM elements gracefully', () => {
      expect(() => updateStats()).not.toThrow();
    });
  });

  describe('updateEntryCountBadge', () => {
    it('should show entry count and be visible when entries exist', () => {
      mockGetState.mockReturnValue({
        entries: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
      });

      const badge = document.createElement('span');
      badge.id = 'entry-count-badge';
      container.appendChild(badge);

      updateEntryCountBadge();

      expect(badge.textContent).toBe('3');
      expect(badge.style.display).toBe('inline');
    });

    it('should hide badge when no entries', () => {
      mockGetState.mockReturnValue({ entries: [] });

      const badge = document.createElement('span');
      badge.id = 'entry-count-badge';
      container.appendChild(badge);

      updateEntryCountBadge();

      expect(badge.textContent).toBe('0');
      expect(badge.style.display).toBe('none');
    });

    it('should handle missing badge element', () => {
      expect(() => updateEntryCountBadge()).not.toThrow();
    });
  });

  describe('applyFilters', () => {
    it('should not throw when virtual list is null', () => {
      expect(() => applyFilters()).not.toThrow();
    });
  });

  describe('cleanupResultsView', () => {
    it('should not throw', () => {
      expect(() => cleanupResultsView()).not.toThrow();
    });
  });

  describe('cleanupSearchTimeout', () => {
    it('should not throw (deprecated alias)', () => {
      expect(() => cleanupSearchTimeout()).not.toThrow();
    });
  });
});
