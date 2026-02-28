/**
 * Extended coverage tests for Race Administration Module
 * Tests: loadRaceList HTTP errors, createRaceItem, handleConfirmDeleteRace
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/services', () => ({
  feedbackDelete: vi.fn(),
  feedbackWarning: vi.fn(),
}));

vi.mock('../../../../src/services/auth', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer token' })),
}));

const mockGetState = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
  },
}));

const mockFetchWithTimeout = vi.fn();

vi.mock('../../../../src/utils', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  logError: vi.fn(),
}));

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../../../src/features/race/pinManagement', () => ({
  authenticateWithPin: vi.fn(() => Promise.resolve({ success: true })),
}));

import { showToast } from '../../../../src/components';
import { closeModal } from '../../../../src/features/modals';
import { handleAdminPinVerify } from '../../../../src/features/race/raceAdmin';
import { logError } from '../../../../src/utils';

/**
 * Helper: call handleAdminPinVerify and flush async loadRaceList.
 * loadRaceList is called without await inside openRaceManagementModal,
 * so we need an extra microtask flush.
 *
 * For success paths, waits for aria-busy to clear.
 * For error paths (401, network), waits for the toast instead.
 */
async function triggerLoadRaceList(waitForToast = false): Promise<void> {
  await handleAdminPinVerify();
  if (waitForToast) {
    // Error paths: 401 returns early without clearing aria-busy.
    // Wait for showToast or logError to be called instead.
    await vi.waitFor(
      () => {
        if ((showToast as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
          throw new Error('Waiting for toast');
        }
      },
      { timeout: 1000 },
    );
  } else {
    // Success paths: wait for aria-busy to clear.
    await vi.waitFor(
      () => {
        const list = document.getElementById('race-list');
        if (list?.getAttribute('aria-busy') === 'true') {
          throw new Error('Still loading');
        }
      },
      { timeout: 1000 },
    );
  }
}

describe('Race Admin — extended coverage', () => {
  let container: HTMLDivElement;

  function setupRaceManagementDOM(): void {
    const modal = document.createElement('div');
    modal.id = 'race-management-modal';
    const listContainer = document.createElement('div');
    listContainer.id = 'race-list';
    const loadingEl = document.createElement('div');
    loadingEl.id = 'race-list-loading';
    loadingEl.style.display = 'none';
    const emptyEl = document.createElement('div');
    emptyEl.id = 'race-list-empty';
    emptyEl.style.display = 'none';
    modal.appendChild(listContainer);
    modal.appendChild(loadingEl);
    modal.appendChild(emptyEl);
    container.appendChild(modal);

    const pinModal = document.createElement('div');
    pinModal.id = 'admin-pin-modal';
    const pinInput = document.createElement('input');
    pinInput.id = 'admin-pin-verify-input';
    pinInput.value = '1234';
    const errorEl = document.createElement('div');
    errorEl.id = 'admin-pin-error';
    container.appendChild(pinModal);
    container.appendChild(pinInput);
    container.appendChild(errorEl);

    const deleteModal = document.createElement('div');
    deleteModal.id = 'delete-race-confirm-modal';
    const deleteText = document.createElement('span');
    deleteText.id = 'delete-race-confirm-text';
    deleteModal.appendChild(deleteText);
    container.appendChild(deleteModal);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    mockGetState.mockReturnValue({ currentLang: 'en' });
  });

  afterEach(() => {
    container.remove();
  });

  describe('loadRaceList HTTP errors', () => {
    it('should show auth error toast and close modal on 401', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 401 });

      await triggerLoadRaceList(true);

      expect(showToast).toHaveBeenCalledWith('authError', 'error');
      expect(closeModal).toHaveBeenCalled();
    });

    it('should show generic error toast on HTTP 500', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });

      await triggerLoadRaceList(true);

      expect(showToast).toHaveBeenCalledWith('loadError', 'error');
      expect(logError).toHaveBeenCalled();
    });

    it('should show error toast on network failure', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockRejectedValue(new Error('Network timeout'));

      await triggerLoadRaceList(true);

      expect(showToast).toHaveBeenCalledWith('loadError', 'error');
    });
  });

  describe('loadRaceList success paths', () => {
    it('should show empty state when no races', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ races: [] }),
      });

      await triggerLoadRaceList();

      const emptyEl = document.getElementById('race-list-empty')!;
      expect(emptyEl.style.display).toBe('block');
    });

    it('should render race items with correct data attributes', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [
              { raceId: 'race-1', entryCount: 5, deviceCount: 2 },
              { raceId: 'race-2', entryCount: 1, deviceCount: 1 },
            ],
          }),
      });

      await triggerLoadRaceList();

      const items = document.querySelectorAll('.race-item');
      expect(items).toHaveLength(2);
      expect(items[0].getAttribute('data-race-id')).toBe('race-1');
      expect(items[1].getAttribute('data-race-id')).toBe('race-2');
    });

    it('should uppercase race IDs in display', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [{ raceId: 'my-race', entryCount: 0, deviceCount: 0 }],
          }),
      });

      await triggerLoadRaceList();

      const raceIdEl = document.querySelector('.race-id');
      expect(raceIdEl?.textContent).toBe('MY-RACE');
    });

    it('should render delete button on each race item', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [{ raceId: 'test', entryCount: 0, deviceCount: 0 }],
          }),
      });

      await triggerLoadRaceList();

      const deleteBtn = document.querySelector('.race-delete-btn');
      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn?.textContent).toBe('delete');
    });

    it('should use singular text for 1 entry and 1 device', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [{ raceId: 'test', entryCount: 1, deviceCount: 1 }],
          }),
      });

      await triggerLoadRaceList();

      const meta = document.querySelector('.race-meta');
      // t() returns the key: 'entry' for singular, 'device' for singular
      expect(meta?.textContent).toBe('1 entry, 1 device');
    });

    it('should use plural text for multiple entries and devices', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            races: [{ raceId: 'test', entryCount: 5, deviceCount: 3 }],
          }),
      });

      await triggerLoadRaceList();

      const meta = document.querySelector('.race-meta');
      expect(meta?.textContent).toBe('5 entries, 3 devices');
    });

    it('should clear aria-busy after load', async () => {
      setupRaceManagementDOM();
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ races: [] }),
      });

      await triggerLoadRaceList();

      const listContainer = document.getElementById('race-list')!;
      expect(listContainer.getAttribute('aria-busy')).toBe('false');
    });
  });
});
