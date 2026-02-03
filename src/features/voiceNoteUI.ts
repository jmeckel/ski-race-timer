/**
 * Voice Note UI Module
 * Handles the voice note modal, confirmation overlay buttons, and edit modal integration
 */

import { store } from '../store';
import { voiceNoteService } from '../services/voiceNote';
import { syncFault } from '../services/sync';
import { showToast } from '../components';
import { feedbackTap, feedbackSuccess } from '../services';
import { t } from '../i18n/translations';
import { openModal, closeModal, isAnyModalOpen } from './modals';
import { escapeAttr } from '../utils';
import type { FaultEntry } from '../types';

// Module state
let currentFaultId: string | null = null;
let accumulatedTranscript = '';
let unsubscribeStatus: (() => void) | null = null;
let unsubscribeTranscript: (() => void) | null = null;

// Max note length
const MAX_NOTE_LENGTH = 500;

/**
 * Open voice note modal for a fault
 */
export function openVoiceNoteModal(faultId: string): void {
  const modal = document.getElementById('voice-note-modal');
  if (!modal) return;

  currentFaultId = faultId;
  accumulatedTranscript = '';

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === faultId);

  // Pre-populate with existing notes if any
  const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
  if (textarea) {
    textarea.value = fault?.notes || '';
    updateCharCount();
  }

  // Update mic button state based on support
  const micBtn = document.getElementById('voice-note-mic-btn');
  if (micBtn) {
    micBtn.classList.toggle('unsupported', !voiceNoteService.isSupported());
  }

  // Reset listening indicator
  updateListeningIndicator(false);

  openModal(modal);

  // Focus textarea
  setTimeout(() => textarea?.focus(), 100);
}

/**
 * Close voice note modal
 */
export function closeVoiceNoteModal(): void {
  voiceNoteService.stop();
  cleanupSubscriptions();
  currentFaultId = null;
  accumulatedTranscript = '';
  closeModal(document.getElementById('voice-note-modal'));
}

/**
 * Save voice note to fault
 */
export function saveVoiceNote(): void {
  if (!currentFaultId) return;

  const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
  const notes = textarea?.value.trim().slice(0, MAX_NOTE_LENGTH) || '';

  const state = store.getState();
  const fault = state.faultEntries.find(f => f.id === currentFaultId);
  if (!fault) return;

  // Determine notes source based on whether transcript was used
  const notesSource = accumulatedTranscript ? 'voice' : 'manual';

  // Update fault with notes (using existing version tracking)
  const changeDescription = notes
    ? `notes: ${notes.slice(0, 30)}${notes.length > 30 ? '...' : ''}`
    : 'notes removed';

  const success = store.updateFaultEntryWithHistory(currentFaultId, {
    notes: notes || undefined,
    notesSource: notes ? notesSource : undefined,
    notesTimestamp: notes ? new Date().toISOString() : undefined
  }, changeDescription);

  if (success) {
    // Sync updated fault to cloud
    const updatedFault = store.getState().faultEntries.find(f => f.id === currentFaultId);
    if (updatedFault) {
      syncFault(updatedFault);
    }

    const lang = state.currentLang;
    showToast(t('noteSaved', lang), 'success');
    feedbackSuccess();
  }

  closeVoiceNoteModal();
}

/**
 * Start voice recording
 */
export function startVoiceRecording(): void {
  const lang = store.getState().currentLang;

  if (!voiceNoteService.isSupported()) {
    showToast(t('voiceNoteUnsupported', lang), 'warning');
    return;
  }

  // Set up callbacks
  unsubscribeStatus = voiceNoteService.onStatusChange((status) => {
    updateListeningIndicator(status === 'listening');

    if (status === 'error') {
      showToast(t('voiceNoteError', lang), 'warning');
    }
  });

  unsubscribeTranscript = voiceNoteService.onTranscript((transcript, isFinal) => {
    const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    if (isFinal) {
      // Append final transcript to accumulated
      accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + transcript;

      // Update textarea with accumulated transcript
      const currentText = textarea.value;
      const newText = currentText
        ? currentText + ' ' + transcript
        : transcript;
      textarea.value = newText.slice(0, MAX_NOTE_LENGTH);
      updateCharCount();
    }
  });

  const started = voiceNoteService.start();
  if (started) {
    feedbackTap();
  }
}

/**
 * Stop voice recording
 */
export function stopVoiceRecording(): void {
  voiceNoteService.stop();
  cleanupSubscriptions();
  updateListeningIndicator(false);
}

