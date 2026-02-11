/**
 * Display Settings Module
 * Handles language toggle, simple mode toggle, glass effects toggle,
 * ambient mode toggle, and voice mode toggle
 */

import { showToast } from '../../components';
import { t } from '../../i18n/translations';
import { voiceModeService } from '../../services';
import { store } from '../../store';
import type { Language } from '../../types';
import { getElement } from '../../utils';
import { ListenerManager } from '../../utils/listenerManager';

// Module state
const listeners = new ListenerManager();

/**
 * Initialize display-related settings
 */
export function initDisplaySettings(applySettings: () => void): void {
  // Simple mode toggle
  const simpleModeToggle = getElement<HTMLInputElement>('simple-mode-toggle');
  if (simpleModeToggle) {
    listeners.add(simpleModeToggle, 'change', () => {
      store.updateSettings({ simple: simpleModeToggle.checked });
      applySettings();
      const adminSection = getElement('admin-section');
      if (adminSection) {
        adminSection.style.display = 'block';
      }
    });
  }

  // Ambient mode toggle
  const ambientModeToggle = getElement<HTMLInputElement>('ambient-mode-toggle');
  if (ambientModeToggle) {
    listeners.add(ambientModeToggle, 'change', () => {
      store.updateSettings({ ambientMode: ambientModeToggle.checked });
    });
  }

  // Voice mode toggle
  initVoiceModeToggle();

  // Language toggle
  const langToggle = getElement('lang-toggle');
  if (langToggle) {
    const selectLanguage = (lang: Language) => {
      if (lang && lang !== store.getState().currentLang) {
        store.setLanguage(lang);
        // Defer to orchestrator for full translation update
        window.dispatchEvent(new CustomEvent('settings-language-changed'));
      }
    };

    listeners.add(langToggle, 'click', (e) => {
      const target = e.target as HTMLElement;
      const lang = target.getAttribute('data-lang') as Language;
      selectLanguage(lang);
    });

    // Keyboard support for language options
    langToggle.querySelectorAll('.lang-option').forEach((opt) => {
      listeners.add(opt, 'keydown', (e) => {
        const event = e as KeyboardEvent;

        switch (event.key) {
          case 'Enter':
          case ' ': {
            event.preventDefault();
            const lang = (opt as HTMLElement).getAttribute(
              'data-lang',
            ) as Language;
            selectLanguage(lang);
            break;
          }
          case 'ArrowLeft':
          case 'ArrowRight': {
            event.preventDefault();
            const options = Array.from(
              langToggle.querySelectorAll('.lang-option'),
            );
            const currentIndex = options.indexOf(opt as Element);
            let nextIndex: number;
            if (event.key === 'ArrowRight') {
              nextIndex = (currentIndex + 1) % options.length;
            } else {
              nextIndex = (currentIndex - 1 + options.length) % options.length;
            }
            const nextOpt = options[nextIndex] as HTMLElement;
            const nextLang = nextOpt.getAttribute('data-lang') as Language;
            nextOpt.focus();
            selectLanguage(nextLang);
            break;
          }
        }
      });
    });
  }
}

/**
 * Initialize voice mode toggle
 */
function initVoiceModeToggle(): void {
  const voiceModeToggle = getElement<HTMLInputElement>('voice-mode-toggle');
  const voiceModeRow = getElement('voice-mode-row');

  if (!voiceModeToggle || !voiceModeRow) return;

  // Hide voice mode if not supported
  if (!voiceModeService.isSupported()) {
    voiceModeRow.style.display = 'none';
    return;
  }

  // Set initial state from voice service
  voiceModeToggle.checked = voiceModeService.isActive();

  listeners.add(voiceModeToggle, 'change', async () => {
    const lang = store.getState().currentLang;

    if (voiceModeToggle.checked) {
      // Check if online
      if (!navigator.onLine) {
        showToast(t('voiceOffline', lang), 'warning');
        voiceModeToggle.checked = false;
        return;
      }

      // Enable voice mode
      const success = voiceModeService.enable();
      if (!success) {
        showToast(t('voiceError', lang), 'error');
        voiceModeToggle.checked = false;
      }
    } else {
      voiceModeService.disable();
    }
  });
}

/**
 * Update display-related settings inputs
 */
export function updateDisplaySettingsInputs(): void {
  const state = store.getState();
  const { settings } = state;

  const simpleModeToggle = getElement<HTMLInputElement>('simple-mode-toggle');
  if (simpleModeToggle) simpleModeToggle.checked = settings.simple;

  // Hide admin section in simple mode
  const adminSection = getElement('admin-section');
  if (adminSection) {
    adminSection.style.display = 'block';
  }

  // Update ambient mode toggle
  const ambientModeToggle = getElement<HTMLInputElement>('ambient-mode-toggle');
  if (ambientModeToggle) ambientModeToggle.checked = settings.ambientMode;

  // Update language toggle
  updateLangToggle();
}

/**
 * Update language toggle UI
 */
export function updateLangToggle(): void {
  const lang = store.getState().currentLang;
  const langToggle = getElement('lang-toggle');
  if (langToggle) {
    langToggle.querySelectorAll('.lang-option').forEach((opt) => {
      const isActive = opt.getAttribute('data-lang') === lang;
      opt.classList.toggle('active', isActive);
      opt.setAttribute('aria-checked', String(isActive));
    });
  }
}

/**
 * Cleanup display settings listeners
 */
export function cleanupDisplaySettings(): void {
  listeners.removeAll();
}
