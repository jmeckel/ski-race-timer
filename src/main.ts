import './styles/main.css';
import './styles/glass.css';
import './styles/animations.css';
// DISABLED: Motion effects disabled to save battery
// import './styles/motion.css';
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
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
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
