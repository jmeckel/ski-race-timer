import './styles/main.css';
import './styles/glass.css';
import './styles/animations.css';
import './styles/radial-dial.css';
// DISABLED: Motion effects disabled to save battery
// import './styles/motion.css';
import { initApp } from './app';
import { getToast, showToast } from './components/Toast';
import { initGlobalErrorHandlers } from './utils/errorBoundary';
import { store } from './store';
import { t } from './i18n/translations';
import { logger } from './utils/logger';
import { batteryService } from './services/battery';

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

// Track SW update interval for cleanup
let swUpdateIntervalId: ReturnType<typeof setInterval> | null = null;

// Register service worker with update notification
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Check for updates periodically (every 5 minutes when visible)
      swUpdateIntervalId = setInterval(() => {
        if (!document.hidden) {
          registration.update();
        }
      }, 300000);

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

// Toggle power-saver CSS class based on battery level
// Stops infinite GPU animations when battery is low to save power
batteryService.initialize().then(() => {
  batteryService.subscribe((status) => {
    document.body.classList.toggle('power-saver', status.batteryLevel !== 'normal');
  });
}).catch(() => {
  // Battery API unavailable - animations stay enabled
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  // Clear SW update interval to prevent memory leak
  if (swUpdateIntervalId !== null) {
    clearInterval(swUpdateIntervalId);
    swUpdateIntervalId = null;
  }
});
