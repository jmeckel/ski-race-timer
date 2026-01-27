/**
 * Chief Judge View Module
 * Handles Chief Judge panel, fault summaries, penalty configuration, and deletion approvals
 */

import { store } from '../store';
import { syncService, syncFault, deleteFaultFromCloud } from '../services/sync';
import { showToast } from '../components';
import { feedbackTap, feedbackSuccess, feedbackDelete } from '../services';
import { t } from '../i18n/translations';
import { escapeHtml } from '../utils';
import { exportResults, exportChiefSummary, exportFaultSummaryWhatsApp } from './export';
import type { FaultEntry, FaultType, Language, Run } from '../types';

// Callback types for external dependencies
type VerifyPinCallback = (lang: Language) => Promise<boolean>;
type OpenFaultEditCallback = (fault: FaultEntry) => void;
type OpenMarkDeletionCallback = (fault: FaultEntry) => void;
type UpdateGateJudgeCallback = () => void;

// Store callbacks for use in event handlers
let verifyPinForChiefJudgeCallback: VerifyPinCallback | null = null;
let openFaultEditModalCallback: OpenFaultEditCallback | null = null;
let openMarkDeletionModalCallback: OpenMarkDeletionCallback | null = null;
let updateInlineFaultsListCallback: UpdateGateJudgeCallback | null = null;
let updateInlineBibSelectorCallback: UpdateGateJudgeCallback | null = null;
let updateInlineGateSelectorCallback: UpdateGateJudgeCallback | null = null;

/**
 * Get localized fault type label
 */
export function getFaultTypeLabel(faultType: FaultType, lang: Language): string {
  const labels: Record<FaultType, string> = {
    'MG': t('faultMGShort', lang),
    'STR': t('faultSTRShort', lang),
    'BR': t('faultBRShort', lang)
  };
  return labels[faultType] || faultType;
}

/**
 * Initialize Chief Judge toggle button
 * @param callbacks External callbacks for PIN verification and modal functions
 */
