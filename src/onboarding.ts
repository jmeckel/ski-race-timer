import { store } from './store';
import { syncService } from './services';
import { exchangePinForToken, hasAuthToken } from './services/sync';
import { feedbackSuccess, feedbackTap } from './services';
import { showToast } from './components';
import { t } from './i18n/translations';
import { generateDeviceName } from './utils/id';
import { getTodaysRecentRaces, addRecentRace, type RecentRace } from './utils/recentRaces';
import { attachRecentRaceItemHandlers, renderRecentRaceItems } from './utils/recentRacesUi';
import { fetchWithTimeout } from './utils/errors';
import { openModal, closeModal } from './features/modals';
import { logger } from './utils/logger';
import type { Language, RaceInfo, DeviceRole } from './types';

const ONBOARDING_STORAGE_KEY = 'skiTimerHasCompletedOnboarding';

/**
 * Debounce utility for race check
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Onboarding Controller - manages the first-time user experience wizard
 */
export class OnboardingController {
  private modal: HTMLElement | null;
  private currentStep = 1;
  private totalSteps = 6;
  private selectedRole: DeviceRole = 'timer';
  private updateTranslationsCallback: (() => void) | null = null;
  private recentRacesDocumentHandler: ((event: MouseEvent) => void) | null = null;

  constructor() {
    this.modal = document.getElementById('onboarding-modal');
    if (this.modal) {
      this.setupEventListeners();
    }
  }

  /**
   * Set callback for updating translations when language changes
   */
  setUpdateTranslationsCallback(callback: () => void): void {
    this.updateTranslationsCallback = callback;
  }

  /**
   * Check if onboarding should be shown
   */
  shouldShow(): boolean {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true';
  }

  /**
   * Show the onboarding wizard
   */
  show(): void {
    if (!this.modal) return;

    this.currentStep = 1;
    this.selectedRole = 'timer';

    // Reset all cards - hide all except first
    this.modal.querySelectorAll('.onboarding-card').forEach((card, i) => {
      (card as HTMLElement).style.display = i === 0 ? 'block' : 'none';
    });

    // Reset form fields
    const raceIdInput = document.getElementById('onboarding-race-id') as HTMLInputElement;
    if (raceIdInput) raceIdInput.value = '';

    const pinInput = document.getElementById('onboarding-pin') as HTMLInputElement;
    if (pinInput) {
      pinInput.value = '';
      pinInput.style.display = 'none';
    }

    const raceStatus = document.getElementById('onboarding-race-status');
    if (raceStatus) {
      raceStatus.textContent = '';
      raceStatus.className = 'race-status';
    }

    const syncToggle = document.getElementById('onboarding-sync-toggle') as HTMLInputElement;
    if (syncToggle) syncToggle.checked = true;

    const photoToggle = document.getElementById('onboarding-photo-toggle') as HTMLInputElement;
    if (photoToggle) photoToggle.checked = false;

    // Reset role selection
    this.modal.querySelectorAll('.role-card').forEach(card => {
      card.classList.toggle('selected', card.getAttribute('data-role') === 'timer');
    });

    // Reset gate inputs
    const gateStart = document.getElementById('onboarding-gate-start') as HTMLInputElement;
    const gateEnd = document.getElementById('onboarding-gate-end') as HTMLInputElement;
    if (gateStart) gateStart.value = '1';
    if (gateEnd) gateEnd.value = '10';

    this.updateUI();
    openModal(this.modal);

    // Pre-fill device name with current value
    const deviceNameInput = document.getElementById('onboarding-device-name') as HTMLInputElement;
    if (deviceNameInput) {
      deviceNameInput.value = store.getState().deviceName;
    }

    // Set current language button as selected
    const currentLang = store.getState().currentLang;
    this.modal.querySelectorAll('.lang-btn').forEach(btn => {
      const lang = (btn as HTMLElement).dataset.lang;
      btn.classList.toggle('selected', lang === currentLang);
    });
  }

  /**
   * Reset onboarding status (for replay from settings)
   */
  reset(): void {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  }

