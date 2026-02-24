/**
 * Chief Judge View Module
 * Handles Chief Judge panel, fault summaries, penalty configuration, and deletion approvals
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { feedbackDelete, feedbackSuccess, feedbackTap } from '../services';
import { deleteFaultFromCloud, syncFault, syncService } from '../services/sync';
import {
  $deviceRole,
  $entries,
  $faultEntries,
  $gateAssignment,
  $isChiefJudgeView,
  $isJudgeReady,
  $penaltySeconds,
  $settings,
  $usePenaltyMode,
  effect,
  store,
} from '../store';
import type { FaultEntry, Language, Run } from '../types';
import {
  escapeAttr,
  escapeHtml,
  getFaultTypeLabel,
  getLocale,
  iconCheck,
  iconEdit,
  iconNote,
  iconTrash,
  iconTrashDetailed,
  iconWarningCircle,
  iconX,
} from '../utils';
import { ListenerManager } from '../utils/listenerManager';
import {
  exportChiefSummary,
  exportFaultSummaryWhatsApp,
  exportResults,
} from './export';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Module-level effect disposers for cleanup
const effectDisposers: (() => void)[] = [];

// Promise resolver for PIN verification (async event pattern)
type PinVerifyResolve = (verified: boolean) => void;
let pendingPinVerifyResolve: PinVerifyResolve | null = null;

/**
 * Request PIN verification via CustomEvent (Promise-based)
 * app.ts listens for this and calls resolvePinVerification when done
 */
async function requestPinVerification(lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    pendingPinVerifyResolve = resolve;
    window.dispatchEvent(
      new CustomEvent('request-pin-verification', { detail: { lang } }),
    );
  });
}

/**
 * Resolve pending PIN verification request
 * Called by app.ts after PIN verification completes
 */
export function resolvePinVerification(verified: boolean): void {
  if (pendingPinVerifyResolve) {
    pendingPinVerifyResolve(verified);
    pendingPinVerifyResolve = null;
  }
}

/**
 * Dispatch event to open fault edit modal
 */
function dispatchOpenFaultEditModal(fault: FaultEntry): void {
  window.dispatchEvent(
    new CustomEvent('open-fault-edit-modal', { detail: { fault } }),
  );
}

/**
 * Dispatch event to open mark deletion modal
 */
function dispatchOpenMarkDeletionModal(fault: FaultEntry): void {
  window.dispatchEvent(
    new CustomEvent('open-mark-deletion-modal', { detail: { fault } }),
  );
}

/**
 * Dispatch event to update inline faults list (gate judge mode)
 */
function dispatchUpdateInlineFaultsList(): void {
  window.dispatchEvent(new CustomEvent('update-inline-faults-list'));
}

/**
 * Dispatch event to update inline bib selector (gate judge mode)
 */
function dispatchUpdateInlineBibSelector(): void {
  window.dispatchEvent(new CustomEvent('update-inline-bib-selector'));
}

/**
 * Dispatch event to update inline gate selector (gate judge mode)
 */
function dispatchUpdateInlineGateSelector(): void {
  window.dispatchEvent(new CustomEvent('update-inline-gate-selector'));
}

/**
 * Initialize Chief Judge toggle button
 * Uses CustomEvents instead of callbacks for decoupled communication
 */
