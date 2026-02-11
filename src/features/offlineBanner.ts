/**
 * Offline Banner Module
 * Shows a dismissible banner when the app goes offline.
 * Auto-dismisses when back online and shows a brief toast.
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { store } from '../store';
import { ListenerManager } from '../utils/listenerManager';

let dismissed = false;
const listeners = new ListenerManager();

function showBanner(): void {
  if (dismissed) return;
  const banner = document.getElementById('offline-banner');
  if (banner) {
    const lang = store.getState().currentLang;
    const textEl = document.getElementById('offline-banner-text');
    if (textEl) textEl.textContent = t('offlineBanner', lang);
    banner.classList.remove('hidden');
  }
}

function hideBanner(): void {
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

function handleOnline(): void {
  hideBanner();
  dismissed = false;
  const lang = store.getState().currentLang;
  showToast(t('onlineRestored', lang), 'success', 2000);
}

function handleOffline(): void {
  dismissed = false;
  showBanner();
}

/**
 * Initialize offline banner listeners.
 * Call once during app initialization.
 */
export function initOfflineBanner(): void {
  // Dismiss button
  const dismissBtn = document.getElementById('offline-banner-dismiss');
  if (dismissBtn) {
    listeners.add(dismissBtn, 'click', () => {
      dismissed = true;
      hideBanner();
    });
  }

  // Listen for online/offline events
  listeners.add(window, 'online', handleOnline);
  listeners.add(window, 'offline', handleOffline);

  // Check initial state
  if (!navigator.onLine) {
    showBanner();
  }
}

/**
 * Cleanup offline banner listeners
 */
export function destroyOfflineBanner(): void {
  listeners.removeAll();
}
