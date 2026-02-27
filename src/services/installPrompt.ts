/**
 * PWA Install Prompt Service
 * Captures the beforeinstallprompt event and provides a way to trigger install.
 * On iOS (which doesn't support beforeinstallprompt), shows instructions.
 */
import { showToast } from '../components/Toast';
import { t } from '../i18n/translations';
import { store } from '../store';
import type { Language } from '../types';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let isInstalled = false;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isInstallAvailable(): boolean {
  return deferredPrompt !== null && !isInstalled;
}

export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function triggerInstall(): Promise<void> {
  if (!deferredPrompt) return;

  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === 'accepted') {
    deferredPrompt = null;
  }
}

export function showIOSInstallInstructions(): void {
  const lang = store.getState().currentLang as Language;
  showToast(t('iosInstallInstructions', lang), 'info', 8000);
}

/** Initialize install prompt listeners */
export function initInstallPrompt(): void {
  // Already running as installed PWA
  if (isStandalone()) {
    isInstalled = true;
    return;
  }

  // Check if previously installed
  if (localStorage.getItem('skiTimerAppInstalled') === 'true') {
    isInstalled = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    // Dispatch custom event so settings view can show install button
    window.dispatchEvent(new CustomEvent('install-prompt-available'));
  });

  window.addEventListener('appinstalled', () => {
    isInstalled = true;
    deferredPrompt = null;
    localStorage.setItem('skiTimerAppInstalled', 'true');
    window.dispatchEvent(new CustomEvent('install-prompt-available'));
  });
}
