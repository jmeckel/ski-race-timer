/**
 * Wake Lock Service
 * Prevents screen from dimming/sleeping during active timing
 * Uses the Screen Wake Lock API when available
 */

class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isEnabled = false;
  private visibilityHandler: (() => void) | null = null;

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

    // Add visibility handler to re-acquire wake lock when page becomes visible
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (!document.hidden && this.isEnabled && !this.wakeLock) {
          this.requestWakeLock();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

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

    await this.releaseWakeLock();
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
      console.warn('Wake Lock request failed:', errorMessage);
      this.wakeLock = null;
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
        console.warn('Wake Lock release error:', err);
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