export function initChiefJudgeToggle(callbacks: {
  verifyPinForChiefJudge: VerifyPinCallback;
  openFaultEditModal: OpenFaultEditCallback;
  openMarkDeletionModal: OpenMarkDeletionCallback;
  updateInlineFaultsList: UpdateGateJudgeCallback;
  updateInlineBibSelector: UpdateGateJudgeCallback;
  updateInlineGateSelector: UpdateGateJudgeCallback;
}): void {
  // Store callbacks for use in event handlers
  verifyPinForChiefJudgeCallback = callbacks.verifyPinForChiefJudge;
  openFaultEditModalCallback = callbacks.openFaultEditModal;
  openMarkDeletionModalCallback = callbacks.openMarkDeletionModal;
  updateInlineFaultsListCallback = callbacks.updateInlineFaultsList;
  updateInlineBibSelectorCallback = callbacks.updateInlineBibSelector;
  updateInlineGateSelectorCallback = callbacks.updateInlineGateSelector;

  const toggleBtn = document.getElementById('chief-judge-toggle-btn');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', async () => {
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
    if (state.settings.sync && state.raceId && verifyPinForChiefJudgeCallback) {
      const verified = await verifyPinForChiefJudgeCallback(lang);
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

  // Subscribe to state changes to update visibility and refresh panel
  // Note: stateSnapshot is captured when notification was queued - use store.getState() if you need latest
  store.subscribe((stateSnapshot, keys) => {
    if (keys.includes('settings') || keys.includes('faultEntries')) {
      updateChiefJudgeToggleVisibility();
    }
    // Refresh fault summary panel when faults or penalty config change and panel is visible
    if ((keys.includes('faultEntries') || keys.includes('penaltySeconds') || keys.includes('usePenaltyMode')) && stateSnapshot.isChiefJudgeView) {
      updateFaultSummaryPanel();
      updatePendingDeletionsPanel();
    }
    // Update penalty UI when config changes
    if (keys.includes('penaltySeconds') || keys.includes('usePenaltyMode')) {
      updatePenaltyConfigUI();
    }
    // Update judges overview when entries change (sync polling) and panel is visible
    if ((keys.includes('entries') || keys.includes('faultEntries') || keys.includes('isJudgeReady')) && stateSnapshot.isChiefJudgeView) {
      updateJudgesOverview();
    }
    // Update inline fault list when faults change and device is a gate judge
    if (keys.includes('faultEntries') && stateSnapshot.deviceRole === 'gateJudge') {
      updateInlineFaultsListCallback?.();
      updateInlineBibSelectorCallback?.();
    }
    // Update inline bib selector when entries change (new starts/finishes) and device is a gate judge
    if (keys.includes('entries') && stateSnapshot.deviceRole === 'gateJudge') {
      updateInlineBibSelectorCallback?.();
    }
    // Update inline gate selector when gate assignment changes
    if (keys.includes('gateAssignment') && stateSnapshot.deviceRole === 'gateJudge') {
      updateInlineGateSelectorCallback?.();
    }
  });

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
    csvBtn.addEventListener('click', () => {
      feedbackTap();
      exportResults();
    });
  }

  const summaryBtn = document.getElementById('export-summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', () => {
      feedbackTap();
      exportChiefSummary();
    });
  }

  const whatsappBtn = document.getElementById('export-whatsapp-btn');
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
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
    modeToggle.addEventListener('click', (e) => {
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
    secondsSelector.addEventListener('click', (e) => {
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
    buttons.forEach(btn => {
      const mode = btn.getAttribute('data-mode');
      const isActive = (mode === 'penalty' && state.usePenaltyMode) ||
                       (mode === 'dsq' && !state.usePenaltyMode);
      btn.classList.toggle('active', isActive);
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
      isReady: state.isJudgeReady
    });
  }

  overviewCount.textContent = String(allJudges.length);

  if (emptyState) {
    emptyState.style.display = allJudges.length === 0 ? 'block' : 'none';
  }

  const existingCards = overviewList.querySelectorAll('.judge-card');
  existingCards.forEach(card => card.remove());

  if (allJudges.length === 0) return;

  allJudges.sort((a, b) => a.gateStart - b.gateStart);

  const cardsHtml = allJudges.map(judge => `
    <div class="judge-card${judge.isReady ? ' ready' : ''}">
      <span class="judge-ready-indicator"></span>
      <span class="judge-name" title="${escapeHtml(judge.deviceName)}">${escapeHtml(judge.deviceName)}</span>
      <span class="judge-gates">${judge.gateStart}–${judge.gateEnd}</span>
    </div>
  `).join('');

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
    cards.forEach(card => card.remove());
    return;
  }

  const cardsHtml: string[] = [];

  const sortedEntries = Array.from(faultsByBib.entries()).sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const bibA = parseInt(keyA.split('-')[0], 10) || 0;
    const bibB = parseInt(keyB.split('-')[0], 10) || 0;
    return bibA - bibB;
  });

  for (const [key, racerFaults] of sortedEntries) {
    const [bib, runStr] = key.split('-');
    const run = parseInt(runStr, 10) as Run;

    const isFinalized = store.isRacerFinalized(bib, run);
    const activeFaults = racerFaults.filter(f => !f.markedForDeletion);
    const penaltySeconds = state.usePenaltyMode ? activeFaults.length * state.penaltySeconds : 0;

    const faultRows = racerFaults.map(fault => {
      const isMarkedForDeletion = fault.markedForDeletion;
      const deletionInfo = isMarkedForDeletion && fault.markedForDeletionBy
        ? `${t('deletionPending', lang)} (${fault.markedForDeletionBy})`
        : '';

      return `
        <div class="fault-entry-row${isMarkedForDeletion ? ' marked-for-deletion' : ''}" data-fault-id="${fault.id}">
          <div class="fault-gate-info">
            <span class="fault-gate-num${isMarkedForDeletion ? ' strikethrough' : ''}">${t('gate', lang)} ${fault.gateNumber}</span>
            <span class="fault-type-badge${isMarkedForDeletion ? ' marked' : ''}">${getFaultTypeLabel(fault.faultType, lang)}</span>
            ${isMarkedForDeletion ? `<span class="deletion-pending-badge" title="${deletionInfo}">⚠</span>` : ''}
          </div>
          <span class="fault-judge-name">${escapeHtml(fault.deviceName)}</span>
          <div class="fault-row-actions">
            <button class="fault-row-btn edit-fault-btn" data-fault-id="${fault.id}" title="${t('edit', lang)}" ${isMarkedForDeletion ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="fault-row-btn delete-fault-btn" data-fault-id="${fault.id}" title="${isMarkedForDeletion ? t('rejectDeletion', lang) : t('markForDeletion', lang)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isMarkedForDeletion
                  ? '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/>'
                  : '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'}
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    const actionHtml = isFinalized
      ? `<div class="finalized-badge">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M20 6L9 17l-5-5"/>
           </svg>
           ${t('finalized', lang)}
         </div>`
      : `<button class="finalize-btn" data-bib="${bib}" data-run="${run}">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M20 6L9 17l-5-5"/>
           </svg>
           ${t('finalize', lang)}
         </button>`;

    const statusHtml = state.usePenaltyMode
      ? `<span class="fault-card-penalty">+${penaltySeconds}s</span>
         <span class="fault-card-result flt">${t('flt', lang)}</span>`
      : `<span class="fault-card-result dsq">DSQ</span>`;

    cardsHtml.push(`
      <div class="fault-summary-card${isFinalized ? ' finalized' : ''}" data-bib="${bib}" data-run="${run}">
        <div class="fault-card-header">
          <span class="fault-card-bib">#${bib.padStart(3, '0')}</span>
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
  existingCards.forEach(card => card.remove());

  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml.join(''));
  } else {
    summaryList.innerHTML = cardsHtml.join('');
  }

  // Add click handlers
  const finalizeButtons = summaryList.querySelectorAll('.finalize-btn');
  finalizeButtons.forEach(btn => {
    btn.addEventListener('click', handleFinalizeClick);
  });

  const editFaultButtons = summaryList.querySelectorAll('.edit-fault-btn');
  editFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId && openFaultEditModalCallback) {
        const fault = store.getState().faultEntries.find(f => f.id === faultId);
        if (fault) {
          openFaultEditModalCallback(fault);
        }
      }
    });
  });

  const deleteFaultButtons = summaryList.querySelectorAll('.delete-fault-btn');
  deleteFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = store.getState().faultEntries.find(f => f.id === faultId);
        if (fault) {
          if (fault.markedForDeletion) {
            handleRejectFaultDeletion(fault);
          } else if (openMarkDeletionModalCallback) {
            openMarkDeletionModalCallback(fault);
          }
        }
      }
    });
  });
}

