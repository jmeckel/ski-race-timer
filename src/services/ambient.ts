/**
 * Ambient Mode Service
 * Provides battery-saving, ultra-minimal UI when device is inactive on Timer view
 *
 * Trigger conditions:
 * 1. No activity for 30 seconds while on Timer view
 * 2. Battery drops to critical level (10%) while not charging
 *
 * Exit: Any tap returns to full UI (first tap does NOT record timestamp)
 */

import { logger } from '../utils/logger';
import { batteryService } from './battery';

export type AmbientTrigger = 'inactivity' | 'battery' | null;

interface AmbientState {
  isActive: boolean;
  triggeredBy: AmbientTrigger;
}

type AmbientChangeCallback = (state: AmbientState) => void;

class AmbientModeService {
  private isInitialized = false;
  private isEnabled = false; // Only active on timer view
  private isAmbientActive = false;
  private triggeredBy: AmbientTrigger = null;
  private lastActivityTimestamp = Date.now();
  private inactivityCheckId: ReturnType<typeof setInterval> | null = null;
  private batteryUnsubscribe: (() => void) | null = null;
  private callbacks: Set<AmbientChangeCallback> = new Set();
  private lastExitTimestamp = 0;

  // Activity event listeners (stored for cleanup)
  private activityHandler: (() => void) | null = null;

  readonly INACTIVITY_THRESHOLD_MS = 30000; // 30 seconds

  /**
   * Initialize the ambient mode service
   * Sets up battery monitoring and activity listeners
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    // Subscribe to battery status changes
    this.batteryUnsubscribe = batteryService.subscribe((status) => {
      // If battery becomes critical while not charging, trigger ambient mode
      if (
        status.batteryLevel === 'critical' &&
        !status.charging &&
        this.isEnabled
      ) {
        this.enterAmbientMode('battery');
      }

      // If charging starts and we were triggered by battery, exit
      if (
        status.charging &&
        this.isAmbientActive &&
        this.triggeredBy === 'battery'
      ) {
        this.exitAmbientMode();
      }
    });

    // Set up activity listeners
    this.activityHandler = () => this.resetInactivityTimer();
    document.addEventListener('touchstart', this.activityHandler, {
      passive: true,
    });
    document.addEventListener('click', this.activityHandler, { passive: true });
    document.addEventListener('keydown', this.activityHandler, {
      passive: true,
    });
  }

  /**
   * Cleanup the service
   */
  cleanup(): void {
    this.disable();

    if (this.batteryUnsubscribe) {
      this.batteryUnsubscribe();
      this.batteryUnsubscribe = null;
    }

    if (this.activityHandler) {
      document.removeEventListener('touchstart', this.activityHandler);
      document.removeEventListener('click', this.activityHandler);
      document.removeEventListener('keydown', this.activityHandler);
      this.activityHandler = null;
    }

    this.callbacks.clear();
    this.isInitialized = false;
  }

  /**
   * Enable ambient mode monitoring (called when on timer view)
   */
  enable(): void {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.lastActivityTimestamp = Date.now();
    this.startInactivityMonitor();

    // Check if battery is already critical
    if (batteryService.isCriticalBattery()) {
      this.enterAmbientMode('battery');
    }
  }

  /**
   * Disable ambient mode monitoring (called when leaving timer view)
   */
  disable(): void {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this.stopInactivityMonitor();

    // Exit ambient mode if active
    if (this.isAmbientActive) {
      this.exitAmbientMode();
    }
  }

  /**
   * Check if ambient mode is currently active
   */
  isActive(): boolean {
    return this.isAmbientActive;
  }

  /**
   * Get current ambient state
   */
  getState(): AmbientState {
    return {
      isActive: this.isAmbientActive,
      triggeredBy: this.triggeredBy,
    };
  }

  /**
   * Subscribe to ambient state changes
   */
  subscribe(callback: AmbientChangeCallback): () => void {
    this.callbacks.add(callback);

    // Immediately notify with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Exit ambient mode and reset timer
   */
  exitAmbientMode(): void {
    if (!this.isAmbientActive) return;

    this.isAmbientActive = false;
    this.triggeredBy = null;
    this.lastActivityTimestamp = Date.now();
    this.lastExitTimestamp = Date.now();

    this.notifySubscribers();

    logger.debug('[Ambient] Exited ambient mode');
  }

  /**
   * Check if ambient mode was exited very recently (within 500ms).
   * Used by record handlers to suppress the first tap after exiting.
   */
  wasRecentlyExited(): boolean {
    return Date.now() - this.lastExitTimestamp < 500;
  }

  /**
   * Reset the inactivity timer (called on any user activity)
   */
  resetInactivityTimer(): void {
    this.lastActivityTimestamp = Date.now();

    // Any user interaction exits ambient mode
    if (this.isAmbientActive) {
      this.exitAmbientMode();
    }
  }

  /**
   * Enter ambient mode
   */
  private enterAmbientMode(trigger: AmbientTrigger): void {
    if (this.isAmbientActive || !this.isEnabled) return;

    this.isAmbientActive = true;
    this.triggeredBy = trigger;

    this.notifySubscribers();

    logger.debug(`[Ambient] Entered ambient mode (trigger: ${trigger})`);
  }

  /**
   * Start the inactivity monitoring loop using setInterval (battery-friendly)
   */
  private startInactivityMonitor(): void {
    if (this.inactivityCheckId !== null) return;

    this.inactivityCheckId = setInterval(() => {
      if (!this.isEnabled) return;

      const elapsed = Date.now() - this.lastActivityTimestamp;

      if (elapsed >= this.INACTIVITY_THRESHOLD_MS && !this.isAmbientActive) {
        this.enterAmbientMode('inactivity');
      }
    }, 5000); // Check every 5 seconds instead of 60fps RAF
  }

  /**
   * Stop the inactivity monitoring loop
   */
  private stopInactivityMonitor(): void {
    if (this.inactivityCheckId !== null) {
      clearInterval(this.inactivityCheckId);
      this.inactivityCheckId = null;
    }
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers(): void {
    const state = this.getState();
    for (const callback of this.callbacks) {
      try {
        callback(state);
      } catch (error) {
        logger.error('[Ambient] Callback error:', error);
      }
    }
  }
}

// Singleton instance
export const ambientModeService = new AmbientModeService();