export function initChiefJudgeToggle(): void {
  const toggleBtn = document.getElementById('chief-judge-toggle-btn');
  if (!toggleBtn) return;

  listeners.add(toggleBtn, 'click', async () => {
    const state = store.getState();
    const lang = state.currentLang;

    // If already in Chief Judge mode, allow exiting without PIN
    if (state.isChiefJudgeView) {
      store.toggleChiefJudgeView();
      updateChiefJudgeView();
      feedbackTap();
      showToast(t('chiefJudgeModeDisabled', lang), 'info');
      return;
    }

    // Entering Chief Judge mode - require PIN verification if sync is enabled
    if (state.settings.sync && state.raceId) {
      const verified = await requestPinVerification(lang);
      if (!verified) {
        return;
      }
    }

    // PIN verified or sync not enabled - enter Chief Judge mode
    store.toggleChiefJudgeView();
    updateChiefJudgeView();
    feedbackTap();
    showToast(t('chiefJudgeModeEnabled', lang), 'info');
  });

  // Update visibility based on sync and faults
  updateChiefJudgeToggleVisibility();

  // Signal-based effects for reactive state updates
  effectDisposers.push(
    // Toggle visibility when settings or faults change
    effect(() => {
      void $settings.value;
      void $faultEntries.value;
      updateChiefJudgeToggleVisibility();
    }),

    // Refresh fault summary panel when faults or penalty config change (only if visible)
    effect(() => {
      void $faultEntries.value;
      void $penaltySeconds.value;
      void $usePenaltyMode.value;
      if ($isChiefJudgeView.value) {
        updateFaultSummaryPanel();
        updatePendingDeletionsPanel();
      }
    }),

    // Update penalty UI when config changes
    effect(() => {
      void $penaltySeconds.value;
      void $usePenaltyMode.value;
      updatePenaltyConfigUI();
    }),

    // Update judges overview when entries/faults/readiness change (only if visible)
    effect(() => {
      void $entries.value;
      void $faultEntries.value;
      void $isJudgeReady.value;
      if ($isChiefJudgeView.value) {
        updateJudgesOverview();
      }
    }),

    // Update inline fault list when faults change (gate judge only)
    effect(() => {
      void $faultEntries.value;
      if ($deviceRole.value === 'gateJudge') {
        dispatchUpdateInlineFaultsList();
        dispatchUpdateInlineBibSelector();
      }
    }),

    // Update inline bib selector when entries change (gate judge only)
    effect(() => {
      void $entries.value;
      if ($deviceRole.value === 'gateJudge') {
        dispatchUpdateInlineBibSelector();
      }
    }),

    // Update inline gate selector when gate assignment changes (gate judge only)
    effect(() => {
      void $gateAssignment.value;
      if ($deviceRole.value === 'gateJudge') {
        dispatchUpdateInlineGateSelector();
      }
    }),
  );

  // Initialize penalty configuration handlers
  initPenaltyConfig();

  // Initialize chief export handlers
  initChiefExportHandlers();
}

/**
 * Initialize chief judge export button handlers
 */
function initChiefExportHandlers(): void {
  const csvBtn = document.getElementById('export-csv-btn');
  if (csvBtn) {
    listeners.add(csvBtn, 'click', () => {
      feedbackTap();
      exportResults();
    });
  }

  const summaryBtn = document.getElementById('export-summary-btn');
  if (summaryBtn) {
    listeners.add(summaryBtn, 'click', () => {
      feedbackTap();
      exportChiefSummary();
    });
  }

  const whatsappBtn = document.getElementById('export-whatsapp-btn');
  if (whatsappBtn) {
    listeners.add(whatsappBtn, 'click', () => {
      feedbackTap();
      exportFaultSummaryWhatsApp();
    });
  }
}

/**
 * Initialize penalty configuration UI handlers
 */
function initPenaltyConfig(): void {
  const modeToggle = document.getElementById('penalty-mode-toggle');
  if (modeToggle) {
    listeners.add(modeToggle, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('.penalty-mode-btn');
      if (!btn) return;

      const mode = btn.getAttribute('data-mode');
      if (mode === 'penalty') {
        store.setUsePenaltyMode(true);
      } else if (mode === 'dsq') {
        store.setUsePenaltyMode(false);
      }
      feedbackTap();
    });
  }

  const secondsSelector = document.getElementById('penalty-seconds-selector');
  if (secondsSelector) {
    listeners.add(secondsSelector, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('.penalty-adj-btn');
      if (!btn) return;

      const adj = btn.getAttribute('data-adj');
      const state = store.getState();
      const current = state.penaltySeconds;

      if (adj === '+1') {
        store.setPenaltySeconds(current + 1);
      } else if (adj === '-1') {
        store.setPenaltySeconds(current - 1);
      }
      feedbackTap();
    });
  }

  updatePenaltyConfigUI();
}

