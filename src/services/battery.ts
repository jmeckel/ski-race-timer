/**
 * Battery Status Service
 * Monitors battery level and charging state for adaptive power management
 * Uses the Battery Status API when available
 */

// Battery thresholds
const BATTERY_LOW = 0.20; // 20%
const BATTERY_CRITICAL = 0.10; // 10%

export type BatteryLevel = 'normal' | 'low' | 'critical';

interface BatteryStatus {
  level: number; // 0.0 - 1.0
  charging: boolean;
  batteryLevel: BatteryLevel;
}

type BatteryChangeCallback = (status: BatteryStatus) => void;

class BatteryService {
  private battery: BatteryManager | null = null;
  private isInitialized = false;
  private callbacks: Set<BatteryChangeCallback> = new Set();
  private currentStatus: BatteryStatus = {
    level: 1.0,
    charging: true, // Assume charging (plugged in) by default
    batteryLevel: 'normal'
  };
  // Store event handler references for proper cleanup
  private levelChangeHandler: (() => void) | null = null;
  private chargingChangeHandler: (() => void) | null = null;

  /**
   * Check if Battery Status API is supported
   */
  isSupported(): boolean {
    return 'getBattery' in navigator;
  }

  /**
   * Initialize battery monitoring
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (!this.isSupported()) {
      console.log('Battery Status API not supported');
      return false;
    }

    try {
      this.battery = await (navigator as NavigatorWithBattery).getBattery();
      this.isInitialized = true;

      // Read initial status
      this.updateStatus();

      // Listen for battery changes - store handlers for cleanup
      this.levelChangeHandler = () => this.updateStatus();
      this.chargingChangeHandler = () => this.updateStatus();
      this.battery.addEventListener('levelchange', this.levelChangeHandler);
      this.battery.addEventListener('chargingchange', this.chargingChangeHandler);

      console.log('Battery service initialized:', this.currentStatus);
      return true;
    } catch (error) {
      console.warn('Failed to initialize battery service:', error);
      return false;
    }
  }

  /**
   * Update current battery status and notify subscribers
   */
  private updateStatus(): void {
    if (!this.battery) return;

    const level = this.battery.level;
    const charging = this.battery.charging;

    // Determine battery level category
    let batteryLevel: BatteryLevel = 'normal';
    if (!charging) {
      if (level <= BATTERY_CRITICAL) {
        batteryLevel = 'critical';
      } else if (level <= BATTERY_LOW) {
        batteryLevel = 'low';
      }
    }

    const newStatus: BatteryStatus = {
      level,
      charging,
      batteryLevel
    };

    // Check if status changed
    const statusChanged =
      this.currentStatus.level !== newStatus.level ||
      this.currentStatus.charging !== newStatus.charging ||
      this.currentStatus.batteryLevel !== newStatus.batteryLevel;

    this.currentStatus = newStatus;

    if (statusChanged) {
      console.log('Battery status changed:', newStatus);
      this.notifySubscribers();
    }
  }

  /**
   * Notify all subscribers of battery change
   */
  private notifySubscribers(): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.currentStatus);
      } catch (error) {
        console.error('Battery callback error:', error);
      }
    }
  }

  /**
   * Subscribe to battery status changes
   */
  subscribe(callback: BatteryChangeCallback): () => void {
    this.callbacks.add(callback);

    // Immediately notify with current status
    callback(this.currentStatus);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get current battery status
   */
  getStatus(): BatteryStatus {
    return { ...this.currentStatus };
  }

  /**
   * Check if battery is low (not charging and below threshold)
   */
  isLowBattery(): boolean {
    return this.currentStatus.batteryLevel === 'low' ||
           this.currentStatus.batteryLevel === 'critical';
  }

  /**
   * Check if battery is critical (not charging and below critical threshold)
   */
  isCriticalBattery(): boolean {
    return this.currentStatus.batteryLevel === 'critical';
  }

  /**
   * Check if device is charging
   */
  isCharging(): boolean {
    return this.currentStatus.charging;
  }

  /**
   * Get battery level as percentage (0-100)
   */
  getLevelPercent(): number {
    return Math.round(this.currentStatus.level * 100);
  }

  /**
   * Cleanup battery service
   */
  cleanup(): void {
    if (this.battery) {
      // Remove event listeners before clearing reference
      if (this.levelChangeHandler) {
        this.battery.removeEventListener('levelchange', this.levelChangeHandler);
        this.levelChangeHandler = null;
      }
      if (this.chargingChangeHandler) {
        this.battery.removeEventListener('chargingchange', this.chargingChangeHandler);
        this.chargingChangeHandler = null;
      }
      this.battery = null;
    }
    this.callbacks.clear();
    this.isInitialized = false;
  }
}

// Type augmentation for Battery API
interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
  addEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery(): Promise<BatteryManager>;
}

// Singleton instance
export const batteryService = new BatteryService();
