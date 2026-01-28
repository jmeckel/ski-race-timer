import './styles/main.css';
import './styles/glass.css';
import './styles/animations.css';
// DISABLED: Motion effects disabled to save battery
// import './styles/motion.css';
import { initApp } from './app';
import { getToast, showToast } from './components/Toast';
import { initGlobalErrorHandlers } from './utils/errorBoundary';
import { store } from './store';
import { t } from './i18n/translations';
import { logger } from './utils/logger';

// Initialize global error handlers first (catches errors during init)
initGlobalErrorHandlers();

// Initialize toast system
getToast();

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Register service worker with update notification
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Check for updates periodically (every 60 seconds when visible)
      setInterval(() => {
        if (!document.hidden) {
          registration.update();
        }
      }, 60000);

      // Handle update found
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // New service worker is installed and waiting
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Show update notification to user
            showUpdateNotification();
          }
        });
      });

    } catch (error) {
      logger.error('Service Worker registration failed:', error);
    }
  });
}

// Show update notification
function showUpdateNotification(): void {
  const lang = store.getState().currentLang;
  showToast(t('updateAvailable', lang), 'info', 10000); // Show for 10 seconds
}

// Handle visibility change (pause/resume)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // App became visible - could refresh sync here
  }
});

// Prevent accidental navigation
window.addEventListener('beforeunload', () => {
  // Only warn if there are unsaved changes
  // For now, always allow navigation
});
