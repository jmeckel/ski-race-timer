/**
 * Unit Tests for Race Dialogs Feature Module
 * Tests: showRaceChangeDialog, handleRaceDeleted, handleAuthExpired,
 *        showPhotoSyncWarningModal, initRaceDialogs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackWarning: vi.fn(),
  syncService: {
    initialize: vi.fn(),
    getPhotoSyncStats: vi.fn(() =>
      Promise.resolve({
        uploadCount: 5,
        downloadCount: 3,
        totalSize: 1024 * 1024 * 2, // 2MB
      }),
    ),
    forceRefresh: vi.fn(),
  },
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'en',
      settings: { sync: true, syncPhotos: false },
      raceId: 'RACE-001',
    })),
    updateSettings: vi.fn(),
    setRaceId: vi.fn(),
  },
}));

vi.mock('../../../src/utils/format', () => ({
  formatFileSize: vi.fn(
    (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`,
  ),
}));

vi.mock('../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(() => ({
    add: vi.fn((target: EventTarget, event: string, handler: EventListener) => {
      target.addEventListener(event, handler);
    }),
    removeAll: vi.fn(),
    count: 0,
  })),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

vi.mock('../../../src/features/race/pinManagement', () => ({
  verifyPinForRaceJoin: vi.fn(() => Promise.resolve(true)),
}));

import { showToast } from '../../../src/components';
import { closeModal, openModal } from '../../../src/features/modals';
import { verifyPinForRaceJoin } from '../../../src/features/race/pinManagement';
import {
  handleAuthExpired,
  handleRaceDeleted,
  initRaceDialogs,
  showPhotoSyncWarningModal,
  showRaceChangeDialog,
} from '../../../src/features/race/raceDialogs';
import {
  feedbackSuccess,
  feedbackWarning,
  syncService,
} from '../../../src/services';
import { store } from '../../../src/store';

describe('Race Dialogs Feature Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('showRaceChangeDialog', () => {
    let modal: HTMLDivElement;
    let title: HTMLHeadingElement;
    let text: HTMLParagraphElement;
    let exportBtn: HTMLButtonElement;
    let deleteBtn: HTMLButtonElement;
    let keepBtn: HTMLButtonElement;
    let cancelBtn: HTMLButtonElement;

    beforeEach(() => {
      modal = document.createElement('div');
      modal.id = 'race-change-modal';
      container.appendChild(modal);

      title = document.createElement('h2');
      title.classList.add('modal-title');
      modal.appendChild(title);

      text = document.createElement('p');
      text.classList.add('modal-text');
      modal.appendChild(text);

      exportBtn = document.createElement('button');
      exportBtn.id = 'race-change-export-btn';
      container.appendChild(exportBtn);

      deleteBtn = document.createElement('button');
      deleteBtn.id = 'race-change-delete-btn';
      container.appendChild(deleteBtn);

      keepBtn = document.createElement('button');
      keepBtn.id = 'race-change-keep-btn';
      container.appendChild(keepBtn);

      cancelBtn = document.createElement('button');
      cancelBtn.setAttribute('data-action', 'cancel');
      modal.appendChild(cancelBtn);
    });

    it('should open modal', async () => {
      const promise = showRaceChangeDialog('synced', 'en');

      expect(openModal).toHaveBeenCalledWith(modal);

      // Resolve by clicking a button
      exportBtn.click();
      const result = await promise;
      expect(result).toBe('export');
    });

    it('should resolve with "export" when export button is clicked', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      exportBtn.click();
      const result = await promise;
      expect(result).toBe('export');
    });

    it('should resolve with "delete" when delete button is clicked', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      deleteBtn.click();
      const result = await promise;
      expect(result).toBe('delete');
    });

    it('should resolve with "keep" when keep button is clicked', async () => {
      const promise = showRaceChangeDialog('unsynced', 'en');
      keepBtn.click();
      const result = await promise;
      expect(result).toBe('keep');
    });

    it('should resolve with "cancel" when cancel button is clicked', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      cancelBtn.click();
      const result = await promise;
      expect(result).toBe('cancel');
    });

    it('should show export button and hide keep button for synced type', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      expect(exportBtn.style.display).toBe('');
      expect(keepBtn.style.display).toBe('none');
      cancelBtn.click();
      await promise;
    });

    it('should hide export button and show keep button for unsynced type', async () => {
      const promise = showRaceChangeDialog('unsynced', 'en');
      expect(exportBtn.style.display).toBe('none');
      expect(keepBtn.style.display).toBe('');
      cancelBtn.click();
      await promise;
    });

    it('should set title text', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      expect(title.textContent).toBe('raceChangeTitle');
      cancelBtn.click();
      await promise;
    });

    it('should set text for synced type', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      expect(text.textContent).toBe('raceChangeSyncedText');
      cancelBtn.click();
      await promise;
    });

    it('should set text for unsynced type', async () => {
      const promise = showRaceChangeDialog('unsynced', 'en');
      expect(text.textContent).toBe('raceChangeUnsyncedText');
      cancelBtn.click();
      await promise;
    });

    it('should resolve with "cancel" if modal element is missing', async () => {
      modal.remove();
      const result = await showRaceChangeDialog('synced', 'en');
      expect(result).toBe('cancel');
    });

    it('should close modal after button click', async () => {
      const promise = showRaceChangeDialog('synced', 'en');
      deleteBtn.click();
      await promise;
      expect(closeModal).toHaveBeenCalledWith(modal);
    });
  });

  describe('handleRaceDeleted', () => {
    it('should update race deleted modal text', () => {
      const textEl = document.createElement('p');
      textEl.id = 'race-deleted-text';
      container.appendChild(textEl);

      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: 'Race was deleted',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(textEl.textContent).toContain('RACE-001');
      expect(textEl.textContent).toContain('Race was deleted');
    });

    it('should open race deleted modal', () => {
      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: 'Race was deleted',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should disable sync and clear race ID', () => {
      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: '',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(store.updateSettings).toHaveBeenCalledWith({ sync: false });
      expect(store.setRaceId).toHaveBeenCalledWith('');
    });

    it('should update sync toggle UI', () => {
      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: '',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(syncToggle.checked).toBe(false);
    });

    it('should clear race ID input', () => {
      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'race-id-input';
      raceIdInput.value = 'RACE-001';
      container.appendChild(raceIdInput);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: '',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(raceIdInput.value).toBe('');
    });

    it('should trigger warning feedback', () => {
      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: '',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      expect(feedbackWarning).toHaveBeenCalled();
    });

    it('should use fallback text when message is empty', () => {
      const textEl = document.createElement('p');
      textEl.id = 'race-deleted-text';
      container.appendChild(textEl);

      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      const event = new CustomEvent('race-deleted', {
        detail: {
          raceId: 'RACE-001',
          deletedAt: Date.now(),
          message: '',
        },
      });

      handleRaceDeleted(
        event as CustomEvent<{
          raceId: string;
          deletedAt: number;
          message: string;
        }>,
      );

      // When message is empty, the fallback t('raceDeletedText') should be used
      expect(textEl.textContent).toContain('raceDeletedText');
    });
  });

  describe('handleAuthExpired', () => {
    it('should show toast with expired message', () => {
      const event = new CustomEvent('auth-expired', {
        detail: { message: 'Session expired' },
      });

      handleAuthExpired(event as CustomEvent<{ message: string }>);

      expect(showToast).toHaveBeenCalledWith(
        'Session expired',
        'warning',
        5000,
      );
    });

    it('should use fallback message when none provided', () => {
      const event = new CustomEvent('auth-expired', {
        detail: { message: '' },
      });

      handleAuthExpired(event as CustomEvent<{ message: string }>);

      expect(showToast).toHaveBeenCalledWith('sessionExpired', 'warning', 5000);
    });

    it('should trigger PIN re-authentication', () => {
      const event = new CustomEvent('auth-expired', {
        detail: { message: 'expired' },
      });

      handleAuthExpired(event as CustomEvent<{ message: string }>);

      expect(verifyPinForRaceJoin).toHaveBeenCalledWith('en');
    });

    it('should trigger warning feedback', () => {
      const event = new CustomEvent('auth-expired', {
        detail: { message: 'expired' },
      });

      handleAuthExpired(event as CustomEvent<{ message: string }>);

      expect(feedbackWarning).toHaveBeenCalled();
    });

    it('should re-initialize sync after successful re-auth', async () => {
      vi.mocked(verifyPinForRaceJoin).mockResolvedValue(true);

      const event = new CustomEvent('auth-expired', {
        detail: { message: 'expired' },
      });

      handleAuthExpired(event as CustomEvent<{ message: string }>);

      // Wait for the promise chain to resolve
      await vi.waitFor(() => {
        expect(syncService.initialize).toHaveBeenCalled();
      });
    });
  });

  describe('showPhotoSyncWarningModal', () => {
    it('should open photo sync modal', async () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      await showPhotoSyncWarningModal();

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should show loading state then update with stats', async () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      const uploadCountEl = document.createElement('span');
      uploadCountEl.id = 'photos-upload-count';
      container.appendChild(uploadCountEl);

      const downloadCountEl = document.createElement('span');
      downloadCountEl.id = 'photos-download-count';
      container.appendChild(downloadCountEl);

      const totalSizeEl = document.createElement('span');
      totalSizeEl.id = 'photos-total-size';
      container.appendChild(totalSizeEl);

      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'photo-sync-confirm-btn';
      container.appendChild(confirmBtn);

      await showPhotoSyncWarningModal();

      expect(uploadCountEl.textContent).toBe('5');
      expect(downloadCountEl.textContent).toBe('3');
      expect(confirmBtn.textContent).toBe('enableSync');
    });

    it('should return early if modal is missing', async () => {
      await showPhotoSyncWarningModal();
      expect(openModal).not.toHaveBeenCalled();
    });
  });

  describe('initRaceDialogs', () => {
    it('should set up race deleted OK button handler', () => {
      const okBtn = document.createElement('button');
      okBtn.id = 'race-deleted-ok-btn';
      container.appendChild(okBtn);

      const modal = document.createElement('div');
      modal.id = 'race-deleted-modal';
      container.appendChild(modal);

      initRaceDialogs();

      // Click the OK button
      okBtn.click();
      expect(closeModal).toHaveBeenCalled();
    });

    it('should set up photo sync modal handlers', () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'photo-sync-cancel-btn';
      container.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'photo-sync-confirm-btn';
      container.appendChild(confirmBtn);

      initRaceDialogs();

      // Click cancel button
      cancelBtn.click();
      expect(closeModal).toHaveBeenCalled();
    });

    it('should enable photo sync on confirm click', () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'photo-sync-cancel-btn';
      container.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'photo-sync-confirm-btn';
      container.appendChild(confirmBtn);

      initRaceDialogs();

      // Click confirm button
      confirmBtn.click();

      expect(store.updateSettings).toHaveBeenCalledWith({ syncPhotos: true });
      expect(feedbackSuccess).toHaveBeenCalled();
    });

    it('should update sync photos toggle on confirm', () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'photo-sync-cancel-btn';
      container.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'photo-sync-confirm-btn';
      container.appendChild(confirmBtn);

      const syncPhotosToggle = document.createElement('input');
      syncPhotosToggle.id = 'sync-photos-toggle';
      syncPhotosToggle.type = 'checkbox';
      syncPhotosToggle.checked = false;
      container.appendChild(syncPhotosToggle);

      initRaceDialogs();

      confirmBtn.click();

      expect(syncPhotosToggle.checked).toBe(true);
    });

    it('should force sync refresh on confirm when sync is active', () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'photo-sync-cancel-btn';
      container.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'photo-sync-confirm-btn';
      container.appendChild(confirmBtn);

      vi.mocked(store.getState).mockReturnValue({
        currentLang: 'en',
        settings: { sync: true, syncPhotos: false },
        raceId: 'RACE-001',
      } as unknown as ReturnType<typeof store.getState>);

      initRaceDialogs();

      confirmBtn.click();

      expect(syncService.forceRefresh).toHaveBeenCalled();
    });

    it('should close modal on overlay click', () => {
      const modal = document.createElement('div');
      modal.id = 'photo-sync-modal';
      container.appendChild(modal);

      initRaceDialogs();

      // Simulate clicking the overlay (modal itself)
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: modal });
      modal.dispatchEvent(clickEvent);

      expect(closeModal).toHaveBeenCalledWith(modal);
    });

    it('should not throw when no elements exist', () => {
      expect(() => initRaceDialogs()).not.toThrow();
    });
  });
});
