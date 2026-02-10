/**
 * Race Administration Module
 * Handles race CRUD operations, race list management, and race deletion
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { feedbackDelete, feedbackWarning } from '../../services';
import { getAuthHeaders } from '../../services/auth';
import { store } from '../../store';
import type { Language, RaceInfo } from '../../types';
import { fetchWithTimeout, logError } from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';
import { logger } from '../../utils/logger';
import { closeModal, openModal } from '../modals';
import { authenticateWithPin } from './pinManagement';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Admin API configuration
const ADMIN_API_BASE = '/api/v1/admin/races';

// Module state
let pendingRaceDelete: string | null = null;

/**
 * Handle manage races button click
 * Always requires PIN verification for security
 */
function handleManageRacesClick(): void {
  // Always show PIN verification modal - race management requires explicit authentication
  const modal = document.getElementById('admin-pin-modal');
  const pinInput = document.getElementById(
    'admin-pin-verify-input',
  ) as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const titleEl = document.getElementById('admin-pin-modal-title');
  const textEl = document.getElementById('admin-pin-modal-text');
  const lang = store.getState().currentLang;

  if (modal && pinInput && errorEl) {
    pinInput.value = '';
    errorEl.style.display = 'none';
    if (titleEl) titleEl.textContent = t('enterAdminPin', lang);
    if (textEl) textEl.textContent = t('enterPinText', lang);
    openModal(modal);
    pinInput.focus();
  }
}

/**
 * Handle admin PIN verification
 */
export async function handleAdminPinVerify(): Promise<void> {
  const pinInput = document.getElementById(
    'admin-pin-verify-input',
  ) as HTMLInputElement;
  const errorEl = document.getElementById('admin-pin-error');
  const modal = document.getElementById('admin-pin-modal');

  if (!pinInput || !modal) return;

  const enteredPin = pinInput.value.trim();

  // Authenticate via JWT token exchange
  const result = await authenticateWithPin(enteredPin);

  if (result.success) {
    // PIN correct - open race management
    closeModal(modal);
    pinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
    openRaceManagementModal();
  } else {
    // PIN incorrect
    if (errorEl) errorEl.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
    feedbackWarning();
  }
}

/**
 * Open race management modal and load race list
 */
function openRaceManagementModal(): void {
  const modal = document.getElementById('race-management-modal');
  if (modal) {
    openModal(modal);
    loadRaceList();
  }
}

/**
 * Load and display race list from admin API
 */
async function loadRaceList(): Promise<void> {
  const listContainer = document.getElementById('race-list');
  const loadingEl = document.getElementById('race-list-loading');
  const emptyEl = document.getElementById('race-list-empty');
  const lang = store.getState().currentLang;

  if (!listContainer) return;

  // Show loading and set ARIA busy state
  listContainer.setAttribute('aria-busy', 'true');
  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Remove existing race items
  listContainer.querySelectorAll('.race-item').forEach((item) => item.remove());

  try {
    const response = await fetchWithTimeout(
      ADMIN_API_BASE,
      {
        headers: getAuthHeaders(),
      },
      10000,
    ); // 10 second timeout for race list
    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
        logger.error(
          'API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN',
        );
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const races: RaceInfo[] = data.races || [];

    // Hide loading and clear ARIA busy state
    listContainer.setAttribute('aria-busy', 'false');
    if (loadingEl) loadingEl.style.display = 'none';

    if (races.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    // Render race items
    races.forEach((race) => {
      const raceItem = createRaceItem(race, lang);
      listContainer.appendChild(raceItem);
    });
  } catch (error) {
    logError('Admin', 'loadRaceList', error, 'loadError');
    showToast(t('loadError', lang), 'error');
    listContainer.setAttribute('aria-busy', 'false');
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

/**
 * Create a race item element
 */
function createRaceItem(race: RaceInfo, lang: Language): HTMLElement {
  const item = document.createElement('div');
  item.className = 'race-item';
  item.setAttribute('data-race-id', race.raceId);

  const info = document.createElement('div');
  info.className = 'race-info';

  const raceIdEl = document.createElement('span');
  raceIdEl.className = 'race-id';
  raceIdEl.textContent = race.raceId.toUpperCase();

  const meta = document.createElement('span');
  meta.className = 'race-meta';
  const entriesText =
    race.entryCount === 1 ? t('entry', lang) : t('entries', lang);
  const devicesText =
    race.deviceCount === 1 ? t('device', lang) : t('devices', lang);
  meta.textContent = `${race.entryCount} ${entriesText}, ${race.deviceCount} ${devicesText}`;

  info.appendChild(raceIdEl);
  info.appendChild(meta);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'race-delete-btn danger';
  deleteBtn.textContent = t('delete', lang);
  deleteBtn.addEventListener('click', () => promptDeleteRace(race.raceId));

  item.appendChild(info);
  item.appendChild(deleteBtn);

  return item;
}

/**
 * Prompt to delete a race
 */
function promptDeleteRace(raceId: string): void {
  const lang = store.getState().currentLang;
  pendingRaceDelete = raceId;

  const modal = document.getElementById('delete-race-confirm-modal');
  const textEl = document.getElementById('delete-race-confirm-text');

  if (textEl) {
    textEl.textContent = `${t('confirmDeleteRaceText', lang)} "${raceId.toUpperCase()}"?`;
  }

  if (modal) {
    openModal(modal);
  }
}

/**
 * Handle confirm delete race
 */
async function handleConfirmDeleteRace(): Promise<void> {
  if (!pendingRaceDelete) return;

  const raceId = pendingRaceDelete;
  const lang = store.getState().currentLang;

  // Close confirmation modal
  const confirmModal = document.getElementById('delete-race-confirm-modal');
  closeModal(confirmModal);

  try {
    const response = await fetchWithTimeout(
      `${ADMIN_API_BASE}?raceId=${encodeURIComponent(raceId)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      },
      10000,
    ); // 10 second timeout for delete

    if (!response.ok) {
      if (response.status === 401) {
        // API auth failed - server PIN mismatch (should not happen in production)
        const modal = document.getElementById('race-management-modal');
        closeModal(modal);
        showToast(t('authError', lang), 'error');
        logger.error(
          'API auth failed - check ADMIN_PIN env variable matches SERVER_API_PIN',
        );
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      showToast(
        `${t('raceDeletedSuccess', lang)} ${raceId.toUpperCase()}`,
        'success',
      );
      feedbackDelete();
      // Refresh the list
      loadRaceList();
    } else {
      throw new Error(result.error || t('unknownError', lang));
    }
  } catch (error) {
    logError('Admin', 'deleteRace', error, 'deleteError');
  } finally {
    pendingRaceDelete = null;
  }
}

/**
 * Initialize race administration handlers
 */
export function initRaceAdmin(): void {
  // Manage races button
  const manageRacesBtn = document.getElementById('manage-races-btn');
  if (manageRacesBtn) {
    listeners.add(manageRacesBtn, 'click', handleManageRacesClick);
  }

  // Refresh races button
  const refreshRacesBtn = document.getElementById('refresh-races-btn');
  if (refreshRacesBtn) {
    listeners.add(refreshRacesBtn, 'click', loadRaceList);
  }

  // Confirm delete race button
  const confirmDeleteRaceBtn = document.getElementById(
    'confirm-delete-race-btn',
  );
  if (confirmDeleteRaceBtn) {
    listeners.add(confirmDeleteRaceBtn, 'click', handleConfirmDeleteRace);
  }
}
