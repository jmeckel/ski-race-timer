/**
 * Results View Module
 * Handles VirtualList, filtering, search, pull-to-refresh, and action buttons
 */

import { PullToRefresh, showToast, VirtualList } from '../components';
import { t } from '../i18n/translations';
import { feedbackUndo, syncService } from '../services';
import { store } from '../store';
import type { Entry, FaultEntry } from '../types';
import { getElement } from '../utils';
import { ListenerManager } from '../utils/listenerManager';
import { exportResults } from './export';
import {
  openFaultEditModal,
  openMarkDeletionModal,
} from './faults/faultOperations';
import { openPhotoViewer } from './photoViewer';

// Module state
let virtualList: VirtualList | null = null;
let pullToRefreshInstance: PullToRefresh | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new ListenerManager();

// CustomEvent type declarations for results view
export type ConfirmModalAction =
  | 'delete'
  | 'deleteSelected'
  | 'clearAll'
  | 'undoAdd';

/**
 * Dispatch event to open edit modal for an entry
 */
function dispatchOpenEditModal(entry: Entry): void {
  window.dispatchEvent(
    new CustomEvent('open-edit-modal', { detail: { entry } }),
  );
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
  window.dispatchEvent(
    new CustomEvent('open-confirm-modal', { detail: { action } }),
  );
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
  listeners.removeAll();
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
    onViewPhoto: (entry) => openPhotoViewer(entry),
  });

  // Listen for fault edit requests from VirtualList
  listeners.add(container, 'fault-edit-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openFaultEditModal(fault);
    }
  }) as EventListener);

  // Listen for fault delete requests from VirtualList
  listeners.add(container, 'fault-delete-request', ((e: CustomEvent) => {
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
      },
    });
  }

  // Search input with debounce
  const searchInput = getElement<HTMLInputElement>('search-input');
  if (searchInput) {
    listeners.add(searchInput, 'input', () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    });
  }

  // Filter selects
  const pointFilter = getElement<HTMLSelectElement>('filter-point');
  const statusFilter = getElement<HTMLSelectElement>('filter-status');

  if (pointFilter) listeners.add(pointFilter, 'change', applyFilters);
  if (statusFilter) listeners.add(statusFilter, 'change', applyFilters);

  // Toggle filters button
  const toggleFiltersBtn = getElement('toggle-filters-btn');
  const filterBar = document.querySelector('.search-filter-bar');
  if (toggleFiltersBtn && filterBar) {
    listeners.add(toggleFiltersBtn, 'click', () => {
      const isVisible = filterBar.classList.toggle('visible');
      toggleFiltersBtn.setAttribute('aria-expanded', String(isVisible));
      toggleFiltersBtn.classList.toggle('active', isVisible);
    });
  }

  // Quick export button
  const quickExportBtn = getElement('quick-export-btn');
  if (quickExportBtn) {
    listeners.add(quickExportBtn, 'click', () => {
      exportResults();
    });
  }

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
  const clearAllBtn = getElement('clear-all-btn');
  if (clearAllBtn) {
    listeners.add(clearAllBtn, 'click', () => {
      const state = store.getState();
      if (state.entries.length === 0) {
        showToast(t('noEntries', state.currentLang), 'info');
        return;
      }
      dispatchOpenConfirmModal('clearAll');
    });
  }

  // Undo button
  const undoBtn = getElement('undo-btn');
  if (undoBtn) {
    listeners.add(undoBtn, 'click', () => {
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
          if (
            result &&
            result.type === 'ADD_ENTRY' &&
            state.settings.sync &&
            state.raceId
          ) {
            const entry = result.data as Entry;
            void syncService
              .deleteEntryFromCloud(entry.id, entry.deviceId)
              .catch(() => {
                /* handled by queue */
              });
          }
        }
      }
    });
  }

  // Export button
  const exportBtn = getElement('export-btn');
  if (exportBtn) listeners.add(exportBtn, 'click', exportResults);

  // Delete selected button
  const deleteSelectedBtn = getElement('delete-selected-btn');
  if (deleteSelectedBtn) {
    listeners.add(deleteSelectedBtn, 'click', () => {
      const state = store.getState();
      if (state.selectedEntries.size > 0) {
        dispatchOpenConfirmModal('deleteSelected');
      }
    });
  }
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
    statusFilter?.value || 'all',
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
  const racers = new Set(entries.map((e) => e.bib)).size;
  // Count distinct racers who have at least one OK finish (not finish entries)
  const finished = new Set(
    entries
      .filter((e) => e.point === 'F' && e.status === 'ok')
      .map((e) => e.bib),
  ).size;

  // Count cross-device duplicates: same bib+point+run from different devices
  const pointDeviceMap = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = `${entry.bib}-${entry.point}-${entry.run ?? 1}`;
    if (!pointDeviceMap.has(key)) {
      pointDeviceMap.set(key, new Set());
    }
    pointDeviceMap.get(key)!.add(entry.deviceId);
  }
  let duplicateCount = 0;
  for (const devices of pointDeviceMap.values()) {
    if (devices.size > 1) {
      duplicateCount++;
    }
  }

  const totalEl = getElement('stat-total');
  const racersEl = getElement('stat-racers');
  const finishedEl = getElement('stat-finished');
  const duplicatesEl = getElement('stat-duplicates');
  const duplicatesItem = getElement('stat-duplicates-item');

  if (totalEl) totalEl.textContent = String(total);
  if (racersEl) racersEl.textContent = String(racers);
  if (finishedEl) finishedEl.textContent = String(finished);
  if (duplicatesEl) duplicatesEl.textContent = String(duplicateCount);
  if (duplicatesItem) {
    duplicatesItem.style.display = duplicateCount > 0 ? '' : 'none';
  }
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
  listeners.removeAll();
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
