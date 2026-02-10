import './styles/main.css';
import './styles/modals.css';
import './styles/timer.css';
import './styles/gate-judge.css';
import './styles/chief-judge.css';
import './styles/settings.css';
import './styles/results.css';
import './styles/onboarding.css';
import './styles/glass.css';
import './styles/animations.css';
import './styles/radial-dial.css';
import { initApp } from './app';
import { getToast } from './components/Toast';
import { batteryService } from './services/battery';
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

// Toggle power-saver CSS class based on battery level
// Stops infinite GPU animations when battery is low to save power
let batteryUnsubscribe: (() => void) | null = null;
batteryService
  .initialize()
  .then(() => {
    batteryUnsubscribe = batteryService.subscribe((status) => {
      document.body.classList.toggle(
        'power-saver',
        status.batteryLevel !== 'normal',
      );
    });
  })
  .catch(() => {
    // Battery API unavailable - animations stay enabled
  });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (batteryUnsubscribe) {
    batteryUnsubscribe();
    batteryUnsubscribe = null;
  }
});