/**
 * Update penalty configuration UI to reflect current state
 */
export function updatePenaltyConfigUI(): void {
  const state = store.getState();
  const configRow = document.getElementById('penalty-config-row');
  const secondsValue = document.getElementById('penalty-seconds-value');
  const modeToggle = document.getElementById('penalty-mode-toggle');

  if (configRow) {
    configRow.classList.toggle('dsq-mode', !state.usePenaltyMode);
  }

  if (secondsValue) {
    secondsValue.textContent = String(state.penaltySeconds);
  }

  if (modeToggle) {
    const buttons = modeToggle.querySelectorAll('.penalty-mode-btn');
    buttons.forEach((btn) => {
      const mode = btn.getAttribute('data-mode');
      const isActive =
        (mode === 'penalty' && state.usePenaltyMode) ||
        (mode === 'dsq' && !state.usePenaltyMode);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }
}

/**
 * Update Chief Judge toggle button visibility
 */
export function updateChiefJudgeToggleVisibility(): void {
  const toggleRow = document.getElementById('chief-judge-toggle-row');
  if (!toggleRow) return;

  const state = store.getState();
  const shouldShow = state.settings.sync;
  toggleRow.style.display = shouldShow ? 'block' : 'none';
}

/**
 * Update Chief Judge view state
 */
export function updateChiefJudgeView(): void {
  const state = store.getState();
  const resultsView = document.querySelector('.results-view');
  const toggleBtn = document.getElementById('chief-judge-toggle-btn');

  if (!resultsView || !toggleBtn) return;

  toggleBtn.classList.toggle('active', state.isChiefJudgeView);
  toggleBtn.setAttribute('aria-pressed', String(state.isChiefJudgeView));
  resultsView.classList.toggle('chief-mode', state.isChiefJudgeView);

  if (state.isChiefJudgeView) {
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
    updateJudgesOverview();
  }
}

/**
 * Update the judges overview section in Chief Judge panel
 */
export function updateJudgesOverview(): void {
  const overviewList = document.getElementById('judges-overview-list');
  const overviewCount = document.getElementById('judges-overview-count');
  const emptyState = document.getElementById('judges-overview-empty');

  if (!overviewList || !overviewCount) return;

  const assignments = syncService.getOtherGateAssignments();
  const state = store.getState();
  const allJudges: import('../types').GateAssignment[] = [...assignments];

  if (state.deviceRole === 'gateJudge' && state.gateAssignment) {
    allJudges.push({
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      gateStart: state.gateAssignment[0],
      gateEnd: state.gateAssignment[1],
      lastSeen: Date.now(),
      isReady: state.isJudgeReady,
    });
  }

  overviewCount.textContent = String(allJudges.length);

  if (emptyState) {
    emptyState.style.display = allJudges.length === 0 ? 'block' : 'none';
  }

  const existingCards = overviewList.querySelectorAll('.judge-card');
  existingCards.forEach((card) => card.remove());

  if (allJudges.length === 0) return;

  allJudges.sort((a, b) => a.gateStart - b.gateStart);

  const cardsHtml = allJudges
    .map(
      (judge) => `
    <div class="judge-card${judge.isReady ? ' ready' : ''}">
      <span class="judge-ready-indicator"></span>
      <span class="judge-name" title="${escapeAttr(judge.deviceName)}">${escapeHtml(judge.deviceName)}</span>
      <span class="judge-gates">${escapeHtml(String(judge.gateStart))}–${escapeHtml(String(judge.gateEnd))}</span>
    </div>
  `,
    )
    .join('');

  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml);
  } else {
    overviewList.innerHTML = cardsHtml;
  }
}

/**
 * Update the fault summary panel in Chief Judge view
 */
