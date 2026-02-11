/**
 * Device Settings Module
 * Handles device name input, role selector, and advanced settings toggle
 */

import { feedbackTap } from '../../services';
import { store } from '../../store';
import type { DeviceRole } from '../../types';
import { getElement } from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';
import { updateGateJudgeTabVisibility } from '../gateJudgeView';
import { openModal } from '../modals';

// Module state
const listeners = new ListenerManager();

/**
 * Initialize device-related settings
 */
export function initDeviceSettings(): void {
  // Device name input
  const deviceNameInput = getElement<HTMLInputElement>('device-name-input');
  if (deviceNameInput) {
    listeners.add(deviceNameInput, 'change', () => {
      store.setDeviceName(deviceNameInput.value.trim());
    });
  }

  // Device Role toggle
  initRoleToggle();

  // Listen for update-role-toggle events from gateJudgeView
  listeners.add(window, 'update-role-toggle', () => updateRoleToggle());

  // Advanced settings collapsible toggle
  initAdvancedSettingsToggle();
}

/**
 * Initialize role toggle in settings
 */
export function initRoleToggle(): void {
  const roleToggle = getElement('role-toggle');
  if (!roleToggle) return;

  listeners.add(roleToggle, 'click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.role-card-setting');
    if (!card) return;

    const role = card.getAttribute('data-role') as DeviceRole;
    if (role && role !== store.getState().deviceRole) {
      store.setDeviceRole(role);
      updateRoleToggle();
      updateGateJudgeTabVisibility();
      feedbackTap();

      // If switching to gateJudge and no gate assignment, show assignment modal
      if (role === 'gateJudge' && !store.getState().gateAssignment) {
        openModal(getElement('gate-assignment-modal'));
      }

      // If switching away from gateJudge while on gateJudge view, go to timer
      if (
        role !== 'gateJudge' &&
        store.getState().currentView === 'gateJudge'
      ) {
        store.setView('timer');
      }
    }
  });
}

/**
 * Update role toggle UI
 */
export function updateRoleToggle(): void {
  const roleToggle = getElement('role-toggle');
  if (!roleToggle) return;

  const state = store.getState();
  roleToggle.querySelectorAll('.role-card-setting').forEach((card) => {
    const role = card.getAttribute('data-role');
    const isActive = role === state.deviceRole;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * Initialize advanced settings collapsible toggle
 */
function initAdvancedSettingsToggle(): void {
  const toggle = getElement('advanced-settings-toggle');
  const section = getElement('advanced-settings-section');
  if (!toggle || !section) return;

  toggle.setAttribute('role', 'button');
  // Start expanded by default
  toggle.setAttribute(
    'aria-expanded',
    section.classList.contains('expanded') ? 'true' : 'false',
  );
  listeners.add(toggle, 'click', () => {
    const isExpanded = section.classList.toggle('expanded');
    toggle.setAttribute('aria-expanded', String(isExpanded));
    feedbackTap();
  });
}

/**
 * Update device-related settings inputs
 */
export function updateDeviceSettingsInputs(): void {
  const state = store.getState();

  const deviceNameInput = getElement<HTMLInputElement>('device-name-input');
  if (deviceNameInput) deviceNameInput.value = state.deviceName;
}

/**
 * Cleanup device settings listeners
 */
export function cleanupDeviceSettings(): void {
  listeners.removeAll();
}
