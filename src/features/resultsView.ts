/**
 * Results View Module
 * Handles VirtualList, filtering, search, pull-to-refresh, and action buttons
 */

import { store } from '../store';
import { VirtualList, PullToRefresh, showToast } from '../components';
import { syncService, feedbackUndo } from '../services';
import { t } from '../i18n/translations';
import { getElement } from '../utils';
import { exportResults } from './export';
import { openPhotoViewer } from './photoViewer';
import { openFaultEditModal, openMarkDeletionModal } from './faultEntry';
import type { Entry, FaultEntry, Language } from '../types';

// Module state
let virtualList: VirtualList | null = null;
let pullToRefreshInstance: PullToRefresh | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// Event listener references for cleanup
type EventListenerRef = { element: HTMLElement | null; event: string; handler: EventListener };
let eventListeners: EventListenerRef[] = [];

// CustomEvent type declarations for results view
export type ConfirmModalAction = 'delete' | 'deleteSelected' | 'clearAll' | 'undoAdd';

/**
 * Dispatch event to open edit modal for an entry
 */
function dispatchOpenEditModal(entry: Entry): void {
  window.dispatchEvent(new CustomEvent('open-edit-modal', { detail: { entry } }));
}

/**
 * Dispatch event to prompt delete for an entry
 */
function dispatchPromptDelete(entry: Entry): void {
  window.dispatchEvent(new CustomEvent('prompt-delete', { detail: { entry } }));
}

/**
 * Dispatch event to open confirm modal
 */
function dispatchOpenConfirmModal(action: ConfirmModalAction): void {
  window.dispatchEvent(new CustomEvent('open-confirm-modal', { detail: { action } }));
}

/**
 * Register an event listener and track it for cleanup
 */
function addListener<T extends HTMLElement>(
  element: T | null,
  event: string,
  handler: EventListener
): void {
  if (!element) return;
  element.addEventListener(event, handler);
  eventListeners.push({ element, event, handler });
}

/**
 * Remove all registered event listeners
 */
function removeAllListeners(): void {
  for (const { element, event, handler } of eventListeners) {
    element?.removeEventListener(event, handler);
  }
  eventListeners = [];
}

/**
 * Get the VirtualList instance for external access
 */
export function getVirtualList(): VirtualList | null {
  return virtualList;
}

/**
 * Initialize results view
 */
export function initResultsView(): void {
  // Cleanup previous initialization
  removeAllListeners();
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }

  const container = getElement('results-list');
  if (!container) return;

  virtualList = new VirtualList({
    container,
    onItemClick: (entry) => dispatchOpenEditModal(entry),
    onItemDelete: (entry) => dispatchPromptDelete(entry),
    onItemSelect: (entry) => {
      store.toggleEntrySelection(entry.id);
    },
    onViewPhoto: (entry) => openPhotoViewer(entry)
  });

  // Listen for fault edit requests from VirtualList
  addListener(container, 'fault-edit-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openFaultEditModal(fault);
    }
  }) as EventListener);

  // Listen for fault delete requests from VirtualList
  addListener(container, 'fault-delete-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openMarkDeletionModal(fault);
    }
  }) as EventListener);

  // Load initial entries
  const state = store.getState();
  virtualList.setEntries(state.entries);
  updateStats();

  // Initialize pull-to-refresh
  const resultsContainer = document.querySelector('.results-view');
  if (resultsContainer) {
    pullToRefreshInstance = new PullToRefresh({
      container: resultsContainer as HTMLElement,
      onRefresh: async () => {
        await syncService.forceRefresh();
        showToast(t('syncReceived', store.getState().currentLang), 'success');
      }
    });
  }

  // Search input with debounce
  const searchInput = getElement<HTMLInputElement>('search-input');
  if (searchInput) {
    const searchHandler = () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    };
    addListener(searchInput, 'input', searchHandler);
  }

  // Filter selects
  const pointFilter = getElement<HTMLSelectElement>('filter-point');
  const statusFilter = getElement<HTMLSelectElement>('filter-status');

  addListener(pointFilter, 'change', applyFilters);
  addListener(statusFilter, 'change', applyFilters);

  // Action buttons
  initResultsActions();

  // Pause VirtualList if not starting on results view
  // It will be resumed when user switches to results tab
  if (state.currentView !== 'results' && virtualList) {
    virtualList.pause();
  }
}

