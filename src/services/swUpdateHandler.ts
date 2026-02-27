/**
 * Service Worker Update Handler
 * Listens for SW update events from vite-plugin-pwa and shows a reload toast
 */
import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../components/Toast';
import { t } from '../i18n/translations';
import { store } from '../store';
import type { Language } from '../types';

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function initSwUpdateHandler(): void {
  updateSW = registerSW({
    onNeedRefresh() {
      const lang = store.getState().currentLang as Language;
      showToast(t('updateAvailable', lang), 'info', 0, {
        action: {
          label: t('reload', lang),
          callback: () => {
            updateSW?.(true);
          },
        },
      });
    },
    onOfflineReady() {
      // App is cached and ready for offline use - no user action needed
    },
  });
}
