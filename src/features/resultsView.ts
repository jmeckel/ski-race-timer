/**
 * Results View Module
 * Handles VirtualList, filtering, search, pull-to-refresh, and action buttons
 */

import { store } from '../store';
import { VirtualList, PullToRefresh, showToast } from '../components';
import { syncService, feedbackUndo } from '../services';
import { t } from '../i18n/translations';
import { exportResults } from './export';
import { openPhotoViewer } from './photoViewer';
import { initChiefJudgeToggle } from './chiefJudgeView';
import { openFaultEditModal, openMarkDeletionModal, updateInlineFaultsList, updateInlineBibSelector, updateInlineGateSelector } from './faultEntry';
import type { Entry, FaultEntry, Language } from '../types';

// Module state
let virtualList: VirtualList | null = null;
let pullToRefreshInstance: PullToRefresh | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let searchInputListener: ((e: Event) => void) | null = null;

// Callback types
type ConfirmModalAction = 'delete' | 'deleteSelected' | 'clearAll' | 'undoAdd';

// Callbacks for external functions (injected from app.ts)
let openEditModalCallback: ((entry: Entry) => void) | null = null;
let promptDeleteCallback: ((entry: Entry) => void) | null = null;
let openConfirmModalCallback: ((action: ConfirmModalAction) => void) | null = null;
let verifyPinForChiefJudgeCallback: ((lang: Language) => Promise<boolean>) | null = null;

/**
 * Set callbacks for external functions
 */
export function setResultsViewCallbacks(callbacks: {
  openEditModal: (entry: Entry) => void;
  promptDelete: (entry: Entry) => void;
  openConfirmModal: (action: ConfirmModalAction) => void;
  verifyPinForChiefJudge: (lang: Language) => Promise<boolean>;
}): void {
  openEditModalCallback = callbacks.openEditModal;
  promptDeleteCallback = callbacks.promptDelete;
  openConfirmModalCallback = callbacks.openConfirmModal;
  verifyPinForChiefJudgeCallback = callbacks.verifyPinForChiefJudge;
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
  const container = document.getElementById('results-list');
  if (!container) return;

  virtualList = new VirtualList({
    container,
    onItemClick: (entry) => openEditModalCallback?.(entry),
    onItemDelete: (entry) => promptDeleteCallback?.(entry),
    onItemSelect: (entry, selected) => {
      if (selected) {
        store.toggleEntrySelection(entry.id);
      } else {
        store.toggleEntrySelection(entry.id);
      }
    },
    onViewPhoto: (entry) => openPhotoViewer(entry)
  });

  // Listen for fault edit requests from VirtualList
  container.addEventListener('fault-edit-request', ((e: CustomEvent) => {
    const fault = e.detail?.fault as FaultEntry;
    if (fault) {
      openFaultEditModal(fault);
    }
  }) as EventListener);

  // Listen for fault delete requests from VirtualList
  container.addEventListener('fault-delete-request', ((e: CustomEvent) => {
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
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  if (searchInput) {
    // Clear any pending search timeout from previous initialization
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    // Remove old listener if re-initializing to prevent duplicates
    if (searchInputListener) {
      searchInput.removeEventListener('input', searchInputListener);
    }

    // Create and store new listener
    searchInputListener = () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    };
    searchInput.addEventListener('input', searchInputListener);
  }

  // Filter selects
  const pointFilter = document.getElementById('filter-point') as HTMLSelectElement;
  const statusFilter = document.getElementById('filter-status') as HTMLSelectElement;

  if (pointFilter) {
    pointFilter.addEventListener('change', applyFilters);
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
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
export function initResultsActions(): void {
  // Clear All button
  const clearAllBtn = document.getElementById('clear-all-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.entries.length === 0) {
        showToast(t('noEntries', state.currentLang), 'info');
        return;
      }
      openConfirmModalCallback?.('clearAll');
    });
  }

  // Undo button
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (store.canUndo()) {
        // Check if this is a destructive undo (undoing ADD_ENTRY deletes an entry)
        const nextAction = store.peekUndo();
        if (nextAction && nextAction.type === 'ADD_ENTRY') {
          // Show confirmation modal for destructive undo
          openConfirmModalCallback?.('undoAdd');
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
  }

  // Export button
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportResults);
  }

  // Delete selected button
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.selectedEntries.size > 0) {
        openConfirmModalCallback?.('deleteSelected');
      }
    });
  }

  // Chief Judge toggle
  if (verifyPinForChiefJudgeCallback) {
    initChiefJudgeToggle({
      verifyPinForChiefJudge: verifyPinForChiefJudgeCallback,
      openFaultEditModal,
      openMarkDeletionModal,
      updateInlineFaultsList,
      updateInlineBibSelector,
      updateInlineGateSelector
    });
  }
}

/**
 * Apply current filters to results
 */
export function applyFilters(): void {
  if (!virtualList) return;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const pointFilter = document.getElementById('filter-point') as HTMLSelectElement;
  const statusFilter = document.getElementById('filter-status') as HTMLSelectElement;

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
  const finished = entries.filter(e => e.point === 'F' && e.status === 'ok').length;

  const totalEl = document.getElementById('stat-total');
  const racersEl = document.getElementById('stat-racers');
  const finishedEl = document.getElementById('stat-finished');

  if (totalEl) totalEl.textContent = String(total);
  if (racersEl) racersEl.textContent = String(racers);
  if (finishedEl) finishedEl.textContent = String(finished);
}

/**
 * Update entry count badge
 */
export function updateEntryCountBadge(): void {
  const badge = document.getElementById('entry-count-badge');
  if (badge) {
    const count = store.getState().entries.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/**
 * Cleanup search timeout (for page unload)
 */
export function cleanupSearchTimeout(): void {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
}
