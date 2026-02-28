/**
 * Unit Tests for Device Settings Module
 * Tests: updateRoleToggle, updateDeviceSettingsInputs, cleanupDeviceSettings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/services', () => ({
  feedbackTap: vi.fn(),
}));

const mockGetState = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setDeviceName: vi.fn(),
    setDeviceRole: vi.fn(),
    setView: vi.fn(),
  },
}));

vi.mock('../../../../src/utils', () => ({
  getElement: vi.fn(
    (id: string) => document.getElementById(id) as HTMLElement | null,
  ),
}));

vi.mock('../../../../src/utils/listenerManager', () => ({
  ListenerManager: vi.fn().mockImplementation(function () {
    return { add: vi.fn(), removeAll: vi.fn() };
  }),
}));

vi.mock('../../../../src/features/gateJudgeView', () => ({
  updateGateJudgeTabVisibility: vi.fn(),
}));

vi.mock('../../../../src/features/modals', () => ({
  openModal: vi.fn(),
}));

import {
  cleanupDeviceSettings,
  initDeviceSettings,
  initRoleToggle,
  updateDeviceSettingsInputs,
  updateRoleToggle,
} from '../../../../src/features/settings/deviceSettings';

describe('Device Settings Module', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    mockGetState.mockReturnValue({
      deviceName: 'Timer 1',
      deviceRole: 'timer',
      currentView: 'timer',
      gateAssignment: null,
    });
  });

  afterEach(() => {
    container.remove();
  });

  describe('initDeviceSettings', () => {
    it('should not throw when elements missing', () => {
      expect(() => initDeviceSettings()).not.toThrow();
    });

    it('should initialize when device name input exists', () => {
      const deviceNameInput = document.createElement('input');
      deviceNameInput.id = 'device-name-input';
      container.appendChild(deviceNameInput);

      expect(() => initDeviceSettings()).not.toThrow();
    });
  });

  describe('initRoleToggle', () => {
    it('should not throw when role-toggle missing', () => {
      expect(() => initRoleToggle()).not.toThrow();
    });

    it('should not throw when role-toggle exists', () => {
      const roleToggle = document.createElement('div');
      roleToggle.id = 'role-toggle';
      container.appendChild(roleToggle);

      expect(() => initRoleToggle()).not.toThrow();
    });
  });

  describe('updateRoleToggle', () => {
    it('should set active class on current role card', () => {
      const roleToggle = document.createElement('div');
      roleToggle.id = 'role-toggle';

      const timerCard = document.createElement('div');
      timerCard.className = 'role-card-setting';
      timerCard.setAttribute('data-role', 'timer');
      roleToggle.appendChild(timerCard);

      const gateCard = document.createElement('div');
      gateCard.className = 'role-card-setting';
      gateCard.setAttribute('data-role', 'gateJudge');
      roleToggle.appendChild(gateCard);

      container.appendChild(roleToggle);

      updateRoleToggle();

      expect(timerCard.classList.contains('active')).toBe(true);
      expect(gateCard.classList.contains('active')).toBe(false);
      expect(timerCard.getAttribute('aria-checked')).toBe('true');
      expect(gateCard.getAttribute('aria-checked')).toBe('false');
    });

    it('should handle missing role toggle', () => {
      expect(() => updateRoleToggle()).not.toThrow();
    });
  });

  describe('updateDeviceSettingsInputs', () => {
    it('should set device name input value', () => {
      const input = document.createElement('input');
      input.id = 'device-name-input';
      container.appendChild(input);

      updateDeviceSettingsInputs();

      expect(input.value).toBe('Timer 1');
    });

    it('should handle missing input', () => {
      expect(() => updateDeviceSettingsInputs()).not.toThrow();
    });
  });

  describe('cleanupDeviceSettings', () => {
    it('should not throw', () => {
      expect(() => cleanupDeviceSettings()).not.toThrow();
    });
  });
});