/**
 * Handle rejecting a fault deletion (restore it)
 */
function handleRejectFaultDeletion(fault: FaultEntry): void {
  const success = store.rejectFaultDeletion(fault.id);

  if (success) {
    const restoredFault = store.getState().faultEntries.find(f => f.id === fault.id);
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

  const itemsHtml = pendingDeletions.map(fault => {
    const timeStr = fault.markedForDeletionAt
      ? new Date(fault.markedForDeletionAt).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    return `
      <div class="pending-deletion-item" data-fault-id="${fault.id}">
        <div class="pending-deletion-info">
          <span class="pending-deletion-fault">
            #${fault.bib.padStart(3, '0')} T${fault.gateNumber} (${getFaultTypeLabel(fault.faultType, lang)}) - ${t(fault.run === 1 ? 'run1' : 'run2', lang)}
          </span>
          <span class="pending-deletion-meta">
            ${t('deletionMarkedBy', lang)}: ${fault.markedForDeletionBy || '?'} (${timeStr})
          </span>
        </div>
        <div class="pending-deletion-actions">
          <button class="pending-deletion-btn approve" data-fault-id="${fault.id}" title="${t('approveDeletion', lang)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </button>
          <button class="pending-deletion-btn reject" data-fault-id="${fault.id}" title="${t('rejectDeletion', lang)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = itemsHtml;

  list.querySelectorAll('.pending-deletion-btn.approve').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find(f => f.id === faultId);
        if (fault) {
          handleApproveFaultDeletion(fault);
        }
      }
    });
  });

  list.querySelectorAll('.pending-deletion-btn.reject').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = pendingDeletions.find(f => f.id === faultId);
        if (fault) {
          handleRejectFaultDeletion(fault);
        }
      }
    });
  });
}

/**
 * Handle finalize button click in Chief Judge view
 */
function handleFinalizeClick(event: Event): void {
  const btn = event.currentTarget as HTMLElement;
  const bib = btn.dataset.bib;
  const runStr = btn.dataset.run;

  if (!bib || !runStr) return;

  const run = parseInt(runStr, 10) as Run;
  store.finalizeRacer(bib, run);
  feedbackSuccess();

  const state = store.getState();
  showToast(`#${bib.padStart(3, '0')} ${t('finalized', state.currentLang)}`, 'success');

  updateFaultSummaryPanel();
}