/**
 * Initialize results action buttons
 */
function initResultsActions(): void {
  // Clear All button
  addListener(getElement('clear-all-btn'), 'click', () => {
    const state = store.getState();
    if (state.entries.length === 0) {
      showToast(t('noEntries', state.currentLang), 'info');
      return;
    }
    dispatchOpenConfirmModal('clearAll');
  });

  // Undo button
  addListener(getElement('undo-btn'), 'click', () => {
    if (store.canUndo()) {
      // Check if this is a destructive undo (undoing ADD_ENTRY deletes an entry)
      const nextAction = store.peekUndo();
      if (nextAction && nextAction.type === 'ADD_ENTRY') {
        // Show confirmation modal for destructive undo
        dispatchOpenConfirmModal('undoAdd');
      } else {
        // Non-destructive undo - proceed immediately
        const result = store.undo();
        feedbackUndo();
        showToast(t('undone', store.getState().currentLang), 'success');

        // Sync undo to cloud if needed
        const state = store.getState();
        if (result && result.type === 'ADD_ENTRY' && state.settings.sync && state.raceId) {
          const entry = result.data as Entry;
          syncService.deleteEntryFromCloud(entry.id, entry.deviceId);
        }
      }
    }
  });

  // Export button
  addListener(getElement('export-btn'), 'click', exportResults);

  // Delete selected button
  addListener(getElement('delete-selected-btn'), 'click', () => {
    const state = store.getState();
    if (state.selectedEntries.size > 0) {
      dispatchOpenConfirmModal('deleteSelected');
    }
  });

}

/**
 * Apply current filters to results
 */
export function applyFilters(): void {
  if (!virtualList) return;

  const searchInput = getElement<HTMLInputElement>('search-input');
  const pointFilter = getElement<HTMLSelectElement>('filter-point');
  const statusFilter = getElement<HTMLSelectElement>('filter-status');

  virtualList.applyFilters(
    searchInput?.value || '',
    pointFilter?.value || 'all',
    statusFilter?.value || 'all'
  );

  updateStats();
}

/**
 * Update statistics
 */
export function updateStats(): void {
  const state = store.getState();
  const entries = state.entries;

  const total = entries.length;
  const racers = new Set(entries.map(e => e.bib)).size;
  // Count distinct racers who have at least one OK finish (not finish entries)
  const finished = new Set(
    entries.filter(e => e.point === 'F' && e.status === 'ok').map(e => e.bib)
  ).size;

  const totalEl = getElement('stat-total');
  const racersEl = getElement('stat-racers');
  const finishedEl = getElement('stat-finished');

  if (totalEl) totalEl.textContent = String(total);
  if (racersEl) racersEl.textContent = String(racers);
  if (finishedEl) finishedEl.textContent = String(finished);
}

/**
 * Update entry count badge
 */
export function updateEntryCountBadge(): void {
  const badge = getElement('entry-count-badge');
  if (badge) {
    const count = store.getState().entries.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/**
 * Cleanup results view resources (for page unload or re-initialization)
 */
export function cleanupResultsView(): void {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  removeAllListeners();
  if (pullToRefreshInstance) {
    pullToRefreshInstance.destroy();
    pullToRefreshInstance = null;
  }
  if (virtualList) {
    virtualList.destroy();
    virtualList = null;
  }
}

/**
 * @deprecated Use cleanupResultsView instead
 */
export function cleanupSearchTimeout(): void {
  cleanupResultsView();
}
