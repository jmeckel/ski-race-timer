import { store } from '../store';
import { logger } from '../utils/logger';
import { batteryService } from './battery';

// GPS configuration
// maximumAge: 10s allows reuse of cached position, reducing GPS chip wake-ups
// while still providing fresh-enough timestamps for race timing
const GPS_OPTIONS_NORMAL: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 10000,
};

// Low battery: disable high accuracy to save significant power
const GPS_OPTIONS_LOW_BATTERY: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 30000,
};

// Critical battery: duty-cycled GPS with maximum caching
const GPS_OPTIONS_CRITICAL: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 30000,
  maximumAge: 120000,
};

// Accuracy thresholds (in meters)
const ACCURACY_GOOD = 10;
const ACCURACY_FAIR = 30;

class GpsService {
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private visibilityHandler: (() => void) | null = null;
  private wasActiveBeforeHidden = false;
  private batteryUnsubscribe: (() => void) | null = null;
  private usingLowPowerMode = false;
  private dutyCycleIntervalId: ReturnType<typeof setInterval> | null = null;
  private isDutyCycling = false;
  private pausedByView = false; // true when paused because user left timer tab
  private timeOffset: number | null = null; // GPS time - system time (ms)

  /**
   * Get GPS options based on current battery level
   */
  private getGpsOptions(): PositionOptions {
    const isLowBattery = batteryService.isLowBattery();
    this.usingLowPowerMode = isLowBattery;
    return isLowBattery ? GPS_OPTIONS_LOW_BATTERY : GPS_OPTIONS_NORMAL;
  }

