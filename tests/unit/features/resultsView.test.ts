/**
 * Unit Tests for Results View Module
 * Tests: getVirtualList, updateStats, updateEntryCountBadge,
 *        applyFilters, initResultsView, action buttons,
 *        cleanupResultsView, cleanupSearchTimeout
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Track VirtualList instance methods
const mockSetEntries = vi.fn();
const mockApplyFilters = vi.fn();
const mockDestroy = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();

vi.mock('../../../src/components', () => ({
  PullToRefresh: vi.fn(() => ({
    destroy: vi.fn(),
  })),
  showToast: vi.fn(),
  VirtualList: vi.fn(() => ({
    setEntries: mockSetEntries,
    applyFilters: mockApplyFilters,
    destroy: mockDestroy,
    pause: mockPause,
    resume: mockResume,
  })),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackUndo: vi.fn(),
  syncService: {
    forceRefresh: vi.fn(() => Promise.resolve()),
    deleteEntryFromCloud: vi.fn(() => Promise.resolve()),
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
  ListenerManager: vi.fn().mockImplementation(() => {
    const tracked: { el: EventTarget; event: string; handler: EventListenerOrEventListenerObject }[] = [];
    return {
      add: vi.fn(
        (el: EventTarget, event: string, handler: EventListenerOrEventListenerObject) => {
          el.addEventListener(event, handler);
          tracked.push({ el, event, handler });
        },
      ),
      removeAll: vi.fn(() => {
        for (const { el, event, handler } of tracked) {
          el.removeEventListener(event, handler);
        }
        tracked.length = 0;
      }),
    };
  }),
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

import { showToast } from '../../../src/components';
import {
  applyFilters,
  cleanupResultsView,
  cleanupSearchTimeout,
  getVirtualList,
  initResultsView,
  updateEntryCountBadge,
  updateStats,
} from '../../../src/features/resultsView';
import { feedbackUndo, syncService } from '../../../src/services';

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
      settings: { sync: false },
      raceId: null,
    });
  });

  afterEach(() => {
    cleanupResultsView();
    container.remove();
  });

  // -------------------------------------------------------------------------
  // getVirtualList
  // -------------------------------------------------------------------------
  describe('getVirtualList', () => {
    it('should return null before initialization', () => {
      expect(getVirtualList()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateStats — basic
  // -------------------------------------------------------------------------
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
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'F', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e3', bib: '043', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
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

    it('should detect cross-device duplicates', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_2' },
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
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
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

  // -------------------------------------------------------------------------
  // updateEntryCountBadge — basic
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // initResultsView — initialization
  // -------------------------------------------------------------------------
  describe('initResultsView', () => {
    it('should create VirtualList and set entries', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      initResultsView();

      expect(getVirtualList()).not.toBeNull();
      expect(mockSetEntries).toHaveBeenCalledWith([]);
    });

    it('should pause VirtualList when not on results view', () => {
      mockGetState.mockReturnValue({
        currentView: 'timer',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      initResultsView();

      expect(mockPause).toHaveBeenCalled();
    });

    it('should not pause VirtualList when on results view', () => {
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      initResultsView();

      expect(mockPause).not.toHaveBeenCalled();
    });

    it('should handle missing results-list container gracefully', () => {
      expect(() => initResultsView()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // applyFilters — with various filter combinations
  // -------------------------------------------------------------------------
  describe('applyFilters with filters', () => {
    it('should apply search filter from search input', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const searchInput = document.createElement('input');
      searchInput.id = 'search-input';
      searchInput.value = '042';
      container.appendChild(searchInput);

      initResultsView();
      applyFilters();

      expect(mockApplyFilters).toHaveBeenCalledWith('042', 'all', 'all');
    });

    it('should apply point filter', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const pointFilter = document.createElement('select');
      pointFilter.id = 'filter-point';
      const opt = document.createElement('option');
      opt.value = 'S';
      pointFilter.appendChild(opt);
      pointFilter.value = 'S';
      container.appendChild(pointFilter);

      initResultsView();
      applyFilters();

      expect(mockApplyFilters).toHaveBeenCalledWith('', 'S', 'all');
    });

    it('should apply status filter', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const statusFilter = document.createElement('select');
      statusFilter.id = 'filter-status';
      const opt = document.createElement('option');
      opt.value = 'dns';
      statusFilter.appendChild(opt);
      statusFilter.value = 'dns';
      container.appendChild(statusFilter);

      initResultsView();
      applyFilters();

      expect(mockApplyFilters).toHaveBeenCalledWith('', 'all', 'dns');
    });

    it('should apply combined search, point, and status filters', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const searchInput = document.createElement('input');
      searchInput.id = 'search-input';
      searchInput.value = '05';
      container.appendChild(searchInput);

      const pointFilter = document.createElement('select');
      pointFilter.id = 'filter-point';
      const opt1 = document.createElement('option');
      opt1.value = 'F';
      pointFilter.appendChild(opt1);
      pointFilter.value = 'F';
      container.appendChild(pointFilter);

      const statusFilter = document.createElement('select');
      statusFilter.id = 'filter-status';
      const opt2 = document.createElement('option');
      opt2.value = 'ok';
      statusFilter.appendChild(opt2);
      statusFilter.value = 'ok';
      container.appendChild(statusFilter);

      initResultsView();
      applyFilters();

      expect(mockApplyFilters).toHaveBeenCalledWith('05', 'F', 'ok');
    });

    it('should not throw when VirtualList is null', () => {
      // Don't init — VirtualList is null
      expect(() => applyFilters()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateStats — various entry patterns
  // -------------------------------------------------------------------------
  describe('updateStats with various entry patterns', () => {
    it('should count unique racers correctly with multiple entries per bib', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'F', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e3', bib: '042', point: 'S', run: 2, status: 'ok', deviceId: 'dev_1' },
          { id: 'e4', bib: '042', point: 'F', run: 2, status: 'ok', deviceId: 'dev_1' },
          { id: 'e5', bib: '043', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
        ],
      });

      const racersEl = document.createElement('span');
      racersEl.id = 'stat-racers';
      container.appendChild(racersEl);

      updateStats();

      expect(racersEl.textContent).toBe('2');
    });

    it('should count finished racers only for OK finishes', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'F', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '043', point: 'F', run: 1, status: 'dsq', deviceId: 'dev_1' },
          { id: 'e3', bib: '044', point: 'F', run: 1, status: 'dns', deviceId: 'dev_1' },
          { id: 'e4', bib: '045', point: 'F', run: 1, status: 'dnf', deviceId: 'dev_1' },
          { id: 'e5', bib: '046', point: 'F', run: 1, status: 'flt', deviceId: 'dev_1' },
        ],
      });

      const finishedEl = document.createElement('span');
      finishedEl.id = 'stat-finished';
      container.appendChild(finishedEl);

      updateStats();

      // Only bib 042 has OK finish
      expect(finishedEl.textContent).toBe('1');
    });

    it('should count start entries not as finished', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
        ],
      });

      const finishedEl = document.createElement('span');
      finishedEl.id = 'stat-finished';
      container.appendChild(finishedEl);

      updateStats();

      expect(finishedEl.textContent).toBe('0');
    });

    it('should detect multiple cross-device duplicates', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_2' },
          { id: 'e3', bib: '043', point: 'F', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e4', bib: '043', point: 'F', run: 1, status: 'ok', deviceId: 'dev_3' },
        ],
      });

      const duplicatesEl = document.createElement('span');
      duplicatesEl.id = 'stat-duplicates';
      container.appendChild(duplicatesEl);

      updateStats();

      expect(duplicatesEl.textContent).toBe('2');
    });

    it('should not count same-device entries as duplicates', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_1' },
        ],
      });

      const duplicatesEl = document.createElement('span');
      duplicatesEl.id = 'stat-duplicates';
      const duplicatesItem = document.createElement('div');
      duplicatesItem.id = 'stat-duplicates-item';
      container.appendChild(duplicatesEl);
      container.appendChild(duplicatesItem);

      updateStats();

      expect(duplicatesEl.textContent).toBe('0');
      expect(duplicatesItem.style.display).toBe('none');
    });

    it('should treat entries without run as run 1', () => {
      mockGetState.mockReturnValue({
        entries: [
          { id: 'e1', bib: '042', point: 'S', run: undefined, status: 'ok', deviceId: 'dev_1' },
          { id: 'e2', bib: '042', point: 'S', run: 1, status: 'ok', deviceId: 'dev_2' },
        ],
      });

      const duplicatesEl = document.createElement('span');
      duplicatesEl.id = 'stat-duplicates';
      container.appendChild(duplicatesEl);

      updateStats();

      // Both should be keyed as run=1 and count as duplicate
      expect(duplicatesEl.textContent).toBe('1');
    });
  });

  // -------------------------------------------------------------------------
  // updateEntryCountBadge — edge cases
  // -------------------------------------------------------------------------
  describe('updateEntryCountBadge edge cases', () => {
    it('should show count of 1 with inline display', () => {
      mockGetState.mockReturnValue({
        entries: [{ id: 'e1' }],
      });

      const badge = document.createElement('span');
      badge.id = 'entry-count-badge';
      container.appendChild(badge);

      updateEntryCountBadge();

      expect(badge.textContent).toBe('1');
      expect(badge.style.display).toBe('inline');
    });

    it('should show large entry count', () => {
      const entries = Array.from({ length: 500 }, (_, i) => ({ id: `e${i}` }));
      mockGetState.mockReturnValue({ entries });

      const badge = document.createElement('span');
      badge.id = 'entry-count-badge';
      container.appendChild(badge);

      updateEntryCountBadge();

      expect(badge.textContent).toBe('500');
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — clear all, undo, export, delete selected
  // -------------------------------------------------------------------------
  describe('action buttons', () => {
    function setupActionDOM() {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const clearAllBtn = document.createElement('button');
      clearAllBtn.id = 'clear-all-btn';
      container.appendChild(clearAllBtn);

      const undoBtn = document.createElement('button');
      undoBtn.id = 'undo-btn';
      container.appendChild(undoBtn);

      const exportBtn = document.createElement('button');
      exportBtn.id = 'export-btn';
      container.appendChild(exportBtn);

      const deleteSelectedBtn = document.createElement('button');
      deleteSelectedBtn.id = 'delete-selected-btn';
      container.appendChild(deleteSelectedBtn);

      return { clearAllBtn, undoBtn, exportBtn, deleteSelectedBtn };
    }

    it('should show "no entries" toast when clearing all with empty entries', () => {
      const { clearAllBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      initResultsView();
      clearAllBtn.click();

      expect(showToast).toHaveBeenCalledWith('noEntries', 'info');
    });

    it('should dispatch open-confirm-modal for clearAll when entries exist', () => {
      const { clearAllBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [{ id: 'e1' }],
        selectedEntries: new Set(),
      });

      initResultsView();

      const eventSpy = vi.fn();
      window.addEventListener('open-confirm-modal', eventSpy);

      clearAllBtn.click();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('open-confirm-modal', eventSpy);
    });

    it('should perform non-destructive undo immediately', () => {
      const { undoBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
        settings: { sync: false },
        raceId: null,
      });

      mockCanUndo.mockReturnValue(true);
      mockPeekUndo.mockReturnValue({ type: 'DELETE_ENTRY', data: {} });
      mockUndo.mockReturnValue({ type: 'DELETE_ENTRY', data: {} });

      initResultsView();
      undoBtn.click();

      expect(mockUndo).toHaveBeenCalled();
      expect(feedbackUndo).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('undone', 'success');
    });

    it('should dispatch undoAdd confirm modal for destructive undo', () => {
      const { undoBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [{ id: 'e1' }],
        selectedEntries: new Set(),
      });

      mockCanUndo.mockReturnValue(true);
      mockPeekUndo.mockReturnValue({ type: 'ADD_ENTRY', data: {} });

      initResultsView();

      const eventSpy = vi.fn();
      window.addEventListener('open-confirm-modal', eventSpy);

      undoBtn.click();

      expect(eventSpy).toHaveBeenCalled();
      // Should NOT call store.undo directly
      expect(mockUndo).not.toHaveBeenCalled();

      window.removeEventListener('open-confirm-modal', eventSpy);
    });

    it('should not undo when canUndo returns false', () => {
      const { undoBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      mockCanUndo.mockReturnValue(false);

      initResultsView();
      undoBtn.click();

      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('should dispatch deleteSelected confirm modal when entries selected', () => {
      const { deleteSelectedBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [{ id: 'e1' }],
        selectedEntries: new Set(['e1']),
      });

      initResultsView();

      const eventSpy = vi.fn();
      window.addEventListener('open-confirm-modal', eventSpy);

      deleteSelectedBtn.click();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('open-confirm-modal', eventSpy);
    });

    it('should not dispatch deleteSelected when no entries selected', () => {
      const { deleteSelectedBtn } = setupActionDOM();
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [{ id: 'e1' }],
        selectedEntries: new Set(),
      });

      initResultsView();

      const eventSpy = vi.fn();
      window.addEventListener('open-confirm-modal', eventSpy);

      deleteSelectedBtn.click();

      expect(eventSpy).not.toHaveBeenCalled();
      window.removeEventListener('open-confirm-modal', eventSpy);
    });
  });

  // -------------------------------------------------------------------------
  // Toggle filters
  // -------------------------------------------------------------------------
  describe('toggle filters button', () => {
    it('should toggle filter bar visibility', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'toggle-filters-btn';
      toggleBtn.setAttribute('aria-expanded', 'false');
      container.appendChild(toggleBtn);

      const filterBar = document.createElement('div');
      filterBar.classList.add('search-filter-bar');
      container.appendChild(filterBar);

      // Need to mock querySelector to find the filter bar
      const origQuerySelector = document.querySelector.bind(document);
      vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
        if (selector === '.search-filter-bar') return filterBar;
        if (selector === '.results-view') return null;
        return origQuerySelector(selector);
      });

      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      initResultsView();
      toggleBtn.click();

      expect(filterBar.classList.contains('visible')).toBe(true);
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
      expect(toggleBtn.classList.contains('active')).toBe(true);

      // Toggle again
      toggleBtn.click();
      expect(filterBar.classList.contains('visible')).toBe(false);
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

      vi.restoreAllMocks();
    });
  });

  // -------------------------------------------------------------------------
  // Undo with sync — cloud deletion
  // -------------------------------------------------------------------------
  describe('undo with sync coordination', () => {
    it('should delete entry from cloud on undo ADD_ENTRY when sync enabled', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const undoBtn = document.createElement('button');
      undoBtn.id = 'undo-btn';
      container.appendChild(undoBtn);

      const entry = { id: 'e1', deviceId: 'dev_1' };
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
        settings: { sync: true },
        raceId: 'race-123',
      });

      mockCanUndo.mockReturnValue(true);
      mockPeekUndo.mockReturnValue({ type: 'DELETE_ENTRY', data: entry });
      mockUndo.mockReturnValue({ type: 'ADD_ENTRY', data: entry });

      initResultsView();
      undoBtn.click();

      expect(syncService.deleteEntryFromCloud).toHaveBeenCalledWith(
        'e1',
        'dev_1',
      );
    });

    it('should NOT delete from cloud when sync is disabled', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      const undoBtn = document.createElement('button');
      undoBtn.id = 'undo-btn';
      container.appendChild(undoBtn);

      const entry = { id: 'e1', deviceId: 'dev_1' };
      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
        settings: { sync: false },
        raceId: 'race-123',
      });

      mockCanUndo.mockReturnValue(true);
      mockPeekUndo.mockReturnValue({ type: 'DELETE_ENTRY', data: entry });
      mockUndo.mockReturnValue({ type: 'ADD_ENTRY', data: entry });

      initResultsView();
      undoBtn.click();

      expect(syncService.deleteEntryFromCloud).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cleanupResultsView
  // -------------------------------------------------------------------------
  describe('cleanupResultsView', () => {
    it('should destroy VirtualList on cleanup', () => {
      const resultsList = document.createElement('div');
      resultsList.id = 'results-list';
      container.appendChild(resultsList);

      mockGetState.mockReturnValue({
        currentView: 'results',
        currentLang: 'en',
        entries: [],
        selectedEntries: new Set(),
      });

      initResultsView();
      expect(getVirtualList()).not.toBeNull();

      cleanupResultsView();
      expect(getVirtualList()).toBeNull();
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        cleanupResultsView();
        cleanupResultsView();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // cleanupSearchTimeout (deprecated alias)
  // -------------------------------------------------------------------------
  describe('cleanupSearchTimeout', () => {
    it('should be an alias for cleanupResultsView', () => {
      expect(() => cleanupSearchTimeout()).not.toThrow();
    });
  });
});