export function updateFaultSummaryPanel(): void {
  const summaryList = document.getElementById('fault-summary-list');
  const summaryCount = document.getElementById('fault-summary-count');
  const emptyState = document.getElementById('chief-empty-state');

  if (!summaryList || !summaryCount) return;

  const state = store.getState();
  const lang = state.currentLang;
  const faults = state.faultEntries;

  // Group faults by bib number
  const faultsByBib = new Map<string, FaultEntry[]>();
  for (const fault of faults) {
    const key = `${fault.bib}-${fault.run}`;
    if (!faultsByBib.has(key)) {
      faultsByBib.set(key, []);
    }
    faultsByBib.get(key)!.push(fault);
  }

  summaryCount.textContent = String(faultsByBib.size);

  if (emptyState) {
    emptyState.style.display = faultsByBib.size === 0 ? 'flex' : 'none';
  }

  if (faultsByBib.size === 0) {
    const cards = summaryList.querySelectorAll('.fault-summary-card');
    cards.forEach((card) => card.remove());
    return;
  }

  const cardsHtml: string[] = [];

  const sortedEntries = Array.from(faultsByBib.entries()).sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const bibA = parseInt(keyA.split('-')[0]!, 10) || 0;
    const bibB = parseInt(keyB.split('-')[0]!, 10) || 0;
    return bibA - bibB;
  });

  for (const [key, racerFaults] of sortedEntries) {
    const [bib, runStr] = key.split('-') as [string, string];
    const run = parseInt(runStr, 10) as Run;

    const isFinalized = store.isRacerFinalized(bib, run);
    const activeFaults = racerFaults.filter((f) => !f.markedForDeletion);
    const penaltySeconds = state.usePenaltyMode
      ? activeFaults.length * state.penaltySeconds
      : 0;

    const faultRows = racerFaults
      .map((fault) => {
        const isMarkedForDeletion = fault.markedForDeletion;
        const deletionInfo =
          isMarkedForDeletion && fault.markedForDeletionBy
            ? `${t('deletionPending', lang)} (${fault.markedForDeletionBy})`
            : '';
        const hasNotes = fault.notes && fault.notes.length > 0;

        return `
        <div class="fault-entry-row${isMarkedForDeletion ? ' marked-for-deletion' : ''}" data-fault-id="${escapeAttr(fault.id)}">
          <div class="fault-gate-info">
            <span class="fault-gate-num${isMarkedForDeletion ? ' strikethrough' : ''}">${t('gate', lang)} ${escapeHtml(String(fault.gateNumber))}</span>
            <span class="fault-type-badge${isMarkedForDeletion ? ' marked' : ''}">${getFaultTypeLabel(fault.faultType, lang)}</span>
            ${hasNotes ? `<span class="fault-note-icon" title="${escapeAttr(t('hasNote', lang))}" aria-label="${escapeAttr(t('hasNote', lang))}">${iconNote(14)}</span>` : ''}
            ${isMarkedForDeletion ? `<span class="deletion-pending-badge" title="${escapeAttr(deletionInfo)}">${iconWarningCircle(14)}</span>` : ''}
          </div>
          <span class="fault-judge-name">${escapeHtml(fault.deviceName)}</span>
          <div class="fault-row-actions">
            <button class="fault-row-btn edit-fault-btn" data-fault-id="${escapeAttr(fault.id)}" title="${escapeAttr(t('edit', lang))}" aria-label="${escapeAttr(t('edit', lang))}" ${isMarkedForDeletion ? 'disabled' : ''}>
              ${iconEdit(14)}
            </button>
            <button class="fault-row-btn delete-fault-btn" data-fault-id="${escapeAttr(fault.id)}" title="${escapeAttr(isMarkedForDeletion ? t('rejectDeletion', lang) : t('markForDeletion', lang))}" aria-label="${escapeAttr(isMarkedForDeletion ? t('rejectDeletion', lang) : t('markForDeletion', lang))}">
              ${isMarkedForDeletion ? iconTrashDetailed(14) : iconTrash(14)}
            </button>
          </div>
        </div>
      `;
      })
      .join('');

    const actionHtml = isFinalized
      ? `<div class="finalized-badge">
           ${iconCheck(16, 2.5)}
           ${t('finalized', lang)}
         </div>`
      : `<button class="finalize-btn" data-bib="${escapeAttr(bib)}" data-run="${escapeAttr(String(run))}">
           ${iconCheck(16)}
           ${t('finalize', lang)}
         </button>`;

    const statusHtml = state.usePenaltyMode
      ? `<span class="fault-card-penalty">+${penaltySeconds}s</span>
         <span class="fault-card-result flt">${t('flt', lang)}</span>`
      : `<span class="fault-card-result dsq">${t('dsq', lang)}</span>`;

    cardsHtml.push(`
      <div class="fault-summary-card${isFinalized ? ' finalized' : ''}" data-bib="${escapeAttr(bib)}" data-run="${escapeAttr(String(run))}">
        <div class="fault-card-header">
          <span class="fault-card-bib">#${escapeHtml(bib.padStart(3, '0'))}</span>
          <div class="fault-card-status">
            ${statusHtml}
          </div>
        </div>
        <div class="fault-card-body">
          ${faultRows}
        </div>
        <div class="fault-card-actions">
          ${actionHtml}
        </div>
      </div>
    `);
  }

  const existingCards = summaryList.querySelectorAll('.fault-summary-card');
  existingCards.forEach((card) => card.remove());

  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml.join(''));
  } else {
    summaryList.innerHTML = cardsHtml.join('');
  }

  // Event delegation: register once on summaryList, cleaned up via listeners manager
  setupSummaryListDelegation(summaryList);
}

