/**
 * Voice Note UI Module
 * Handles the voice note modal, confirmation overlay buttons, and edit modal integration
 */

import { store } from '../store';
import { voiceNoteService } from '../services/voiceNote';
import { voiceModeService } from '../services/voice';
import { syncFault } from '../services/sync';
import { showToast } from '../components';
import { feedbackTap, feedbackSuccess } from '../services';
import { t } from '../i18n/translations';
import { openModal, closeModal, isAnyModalOpen } from './modals';

// Module state
let currentFaultId: string | null = null;
let accumulatedTranscript = '';
let unsubscribeStatus: (() => void) | null = null;
let unsubscribeTranscript: (() => void) | null = null;

// References for cleanup
let faultEditObserver: MutationObserver | null = null;
let overlayKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

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
    micBtn.classList.remove('loading');
  }

  // Reset listening indicator
  updateListeningIndicator(false);

  // Pre-warm speech recognition while modal animates (saves ~5-20ms on first recording)
  if (voiceNoteService.isSupported()) {
    voiceNoteService.initialize();
  }

  openModal(modal);

  // Focus textarea on next frame (after modal becomes visible)
  requestAnimationFrame(() => textarea?.focus());
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
  // Resume voice mode in case it was paused
  voiceModeService.resume();
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
 * Pauses voice mode service first to avoid SpeechRecognition conflicts
 */
export function startVoiceRecording(): void {
  const lang = store.getState().currentLang;

  if (!voiceNoteService.isSupported()) {
    showToast(t('voiceNoteUnsupported', lang), 'warning');
    return;
  }

  // Show loading state immediately for visual feedback while browser initializes
  const micBtn = document.getElementById('voice-note-mic-btn');
  micBtn?.classList.add('loading');

  // Pause voice mode to avoid SpeechRecognition conflicts
  // Browser only allows one active SpeechRecognition session at a time
  voiceModeService.pause();

  // Set up callbacks
  unsubscribeStatus = voiceNoteService.onStatusChange((status) => {
    // Remove loading state once browser responds
    micBtn?.classList.remove('loading');
    updateListeningIndicator(status === 'listening');

    if (status === 'error') {
      showToast(t('voiceNoteError', lang), 'warning');
      // Resume voice mode on error
      voiceModeService.resume();
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
  } else {
    // Failed to start - clear loading state and resume voice mode
    micBtn?.classList.remove('loading');
    voiceModeService.resume();
  }
}

/**
 * Stop voice recording
 * Resumes voice mode service after stopping
 */
export function stopVoiceRecording(): void {
  voiceNoteService.stop();
  cleanupSubscriptions();
  updateListeningIndicator(false);
  // Resume voice mode after voice note recording stops
  voiceModeService.resume();
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
  micBtn?.addEventListener('click', toggleVoiceRecording);

  // Save button
  const saveBtn = document.getElementById('voice-note-save-btn');
  saveBtn?.addEventListener('click', saveVoiceNote);

  // Cancel and close buttons both dismiss the modal
  const cancelBtn = document.getElementById('voice-note-cancel-btn');
  cancelBtn?.addEventListener('click', closeVoiceNoteModal);

  const closeBtn = document.getElementById('voice-note-close-btn');
  closeBtn?.addEventListener('click', closeVoiceNoteModal);

  // Textarea input handler for char count
  const textarea = document.getElementById('voice-note-textarea') as HTMLTextAreaElement;
  textarea?.addEventListener('input', updateCharCount);

  if (modal) {
    // Close on Escape key
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeVoiceNoteModal();
      }
    });

    // Close on click outside modal content (on backdrop)
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
    overlayKeydownHandler = (e: KeyboardEvent) => {
      // Only dismiss if overlay is visible AND no other modal is open
      // (modals take precedence over the confirmation overlay)
      if (e.key === 'Escape' && overlay.classList.contains('show') && !isAnyModalOpen()) {
        e.preventDefault();
        dismissFaultConfirmation();
      }
    };
    document.addEventListener('keydown', overlayKeydownHandler);
  }
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
      voiceModeService.resume();
      return;
    }

    // Pause voice mode before starting voice note recording
    voiceModeService.pause();

    // Start recording
    editUnsubscribeStatus = voiceNoteService.onStatusChange((status) => {
      if (status === 'error') {
        showToast(t('voiceNoteError', lang), 'warning');
        cleanupEditSubscriptions();
        isEditRecording = false;
        micBtn?.classList.remove('recording');
        micBtn?.setAttribute('aria-pressed', 'false');
        voiceModeService.resume();
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
    } else {
      voiceModeService.resume();
    }
  });

  // Clean up when fault edit modal closes
  const faultEditModal = document.getElementById('fault-edit-modal');
  if (faultEditModal) {
    faultEditObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isVisible = faultEditModal.classList.contains('show') ||
                           faultEditModal.style.display !== 'none';
          if (!isVisible && isEditRecording) {
            voiceNoteService.stop();
            cleanupEditSubscriptions();
            isEditRecording = false;
            const micBtn = document.getElementById('fault-edit-mic-btn');
            micBtn?.classList.remove('recording');
            micBtn?.setAttribute('aria-pressed', 'false');
            voiceModeService.resume();
          }
        }
      }
    });
    faultEditObserver.observe(faultEditModal, { attributes: true });
  }
}

/**
 * Cleanup voice note UI resources
 */
export function cleanupVoiceNoteUI(): void {
  if (faultEditObserver) {
    faultEditObserver.disconnect();
    faultEditObserver = null;
  }
  if (overlayKeydownHandler) {
    document.removeEventListener('keydown', overlayKeydownHandler);
    overlayKeydownHandler = null;
  }
  cleanupSubscriptions();
}

/**
 * Initialize all voice note UI handlers
 */
export function initVoiceNoteUI(): void {
  initVoiceNoteModal();
  initFaultConfirmationOverlay();
  initFaultEditMicHandler();
}
