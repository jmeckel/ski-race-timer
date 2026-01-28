/**
 * Chief Judge Feature Module
 * Handles Chief Judge panel functionality including fault summaries,
 * pending deletions, and racer finalization
 */

import type { AppState, FaultEntry, GateAssignment, Run, FaultType, Language } from '../types';
import { escapeHtml } from '../utils/format';
import { t } from '../i18n/translations';

// Dependencies interface
export interface ChiefJudgeDependencies {
  getState: () => AppState;
  isRacerFinalized: (bib: string, run: number) => boolean;
  getOtherGateAssignments: () => GateAssignment[];
  openFaultEditModal: (fault: FaultEntry) => void;
  openMarkDeletionModal: (fault: FaultEntry) => void;
  rejectFaultDeletion: (faultId: string) => boolean;
  approveFaultDeletion: (faultId: string) => Promise<boolean>;
  getFaultById: (faultId: string) => FaultEntry | undefined;
  syncFaultToCloud: (fault: FaultEntry) => void;
  deleteFaultFromCloud: (fault: FaultEntry) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  feedbackTap: () => void;
  handleFinalizeClick: (e: Event) => void;
}

let deps: ChiefJudgeDependencies | null = null;

/**
 * Initialize the Chief Judge module with dependencies
 */
export function initChiefJudge(dependencies: ChiefJudgeDependencies): void {
  deps = dependencies;
}

/**
 * Get fault type label for display
 */
function getFaultTypeLabel(faultType: FaultType, lang: Language): string {
  const labels: Record<FaultType, Record<Language, string>> = {
    MG: { de: 'Ausgelassen', en: 'Missed' },
    STR: { de: 'Einfädler', en: 'Straddling' },
    BR: { de: 'Bindung', en: 'Binding' }
  };
  return labels[faultType]?.[lang] || faultType;
}

/**
 * Update Chief Judge toggle button visibility
 * Only show when sync is enabled
 */
export function updateChiefJudgeToggleVisibility(): void {
  const toggleRow = document.getElementById('chief-judge-toggle-row');
  if (!toggleRow || !deps) return;

  const state = deps.getState();
  // Show toggle when sync is enabled (even if no faults yet - chief may want to monitor)
  const shouldShow = state.settings.sync;
  toggleRow.style.display = shouldShow ? 'block' : 'none';
}

/**
 * Update Chief Judge view state
 */
