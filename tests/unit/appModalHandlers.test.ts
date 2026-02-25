/**
 * Unit Tests for App Modal Handlers Module
 * Tests: initModals, destroyModals, openEditModal, openConfirmModal,
 *        promptDelete, closeAllModals
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../src/components', () => ({
  showToast: vi.fn(),
  clearToasts: vi.fn(),
}));

vi.mock('../../src/features/entryDeletion', () => ({
  deleteEntriesWithCleanup: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/features/faults', () => ({
  initFaultEditModal: vi.fn(),
  updateInlineFaultsList: vi.fn(),
}));

vi.mock('../../src/features/modals', () => ({
  closeAllModalsAnimated: vi.fn(),
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../src/features/photoViewer', () => ({
  closePhotoViewer: vi.fn(),
  deletePhoto: vi.fn(),
}));

vi.mock('../../src/features/race', () => ({
  cleanupPinVerification: vi.fn(),
  hasPendingPinVerification: vi.fn(() => false),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../src/services', () => ({
  feedbackDelete: vi.fn(),
  feedbackUndo: vi.fn(),
  photoStorage: {
    clearAll: vi.fn(() => Promise.resolve()),
    deletePhoto: vi.fn(() => Promise.resolve()),
  },
  syncService: { deleteEntryFromCloud: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../../src/services/sync', () => ({
  deleteFaultFromCloud: vi.fn(() => Promise.resolve()),
  syncEntry: vi.fn(() => Promise.resolve()),
}));

const mockGetState = vi.fn();

vi.mock('../../src/store', () => ({
  store: {
    getState: (...args: unknown[]) => mockGetState(...args),
    clearAll: vi.fn(),
    updateEntry: vi.fn(),
    undo: vi.fn(() => null),
    canUndo: vi.fn(() => false),
    markFaultForDeletion: vi.fn(),
  },
}));

vi.mock('../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    removeAll: vi.fn(),
  })),
}));

vi.mock('../../src/utils/modalContext', () => ({
  clearModalContext: vi.fn(),
  getModalContext: vi.fn(() => null),
  setModalContext: vi.fn(),
}));

vi.mock('../../src/utils/modalHelpers', () => ({
  openModalWithContext: vi.fn(),
}));

vi.mock('../../src/utils/uiHelpers', () => ({
  updateButtonGroupState: vi.fn(),
}));

vi.mock('../../src/utils/validation', () => ({
  makeNumericInput: vi.fn(),
}));

import {
  closeAllModals,
  destroyModals,
  initModals,
  openConfirmModal,
  openEditModal,
  promptDelete,
} from '../../src/appModalHandlers';
import { closeAllModalsAnimated, openModal } from '../../src/features/modals';
import { t } from '../../src/i18n/translations';
import {
  clearModalContext,
  setModalContext,
} from '../../src/utils/modalContext';
import { openModalWithContext } from '../../src/utils/modalHelpers';

describe('App Modal Handlers Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      entries: [],
      faultEntries: [],
      settings: { sync: false },
      raceId: 'RACE',
      selectedEntries: new Set(),
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('initModals', () => {
    it('should not throw when DOM elements are missing', () => {
      expect(() => initModals()).not.toThrow();
    });

    it('should initialize fault edit modal', async () => {
      initModals();
      const { initFaultEditModal } = await import('../../src/features/faults');
      expect(initFaultEditModal).toHaveBeenCalled();
    });
  });

  describe('destroyModals', () => {
    it('should not throw', () => {
      expect(() => destroyModals()).not.toThrow();
    });
  });

  describe('openEditModal', () => {
    it('should not throw when edit-modal is missing', () => {
      const entry = {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };
      expect(() => openEditModal(entry)).not.toThrow();
    });

    it('should open modal with entry data when DOM exists', () => {
      const modal = document.createElement('div');
      modal.id = 'edit-modal';
      container.appendChild(modal);

      const bibInput = document.createElement('input');
      bibInput.id = 'edit-bib-input';
      container.appendChild(bibInput);

      const statusSelect = document.createElement('select');
      statusSelect.id = 'edit-status-select';
      container.appendChild(statusSelect);

      const entry = {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 2,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      openEditModal(entry);

      expect(bibInput.value).toBe('042');
      expect(openModalWithContext).toHaveBeenCalledWith(modal, {
        entryId: 'e1',
        entryRun: 2,
      });
    });

    it('should default run to 1 when not provided', () => {
      const modal = document.createElement('div');
      modal.id = 'edit-modal';
      container.appendChild(modal);

      const entry = {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      } as {
        id: string;
        bib: string;
        point: 'F';
        run?: number;
        timestamp: string;
        status: 'ok';
        deviceId: string;
        deviceName: string;
      };

      openEditModal(entry as any);

      expect(openModalWithContext).toHaveBeenCalledWith(modal, {
        entryId: 'e1',
        entryRun: 1,
      });
    });
  });

  describe('openConfirmModal', () => {
    it('should not throw when confirm-modal is missing', () => {
      expect(() => openConfirmModal('delete')).not.toThrow();
    });

    it('should set title and text for clearAll action', () => {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('div');
      title.classList.add('modal-title');
      modal.appendChild(title);
      const text = document.createElement('div');
      text.classList.add('modal-text');
      modal.appendChild(text);
      container.appendChild(modal);

      openConfirmModal('clearAll');

      expect(t).toHaveBeenCalledWith('confirmClearAll', 'en');
      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should set title and text for deleteSelected action', () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        selectedEntries: new Set(['e1', 'e2']),
      });

      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('div');
      title.classList.add('modal-title');
      modal.appendChild(title);
      const text = document.createElement('div');
      text.classList.add('modal-text');
      modal.appendChild(text);
      container.appendChild(modal);

      openConfirmModal('deleteSelected');

      expect(t).toHaveBeenCalledWith('confirmDelete', 'en');
    });

    it('should set title and text for undoAdd action', () => {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('div');
      title.classList.add('modal-title');
      modal.appendChild(title);
      const text = document.createElement('div');
      text.classList.add('modal-text');
      modal.appendChild(text);
      container.appendChild(modal);

      openConfirmModal('undoAdd');

      expect(t).toHaveBeenCalledWith('confirmUndoAdd', 'en');
    });

    it('should set title and text for delete action', () => {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('div');
      title.classList.add('modal-title');
      modal.appendChild(title);
      const text = document.createElement('div');
      text.classList.add('modal-text');
      modal.appendChild(text);
      container.appendChild(modal);

      openConfirmModal('delete');

      expect(t).toHaveBeenCalledWith('confirmDelete', 'en');
      expect(t).toHaveBeenCalledWith('confirmDeleteText', 'en');
    });
  });

  describe('promptDelete', () => {
    it('should set modal context and open confirm modal', () => {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      const title = document.createElement('div');
      title.classList.add('modal-title');
      modal.appendChild(title);
      const text = document.createElement('div');
      text.classList.add('modal-text');
      modal.appendChild(text);
      container.appendChild(modal);

      const entry = {
        id: 'e1',
        bib: '042',
        point: 'F' as const,
        run: 1,
        timestamp: '2024-01-15T10:00:00.000Z',
        status: 'ok' as const,
        deviceId: 'dev_1',
        deviceName: 'Timer 1',
      };

      promptDelete(entry);

      expect(setModalContext).toHaveBeenCalledWith(modal, {
        action: 'delete',
        entryId: 'e1',
      });
    });
  });

  describe('closeAllModals', () => {
    it('should close all modals', () => {
      closeAllModals();
      expect(closeAllModalsAnimated).toHaveBeenCalled();
    });

    it('should clear modal contexts', () => {
      const modal1 = document.createElement('div');
      modal1.classList.add('modal-overlay');
      container.appendChild(modal1);

      closeAllModals();
      expect(clearModalContext).toHaveBeenCalledWith(modal1);
    });

    it('should cleanup PIN verification when admin modal is open', async () => {
      const { hasPendingPinVerification, cleanupPinVerification } =
        await import('../../src/features/race');
      vi.mocked(hasPendingPinVerification).mockReturnValue(true);

      const adminPinModal = document.createElement('div');
      adminPinModal.id = 'admin-pin-modal';
      adminPinModal.classList.add('modal-overlay', 'show');
      container.appendChild(adminPinModal);

      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      pinInput.value = '1234';
      container.appendChild(pinInput);

      closeAllModals();

      expect(cleanupPinVerification).toHaveBeenCalled();
      expect(pinInput.value).toBe('');
    });
  });
});