// Track which containers have delegated handlers to avoid duplicates
const delegatedContainers = new WeakSet<Element>();

/**
 * Set up event delegation on the fault summary list container
 */
function setupSummaryListDelegation(summaryList: HTMLElement): void {
  if (delegatedContainers.has(summaryList)) return;
  delegatedContainers.add(summaryList);

  listeners.add(summaryList, 'click', (e: Event) => {
    const target = e.target as HTMLElement;

    // Finalize button
    const finalizeBtn = target.closest('.finalize-btn') as HTMLElement | null;
    if (finalizeBtn) {
      handleFinalizeClick(finalizeBtn);
      return;
    }

    // Edit fault button
    const editBtn = target.closest('.edit-fault-btn') as HTMLElement | null;
    if (editBtn) {
      e.stopPropagation();
      const faultId = editBtn.dataset.faultId;
      if (faultId) {
        const fault = store.getState().faultEntries.find((f) => f.id === faultId);
        if (fault) dispatchOpenFaultEditModal(fault);
      }
      return;
    }

    // Delete fault button
    const deleteBtn = target.closest('.delete-fault-btn') as HTMLElement | null;
    if (deleteBtn) {
      e.stopPropagation();
      const faultId = deleteBtn.dataset.faultId;
      if (faultId) {
        const fault = store.getState().faultEntries.find((f) => f.id === faultId);
        if (fault) {
          if (fault.markedForDeletion) {
            handleRejectFaultDeletion(fault);
          } else {
            dispatchOpenMarkDeletionModal(fault);
          }
        }
      }
    }
  });
}

/**
 * Set up event delegation on the pending deletions list container
 */
function setupPendingDeletionsDelegation(list: HTMLElement, getPendingDeletions: () => FaultEntry[]): void {
  if (delegatedContainers.has(list)) return;
  delegatedContainers.add(list);

  listeners.add(list, 'click', (e: Event) => {
    const target = e.target as HTMLElement;
    const pendingDeletions = getPendingDeletions();

    // Approve button
    const approveBtn = target.closest('.pending-deletion-btn.approve') as HTMLElement | null;
    if (approveBtn) {
      e.stopPropagation();
      const faultId = approveBtn.dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find((f) => f.id === faultId);
        if (fault) handleApproveFaultDeletion(fault);
      }
      return;
    }

    // Reject button
    const rejectBtn = target.closest('.pending-deletion-btn.reject') as HTMLElement | null;
    if (rejectBtn) {
      e.stopPropagation();
      const faultId = rejectBtn.dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find((f) => f.id === faultId);
        if (fault) handleRejectFaultDeletion(fault);
      }
    }
  });
}

/**
 * Handle rejecting a fault deletion (restore it)
 */
