/**
 * Unit Tests for Race Administration Module
 * Tests: handleAdminPinVerify, initRaceAdmin
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

vi.mock('../../../../src/utils', () => ({
  fetchWithTimeout: vi.fn(),
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

const mockAuthenticateWithPin = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('../../../../src/features/race/pinManagement', () => ({
  authenticateWithPin: (...args: unknown[]) => mockAuthenticateWithPin(...args),
}));

import { closeModal, openModal } from '../../../../src/features/modals';
import {
  handleAdminPinVerify,
  initRaceAdmin,
} from '../../../../src/features/race/raceAdmin';
import { feedbackWarning } from '../../../../src/services';

describe('Race Administration Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('handleAdminPinVerify', () => {
    it('should return early when input or modal missing', async () => {
      await handleAdminPinVerify();
      // Should not throw
    });

    it('should authenticate and open race management on success', async () => {
      mockAuthenticateWithPin.mockResolvedValue({ success: true });

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      pinInput.value = '1234';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      const raceModal = document.createElement('div');
      raceModal.id = 'race-management-modal';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);
      container.appendChild(raceModal);

      await handleAdminPinVerify();

      expect(closeModal).toHaveBeenCalledWith(modal);
      expect(openModal).toHaveBeenCalledWith(raceModal);
    });

    it('should show error on PIN failure', async () => {
      mockAuthenticateWithPin.mockResolvedValue({ success: false });

      const modal = document.createElement('div');
      modal.id = 'admin-pin-modal';
      const pinInput = document.createElement('input');
      pinInput.id = 'admin-pin-verify-input';
      pinInput.value = '0000';
      const errorEl = document.createElement('div');
      errorEl.id = 'admin-pin-error';
      errorEl.style.display = 'none';
      container.appendChild(modal);
      container.appendChild(pinInput);
      container.appendChild(errorEl);

      await handleAdminPinVerify();

      expect(errorEl.style.display).toBe('block');
      expect(feedbackWarning).toHaveBeenCalled();
    });
  });

  describe('initRaceAdmin', () => {
    it('should not throw', () => {
      expect(() => initRaceAdmin()).not.toThrow();
    });
  });
});
