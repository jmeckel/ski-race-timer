import { store } from './store';
import { syncService } from './services';
import { exchangePinForToken } from './services/sync';
import { feedbackSuccess, feedbackTap } from './services';
import { showToast } from './components';
import { t } from './i18n/translations';
import type { Language } from './types';

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
 * Close modal with animation
 */
function closeModal(modal: HTMLElement | null): void {
  if (!modal || !modal.classList.contains('show')) return;

  modal.classList.add('closing');

  setTimeout(() => {
    modal.classList.remove('show', 'closing');
  }, 150);
}

/**
 * Onboarding Controller - manages the first-time user experience wizard
 */
export class OnboardingController {
  private modal: HTMLElement | null;
  private currentStep = 1;
  private totalSteps = 4;
  private updateTranslationsCallback: (() => void) | null = null;

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

    this.updateUI();
    this.modal.classList.add('show');

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
          this.goToStep(this.currentStep + 1);
        }
        break;
      case 'skip':
        // Skip race setup but still continue
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
      case 2: { // Device name
        const deviceName = (document.getElementById('onboarding-device-name') as HTMLInputElement)?.value.trim();
        if (!deviceName) {
          showToast(t('deviceName', lang), 'warning');
          return false;
        }
        return true;
      }
      case 3: { // Race setup
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
      case 2: { // Save device name
        const deviceName = (document.getElementById('onboarding-device-name') as HTMLInputElement)?.value.trim();
        if (deviceName) {
          store.setDeviceName(deviceName);
        }
        break;
      }
      case 3: { // Save race settings
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

    // Hide current card
    const currentCard = this.modal.querySelector(`[data-step="${this.currentStep}"]`) as HTMLElement;
    if (currentCard) {
      currentCard.style.display = 'none';
    }

    // Show new card
    this.currentStep = step;
    const newCard = this.modal.querySelector(`[data-step="${step}"]`) as HTMLElement;
    if (newCard) {
      newCard.style.display = 'block';
    }

    // Update progress dots
    this.updateProgressDots();

    // If final step, show summary
    if (step === 4) {
      this.showSummary();
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
      summary.innerHTML = `
        <div class="onboarding-summary-item">
          <span>${t('deviceNameLabel', lang)}</span>
          <strong>${state.deviceName}</strong>
        </div>
        <div class="onboarding-summary-item">
          <span>${t('raceIdLabel', lang)}</span>
          <strong>${state.raceId || '—'}</strong>
        </div>
        <div class="onboarding-summary-item">
          <span>${t('syncStatusLabel', lang)}</span>
          <strong>${state.settings.sync ? t('enabled', lang) : t('disabled', lang)}</strong>
        </div>
      `;
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
      statusEl.textContent = `✓ ${t('raceFound', lang)} (${result.entryCount} ${t('entries', lang)})`;
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
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    closeModal(this.modal);
    store.setView('timer');

    // Show success feedback
    feedbackSuccess();
    showToast(t('onboardingComplete', store.getState().currentLang), 'success');
  }
}
