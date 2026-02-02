import { store } from '../store';
import { logger } from '../utils/logger';

// GPS configuration
const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 1000
};

// Accuracy thresholds (in meters)
const ACCURACY_GOOD = 10;
const ACCURACY_FAIR = 30;

class GpsService {
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private visibilityHandler: (() => void) | null = null;
  private wasActiveBeforeHidden = false;

  /**
   * Start watching GPS position
   */
  start(): boolean {
    if (this.watchId !== null) {
      return true; // Already watching
    }

    if (!navigator.geolocation) {
      logger.error('Geolocation not supported');
      store.setGpsStatus('inactive');
      return false;
    }

    store.setGpsStatus('searching');

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePosition(position),
        (error) => this.handleError(error),
        GPS_OPTIONS
      );

      // Add visibility change handler to pause/resume GPS for battery optimization
      // Only add after successful watchPosition to prevent memory leak on error
      if (!this.visibilityHandler) {
        this.visibilityHandler = () => {
          if (document.hidden) {
            // Page is hidden - stop GPS watch to save battery
            this.wasActiveBeforeHidden = this.watchId !== null;
            if (this.watchId !== null) {
              navigator.geolocation.clearWatch(this.watchId);
              this.watchId = null;
              // Keep lastPosition so we can still use it for entries
              store.setGpsStatus('inactive');
            }
          } else {
            // Page is visible again - resume GPS if it was active before
            if (this.wasActiveBeforeHidden) {
              store.setGpsStatus('searching');
              this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handlePosition(position),
                (error) => this.handleError(error),
                GPS_OPTIONS
              );
            }
          }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
      }

      return true;
    } catch (error) {
      logger.error('Failed to start GPS:', error);
      // Clean up visibility handler if it was registered before error
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
      }
      store.setGpsStatus('inactive');
      return false;
    }
  }

  /**
   * Pause watching GPS position without clearing last known location
   */
  pause(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.wasActiveBeforeHidden = false;
    // Only show 'paused' (green static) if GPS was actually working (had a fix)
    // Otherwise show 'inactive' (red) to indicate GPS never worked
    store.setGpsStatus(this.lastPosition ? 'paused' : 'inactive');
  }

  /**
   * Stop watching GPS position
   */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.wasActiveBeforeHidden = false;

    this.lastPosition = null;
    store.setGpsStatus('inactive');
  }

  /**
   * Handle GPS position update
   */
  private handlePosition(position: GeolocationPosition): void {
    this.lastPosition = position;

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
  getCoordinates(): { latitude: number; longitude: number; accuracy: number } | undefined {
    if (!this.lastPosition) return undefined;

    return {
      latitude: this.lastPosition.coords.latitude,
      longitude: this.lastPosition.coords.longitude,
      accuracy: this.lastPosition.coords.accuracy
    };
  }

  /**
   * Get GPS timestamp (more accurate than Date.now())
   */
  getTimestamp(): number | null {
    return this.lastPosition?.timestamp ?? null;
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
    return this.watchId !== null && this.lastPosition !== null;
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
        GPS_OPTIONS
      );
    });
  }
}

// Singleton instance
export const gpsService = new GpsService();
