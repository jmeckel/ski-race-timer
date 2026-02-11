/**
 * Polling Module
 * Handles adaptive polling strategy with battery and network awareness
 */

import {
  type BatteryLevel,
  type BatteryStatus,
  batteryService,
} from '../battery';
import { networkMonitor } from './networkMonitor';
import {
  BATTERY_POLLING_CONFIGS,
  type ConnectionQuality,
  IDLE_THRESHOLD,
  POLL_INTERVAL_ERROR,
  POLL_INTERVAL_HIDDEN,
  POLL_INTERVAL_METERED_BASE,
  POLL_INTERVAL_NORMAL,
  POLL_INTERVAL_OFFLINE,
  POLL_INTERVAL_SLOW,
  POLL_INTERVAL_ULTRA_LOW_BATTERY,
  POLL_INTERVALS_METERED,
  type PollingConfig,
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
  private currentBatteryRawLevel = 1.0; // Raw 0.0-1.0 level for ultra-low check
  private currentConnectionQuality: ConnectionQuality = 'good';
  private isTabHidden = false;
  private batteryUnsubscribe: (() => void) | null = null;
  private meteredUnsubscribe: (() => void) | null = null;
  private qualityUnsubscribe: (() => void) | null = null;
  private isAdjustingInterval = false;
  private currentPollingIntervalMs = 0;
  private pollCallback: (() => void) | null = null;

  /**
   * Initialize polling with battery awareness
   */
  initialize(pollCallback: () => void): void {
    this.pollCallback = pollCallback;

    // Subscribe to battery level changes
    this.batteryUnsubscribe = batteryService.subscribe(
      (status: BatteryStatus) => {
        const previousLevel = this.currentBatteryLevel;
        const previousRawLevel = this.currentBatteryRawLevel;
        this.currentBatteryLevel = status.batteryLevel;
        this.currentBatteryRawLevel = status.level;

        // Adjust polling if battery level changed and we're actively polling
        // Also trigger on crossing the 5% ultra-low threshold
        const crossedUltraLow =
          (previousRawLevel >= 0.05 && status.level < 0.05) ||
          (previousRawLevel < 0.05 && status.level >= 0.05);
        if ((previousLevel !== status.batteryLevel || crossedUltraLow) && this.pollInterval) {
          this.applyBatteryAwarePolling();
        }
      },
    );

    // Subscribe to network metered state changes
    this.meteredUnsubscribe = networkMonitor.onMeteredChange(() => {
      if (this.pollInterval) {
        this.applyBatteryAwarePolling();
      }
    });

    // Subscribe to connection quality changes (online/offline/slow)
    this.currentConnectionQuality = networkMonitor.getConnectionQuality();
    this.qualityUnsubscribe = networkMonitor.onQualityChange(
      (quality: ConnectionQuality) => {
        const previousQuality = this.currentConnectionQuality;
        this.currentConnectionQuality = quality;

        // Adjust polling if quality changed and we're actively polling
        if (previousQuality !== quality && this.pollInterval) {
          this.applyBatteryAwarePolling();
        }
      },
    );
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
    const interval =
      this.consecutiveErrors > 2 ? POLL_INTERVAL_ERROR : POLL_INTERVAL_NORMAL;
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
   * Get all polling configuration based on battery level, network state,
   * connection quality, and tab visibility
   */
  getPollingConfig(): PollingConfig {
    const isMetered = networkMonitor.isMeteredConnection();

    if (this.currentConnectionQuality === 'offline') {
      return { intervals: [POLL_INTERVAL_OFFLINE], threshold: 1, baseInterval: POLL_INTERVAL_OFFLINE };
    }

    if (this.isTabHidden) {
      return { intervals: [POLL_INTERVAL_HIDDEN], threshold: 1, baseInterval: POLL_INTERVAL_HIDDEN };
    }

    // Ultra-low battery (<5%): more aggressive than 'critical' (10%) to preserve remaining battery
    if (this.currentBatteryRawLevel < 0.05 && !batteryService.isCharging()) {
      return { intervals: [POLL_INTERVAL_ULTRA_LOW_BATTERY], threshold: 1, baseInterval: POLL_INTERVAL_ULTRA_LOW_BATTERY };
    }

    // Slow or metered network uses reduced intervals to save data
    if (this.currentConnectionQuality === 'slow' || isMetered) {
      return {
        intervals: POLL_INTERVALS_METERED,
        threshold: IDLE_THRESHOLD,
        baseInterval: this.currentConnectionQuality === 'slow' ? POLL_INTERVAL_SLOW : POLL_INTERVAL_METERED_BASE,
      };
    }

    return BATTERY_POLLING_CONFIGS[this.currentBatteryLevel];
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

      // Validate intervals array before accessing
      if (!config.intervals || config.intervals.length === 0) {
        this.setPollingInterval(config.baseInterval);
        return;
      }

      // Clamp idle level to new interval array bounds
      this.currentIdleLevel = Math.min(
        Math.max(0, this.currentIdleLevel),
        config.intervals.length - 1,
      );

      // Get appropriate interval
      const newInterval =
        this.consecutiveNoChanges < config.threshold
          ? config.baseInterval // Active mode
          : config.intervals[this.currentIdleLevel]!; // Idle mode

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

      // Validate intervals array before accessing
      if (!config.intervals || config.intervals.length === 0) {
        if (this.pollInterval) {
          this.setPollingInterval(config.baseInterval);
        }
        return;
      }

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
            Math.max(0, this.currentIdleLevel + 1),
            config.intervals.length - 1,
          );

          if (newIdleLevel !== this.currentIdleLevel) {
            this.currentIdleLevel = newIdleLevel;

            if (this.pollInterval) {
              this.setPollingInterval(config.intervals[this.currentIdleLevel]!);
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
   * Notify the polling manager that the tab visibility has changed.
   * When hidden, polling slows to POLL_INTERVAL_HIDDEN.
   * When visible, an immediate poll is triggered and the normal interval is restored.
   */
  setTabHidden(hidden: boolean): void {
    if (this.isTabHidden === hidden) return;
    this.isTabHidden = hidden;

    if (!this.pollInterval) return;

    if (hidden) {
      // Tab hidden: slow down polling
      this.applyBatteryAwarePolling();
    } else {
      // Tab visible: immediately poll and restore normal interval
      if (this.pollCallback) {
        this.pollCallback();
      }
      this.applyBatteryAwarePolling();
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

    if (this.meteredUnsubscribe) {
      this.meteredUnsubscribe();
      this.meteredUnsubscribe = null;
    }

    if (this.qualityUnsubscribe) {
      this.qualityUnsubscribe();
      this.qualityUnsubscribe = null;
    }

    this.pollCallback = null;
    this.consecutiveErrors = 0;
    this.consecutiveNoChanges = 0;
    this.currentIdleLevel = 0;
    this.isTabHidden = false;
    this.currentConnectionQuality = 'good';
  }
}

// Singleton instance
export const pollingManager = new PollingManager();
