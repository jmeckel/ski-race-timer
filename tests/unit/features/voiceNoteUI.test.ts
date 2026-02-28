/**
 * Unit Tests for Voice Note UI Module
 * Tests: openVoiceNoteModal, closeVoiceNoteModal, saveVoiceNote,
 *        startVoiceRecording, stopVoiceRecording, toggleVoiceRecording,
 *        initVoiceNoteModal, initFaultConfirmationOverlay, cleanupVoiceNoteUI
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
const mockVoiceNoteOnStatusChange = vi.fn(() => vi.fn());
const mockVoiceNoteOnTranscript = vi.fn(() => vi.fn());

vi.mock('../../../src/services/voiceNote', () => ({
  voiceNoteService: {
    isSupported: (...args: unknown[]) => mockVoiceNoteIsSupported(...args),
    isRecording: (...args: unknown[]) => mockIsRecording(...args),
    start: (...args: unknown[]) => mockVoiceNoteStart(...args),
    stop: (...args: unknown[]) => mockVoiceNoteStop(...args),
    initialize: (...args: unknown[]) => mockVoiceNoteInitialize(...args),
    onStatusChange: (...args: unknown[]) =>
      mockVoiceNoteOnStatusChange(...args),
    onTranscript: (...args: unknown[]) => mockVoiceNoteOnTranscript(...args),
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

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
}));

vi.mock('../../../src/utils/modalContext', () => ({
  getModalContext: vi.fn(() => null),
}));

vi.mock('../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  isAnyModalOpen: vi.fn(() => false),
  openModal: vi.fn(),
}));

import { showToast } from '../../../src/components';
import { openModal } from '../../../src/features/modals';
import {
  cleanupVoiceNoteUI,
  closeVoiceNoteModal,
  initFaultConfirmationOverlay,
  initVoiceNoteModal,
  initVoiceNoteUI,
  openVoiceNoteModal,
  saveVoiceNote,
  startVoiceRecording,
  stopVoiceRecording,
  toggleVoiceRecording,
} from '../../../src/features/voiceNoteUI';
import { voiceModeService } from '../../../src/services/voice';

describe('Voice Note UI Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
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
    container.remove();
  });

  describe('openVoiceNoteModal', () => {
    it('should open modal when element exists', () => {
      const modal = document.createElement('div');
      modal.id = 'voice-note-modal';
      container.appendChild(modal);

      const textarea = document.createElement('textarea');
      textarea.id = 'voice-note-textarea';
      container.appendChild(textarea);

      openVoiceNoteModal('fault-1');

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should pre-populate textarea with existing notes', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        faultEntries: [
          {
            id: 'fault-1',
            bib: '042',
            gateNumber: 5,
            faultType: 'MG',
            run: 1,
            notes: 'Existing note',
            timestamp: '2024-01-15T10:00:00.000Z',
          },
        ],
      });

      const modal = document.createElement('div');
      modal.id = 'voice-note-modal';
      container.appendChild(modal);

      const textarea = document.createElement('textarea');
      textarea.id = 'voice-note-textarea';
      container.appendChild(textarea);

      openVoiceNoteModal('fault-1');

      expect(textarea.value).toBe('Existing note');
    });

    it('should not throw when modal does not exist', () => {
      expect(() => openVoiceNoteModal('fault-1')).not.toThrow();
    });
  });

  describe('closeVoiceNoteModal', () => {
    it('should stop recording and resume voice mode', () => {
      closeVoiceNoteModal();

      expect(mockVoiceNoteStop).toHaveBeenCalled();
      expect(voiceModeService.resume).toHaveBeenCalled();
    });
  });

  describe('saveVoiceNote', () => {
    it('should not save when no fault selected', () => {
      // Close and reopen with no fault
      closeVoiceNoteModal();
      saveVoiceNote();
      // Should return early - no fault ID
    });

    it('should save note when fault is selected', async () => {
      const modal = document.createElement('div');
      modal.id = 'voice-note-modal';
      container.appendChild(modal);

      const textarea = document.createElement('textarea');
      textarea.id = 'voice-note-textarea';
      container.appendChild(textarea);

      openVoiceNoteModal('fault-1');
      // Set value AFTER opening modal (which clears it to existing notes)
      textarea.value = 'Test note';
      saveVoiceNote();

      const { store } = await import('../../../src/store');
      expect(store.updateFaultEntryWithHistory).toHaveBeenCalledWith(
        'fault-1',
        expect.objectContaining({ notes: 'Test note' }),
        expect.any(String),
      );
    });
  });

  describe('startVoiceRecording', () => {
    it('should show warning when not supported', () => {
      mockVoiceNoteIsSupported.mockReturnValue(false);

      startVoiceRecording();

      expect(showToast).toHaveBeenCalledWith('voiceNoteUnsupported', 'warning');
    });

    it('should pause voice mode and start recording', () => {
      mockVoiceNoteIsSupported.mockReturnValue(true);

      startVoiceRecording();

      expect(voiceModeService.pause).toHaveBeenCalled();
      expect(mockVoiceNoteStart).toHaveBeenCalled();
    });

    it('should resume voice mode when start fails', () => {
      mockVoiceNoteIsSupported.mockReturnValue(true);
      mockVoiceNoteStart.mockReturnValue(false);

      startVoiceRecording();

      expect(voiceModeService.resume).toHaveBeenCalled();
    });
  });

  describe('stopVoiceRecording', () => {
    it('should stop recording and resume voice mode', () => {
      stopVoiceRecording();

      expect(mockVoiceNoteStop).toHaveBeenCalled();
      expect(voiceModeService.resume).toHaveBeenCalled();
    });
  });

  describe('toggleVoiceRecording', () => {
    it('should start recording when not recording', () => {
      mockIsRecording.mockReturnValue(false);
      mockVoiceNoteIsSupported.mockReturnValue(true);

      toggleVoiceRecording();

      expect(mockVoiceNoteStart).toHaveBeenCalled();
    });

    it('should stop recording when already recording', () => {
      mockIsRecording.mockReturnValue(true);

      toggleVoiceRecording();

      expect(mockVoiceNoteStop).toHaveBeenCalled();
    });
  });

  describe('initVoiceNoteModal', () => {
    it('should not throw', () => {
      expect(() => initVoiceNoteModal()).not.toThrow();
    });
  });

  describe('initFaultConfirmationOverlay', () => {
    it('should not throw', () => {
      expect(() => initFaultConfirmationOverlay()).not.toThrow();
    });
  });

  describe('initVoiceNoteUI', () => {
    it('should not throw', () => {
      expect(() => initVoiceNoteUI()).not.toThrow();
    });
  });

  describe('cleanupVoiceNoteUI', () => {
    it('should not throw', () => {
      expect(() => cleanupVoiceNoteUI()).not.toThrow();
    });
  });
});
