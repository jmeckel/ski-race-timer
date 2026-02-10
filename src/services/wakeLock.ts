/**
 * Wake Lock Service
 * Prevents screen from dimming/sleeping during active timing
 * Uses the Screen Wake Lock API when available
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { store } from '../store';
import { logger } from '../utils/logger';

// Idle timeout: 30 minutes
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// Check interval: 60 seconds
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isEnabled = false;
  private visibilityHandler: (() => void) | null = null;
  private lastInteraction: number = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private interactionHandler: (() => void) | null = null;

  /**
   * Check if Wake Lock API is supported
   */
  isSupported(): boolean {
    return 'wakeLock' in navigator;
  }

  /**
   * Enable wake lock - screen will stay on
   * Call this when user enters timer view
   */
  async enable(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    if (this.isEnabled) {
      return true; // Already enabled
    }

    this.isEnabled = true;
    this.lastInteraction = Date.now();

    // Add visibility handler to re-acquire wake lock when page becomes visible
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (!document.hidden && this.isEnabled && !this.wakeLock) {
          this.requestWakeLock();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Start idle timeout tracking
    this.startIdleTracking();

    return this.requestWakeLock();
  }

  /**
   * Disable wake lock - screen can dim/sleep normally
   * Call this when user leaves timer view
   */
  async disable(): Promise<void> {
    this.isEnabled = false;

    // Remove visibility handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // Stop idle tracking
    this.stopIdleTracking();

    await this.releaseWakeLock();
  }

  /**
   * Reset idle timer - call on user interaction.
   * Re-acquires wake lock if it was released due to idle timeout.
   */
  resetIdleTimer(): void {
    this.lastInteraction = Date.now();

    // Re-acquire wake lock if it was released due to idle and still enabled
    if (this.isEnabled && !this.wakeLock) {
      this.requestWakeLock();
    }
  }

  /**
   * Start tracking user idle state
   */
  private startIdleTracking(): void {
    // Register global interaction listener
    if (!this.interactionHandler) {
      this.interactionHandler = () => this.resetIdleTimer();
      document.addEventListener('touchstart', this.interactionHandler, { passive: true });
      document.addEventListener('mousedown', this.interactionHandler);
      document.addEventListener('keydown', this.interactionHandler);
    }

    // Start periodic idle check
    if (this.idleCheckInterval === null) {
      this.idleCheckInterval = setInterval(() => this.checkIdle(), IDLE_CHECK_INTERVAL_MS);
    }
  }

  /**
   * Stop tracking user idle state
   */
  private stopIdleTracking(): void {
    if (this.interactionHandler) {
      document.removeEventListener('touchstart', this.interactionHandler);
      document.removeEventListener('mousedown', this.interactionHandler);
      document.removeEventListener('keydown', this.interactionHandler);
      this.interactionHandler = null;
    }

    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Check if user has been idle and release wake lock if so
   */
  private checkIdle(): void {
    if (!this.isEnabled) return;

    const idleTime = Date.now() - this.lastInteraction;
    if (idleTime >= IDLE_TIMEOUT_MS && this.wakeLock) {
      logger.debug('[WakeLock] Idle timeout reached, releasing wake lock');
      this.releaseWakeLock();

      const lang = store.getState().currentLang;
      showToast(t('wakeLockIdleTimeout', lang), 'warning', 5000);
    }
  }

  /**
   * Request wake lock from the browser
   */
  private async requestWakeLock(): Promise<boolean> {
    if (!this.isSupported() || this.wakeLock) {
      return !!this.wakeLock;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');

      // Listen for release (e.g., when tab becomes hidden)
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });

      return true;
    } catch (err) {
      // Wake lock request can fail for various reasons:
      // - Low battery
      // - Permission denied
      // - Page not visible
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Wake Lock request failed:', errorMessage);
      this.wakeLock = null;

      // Notify user that screen may dim during timing
      const lang = store.getState().currentLang;
      showToast(t('wakeLockFailed', lang), 'warning', 5000);

      return false;
    }
  }

  /**
   * Release wake lock
   */
  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (err) {
        // Ignore errors during release (may already be released)
        logger.warn('Wake Lock release error:', err);
      }
      this.wakeLock = null;
    }
  }

  /**
   * Check if wake lock is currently active
   */
  isActive(): boolean {
    return this.wakeLock !== null;
  }

  /**
   * Check if wake lock is enabled (may not be active if page is hidden)
   */
  isWakeLockEnabled(): boolean {
    return this.isEnabled;
  }
}

// Singleton instance
export const wakeLockService = new WakeLockService();
