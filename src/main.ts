import './styles/main.css';
import './styles/glass.css';
import './styles/animations.css';
import './styles/motion.css';
import { initApp } from './app';
import { getToast } from './components/Toast';
import { initGlobalErrorHandlers } from './utils/errorBoundary';

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

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              console.log('New version available');
            }
          });
        }
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}

// Handle visibility change (pause/resume)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // App became visible - could refresh sync here
    console.log('App resumed');
  }
});

// Handle online/offline
window.addEventListener('online', () => {
  console.log('App is online');
  // Could trigger sync queue processing here
});

window.addEventListener('offline', () => {
  console.log('App is offline');
});

// Prevent accidental navigation
window.addEventListener('beforeunload', () => {
  // Only warn if there are unsaved changes
  // For now, always allow navigation
});

// Debug info
console.log(`Ski Race Timer v${__APP_VERSION__}`);
