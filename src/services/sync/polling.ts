/**
 * Polling Module
 * Handles adaptive polling strategy with battery and network awareness
 */

import { batteryService, type BatteryLevel, type BatteryStatus } from '../battery';
import { networkMonitor } from './networkMonitor';
import {
  POLL_INTERVAL_NORMAL,
  POLL_INTERVAL_ERROR,
  POLL_INTERVALS_IDLE,
  POLL_INTERVALS_LOW_BATTERY,
  POLL_INTERVALS_CRITICAL,
  POLL_INTERVALS_METERED,
  POLL_INTERVAL_METERED_BASE,
  IDLE_THRESHOLD,
  IDLE_THRESHOLD_LOW_BATTERY,
  type PollingConfig
} from './types';

/**
 * Adaptive polling manager with battery and network awareness
 */
class PollingManager {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private consecutiveErrors = 0;
  private consecutiveNoChanges = 0;
  private currentIdleLevel = 0;
  private currentBatteryLevel: BatteryLevel = 'normal';
  private batteryUnsubscribe: (() => void) | null = null;
  private isAdjustingInterval = false;
  private currentPollingIntervalMs = 0;
  private pollCallback: (() => void) | null = null;

  /**
   * Initialize polling with battery awareness
   */
  initialize(pollCallback: () => void): void {
    this.pollCallback = pollCallback;

    // Subscribe to battery level changes
    this.batteryUnsubscribe = batteryService.subscribe((status: BatteryStatus) => {
      const previousLevel = this.currentBatteryLevel;
      this.currentBatteryLevel = status.batteryLevel;

      // Adjust polling if battery level changed and we're actively polling
      if (previousLevel !== status.batteryLevel && this.pollInterval) {
        this.applyBatteryAwarePolling();
      }
    });

    // Subscribe to network metered state changes
    networkMonitor.onMeteredChange(() => {
      if (this.pollInterval) {
        this.applyBatteryAwarePolling();
      }
    });
  }

  /**
   * Start polling for cloud updates
   */
  start(): void {
    // Clear tracking to ensure fresh start
    this.currentPollingIntervalMs = 0;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Initial fetch
    if (this.pollCallback) {
      this.pollCallback();
    }

    // Set up polling using centralized method
    const interval = this.consecutiveErrors > 2 ? POLL_INTERVAL_ERROR : POLL_INTERVAL_NORMAL;
    this.setPollingInterval(interval);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.currentPollingIntervalMs = 0;
  }

  /**
   * Check if currently polling
   */
  isPolling(): boolean {
    return this.pollInterval !== null;
  }

  /**
   * Get all polling configuration based on battery level and network state
   */
  getPollingConfig(): PollingConfig {
    const isMetered = networkMonitor.isMeteredConnection();

    // Battery critical takes highest priority
    if (this.currentBatteryLevel === 'critical') {
      return {
        intervals: POLL_INTERVALS_CRITICAL,
        threshold: IDLE_THRESHOLD_LOW_BATTERY,
        baseInterval: POLL_INTERVALS_CRITICAL[0] // 30s even when active
      };
    }
    // Metered network uses reduced intervals to save data
    if (isMetered) {
      return {
        intervals: POLL_INTERVALS_METERED,
        threshold: IDLE_THRESHOLD,
        baseInterval: POLL_INTERVAL_METERED_BASE // 10s when on cellular
      };
    }
    // Low battery uses slower intervals
    if (this.currentBatteryLevel === 'low') {
      return {
        intervals: POLL_INTERVALS_LOW_BATTERY,
        threshold: IDLE_THRESHOLD_LOW_BATTERY,
        baseInterval: POLL_INTERVALS_LOW_BATTERY[0] // 10s when active
      };
    }
    // Normal mode
    return {
      intervals: POLL_INTERVALS_IDLE,
      threshold: IDLE_THRESHOLD,
      baseInterval: POLL_INTERVAL_NORMAL // 5s when active
    };
  }

  /**
   * Centralized method to set the polling interval
   * Prevents race conditions by using a single point of interval management
   */
  private setPollingInterval(intervalMs: number): void {
    // Skip if already at desired interval (prevents race condition)
    if (this.currentPollingIntervalMs === intervalMs && this.pollInterval) {
      return;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    this.currentPollingIntervalMs = intervalMs;
    if (this.pollCallback) {
      this.pollInterval = setInterval(this.pollCallback, intervalMs);
    }
  }

  /**
   * Apply battery-aware polling based on current state
   * Uses mutex flag to prevent race condition with adjustPollingInterval
   */
  applyBatteryAwarePolling(): void {
    if (this.isAdjustingInterval) {
      return;
    }
    this.isAdjustingInterval = true;

    try {
      const config = this.getPollingConfig();

      // Clamp idle level to new interval array bounds
      this.currentIdleLevel = Math.min(this.currentIdleLevel, config.intervals.length - 1);

      // Get appropriate interval
      const newInterval = this.consecutiveNoChanges < config.threshold
        ? config.baseInterval  // Active mode
        : config.intervals[this.currentIdleLevel];  // Idle mode

      this.setPollingInterval(newInterval);
    } finally {
      this.isAdjustingInterval = false;
    }
  }

  /**
   * Adjust polling interval based on success/failure and whether changes were detected
   * Implements adaptive polling: fast when active, slow when idle
   */
  adjustPollingInterval(success: boolean, hasChanges: boolean = false): void {
    if (this.isAdjustingInterval) {
      return;
    }
    this.isAdjustingInterval = true;

    try {
      if (!success) {
        // Error case - use error interval
        this.consecutiveErrors++;
        if (this.consecutiveErrors > 2 && this.pollInterval) {
          this.setPollingInterval(POLL_INTERVAL_ERROR);
        }
        return;
      }

      // Success case - reset error counter
      this.consecutiveErrors = 0;

      const config = this.getPollingConfig();

      if (hasChanges) {
        // Changes detected - reset to fast polling (battery-aware)
        this.consecutiveNoChanges = 0;
        this.currentIdleLevel = 0;

        if (this.pollInterval) {
          this.setPollingInterval(config.baseInterval);
        }
      } else {
        // No changes - consider throttling
        this.consecutiveNoChanges++;

        if (this.consecutiveNoChanges >= config.threshold) {
          const newIdleLevel = Math.min(
            this.currentIdleLevel + 1,
            config.intervals.length - 1
          );

          if (newIdleLevel !== this.currentIdleLevel) {
            this.currentIdleLevel = newIdleLevel;

            if (this.pollInterval) {
              this.setPollingInterval(config.intervals[this.currentIdleLevel]);
            }
          }
        }
      }
    } finally {
      this.isAdjustingInterval = false;
    }
  }

  /**
   * Reset adaptive polling to fast mode (call when user sends an entry)
   */
  resetToFastPolling(): void {
    this.consecutiveNoChanges = 0;
    this.currentIdleLevel = 0;

    if (this.pollInterval) {
      const config = this.getPollingConfig();
      this.setPollingInterval(config.baseInterval);
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();

    if (this.batteryUnsubscribe) {
      this.batteryUnsubscribe();
      this.batteryUnsubscribe = null;
    }

    this.pollCallback = null;
    this.consecutiveErrors = 0;
    this.consecutiveNoChanges = 0;
    this.currentIdleLevel = 0;
  }
}

// Singleton instance
export const pollingManager = new PollingManager();