function handleRejectFaultDeletion(fault: FaultEntry): void {
  const success = store.rejectFaultDeletion(fault.id);

  if (success) {
    const restoredFault = store
      .getState()
      .faultEntries.find((f) => f.id === fault.id);
    if (restoredFault) {
      syncFault(restoredFault);
    }

    const lang = store.getState().currentLang;
    showToast(t('deletionRejected', lang), 'success');
    feedbackSuccess();
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}

/**
 * Handle approving a fault deletion (chief judge action)
 */
function handleApproveFaultDeletion(fault: FaultEntry): void {
  const approvedFault = store.approveFaultDeletion(fault.id);

  if (approvedFault) {
    deleteFaultFromCloud(approvedFault);

    const lang = store.getState().currentLang;
    showToast(t('deletionApproved', lang), 'success');
    feedbackDelete();
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}

/**
 * Update the pending deletions panel in Chief Judge view
 */
export function updatePendingDeletionsPanel(): void {
  const section = document.getElementById('pending-deletions-section');
  const list = document.getElementById('pending-deletions-list');
  const countEl = document.getElementById('pending-deletions-count');

  if (!section || !list || !countEl) return;

  const pendingDeletions = store.getPendingDeletions();
  const state = store.getState();
  const lang = state.currentLang;

  countEl.textContent = String(pendingDeletions.length);
  section.style.display = pendingDeletions.length > 0 ? 'block' : 'none';

  if (pendingDeletions.length === 0) {
    list.innerHTML = '';
    return;
  }

  const itemsHtml = pendingDeletions
    .map((fault) => {
      const timeStr = fault.markedForDeletionAt
        ? new Date(fault.markedForDeletionAt).toLocaleTimeString(
            getLocale(lang),
            {
              hour: '2-digit',
              minute: '2-digit',
            },
          )
        : '';

      return `
      <div class="pending-deletion-item" data-fault-id="${escapeAttr(fault.id)}">
        <div class="pending-deletion-info">
          <span class="pending-deletion-fault">
            #${escapeHtml(fault.bib.padStart(3, '0'))} T${escapeHtml(String(fault.gateNumber))} (${getFaultTypeLabel(fault.faultType, lang)}) - ${t(fault.run === 1 ? 'run1' : 'run2', lang)}
          </span>
          <span class="pending-deletion-meta">
            ${t('deletionMarkedBy', lang)}: ${escapeHtml(fault.markedForDeletionBy || '?')} (${escapeHtml(timeStr)})
          </span>
        </div>
        <div class="pending-deletion-actions">
          <button class="pending-deletion-btn approve" data-fault-id="${escapeAttr(fault.id)}" title="${escapeAttr(t('approveDeletion', lang))}" aria-label="${escapeAttr(t('approveDeletion', lang))}">
            ${iconCheck(16, 2.5)}
          </button>
          <button class="pending-deletion-btn reject" data-fault-id="${escapeAttr(fault.id)}" title="${escapeAttr(t('rejectDeletion', lang))}" aria-label="${escapeAttr(t('rejectDeletion', lang))}">
            ${iconX(16)}
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  list.innerHTML = itemsHtml;

  // Event delegation: register once on list, cleaned up via listeners manager
  setupPendingDeletionsDelegation(list, () => store.getPendingDeletions());
}

/**
 * Handle finalize button click in Chief Judge view
 */
function handleFinalizeClick(btn: HTMLElement): void {
  const bib = btn.dataset.bib;
  const runStr = btn.dataset.run;

  if (!bib || !runStr) return;

  const run = parseInt(runStr, 10) as Run;
  store.finalizeRacer(bib, run);
  feedbackSuccess();

  const state = store.getState();
  showToast(
    `#${bib.padStart(3, '0')} ${t('finalized', state.currentLang)}`,
    'success',
  );

  updateFaultSummaryPanel();
}

/**
 * Clean up Chief Judge view store subscription
 */
export function cleanupChiefJudgeView(): void {
  for (const dispose of effectDisposers) {
    dispose();
  }
  effectDisposers.length = 0;
  listeners.removeAll();
}
