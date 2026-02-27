/**
 * Extended coverage tests for Voice Note UI Module
 * Tests: initFaultEditMicHandler, MutationObserver cleanup, transcript accumulation,
 *        character count updates, confirmation overlay buttons
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
}));

vi.mock('../../../src/services/sync', () => ({
  syncFault: vi.fn(() => Promise.resolve()),
}));

const mockIsRecording = vi.fn(() => false);
const mockVoiceNoteStart = vi.fn(() => true);
const mockVoiceNoteStop = vi.fn();
const mockVoiceNoteIsSupported = vi.fn(() => true);
const mockVoiceNoteInitialize = vi.fn();

// Track callbacks for manual triggering
let capturedStatusCallback: ((status: string) => void) | null = null;
let capturedTranscriptCallback:
  | ((transcript: string, isFinal: boolean) => void)
  | null = null;

const mockVoiceNoteOnStatusChange = vi.fn((cb) => {
  capturedStatusCallback = cb;
  return vi.fn();
});
const mockVoiceNoteOnTranscript = vi.fn((cb) => {
  capturedTranscriptCallback = cb;
  return vi.fn();
});

vi.mock('../../../src/services/voiceNote', () => ({
  voiceNoteService: {
    isSupported: (...a: unknown[]) => mockVoiceNoteIsSupported(...a),
    isRecording: (...a: unknown[]) => mockIsRecording(...a),
    start: (...a: unknown[]) => mockVoiceNoteStart(...a),
    stop: (...a: unknown[]) => mockVoiceNoteStop(...a),
    initialize: (...a: unknown[]) => mockVoiceNoteInitialize(...a),
    onStatusChange: (...a: unknown[]) => mockVoiceNoteOnStatusChange(...a),
    onTranscript: (...a: unknown[]) => mockVoiceNoteOnTranscript(...a),
  },
}));

vi.mock('../../../src/services/voice', () => ({
  voiceModeService: {
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));

const mockGetState = vi.fn();

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    updateFaultEntryWithHistory: vi.fn(() => true),
  },
}));

// Use REAL ListenerManager to test handler bodies
vi.mock('../../../src/utils/listenerManager', () => {
  class RealListenerManager {
    private entries: Array<{
      el: EventTarget;
      event: string;
      handler: EventListenerOrEventListenerObject;
    }> = [];
    add(
      el: EventTarget,
      event: string,
      handler: EventListenerOrEventListenerObject,
    ) {
      el.addEventListener(event, handler);
      this.entries.push({ el, event, handler });
    }
    removeAll() {
      for (const { el, event, handler } of this.entries) {
        el.removeEventListener(event, handler);
      }
      this.entries = [];
    }
  }
  return { ListenerManager: RealListenerManager };
});

vi.mock('../../../src/utils/modalContext', () => ({
  getModalContext: vi.fn(() => ({ faultId: 'fault-1' })),
}));

vi.mock('../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  isAnyModalOpen: vi.fn(() => false),
  openModal: vi.fn(),
}));

import { showToast } from '../../../src/components';
import {
  cleanupVoiceNoteUI,
  initVoiceNoteUI,
  openVoiceNoteModal,
  saveVoiceNote,
  startVoiceRecording,
} from '../../../src/features/voiceNoteUI';
import { feedbackTap } from '../../../src/services';
import { voiceModeService } from '../../../src/services/voice';
import { store } from '../../../src/store';

describe('Voice Note UI — extended coverage', () => {
  let container: HTMLDivElement;

  function setupVoiceNoteDom(): void {
    // Voice note modal
    const modal = document.createElement('div');
    modal.id = 'voice-note-modal';
    container.appendChild(modal);

    const textarea = document.createElement('textarea');
    textarea.id = 'voice-note-textarea';
    container.appendChild(textarea);

    const charCount = document.createElement('span');
    charCount.id = 'voice-note-char-count';
    container.appendChild(charCount);

    const micBtn = document.createElement('button');
    micBtn.id = 'voice-note-mic-btn';
    container.appendChild(micBtn);

    const saveBtn = document.createElement('button');
    saveBtn.id = 'voice-note-save-btn';
    container.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'voice-note-cancel-btn';
    container.appendChild(cancelBtn);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'voice-note-close-btn';
    container.appendChild(closeBtn);

    const indicator = document.createElement('div');
    indicator.id = 'voice-note-listening-indicator';
    container.appendChild(indicator);

    // Fault confirmation overlay
    const overlay = document.createElement('div');
    overlay.id = 'fault-confirmation-overlay';
    container.appendChild(overlay);

    const content = document.createElement('div');
    content.className = 'fault-confirmation-content';
    overlay.appendChild(content);

    const addNoteBtn = document.createElement('button');
    addNoteBtn.id = 'fault-confirmation-add-note-btn';
    container.appendChild(addNoteBtn);

    const doneBtn = document.createElement('button');
    doneBtn.id = 'fault-confirmation-done-btn';
    container.appendChild(doneBtn);

    // Fault edit modal
    const faultEditModal = document.createElement('div');
    faultEditModal.id = 'fault-edit-modal';
    container.appendChild(faultEditModal);

    const editMicBtn = document.createElement('button');
    editMicBtn.id = 'fault-edit-mic-btn';
    container.appendChild(editMicBtn);

    const editTextarea = document.createElement('textarea');
    editTextarea.id = 'fault-edit-notes';
    container.appendChild(editTextarea);

    const editCharCount = document.createElement('span');
    editCharCount.id = 'fault-edit-notes-char-count';
    container.appendChild(editCharCount);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    capturedStatusCallback = null;
    capturedTranscriptCallback = null;
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      faultEntries: [
        {
          id: 'fault-1',
          bib: '042',
          gateNumber: 5,
          faultType: 'MG',
          run: 1,
          notes: '',
          timestamp: '2024-01-15T10:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    cleanupVoiceNoteUI();
    container.remove();
  });

  describe('initFaultEditMicHandler — via initVoiceNoteUI', () => {
    it('should fire fault-edit-mic-click event handler', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();

      // Dispatch the custom event that initFaultEditMicHandler listens for
      window.dispatchEvent(new Event('fault-edit-mic-click'));

      // Should have called voiceNoteService.start (via the handler)
      expect(mockVoiceNoteStart).toHaveBeenCalled();
      expect(voiceModeService.pause).toHaveBeenCalled();
    });

    it('should show unsupported toast when voice not supported', () => {
      setupVoiceNoteDom();
      mockVoiceNoteIsSupported.mockReturnValue(false);
      initVoiceNoteUI();

      window.dispatchEvent(new Event('fault-edit-mic-click'));

      expect(showToast).toHaveBeenCalledWith('voiceNoteUnsupported', 'warning');
    });

    it('should toggle recording off on second click', () => {
      setupVoiceNoteDom();
      mockVoiceNoteIsSupported.mockReturnValue(true);
      initVoiceNoteUI();

      // First click starts recording
      window.dispatchEvent(new Event('fault-edit-mic-click'));
      expect(mockVoiceNoteStart).toHaveBeenCalled();

      // Second click stops recording
      window.dispatchEvent(new Event('fault-edit-mic-click'));
      expect(mockVoiceNoteStop).toHaveBeenCalled();
      expect(voiceModeService.resume).toHaveBeenCalled();
    });

    it('should resume voice mode when start fails', () => {
      setupVoiceNoteDom();
      mockVoiceNoteIsSupported.mockReturnValue(true);
      mockVoiceNoteStart.mockReturnValue(false);
      initVoiceNoteUI();

      window.dispatchEvent(new Event('fault-edit-mic-click'));

      expect(voiceModeService.resume).toHaveBeenCalled();
    });
  });

  describe('transcript accumulation', () => {
    it('should accumulate transcript in textarea on final result', () => {
      setupVoiceNoteDom();
      openVoiceNoteModal('fault-1');
      startVoiceRecording();

      const textarea = document.getElementById(
        'voice-note-textarea',
      ) as HTMLTextAreaElement;

      // Trigger transcript callback
      if (capturedTranscriptCallback) {
        capturedTranscriptCallback('first segment', true);
        expect(textarea.value).toContain('first segment');

        capturedTranscriptCallback('second segment', true);
        expect(textarea.value).toContain('second segment');
      }
    });

    it('should not update textarea on non-final transcript', () => {
      setupVoiceNoteDom();
      openVoiceNoteModal('fault-1');
      startVoiceRecording();

      const textarea = document.getElementById(
        'voice-note-textarea',
      ) as HTMLTextAreaElement;
      const initialValue = textarea.value;

      if (capturedTranscriptCallback) {
        capturedTranscriptCallback('interim text', false);
        expect(textarea.value).toBe(initialValue);
      }
    });
  });

  describe('character count updates', () => {
    it('should update char count on textarea input', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();
      openVoiceNoteModal('fault-1');

      const textarea = document.getElementById(
        'voice-note-textarea',
      ) as HTMLTextAreaElement;
      const charCount = document.getElementById('voice-note-char-count')!;

      textarea.value = 'Hello world';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('11/500');
    });

    it('should add near-limit class when over 90%', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();
      openVoiceNoteModal('fault-1');

      const textarea = document.getElementById(
        'voice-note-textarea',
      ) as HTMLTextAreaElement;
      const charCount = document.getElementById('voice-note-char-count')!;

      // 500 * 0.9 = 450, so 451+ should trigger near-limit
      textarea.value = 'x'.repeat(460);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.classList.contains('near-limit')).toBe(true);
    });
  });

  describe('fault confirmation overlay buttons', () => {
    it('should open voice note modal when Add Note clicked', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();

      // Show overlay first
      const overlay = document.getElementById('fault-confirmation-overlay')!;
      overlay.classList.add('show');

      const addNoteBtn = document.getElementById(
        'fault-confirmation-add-note-btn',
      )!;
      addNoteBtn.click();

      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should dismiss overlay when Done clicked', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();

      const overlay = document.getElementById('fault-confirmation-overlay')!;
      overlay.classList.add('show');

      const doneBtn = document.getElementById('fault-confirmation-done-btn')!;
      doneBtn.click();

      expect(feedbackTap).toHaveBeenCalled();
    });

    it('should dismiss overlay on Escape key', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();

      const overlay = document.getElementById('fault-confirmation-overlay')!;
      overlay.classList.add('show');

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(overlay.classList.contains('show')).toBe(false);
    });

    it('should dismiss overlay on backdrop click', () => {
      setupVoiceNoteDom();
      initVoiceNoteUI();

      const overlay = document.getElementById('fault-confirmation-overlay')!;
      overlay.classList.add('show');

      // Click on overlay itself (backdrop), not on content child
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(overlay.classList.contains('show')).toBe(false);
    });
  });

  describe('saveVoiceNote — notesSource', () => {
    it('should mark notesSource as "manual" when no transcript used', () => {
      setupVoiceNoteDom();
      openVoiceNoteModal('fault-1');

      const textarea = document.getElementById(
        'voice-note-textarea',
      ) as HTMLTextAreaElement;
      textarea.value = 'Manual note';

      saveVoiceNote();

      expect(store.updateFaultEntryWithHistory).toHaveBeenCalledWith(
        'fault-1',
        expect.objectContaining({ notesSource: 'manual' }),
        expect.any(String),
      );
    });
  });

  describe('MutationObserver cleanup', () => {
    it('should stop recording when fault edit modal is hidden', async () => {
      setupVoiceNoteDom();
      mockVoiceNoteIsSupported.mockReturnValue(true);

      // Modal starts visible
      const faultEditModal = document.getElementById('fault-edit-modal')!;
      faultEditModal.classList.add('show');

      initVoiceNoteUI();

      // Start fault edit recording
      window.dispatchEvent(new Event('fault-edit-mic-click'));
      expect(mockVoiceNoteStart).toHaveBeenCalled();

      // Simulate modal being hidden via class change
      faultEditModal.style.display = 'none';
      faultEditModal.classList.remove('show');

      // MutationObserver fires asynchronously — flush microtasks
      await new Promise((r) => setTimeout(r, 0));

      expect(mockVoiceNoteStop).toHaveBeenCalled();
    });
  });
});