/**
 * Toggle voice recording
 */
export function toggleVoiceRecording(): void {
  if (voiceNoteService.isRecording()) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

/**
 * Update listening indicator UI
 */
function updateListeningIndicator(isListening: boolean): void {
  const indicator = document.getElementById('voice-note-listening-indicator');
  const micBtn = document.getElementById('voice-note-mic-btn');

  if (indicator) {
    indicator.classList.toggle('active', isListening);
  }

  if (micBtn) {
    micBtn.classList.toggle('recording', isListening);
    micBtn.setAttribute('aria-pressed', String(isListening));
  }
}

/**
 * Update character count display
 */
function updateCharCount(): void {
  const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
  const charCount = document.getElementById('voice-note-char-count');

  if (textarea && charCount) {
    const count = textarea.value.length;
    charCount.textContent = `${count}/${MAX_NOTE_LENGTH}`;
    charCount.classList.toggle('near-limit', count > MAX_NOTE_LENGTH * 0.9);
  }
}

/**
 * Cleanup subscriptions
 */
function cleanupSubscriptions(): void {
  if (unsubscribeStatus) {
    unsubscribeStatus();
    unsubscribeStatus = null;
  }
  if (unsubscribeTranscript) {
    unsubscribeTranscript();
    unsubscribeTranscript = null;
  }
}

/**
 * Initialize voice note modal handlers
 */
export function initVoiceNoteModal(): void {
  const modal = document.getElementById('voice-note-modal');

  // Mic button
  const micBtn = document.getElementById('voice-note-mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleVoiceRecording();
    });
  }

  // Save button
  const saveBtn = document.getElementById('voice-note-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveVoiceNote();
    });
  }

  // Cancel button
  const cancelBtn = document.getElementById('voice-note-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeVoiceNoteModal();
    });
  }

  // Close button (X in header)
  const closeBtn = document.getElementById('voice-note-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeVoiceNoteModal();
    });
  }

  // Textarea input handler for char count
  const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
  if (textarea) {
    textarea.addEventListener('input', () => {
      updateCharCount();
    });
  }

  // Close on Escape key
  if (modal) {
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeVoiceNoteModal();
      }
    });
  }

  // Close on click outside modal content (on backdrop)
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeVoiceNoteModal();
      }
    });
  }
}

/**
 * Dismiss fault confirmation overlay
 */
function dismissFaultConfirmation(): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  if (overlay?.classList.contains('show')) {
    overlay.classList.remove('show');
  }
}

/**
 * Initialize fault confirmation overlay "Add Note" button
 */
export function initFaultConfirmationOverlay(): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  const content = overlay?.querySelector('.fault-confirmation-content');

  const addNoteBtn = document.getElementById('fault-confirmation-add-note-btn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', () => {
      feedbackTap();

      // Get the fault ID from the overlay
      const faultId = overlay?.getAttribute('data-fault-id');

      // Hide the confirmation overlay
      dismissFaultConfirmation();

      // Open voice note modal if we have a fault ID
      if (faultId) {
        openVoiceNoteModal(faultId);
      }
    });
  }

  const doneBtn = document.getElementById('fault-confirmation-done-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      feedbackTap();
      dismissFaultConfirmation();
    });
  }

  // Dismiss on click outside content (on backdrop)
  if (overlay && content) {
    overlay.addEventListener('click', (e) => {
      // Only dismiss if clicking on the backdrop, not the content
      if (e.target === overlay) {
        feedbackTap();
        dismissFaultConfirmation();
      }
    });
  }

  // Dismiss on Escape key
  if (overlay) {
    // Use document-level listener to catch ESC even without focus
    document.addEventListener('keydown', (e) => {
      // Only dismiss if overlay is visible AND no other modal is open
      // (modals take precedence over the confirmation overlay)
      if (e.key === 'Escape' && overlay.classList.contains('show') && !isAnyModalOpen()) {
        e.preventDefault();
        dismissFaultConfirmation();
      }
    });
  }
}

/**
 * Show fault confirmation with note option (replaces auto-dismiss)
 */