export function updateChiefJudgeView(): void {
  if (!deps) return;

  const state = deps.getState();
  const resultsView = document.querySelector('.results-view');
  const toggleBtn = document.getElementById('chief-judge-toggle-btn');

  if (!resultsView || !toggleBtn) return;

  // Toggle active state on button and view
  toggleBtn.classList.toggle('active', state.isChiefJudgeView);
  resultsView.classList.toggle('chief-mode', state.isChiefJudgeView);

  // Populate panels when entering chief mode
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
  if (!deps) return;

  const overviewList = document.getElementById('judges-overview-list');
  const overviewCount = document.getElementById('judges-overview-count');
  const emptyState = document.getElementById('judges-overview-empty');

  if (!overviewList || !overviewCount) return;

  // Get all gate assignments from sync service
  const assignments = deps.getOtherGateAssignments();

  // Also include this device if it's a gate judge
  const state = deps.getState();
  const allJudges: GateAssignment[] = [...assignments];

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

  // Update count
  overviewCount.textContent = String(allJudges.length);

  // Show/hide empty state
  if (emptyState) {
    emptyState.style.display = allJudges.length === 0 ? 'block' : 'none';
  }

  // Build judge cards
  const existingCards = overviewList.querySelectorAll('.judge-card');
  existingCards.forEach(card => card.remove());

  if (allJudges.length === 0) return;

  // Sort by gate start
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
 * Groups faults by bib number and shows summary for each racer
 */
export function updateFaultSummaryPanel(): void {
  if (!deps) return;

  const summaryList = document.getElementById('fault-summary-list');
  const summaryCount = document.getElementById('fault-summary-count');
  const emptyState = document.getElementById('chief-empty-state');

  if (!summaryList || !summaryCount) return;

  const state = deps.getState();
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

  // Update count badge
  summaryCount.textContent = String(faultsByBib.size);

  // Show/hide empty state
  if (emptyState) {
    emptyState.style.display = faultsByBib.size === 0 ? 'flex' : 'none';
  }

  if (faultsByBib.size === 0) {
    // Clear any existing cards (except empty state)
    const cards = summaryList.querySelectorAll('.fault-summary-card');
    cards.forEach(card => card.remove());
    return;
  }

  // Build fault summary cards HTML
  const cardsHtml: string[] = [];

  // Sort by bib number
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

    // Check if this racer is finalized
    const isFinalized = deps.isRacerFinalized(bib, run);

    // Count active faults (not marked for deletion) for penalty calculation
    const activeFaults = racerFaults.filter(f => !f.markedForDeletion);

    // Calculate penalty using configurable values (only count active faults)
    const penaltySeconds = state.usePenaltyMode ? activeFaults.length * state.penaltySeconds : 0;

    // Build fault rows with edit/delete buttons
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

    // Build action button (finalize or finalized badge)
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

    // Build status display based on penalty mode
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

  // Remove existing cards and add new ones
  const existingCards = summaryList.querySelectorAll('.fault-summary-card');
  existingCards.forEach(card => card.remove());

  // Insert cards before empty state
  if (emptyState) {
    emptyState.insertAdjacentHTML('beforebegin', cardsHtml.join(''));
  } else {
    summaryList.innerHTML = cardsHtml.join('');
  }

  // Add click handlers for finalize buttons
  const finalizeButtons = summaryList.querySelectorAll('.finalize-btn');
  finalizeButtons.forEach(btn => {
    btn.addEventListener('click', deps!.handleFinalizeClick);
  });

  // Add click handlers for edit fault buttons
  const editFaultButtons = summaryList.querySelectorAll('.edit-fault-btn');
  editFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = deps!.getFaultById(faultId);
        if (fault) {
          deps!.openFaultEditModal(fault);
        }
      }
    });
  });

  // Add click handlers for delete/mark for deletion buttons
  const deleteFaultButtons = summaryList.querySelectorAll('.delete-fault-btn');
  deleteFaultButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const faultId = (btn as HTMLElement).dataset.faultId;
      if (faultId) {
        const fault = deps!.getFaultById(faultId);
        if (fault) {
          if (fault.markedForDeletion) {
            // Reject deletion - restore the fault
            handleRejectFaultDeletion(fault);
          } else {
            // Mark for deletion
            deps!.openMarkDeletionModal(fault);
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
  if (!deps) return;

  const success = deps.rejectFaultDeletion(fault.id);

  if (success) {
    // Sync the updated fault to cloud
    const restoredFault = deps.getFaultById(fault.id);
    if (restoredFault) {
      deps.syncFaultToCloud(restoredFault);
    }

    const state = deps.getState();
    deps.showToast(t('deletionRejected', state.currentLang), 'success');

    // Refresh panels
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}

/**
 * Update the pending deletions panel in Chief Judge view
 */
export function updatePendingDeletionsPanel(): void {
  if (!deps) return;

  const pendingList = document.getElementById('pending-deletions-list');
  const pendingCount = document.getElementById('pending-deletions-count');
  const emptyState = document.getElementById('pending-deletions-empty');
  const panel = document.getElementById('pending-deletions-panel');

  if (!pendingList || !pendingCount || !panel) return;

  const state = deps.getState();
  const lang = state.currentLang;

  // Get faults marked for deletion
  const pendingDeletions = state.faultEntries.filter(f => f.markedForDeletion);

  // Update count
  pendingCount.textContent = String(pendingDeletions.length);

  // Show/hide panel based on whether there are pending deletions
  panel.style.display = pendingDeletions.length > 0 ? 'block' : 'none';

  // Show/hide empty state
  if (emptyState) {
    emptyState.style.display = pendingDeletions.length === 0 ? 'flex' : 'none';
  }

  // Clear existing items
  const existingItems = pendingList.querySelectorAll('.pending-deletion-item');
  existingItems.forEach(item => item.remove());

  if (pendingDeletions.length === 0) return;

  // Build pending deletion items
  pendingDeletions.forEach(fault => {
    const item = document.createElement('div');
    item.className = 'pending-deletion-item';
    item.setAttribute('data-fault-id', fault.id);

    item.innerHTML = `
      <div class="pending-deletion-info">
        <span class="pending-deletion-bib">#${fault.bib}</span>
        <span class="pending-deletion-gate">T${fault.gateNumber} (${fault.faultType})</span>
        <span class="pending-deletion-run">${t('run1', lang).replace('1', String(fault.run))}</span>
      </div>
      <div class="pending-deletion-meta">
        <span>${t('deletionMarkedBy', lang)}: ${escapeHtml(fault.markedForDeletionBy || 'Unknown')}</span>
      </div>
      <div class="pending-deletion-actions">
        <button class="approve-deletion-btn danger" data-fault-id="${fault.id}">
          ${t('approveDeletion', lang)}
        </button>
        <button class="reject-deletion-btn" data-fault-id="${fault.id}">
          ${t('rejectDeletion', lang)}
        </button>
      </div>
    `;

    // Approve deletion button handler
    const approveBtn = item.querySelector('.approve-deletion-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        deps!.feedbackTap();
        await handleApproveDeletion(fault);
      });
    }

    // Reject deletion button handler
    const rejectBtn = item.querySelector('.reject-deletion-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => {
        deps!.feedbackTap();
        handleRejectFaultDeletion(fault);
      });
    }

    pendingList.appendChild(item);
  });
}

/**
 * Handle approving a fault deletion
 */
async function handleApproveDeletion(fault: FaultEntry): Promise<void> {
  if (!deps) return;

  const success = await deps.approveFaultDeletion(fault.id);

  if (success) {
    // Delete from cloud
    deps.deleteFaultFromCloud(fault);

    const state = deps.getState();
    deps.showToast(t('deletionApproved', state.currentLang), 'success');

    // Refresh panels
    updateFaultSummaryPanel();
    updatePendingDeletionsPanel();
  }
}
