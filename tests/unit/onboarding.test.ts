/**
 * Unit Tests for Onboarding Controller Module
 * Tests: shouldShow, show, reset, goToStep, validateCurrentStep,
 *        saveCurrentStep, handleAction, complete, dismiss, showSummary,
 *        updateUIForRole, updateProgressDots, checkRaceExists, validatePin
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../src/features/modals', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../src/services', () => ({
  feedbackSuccess: vi.fn(),
  feedbackTap: vi.fn(),
  syncService: {
    initialize: vi.fn(),
    checkRaceExists: vi.fn(() =>
      Promise.resolve({ exists: false, entryCount: 0 }),
    ),
  },
}));

const mockStorageGetRaw = vi.fn(() => null);
const mockStorageSetRaw = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageFlush = vi.fn();

vi.mock('../../src/services/storage', () => ({
  storage: {
    getRaw: (...args: unknown[]) => mockStorageGetRaw(...args),
    setRaw: (...args: unknown[]) => mockStorageSetRaw(...args),
    remove: (...args: unknown[]) => mockStorageRemove(...args),
    flush: (...args: unknown[]) => mockStorageFlush(...args),
  },
}));

vi.mock('../../src/services/sync', () => ({
  exchangePinForToken: vi.fn(() => Promise.resolve({ success: true })),
  hasAuthToken: vi.fn(() => false),
}));

const mockGetState = vi.fn();

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setLanguage: vi.fn(),
    setDeviceRole: vi.fn(),
    setDeviceName: vi.fn(),
    setGateAssignment: vi.fn(),
    setRaceId: vi.fn(),
    setView: vi.fn(),
    updateSettings: vi.fn(),
    forceSave: vi.fn(),
  },
}));

vi.mock('../../src/utils/errors', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../src/utils/format', () => ({
  escapeHtml: vi.fn((s: string) => s),
  debounce: vi.fn((fn: Function) => fn),
}));

vi.mock('../../src/utils/id', () => ({
  generateDeviceName: vi.fn(() => 'Alpine Fox'),
}));

vi.mock('../../src/utils/listenerManager', () => {
  class MockListenerManager {
    add = vi.fn();
    removeAll = vi.fn();
  }
  return { ListenerManager: MockListenerManager };
});

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/utils/recentRaces', () => ({
  addRecentRace: vi.fn(),
  getTodaysRecentRaces: vi.fn(() => []),
}));

vi.mock('../../src/utils/recentRacesUi', () => ({
  attachRecentRaceItemHandlers: vi.fn(),
  renderRecentRaceItems: vi.fn(() => ''),
}));

vi.mock('../../src/utils/templates', () => ({
  iconCheck: vi.fn(() => '<svg>check</svg>'),
  iconHourglass: vi.fn(() => '<svg>hourglass</svg>'),
}));

import { showToast } from '../../src/components';
import { closeModal, openModal } from '../../src/features/modals';
import { OnboardingController } from '../../src/onboarding';
import { feedbackSuccess } from '../../src/services';
import { store } from '../../src/store';

// Helper type for accessing private methods via bracket notation
type PrivateAccess = {
  goToStep: (step: number) => void;
  handleAction: (action: string) => Promise<void>;
  validateCurrentStep: () => Promise<boolean>;
  saveCurrentStep: () => Promise<void>;
  updateUIForRole: () => void;
  showSummary: () => void;
  finalize: () => void;
  dismiss: () => void;
  complete: () => void;
  checkRaceExists: () => Promise<void>;
  validatePin: (pin: string) => Promise<boolean>;
  updateOnboardingTranslations: () => void;
  currentStep: number;
  selectedRole: string;
};

// Helper: create a controller that has access to modal and private methods
function createControllerWithModal(container: HTMLDivElement) {
  const modal = document.createElement('div');
  modal.id = 'onboarding-modal';
  container.appendChild(modal);

  // Create onboarding cards for steps 1-6
  for (let i = 1; i <= 6; i++) {
    const card = document.createElement('div');
    card.className = 'onboarding-card';
    card.setAttribute('data-step', String(i));
    card.style.display = i === 1 ? 'block' : 'none';
    modal.appendChild(card);
  }

  // Add step 4 path-specific cards
  const timerPathCard = document.createElement('div');
  timerPathCard.className = 'onboarding-card';
  timerPathCard.setAttribute('data-step', '4');
  timerPathCard.setAttribute('data-path', 'timer');
  timerPathCard.style.display = 'none';
  modal.appendChild(timerPathCard);

  const judgePathCard = document.createElement('div');
  judgePathCard.className = 'onboarding-card';
  judgePathCard.setAttribute('data-step', '4');
  judgePathCard.setAttribute('data-path', 'gateJudge');
  judgePathCard.style.display = 'none';
  modal.appendChild(judgePathCard);

  // Add progress dots
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('span');
    dot.className = 'progress-dot';
    modal.appendChild(dot);
  }

  const progressLabel = document.createElement('span');
  progressLabel.id = 'onboarding-progress-label';
  modal.appendChild(progressLabel);

  const controller = new OnboardingController();
  return { controller, modal };
}

describe('OnboardingController', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      currentLang: 'en',
      deviceName: 'Timer 1',
      deviceRole: 'timer',
      raceId: '',
      gateAssignment: null,
      selectedRun: 1,
      bibInput: '',
      entries: [],
      settings: {
        sync: false,
        photoCapture: false,
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('shouldShow', () => {
    it('should return true when onboarding not completed', () => {
      mockStorageGetRaw.mockReturnValue(null);
      const controller = new OnboardingController();
      expect(controller.shouldShow()).toBe(true);
    });

    it('should return false when onboarding completed', () => {
      mockStorageGetRaw.mockReturnValue('true');
      const controller = new OnboardingController();
      expect(controller.shouldShow()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should remove onboarding storage key and flush', () => {
      const controller = new OnboardingController();
      controller.reset();

      expect(mockStorageRemove).toHaveBeenCalledWith(
        'skiTimerHasCompletedOnboarding',
      );
      expect(mockStorageFlush).toHaveBeenCalled();
    });
  });

  describe('show', () => {
    it('should open modal when modal element exists', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const controller = new OnboardingController();
      controller.show();

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should not throw when modal does not exist', () => {
      const controller = new OnboardingController();
      expect(() => controller.show()).not.toThrow();
    });

    it('should reset form fields when shown', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'old-race';
      container.appendChild(raceIdInput);

      const pinInput = document.createElement('input');
      pinInput.id = 'onboarding-pin';
      pinInput.value = '1234';
      container.appendChild(pinInput);

      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'onboarding-device-name';
      container.appendChild(deviceNameInput);

      const controller = new OnboardingController();
      controller.show();

      expect(raceIdInput.value).toBe('');
      expect(pinInput.value).toBe('');
      expect(deviceNameInput.value).toBe('Timer 1');
    });

    it('should reset role cards to timer selected', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const timerCard = document.createElement('div');
      timerCard.className = 'role-card';
      timerCard.setAttribute('data-role', 'timer');
      modal.appendChild(timerCard);

      const judgeCard = document.createElement('div');
      judgeCard.className = 'role-card';
      judgeCard.setAttribute('data-role', 'gateJudge');
      judgeCard.classList.add('selected');
      modal.appendChild(judgeCard);

      const controller = new OnboardingController();
      controller.show();

      expect(timerCard.classList.contains('selected')).toBe(true);
      expect(judgeCard.classList.contains('selected')).toBe(false);
      expect(timerCard.getAttribute('aria-checked')).toBe('true');
      expect(judgeCard.getAttribute('aria-checked')).toBe('false');
    });

    it('should reset sync and photo toggles', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const syncToggle = document.createElement('input');
      syncToggle.type = 'checkbox';
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.checked = false;
      container.appendChild(syncToggle);

      const photoToggle = document.createElement('input');
      photoToggle.type = 'checkbox';
      photoToggle.id = 'onboarding-photo-toggle';
      photoToggle.checked = true;
      container.appendChild(photoToggle);

      const controller = new OnboardingController();
      controller.show();

      expect(syncToggle.checked).toBe(true);
      expect(photoToggle.checked).toBe(false);
    });

    it('should reset gate inputs', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const gateStart = document.createElement('input');
      gateStart.id = 'onboarding-gate-start';
      gateStart.value = '5';
      container.appendChild(gateStart);

      const gateEnd = document.createElement('input');
      gateEnd.id = 'onboarding-gate-end';
      gateEnd.value = '20';
      container.appendChild(gateEnd);

      const controller = new OnboardingController();
      controller.show();

      expect(gateStart.value).toBe('1');
      expect(gateEnd.value).toBe('10');
    });

    it('should show race status reset', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const raceStatus = document.createElement('div');
      raceStatus.id = 'onboarding-race-status';
      raceStatus.textContent = 'old status';
      raceStatus.className = 'race-status found';
      container.appendChild(raceStatus);

      const controller = new OnboardingController();
      controller.show();

      expect(raceStatus.textContent).toBe('');
      expect(raceStatus.className).toBe('race-status');
    });

    it('should highlight current language button', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const enBtn = document.createElement('button');
      enBtn.className = 'lang-btn';
      enBtn.dataset.lang = 'en';
      modal.appendChild(enBtn);

      const deBtn = document.createElement('button');
      deBtn.className = 'lang-btn';
      deBtn.dataset.lang = 'de';
      modal.appendChild(deBtn);

      const controller = new OnboardingController();
      controller.show();

      expect(enBtn.classList.contains('selected')).toBe(true);
      expect(deBtn.classList.contains('selected')).toBe(false);
    });

    it('should show first onboarding card only', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      const card1 = document.createElement('div');
      card1.className = 'onboarding-card';
      card1.style.display = 'none';
      modal.appendChild(card1);

      const card2 = document.createElement('div');
      card2.className = 'onboarding-card';
      card2.style.display = 'block';
      modal.appendChild(card2);

      const controller = new OnboardingController();
      controller.show();

      expect(card1.style.display).toBe('block');
      expect(card2.style.display).toBe('none');
    });
  });

  describe('setUpdateTranslationsCallback', () => {
    it('should store callback', () => {
      const controller = new OnboardingController();
      const callback = vi.fn();
      controller.setUpdateTranslationsCallback(callback);
      // No direct way to test, but should not throw
    });
  });

  describe('constructor', () => {
    it('should set up event listeners when modal exists', () => {
      const modal = document.createElement('div');
      modal.id = 'onboarding-modal';
      container.appendChild(modal);

      expect(() => new OnboardingController()).not.toThrow();
    });

    it('should not throw when modal does not exist', () => {
      expect(() => new OnboardingController()).not.toThrow();
    });
  });

  describe('goToStep (private)', () => {
    it('should navigate to specified step', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      // Navigate to step 2
      (controller as unknown as PrivateAccess).goToStep(2);

      // Step 1 card should be hidden, step 2 shown
      const step1 = modal.querySelector(
        '[data-step="1"]:not([data-path])',
      ) as HTMLElement;
      const step2 = modal.querySelector(
        '[data-step="2"]:not([data-path])',
      ) as HTMLElement;
      expect(step1.style.display).toBe('none');
      expect(step2.style.display).toBe('block');
    });

    it('should not navigate below step 1', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // Attempt step 0 - should be no-op
      expect(() => {
        (controller as unknown as PrivateAccess).goToStep(0);
      }).not.toThrow();
    });

    it('should not navigate above total steps', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      expect(() => {
        (controller as unknown as PrivateAccess).goToStep(99);
      }).not.toThrow();
    });

    it('should show timer path card at step 4', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).goToStep(4);

      const timerPath = modal.querySelector(
        '[data-step="4"][data-path="timer"]',
      ) as HTMLElement;
      expect(timerPath.style.display).toBe('block');
    });

    it('should show gateJudge path card at step 4 when role is gateJudge', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      // Set role to gateJudge
      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';

      (controller as unknown as PrivateAccess).goToStep(4);

      const judgePath = modal.querySelector(
        '[data-step="4"][data-path="gateJudge"]',
      ) as HTMLElement;
      expect(judgePath.style.display).toBe('block');
    });

    it('should show summary on step 6', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // Create summary element
      const summary = document.createElement('div');
      summary.id = 'onboarding-summary';
      container.appendChild(summary);

      (controller as unknown as PrivateAccess).goToStep(6);

      // Summary should have content rendered
      expect(summary.children.length).toBeGreaterThan(0);
    });
  });

  describe('updateProgressDots (private)', () => {
    it('should mark current step dot as active', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).goToStep(3);

      const dots = modal.querySelectorAll('.progress-dot');
      expect(dots[2]!.classList.contains('active')).toBe(true);
      expect(dots[0]!.classList.contains('completed')).toBe(true);
      expect(dots[1]!.classList.contains('completed')).toBe(true);
    });

    it('should update progress label text', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).goToStep(2);

      const label = modal.querySelector('#onboarding-progress-label');
      expect(label!.textContent).toContain('2');
    });

    it('should show German label when lang is de', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        currentLang: 'de',
      });

      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).goToStep(2);

      const label = modal.querySelector('#onboarding-progress-label');
      expect(label!.textContent).toContain('Schritt');
    });
  });

  describe('updateUIForRole (private)', () => {
    it('should update labels for timer role', () => {
      const { controller } = createControllerWithModal(container);

      const titleEl = document.createElement('span');
      titleEl.id = 'onboarding-device-name-title';
      container.appendChild(titleEl);
      const descEl = document.createElement('span');
      descEl.id = 'onboarding-device-name-desc';
      container.appendChild(descEl);
      const readyTitle = document.createElement('span');
      readyTitle.id = 'onboarding-ready-title';
      container.appendChild(readyTitle);
      const readyTip = document.createElement('span');
      readyTip.id = 'onboarding-ready-tip';
      container.appendChild(readyTip);
      const finishBtn = document.createElement('button');
      finishBtn.id = 'onboarding-finish-btn';
      container.appendChild(finishBtn);

      controller.show();
      (controller as unknown as PrivateAccess).updateUIForRole();

      expect(titleEl.textContent).toBe('onboardingDeviceName');
      expect(readyTitle.textContent).toBe('onboardingReady');
      expect(finishBtn.textContent).toBe('startTiming');
    });

    it('should update labels for gateJudge role', () => {
      const { controller } = createControllerWithModal(container);

      const titleEl = document.createElement('span');
      titleEl.id = 'onboarding-device-name-title';
      container.appendChild(titleEl);
      const descEl = document.createElement('span');
      descEl.id = 'onboarding-device-name-desc';
      container.appendChild(descEl);
      const readyTitle = document.createElement('span');
      readyTitle.id = 'onboarding-ready-title';
      container.appendChild(readyTitle);
      const readyTip = document.createElement('span');
      readyTip.id = 'onboarding-ready-tip';
      container.appendChild(readyTip);
      const finishBtn = document.createElement('button');
      finishBtn.id = 'onboarding-finish-btn';
      container.appendChild(finishBtn);

      controller.show();
      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';
      (controller as unknown as PrivateAccess).updateUIForRole();

      expect(titleEl.textContent).toBe('onboardingDeviceNameJudge');
      expect(readyTitle.textContent).toBe('onboardingReadyJudge');
      expect(finishBtn.textContent).toBe('startJudging');
    });
  });

  describe('showSummary (private)', () => {
    it('should render summary rows for timer role', () => {
      const { controller } = createControllerWithModal(container);

      const summary = document.createElement('div');
      summary.id = 'onboarding-summary';
      container.appendChild(summary);

      controller.show();
      (controller as unknown as PrivateAccess).showSummary();

      const rows = summary.querySelectorAll('.onboarding-summary-row');
      expect(rows.length).toBeGreaterThanOrEqual(5); // role, name, photo, race, sync
    });

    it('should render summary rows for gateJudge role with gate range', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        gateAssignment: [1, 10],
      });

      const { controller } = createControllerWithModal(container);

      const summary = document.createElement('div');
      summary.id = 'onboarding-summary';
      container.appendChild(summary);

      controller.show();
      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';
      (controller as unknown as PrivateAccess).showSummary();

      const rows = summary.querySelectorAll('.onboarding-summary-row');
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle missing summary element', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      expect(() => {
        (controller as unknown as PrivateAccess).showSummary();
      }).not.toThrow();
    });

    it('should show enabled badge for sync when enabled', () => {
      mockGetState.mockReturnValue({
        ...mockGetState(),
        settings: { sync: true, photoCapture: true },
      });

      const { controller } = createControllerWithModal(container);

      const summary = document.createElement('div');
      summary.id = 'onboarding-summary';
      container.appendChild(summary);

      controller.show();
      (controller as unknown as PrivateAccess).showSummary();

      const badges = summary.querySelectorAll(
        '.onboarding-summary-badge.enabled',
      );
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('handleAction (private)', () => {
    it('should handle "back" action', async () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      // Go to step 2 first
      (controller as unknown as PrivateAccess).goToStep(2);

      // Then go back
      await (controller as unknown as PrivateAccess).handleAction('back');

      // Should be on step 1 now
      const step1 = modal.querySelector(
        '[data-step="1"]:not([data-path])',
      ) as HTMLElement;
      expect(step1.style.display).toBe('block');
    });

    it('should handle "skip" action', async () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      await (controller as unknown as PrivateAccess).handleAction('skip');

      // Should be on step 2
      const step2 = modal.querySelector(
        '[data-step="2"]:not([data-path])',
      ) as HTMLElement;
      expect(step2.style.display).toBe('block');
      expect(store.forceSave).toHaveBeenCalled();
    });

    it('should handle "finish" action', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      await (controller as unknown as PrivateAccess).handleAction('finish');

      expect(closeModal).toHaveBeenCalled();
      expect(feedbackSuccess).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalled();
    });

    it('should handle "dismiss" action', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      await (controller as unknown as PrivateAccess).handleAction('dismiss');

      expect(closeModal).toHaveBeenCalled();
      expect(store.setDeviceRole).toHaveBeenCalled();
    });

    it('should handle "next" action with validation', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // Step 1 (language) always validates
      await (controller as unknown as PrivateAccess).handleAction('next');

      expect(store.forceSave).toHaveBeenCalled();
    });
  });

  describe('validateCurrentStep (private)', () => {
    it('should validate step 2 (role selection) as always true', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // Navigate to step 2
      (controller as unknown as PrivateAccess).currentStep = 2;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(true);
    });

    it('should validate step 3 (device name) as false when empty', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // Create empty device name input
      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'onboarding-device-name';
      deviceNameInput.value = '';
      container.appendChild(deviceNameInput);

      (controller as unknown as PrivateAccess).currentStep = 3;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(false);
      expect(showToast).toHaveBeenCalled();
    });

    it('should validate step 3 as true with device name', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'onboarding-device-name';
      deviceNameInput.value = 'My Timer';
      container.appendChild(deviceNameInput);

      (controller as unknown as PrivateAccess).currentStep = 3;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(true);
    });

    it('should validate step 4 as always true', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).currentStep = 4;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(true);
    });

    it('should validate step 5 as true when no race ID (skip mode)', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = '';
      container.appendChild(raceIdInput);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      (controller as unknown as PrivateAccess).currentStep = 5;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(true);
    });

    it('should reject step 5 with race ID but short PIN', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'RACE-1';
      container.appendChild(raceIdInput);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      const pinInput = document.createElement('input');
      pinInput.id = 'onboarding-pin';
      pinInput.value = '12'; // too short
      container.appendChild(pinInput);

      (controller as unknown as PrivateAccess).currentStep = 5;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(false);
      expect(showToast).toHaveBeenCalled();
    });

    it('should validate step 5 with valid PIN', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'RACE-1';
      container.appendChild(raceIdInput);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      const pinInput = document.createElement('input');
      pinInput.id = 'onboarding-pin';
      pinInput.value = '1234';
      container.appendChild(pinInput);

      (controller as unknown as PrivateAccess).currentStep = 5;

      const result = await (
        controller as unknown as PrivateAccess
      ).validateCurrentStep();
      expect(result).toBe(true);
    });
  });

  describe('saveCurrentStep (private)', () => {
    it('should save device role on step 2', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).currentStep = 2;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.setDeviceRole).toHaveBeenCalledWith('timer');
    });

    it('should save device name on step 3', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'onboarding-device-name';
      deviceNameInput.value = 'My Timer';
      container.appendChild(deviceNameInput);

      (controller as unknown as PrivateAccess).currentStep = 3;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.setDeviceName).toHaveBeenCalledWith('My Timer');
    });

    it('should save gate assignment on step 4 for gateJudge', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';

      const gateStart = document.createElement('input');
      gateStart.id = 'onboarding-gate-start';
      gateStart.value = '5';
      container.appendChild(gateStart);

      const gateEnd = document.createElement('input');
      gateEnd.id = 'onboarding-gate-end';
      gateEnd.value = '15';
      container.appendChild(gateEnd);

      (controller as unknown as PrivateAccess).currentStep = 4;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.setGateAssignment).toHaveBeenCalledWith([5, 15]);
    });

    it('should swap gate start and end if reversed', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';

      const gateStart = document.createElement('input');
      gateStart.id = 'onboarding-gate-start';
      gateStart.value = '20';
      container.appendChild(gateStart);

      const gateEnd = document.createElement('input');
      gateEnd.id = 'onboarding-gate-end';
      gateEnd.value = '5';
      container.appendChild(gateEnd);

      (controller as unknown as PrivateAccess).currentStep = 4;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.setGateAssignment).toHaveBeenCalledWith([5, 20]);
    });

    it('should save photo capture on step 4 for timer role', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const photoToggle = document.createElement('input');
      photoToggle.id = 'onboarding-photo-toggle';
      photoToggle.type = 'checkbox';
      photoToggle.checked = true;
      container.appendChild(photoToggle);

      (controller as unknown as PrivateAccess).currentStep = 4;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.updateSettings).toHaveBeenCalledWith({ photoCapture: true });
    });

    it('should save race settings on step 5 with sync enabled', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'RACE-1';
      container.appendChild(raceIdInput);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      (controller as unknown as PrivateAccess).currentStep = 5;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.setRaceId).toHaveBeenCalledWith('RACE-1');
      expect(store.updateSettings).toHaveBeenCalledWith({ sync: true });
    });

    it('should not enable sync when no race ID on step 5', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = '';
      container.appendChild(raceIdInput);

      const syncToggle = document.createElement('input');
      syncToggle.id = 'onboarding-sync-toggle';
      syncToggle.type = 'checkbox';
      syncToggle.checked = true;
      container.appendChild(syncToggle);

      (controller as unknown as PrivateAccess).currentStep = 5;
      await (controller as unknown as PrivateAccess).saveCurrentStep();

      expect(store.updateSettings).toHaveBeenCalledWith({ sync: false });
    });
  });

  describe('finalize (private)', () => {
    it('should save state, set storage key, close modal, and navigate to timer', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).finalize();

      expect(store.forceSave).toHaveBeenCalled();
      expect(mockStorageSetRaw).toHaveBeenCalledWith(
        'skiTimerHasCompletedOnboarding',
        'true',
      );
      expect(mockStorageFlush).toHaveBeenCalled();
      expect(closeModal).toHaveBeenCalled();
      expect(store.setView).toHaveBeenCalledWith('timer');
    });

    it('should navigate to gateJudge view when role is gateJudge', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const gateJudgeTab = document.createElement('div');
      gateJudgeTab.id = 'gate-judge-tab';
      gateJudgeTab.style.display = 'none';
      container.appendChild(gateJudgeTab);

      (controller as unknown as PrivateAccess).selectedRole = 'gateJudge';
      (controller as unknown as PrivateAccess).finalize();

      expect(store.setView).toHaveBeenCalledWith('gateJudge');
      expect(gateJudgeTab.style.display).toBe('');
    });
  });

  describe('dismiss (private)', () => {
    it('should save device name if set', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'onboarding-device-name';
      deviceNameInput.value = 'My Timer';
      container.appendChild(deviceNameInput);

      (controller as unknown as PrivateAccess).dismiss();

      expect(store.setDeviceName).toHaveBeenCalledWith('My Timer');
      expect(store.setDeviceRole).toHaveBeenCalled();
    });
  });

  describe('complete (private)', () => {
    it('should finalize and show success feedback', () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      (controller as unknown as PrivateAccess).complete();

      expect(feedbackSuccess).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalled();
      expect(closeModal).toHaveBeenCalled();
    });
  });

  describe('checkRaceExists (private)', () => {
    it('should show loading then result', async () => {
      const { syncService } = await import('../../src/services');

      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'RACE-1';
      container.appendChild(raceIdInput);

      const statusEl = document.createElement('div');
      statusEl.id = 'onboarding-race-status';
      container.appendChild(statusEl);

      await (controller as unknown as PrivateAccess).checkRaceExists();

      expect(syncService.checkRaceExists).toHaveBeenCalledWith('RACE-1');
      expect(statusEl.className).toContain('new');
    });

    it('should show found state when race exists', async () => {
      const { syncService } = await import('../../src/services');
      vi.mocked(syncService.checkRaceExists).mockResolvedValueOnce({
        exists: true,
        entryCount: 10,
      });

      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = 'EXISTING-RACE';
      container.appendChild(raceIdInput);

      const statusEl = document.createElement('div');
      statusEl.id = 'onboarding-race-status';
      container.appendChild(statusEl);

      await (controller as unknown as PrivateAccess).checkRaceExists();

      expect(statusEl.className).toContain('found');
    });

    it('should clear status when race ID is empty', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const raceIdInput = document.createElement('input');
      raceIdInput.id = 'onboarding-race-id';
      raceIdInput.value = '';
      container.appendChild(raceIdInput);

      const statusEl = document.createElement('div');
      statusEl.id = 'onboarding-race-status';
      statusEl.textContent = 'old status';
      container.appendChild(statusEl);

      await (controller as unknown as PrivateAccess).checkRaceExists();

      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('race-status');
    });

    it('should return early when elements missing', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      // No raceIdInput or statusEl
      await expect(
        (controller as unknown as PrivateAccess).checkRaceExists(),
      ).resolves.not.toThrow();
    });
  });

  describe('validatePin (private)', () => {
    it('should return true when PIN is valid', async () => {
      const { controller } = createControllerWithModal(container);
      controller.show();

      const result = await (controller as unknown as PrivateAccess).validatePin(
        '1234',
      );
      expect(result).toBe(true);
    });

    it('should return true and show warning on network error', async () => {
      const { exchangePinForToken } = await import('../../src/services/sync');
      vi.mocked(exchangePinForToken).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const { controller } = createControllerWithModal(container);
      controller.show();

      const result = await (controller as unknown as PrivateAccess).validatePin(
        '1234',
      );
      expect(result).toBe(true);
      expect(showToast).toHaveBeenCalled();
    });
  });

  describe('updateOnboardingTranslations (private)', () => {
    it('should update elements with data-i18n attribute', () => {
      const { controller, modal } = createControllerWithModal(container);
      controller.show();

      const el = document.createElement('span');
      el.setAttribute('data-i18n', 'someKey');
      el.textContent = 'old';
      modal.appendChild(el);

      (controller as unknown as PrivateAccess).updateOnboardingTranslations();

      expect(el.textContent).toBe('someKey');
    });
  });
});