export function showFaultConfirmationWithNoteOption(fault: FaultEntry): void {
  const overlay = document.getElementById('fault-confirmation-overlay');
  if (!overlay) return;

  // Store fault ID for "Add Note" button (escaped for safety)
  overlay.setAttribute('data-fault-id', escapeAttr(fault.id));

  const bibEl = overlay.querySelector('.fault-confirmation-bib');
  const gateEl = overlay.querySelector('.fault-confirmation-gate');
  const typeEl = overlay.querySelector('.fault-confirmation-type');

  const state = store.getState();
  const lang = state.currentLang;

  // Using textContent which auto-escapes HTML
  if (bibEl) bibEl.textContent = fault.bib;
  if (gateEl) gateEl.textContent = `${t('gate', lang)} ${fault.gateNumber}`;
  if (typeEl) typeEl.textContent = getFaultTypeLabel(fault.faultType, lang);

  overlay.classList.add('show');

  // Focus the Done button for keyboard accessibility
  const doneBtn = document.getElementById('fault-confirmation-done-btn');
  setTimeout(() => doneBtn?.focus(), 100);
}

/**
 * Get localized fault type label (imported from chiefJudgeView but duplicated to avoid circular deps)
 */
function getFaultTypeLabel(faultType: string, lang: string): string {
  const labels: Record<string, string> = {
    'MG': t('faultMGShort', lang as 'en' | 'de'),
    'STR': t('faultSTRShort', lang as 'en' | 'de'),
    'BR': t('faultBRShort', lang as 'en' | 'de')
  };
  return labels[faultType] || faultType;
}

/**
 * Initialize fault edit modal voice recording
 */
function initFaultEditMicHandler(): void {
  // State for fault edit recording
  let isEditRecording = false;
  let editUnsubscribeStatus: (() => void) | null = null;
  let editUnsubscribeTranscript: (() => void) | null = null;

  const cleanupEditSubscriptions = () => {
    if (editUnsubscribeStatus) {
      editUnsubscribeStatus();
      editUnsubscribeStatus = null;
    }
    if (editUnsubscribeTranscript) {
      editUnsubscribeTranscript();
      editUnsubscribeTranscript = null;
    }
  };

  window.addEventListener('fault-edit-mic-click', () => {
    const lang = store.getState().currentLang;
    const micBtn = document.getElementById('fault-edit-mic-btn');
    const textarea = document.getElementById('fault-edit-notes') as HTMLTextAreaElement;
    const charCount = document.getElementById('fault-edit-notes-char-count');

    if (!voiceNoteService.isSupported()) {
      showToast(t('voiceNoteUnsupported', lang), 'warning');
      return;
    }

    if (isEditRecording) {
      // Stop recording
      voiceNoteService.stop();
      cleanupEditSubscriptions();
      isEditRecording = false;
      micBtn?.classList.remove('recording');
      micBtn?.setAttribute('aria-pressed', 'false');
      return;
    }

    // Start recording
    editUnsubscribeStatus = voiceNoteService.onStatusChange((status) => {
      if (status === 'error') {
        showToast(t('voiceNoteError', lang), 'warning');
        cleanupEditSubscriptions();
        isEditRecording = false;
        micBtn?.classList.remove('recording');
        micBtn?.setAttribute('aria-pressed', 'false');
      }
    });

    editUnsubscribeTranscript = voiceNoteService.onTranscript((transcript, isFinal) => {
      if (isFinal && textarea) {
        const currentText = textarea.value;
        const newText = currentText
          ? currentText + ' ' + transcript
          : transcript;
        textarea.value = newText.slice(0, 500);

        // Update char count
        if (charCount) {
          const count = textarea.value.length;
          charCount.textContent = `${count}/500`;
          charCount.classList.toggle('near-limit', count > 450);
        }
      }
    });

    const started = voiceNoteService.start();
    if (started) {
      isEditRecording = true;
      micBtn?.classList.add('recording');
      micBtn?.setAttribute('aria-pressed', 'true');
      feedbackTap();
    }
  });

  // Clean up when fault edit modal closes
  const faultEditModal = document.getElementById('fault-edit-modal');
  if (faultEditModal) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isVisible = faultEditModal.classList.contains('active') ||
                           faultEditModal.style.display !== 'none';
          if (!isVisible && isEditRecording) {
            voiceNoteService.stop();
            cleanupEditSubscriptions();
            isEditRecording = false;
            const micBtn = document.getElementById('fault-edit-mic-btn');
            micBtn?.classList.remove('recording');
            micBtn?.setAttribute('aria-pressed', 'false');
          }
        }
      }
    });
    observer.observe(faultEditModal, { attributes: true });
  }
}

/**
 * Initialize all voice note UI handlers
 */
export function initVoiceNoteUI(): void {
  initVoiceNoteModal();
  initFaultConfirmationOverlay();
  initFaultEditMicHandler();
}