  /**
   * Setup all event listeners for onboarding modal
   */
  private setupEventListeners(): void {
    if (!this.modal) return;

    // Language selection
    this.modal.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const lang = target.dataset.lang as Language;
        if (lang) {
          store.setLanguage(lang);
          this.modal!.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('selected'));
          target.classList.add('selected');
          feedbackTap();

          // Update translations in the whole app
          if (this.updateTranslationsCallback) {
            this.updateTranslationsCallback();
          }
          // Also update the onboarding modal translations
          this.updateOnboardingTranslations();
        }
      });
    });

    // Action buttons (next, skip, finish)
    this.modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        if (action) {
          feedbackTap();
          await this.handleAction(action);
        }
      });
    });

    // Regenerate device name button
    const regenerateBtn = document.getElementById('onboarding-regenerate-name');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        const deviceNameInput = document.getElementById('onboarding-device-name') as HTMLInputElement;
        if (deviceNameInput) {
          deviceNameInput.value = generateDeviceName();
          feedbackTap();
        }
      });
    }

    // Role selection
    this.modal.querySelectorAll('.role-card').forEach(card => {
      card.addEventListener('click', () => {
        const role = card.getAttribute('data-role') as DeviceRole;
        if (role) {
          this.selectedRole = role;
          this.modal!.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          feedbackTap();
        }
      });
    });

    // Race ID input - check existence with debounce
    const raceIdInput = document.getElementById('onboarding-race-id') as HTMLInputElement;
    if (raceIdInput) {
      const debouncedCheck = debounce(() => this.checkRaceExists(), 500);

      raceIdInput.addEventListener('input', () => {
        debouncedCheck();
        // Show/hide PIN field based on race ID input
        const pinInput = document.getElementById('onboarding-pin') as HTMLInputElement;
        if (pinInput) {
          pinInput.style.display = raceIdInput.value.trim() ? 'block' : 'none';
        }
      });
    }

    // Recent races button
    const recentRacesBtn = document.getElementById('onboarding-recent-races-btn');
    const recentRacesDropdown = document.getElementById('onboarding-recent-races-dropdown');
    if (recentRacesBtn && recentRacesDropdown) {
      recentRacesBtn.addEventListener('click', () => {
        feedbackTap();
        if (recentRacesDropdown.style.display === 'none') {
          this.showRecentRacesDropdown(recentRacesDropdown, 'onboarding-race-id');
        } else {
          recentRacesDropdown.style.display = 'none';
        }
      });

      // Close dropdown when clicking outside
      if (!this.recentRacesDocumentHandler) {
        this.recentRacesDocumentHandler = (e) => {
          const target = e.target as Node;
          if (!recentRacesBtn.contains(target) && !recentRacesDropdown.contains(target)) {
            recentRacesDropdown.style.display = 'none';
          }
        };
        document.addEventListener('click', this.recentRacesDocumentHandler);
      }
    }
  }

  /**
   * Show recent races dropdown and populate with today's races
   * Fetches from API if authenticated, falls back to localStorage
   */
  private async showRecentRacesDropdown(dropdown: HTMLElement, inputId: string): Promise<void> {
    const lang = store.getState().currentLang;

    // Show loading state
    dropdown.innerHTML = `<div class="recent-races-empty">${t('loading', lang)}</div>`;
    dropdown.style.display = 'block';

    // Try to fetch from API if authenticated
    let races: RecentRace[] = [];

    if (hasAuthToken()) {
      try {
        races = await this.fetchRacesFromApi();
      } catch (error) {
        logger.warn('Failed to fetch races from API:', error);
        // Fall back to localStorage
        races = getTodaysRecentRaces();
      }
    } else {
      // Not authenticated - use localStorage
      races = getTodaysRecentRaces();
    }

    if (races.length === 0) {
      dropdown.innerHTML = `<div class="recent-races-empty">${t('noRecentRaces', lang)}</div>`;
    } else {
      dropdown.innerHTML = renderRecentRaceItems(races);
      attachRecentRaceItemHandlers(dropdown, races, (race) => {
        this.selectRecentRace(race, inputId, dropdown);
      });
    }
  }

  /**
   * Fetch races from the admin API
   * Returns races filtered to today only, formatted as RecentRace
   */
  private async fetchRacesFromApi(): Promise<RecentRace[]> {
    const token = localStorage.getItem('skiTimerAuthToken');
    if (!token) {
      return [];
    }

    const response = await fetchWithTimeout('/api/v1/admin/races', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, 5000);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const raceInfos: RaceInfo[] = data.races || [];

    // Filter to today's races and convert to RecentRace format
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const todaysRaces = raceInfos
      .filter(race => race.lastUpdated && race.lastUpdated >= todayStart)
      .map(race => ({
        raceId: race.raceId,
        createdAt: race.lastUpdated || Date.now(),
        lastUpdated: race.lastUpdated || Date.now(),
        entryCount: race.entryCount
      }))
      .slice(0, 5);

    // Also update localStorage with fetched races for future use
    todaysRaces.forEach(race => {
      addRecentRace(race.raceId, race.lastUpdated, race.entryCount);
    });

    return todaysRaces;
  }

  /**
   * Select a recent race and fill the input
   */
  private selectRecentRace(race: RecentRace, inputId: string, dropdown: HTMLElement): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.value = race.raceId;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      feedbackTap();
    }
    dropdown.style.display = 'none';
  }

  /**
   * Update translations within the onboarding modal
   */
  private updateOnboardingTranslations(): void {
    if (!this.modal) return;

    const lang = store.getState().currentLang;

    this.modal.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key, lang);
      }
    });
  }

  /**
   * Handle action button clicks
   */
  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'next':
        if (await this.validateCurrentStep()) {
          await this.saveCurrentStep();
          // Force save after each step to ensure persistence
          store.forceSave();
          this.goToStep(this.currentStep + 1);
        }
        break;
      case 'back':
        // Go to previous step without validation
        if (this.currentStep > 1) {
          this.goToStep(this.currentStep - 1);
        }
        break;
      case 'skip':
        // Skip current step but ensure previous data is persisted
        // Force save to persist any data entered in prior steps
        store.forceSave();
        this.goToStep(this.currentStep + 1);
        break;
      case 'finish':
        this.complete();
        break;
    }
  }

  /**
   * Validate the current step before proceeding
   */
  private async validateCurrentStep(): Promise<boolean> {
    const lang = store.getState().currentLang;

    switch (this.currentStep) {
      case 2: { // Role selection - always valid (defaults to timer)
        return true;
      }
      case 3: { // Device name
        const deviceName = (document.getElementById('onboarding-device-name') as HTMLInputElement)?.value.trim();
        if (!deviceName) {
          showToast(t('deviceName', lang), 'warning');
          return false;
        }
        return true;
      }
      case 4: { // Photo capture (timer) or Gate assignment (judge) - no validation needed
        return true;
      }
      case 5: { // Race setup
        const raceId = (document.getElementById('onboarding-race-id') as HTMLInputElement)?.value.trim();
        const syncEnabled = (document.getElementById('onboarding-sync-toggle') as HTMLInputElement)?.checked;

        if (!raceId || !syncEnabled) {
          // No race ID or sync disabled - valid (skip mode)
          return true;
        }

        const pin = (document.getElementById('onboarding-pin') as HTMLInputElement)?.value;
        if (pin.length !== 4) {
          showToast(t('invalidPin', lang), 'warning');
          return false;
        }

        // Validate PIN with server
        return await this.validatePin(pin);
      }
      default:
        return true;
    }
  }

  /**
   * Save the current step's data
   */
  private async saveCurrentStep(): Promise<void> {
    switch (this.currentStep) {
      case 2: { // Save device role
        store.setDeviceRole(this.selectedRole);
        break;
      }
      case 3: { // Save device name
        const deviceName = (document.getElementById('onboarding-device-name') as HTMLInputElement)?.value.trim();
        if (deviceName) {
          store.setDeviceName(deviceName);
        }
        break;
      }
      case 4: { // Save photo capture (timer) or gate assignment (judge)
        if (this.selectedRole === 'gateJudge') {
          const gateStart = parseInt((document.getElementById('onboarding-gate-start') as HTMLInputElement)?.value || '1', 10);
          const gateEnd = parseInt((document.getElementById('onboarding-gate-end') as HTMLInputElement)?.value || '10', 10);
          const validStart = Math.min(gateStart, gateEnd);
          const validEnd = Math.max(gateStart, gateEnd);
          store.setGateAssignment([validStart, validEnd]);
        } else {
          const photoEnabled = (document.getElementById('onboarding-photo-toggle') as HTMLInputElement)?.checked;
          store.updateSettings({ photoCapture: photoEnabled });
        }
        break;
      }
      case 5: { // Save race settings
        const raceId = (document.getElementById('onboarding-race-id') as HTMLInputElement)?.value.trim();
        const syncEnabled = (document.getElementById('onboarding-sync-toggle') as HTMLInputElement)?.checked;

        if (raceId) {
          store.setRaceId(raceId);
        }

        const shouldEnableSync = syncEnabled && !!raceId;
        store.updateSettings({ sync: shouldEnableSync });

        if (shouldEnableSync) {
          syncService.initialize();
        }
        break;
      }
    }
  }

  /**
   * Navigate to a specific step
   */
  private goToStep(step: number): void {
    if (!this.modal || step < 1 || step > this.totalSteps) return;

    // Hide current card (may be path-specific)
    this.modal.querySelectorAll(`[data-step="${this.currentStep}"]`).forEach(card => {
      (card as HTMLElement).style.display = 'none';
    });

    // Show new card
    this.currentStep = step;

    // Step 4 has branching paths - show the correct one based on role
    if (step === 4) {
      const pathCard = this.modal.querySelector(`[data-step="4"][data-path="${this.selectedRole}"]`) as HTMLElement;
      if (pathCard) {
        pathCard.style.display = 'block';
      }
    } else {
      const newCard = this.modal.querySelector(`[data-step="${step}"]:not([data-path])`) as HTMLElement;
      if (newCard) {
        newCard.style.display = 'block';
      }
    }

    // Update UI elements based on role
    this.updateUIForRole();

    // Update progress dots
    this.updateProgressDots();

    // If final step, show summary
    if (step === 6) {
      this.showSummary();
    }
  }

  /**
   * Update UI elements based on selected role
   */
  private updateUIForRole(): void {
    const lang = store.getState().currentLang;

    // Update device name step labels
    const titleEl = document.getElementById('onboarding-device-name-title');
    const descEl = document.getElementById('onboarding-device-name-desc');
    if (this.selectedRole === 'gateJudge') {
      if (titleEl) titleEl.textContent = t('onboardingDeviceNameJudge', lang);
      if (descEl) descEl.textContent = t('onboardingDeviceNameJudgeDesc', lang);
    } else {
      if (titleEl) titleEl.textContent = t('onboardingDeviceName', lang);
      if (descEl) descEl.textContent = t('onboardingDeviceNameDesc', lang);
    }

    // Update final step for role
    const readyTitle = document.getElementById('onboarding-ready-title');
    const readyTip = document.getElementById('onboarding-ready-tip');
    const finishBtn = document.getElementById('onboarding-finish-btn');
    if (this.selectedRole === 'gateJudge') {
      if (readyTitle) readyTitle.textContent = t('onboardingReadyJudge', lang);
      if (readyTip) readyTip.textContent = t('onboardingTipJudge', lang);
      if (finishBtn) finishBtn.textContent = t('startJudging', lang);
    } else {
      if (readyTitle) readyTitle.textContent = t('onboardingReady', lang);
      if (readyTip) readyTip.textContent = t('onboardingTip', lang);
      if (finishBtn) finishBtn.textContent = t('startTiming', lang);
    }
  }

  /**
   * Update the progress indicator dots
   */
  private updateProgressDots(): void {
    if (!this.modal) return;

    const dots = this.modal.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i + 1 === this.currentStep) {
        dot.classList.add('active');
      } else if (i + 1 < this.currentStep) {
        dot.classList.add('completed');
      }
    });
  }

  /**
   * Update the UI to match current state
   */
  private updateUI(): void {
    this.updateProgressDots();
    this.updateOnboardingTranslations();
  }

  /**
   * Show the summary on the final step
   */
  private showSummary(): void {
    const state = store.getState();
    const lang = state.currentLang;
    const summary = document.getElementById('onboarding-summary');

    if (summary) {
      summary.innerHTML = '';

      const rows: Array<[string, string]> = [];

      // Role
      rows.push([t('deviceRole', lang), this.selectedRole === 'gateJudge' ? t('roleJudgeTitle', lang) : t('roleTimerTitle', lang)]);

      // Device/Judge name
      rows.push([this.selectedRole === 'gateJudge' ? t('onboardingDeviceNameJudge', lang) : t('deviceNameLabel', lang), state.deviceName]);

      // Role-specific row
      if (this.selectedRole === 'gateJudge') {
        const gateRange = state.gateAssignment;
        rows.push([t('gates', lang), gateRange ? `${gateRange[0]}–${gateRange[1]}` : '—']);
      } else {
        rows.push([t('photoCaptureLabel', lang), state.settings.photoCapture ? t('enabled', lang) : t('disabled', lang)]);
      }

      // Race ID & Sync
      rows.push([t('raceIdLabel', lang), state.raceId || '—']);
      rows.push([t('syncStatusLabel', lang), state.settings.sync ? t('enabled', lang) : t('disabled', lang)]);

      rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'onboarding-summary-item';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;

        const valueEl = document.createElement('strong');
        valueEl.textContent = value;

        row.append(labelEl, valueEl);
        summary.appendChild(row);
      });
    }
  }

  /**
   * Check if the race exists in the cloud
   */
  private async checkRaceExists(): Promise<void> {
    const raceIdInput = document.getElementById('onboarding-race-id') as HTMLInputElement;
    const statusEl = document.getElementById('onboarding-race-status');

    if (!raceIdInput || !statusEl) return;

    const raceId = raceIdInput.value.trim();

    if (!raceId) {
      statusEl.textContent = '';
      statusEl.className = 'race-status';
      return;
    }

    const result = await syncService.checkRaceExists(raceId);
    const lang = store.getState().currentLang;

    if (result.exists) {
      const entryWord = result.entryCount === 1 ? t('entry', lang) : t('entries', lang);
      statusEl.textContent = `✓ ${t('raceFound', lang)} (${result.entryCount} ${entryWord})`;
      statusEl.className = 'race-status found';
    } else {
      statusEl.textContent = `+ ${t('raceNew', lang)}`;
      statusEl.className = 'race-status new';
    }
  }

  /**
   * Validate PIN with the server
   */
  private async validatePin(pin: string): Promise<boolean> {
    try {
      const result = await exchangePinForToken(pin);
      return result.success;
    } catch {
      // If offline, accept any PIN (will validate when online)
      return true;
    }
  }

  /**
   * Complete the onboarding wizard
   */
  private complete(): void {
    // Force save all settings before closing (bypasses debounce to ensure persistence)
    store.forceSave();

    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    closeModal(this.modal);

    // Navigate to appropriate view based on role
    if (this.selectedRole === 'gateJudge') {
      store.setView('gateJudge');
      // Show gate judge tab
      const gateJudgeTab = document.getElementById('gate-judge-tab');
      if (gateJudgeTab) gateJudgeTab.style.display = '';
    } else {
      store.setView('timer');
    }

    // Show success feedback
    feedbackSuccess();
    showToast(t('onboardingComplete', store.getState().currentLang), 'success');

    if (this.recentRacesDocumentHandler) {
      document.removeEventListener('click', this.recentRacesDocumentHandler);
      this.recentRacesDocumentHandler = null;
    }
  }
}