  /**
   * Start duty cycling: periodic GPS fixes instead of continuous watching
   */
  private startDutyCycling(): void {
    if (this.isDutyCycling) return;
    this.isDutyCycling = true;

    // Stop continuous watch
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    logger.debug('[GPS] Starting duty cycling (60s interval)');

    // Periodic getCurrentPosition every 60s
    this.dutyCycleIntervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => this.handlePosition(position),
        (error) => this.handleError(error),
        GPS_OPTIONS_CRITICAL,
      );
    }, 60000);

    // Get one position immediately
    navigator.geolocation.getCurrentPosition(
      (position) => this.handlePosition(position),
      (error) => this.handleError(error),
      GPS_OPTIONS_CRITICAL,
    );
  }

  /**
   * Stop duty cycling
   */
  private stopDutyCycling(): void {
    if (this.dutyCycleIntervalId !== null) {
      clearInterval(this.dutyCycleIntervalId);
      this.dutyCycleIntervalId = null;
    }
    this.isDutyCycling = false;
  }

  /**
   * Start watching GPS position
   */
  start(): boolean {
    if (this.watchId !== null || this.isDutyCycling) {
      return true; // Already watching
    }

    if (!navigator.geolocation) {
      logger.error('Geolocation not supported');
      store.setGpsStatus('inactive');
      return false;
    }

    this.pausedByView = false;
    store.setGpsStatus('searching');

    try {
      const options = this.getGpsOptions();
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePosition(position),
        (error) => this.handleError(error),
        options,
      );

      // Add visibility change handler to pause/resume GPS for battery optimization
      // Only add after successful watchPosition to prevent memory leak on error
      if (!this.visibilityHandler) {
        this.visibilityHandler = () => {
          if (document.hidden) {
            // Page is hidden - stop GPS watch to save battery
            this.wasActiveBeforeHidden =
              this.watchId !== null || this.isDutyCycling;
            if (this.watchId !== null) {
              navigator.geolocation.clearWatch(this.watchId);
              this.watchId = null;
            }
            this.stopDutyCycling();
            if (this.wasActiveBeforeHidden) {
              // Keep lastPosition so we can still use it for entries
              store.setGpsStatus('inactive');
            }
          } else {
            // Page is visible again - resume GPS if it was active before
            // but NOT if it was paused because user left the timer tab
            if (this.wasActiveBeforeHidden && !this.pausedByView) {
              store.setGpsStatus('searching');
              // Check battery level to decide between duty cycling vs continuous
              if (batteryService.isCriticalBattery()) {
                this.startDutyCycling();
              } else {
                const opts = this.getGpsOptions();
                this.watchId = navigator.geolocation.watchPosition(
                  (position) => this.handlePosition(position),
                  (error) => this.handleError(error),
                  opts,
                );
              }
            }
          }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
      }

      // Subscribe to battery changes to switch GPS accuracy mode
      if (!this.batteryUnsubscribe) {
        this.batteryUnsubscribe = batteryService.subscribe(() => {
          // Only react if actively watching or duty cycling
          if (this.watchId === null && !this.isDutyCycling) return;

          const isCritical = batteryService.isCriticalBattery();

          if (isCritical && !this.isDutyCycling) {
            // Switch to duty cycling for critical battery
            logger.debug(
              '[GPS] Switching to duty-cycle mode (critical battery)',
            );
            this.startDutyCycling();
            return;
          }

          if (!isCritical && this.isDutyCycling) {
            // Resume continuous watching from duty cycling
            logger.debug('[GPS] Resuming continuous GPS from duty-cycle mode');
            this.stopDutyCycling();
            const opts = this.getGpsOptions();
            this.watchId = navigator.geolocation.watchPosition(
              (position) => this.handlePosition(position),
              (error) => this.handleError(error),
              opts,
            );
            return;
          }

          // Normal low-power vs high-accuracy switching (non-critical)
          if (this.watchId !== null) {
            const shouldUseLowPower = batteryService.isLowBattery();
            if (shouldUseLowPower !== this.usingLowPowerMode) {
              logger.debug(
                `[GPS] Switching to ${shouldUseLowPower ? 'low-power' : 'high-accuracy'} mode`,
              );
              navigator.geolocation.clearWatch(this.watchId);
              const opts = this.getGpsOptions();
              this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handlePosition(position),
                (error) => this.handleError(error),
                opts,
              );
            }
          }
        });
      }

      return true;
    } catch (error) {
      logger.error('Failed to start GPS:', error);
      // Clean up visibility handler if it was registered before error
      if (this.visibilityHandler) {
        document.removeEventListener(
          'visibilitychange',
          this.visibilityHandler,
        );
        this.visibilityHandler = null;
      }
      store.setGpsStatus('inactive');
      return false;
    }
  }

  /**
   * Pause watching GPS position without clearing last known location.
   * Used when user navigates away from the timer tab.
   */
  pause(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopDutyCycling();

    this.pausedByView = true;
    this.wasActiveBeforeHidden = false;
    // Only show 'paused' (green static) if GPS was actually working (had a fix)
    // Otherwise show 'inactive' (red) to indicate GPS never worked
    store.setGpsStatus(this.lastPosition ? 'paused' : 'inactive');
  }

  /**
   * Resume GPS watching after a view-based pause.
   * No-op if the page is currently hidden (visibility handler will
   * resume GPS when the page becomes visible again).
   */
  resume(): void {
    if (!this.pausedByView) return; // Not paused by view, nothing to do
    this.pausedByView = false;

    // Don't resume hardware if page is hidden — the visibility handler
    // will take care of it when the page becomes visible.
    if (document.hidden) {
      // Mark so the visibility handler knows to restart
      this.wasActiveBeforeHidden = true;
      return;
    }

    // Actually restart GPS
    this.start();
  }

  /**
   * Check if GPS is paused (e.g. because user is on a non-timer tab)
   */
  isPaused(): boolean {
    return this.pausedByView;
  }

  /**
   * Stop watching GPS position
   */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopDutyCycling();

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.wasActiveBeforeHidden = false;
    this.pausedByView = false;

    // Remove battery subscription
    if (this.batteryUnsubscribe) {
      this.batteryUnsubscribe();
      this.batteryUnsubscribe = null;
    }

    this.lastPosition = null;
    this.timeOffset = null;
    store.setGpsStatus('inactive');
  }

  /**
   * Handle GPS position update
   */
  private handlePosition(position: GeolocationPosition): void {
    this.lastPosition = position;

    // Calculate offset between GPS time and system time
    // offset = gpsTimestamp - Date.now() (at time of position receipt)
    const newOffset = position.timestamp - Date.now();

    // Warn if clock drift exceeds 500ms - significant for race timing
    if (Math.abs(newOffset) > 500) {
      logger.warn(
        `[GPS] Clock offset ${newOffset}ms - system clock may be inaccurate`,
      );
    }

    this.timeOffset = newOffset;

    const accuracy = position.coords.accuracy;
    store.setGpsStatus('active', accuracy);
  }

  /**
   * Handle GPS error
   */
  private handleError(error: GeolocationPositionError): void {
    logger.error('GPS error:', error.message);

    switch (error.code) {
      case error.PERMISSION_DENIED:
        store.setGpsStatus('inactive');
        this.stop();
        break;
      case error.POSITION_UNAVAILABLE:
        store.setGpsStatus('searching');
        break;
      case error.TIMEOUT:
        store.setGpsStatus('searching');
        break;
    }
  }

  /**
   * Get current position
   */
  getPosition(): GeolocationPosition | null {
    return this.lastPosition;
  }

  /**
   * Get current coordinates for entry
   */
  getCoordinates():
    | { latitude: number; longitude: number; accuracy: number }
    | undefined {
    if (!this.lastPosition) return undefined;

    return {
      latitude: this.lastPosition.coords.latitude,
      longitude: this.lastPosition.coords.longitude,
      accuracy: this.lastPosition.coords.accuracy,
    };
  }

  /**
   * Get GPS timestamp (more accurate than Date.now())
   */
  getTimestamp(): number | null {
    return this.lastPosition?.timestamp ?? null;
  }

  /**
   * Get the offset between GPS time and system time (in milliseconds).
   * Returns null if no GPS fix is available.
   * Usage: `const preciseTime = Date.now() + offset` gives GPS-corrected time.
   */
  getTimeOffset(): number | null {
    return this.timeOffset;
  }

  /**
   * Get accuracy status
   */
  getAccuracyStatus(): 'good' | 'fair' | 'poor' | 'unknown' {
    if (!this.lastPosition) return 'unknown';

    const accuracy = this.lastPosition.coords.accuracy;
    if (accuracy <= ACCURACY_GOOD) return 'good';
    if (accuracy <= ACCURACY_FAIR) return 'fair';
    return 'poor';
  }

  /**
   * Check if GPS is active
   */
  isActive(): boolean {
    return (
      (this.watchId !== null || this.isDutyCycling) &&
      this.lastPosition !== null
    );
  }

  /**
   * Toggle GPS based on settings
   */
  toggle(enabled: boolean): boolean {
    if (enabled) {
      return this.start();
    } else {
      this.stop();
      return true;
    }
  }

  /**
   * Request one-time position
   */
  async requestPosition(): Promise<GeolocationPosition | null> {
    if (!navigator.geolocation) return null;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.lastPosition = position;
          resolve(position);
        },
        () => resolve(null),
        this.getGpsOptions(),
      );
    });
  }
}

// Singleton instance
export const gpsService = new GpsService();
