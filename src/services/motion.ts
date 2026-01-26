/**
 * Motion Service
 * Provides accelerometer-reactive tilt values for liquid glass UI effects
 * Uses DeviceOrientation API with iOS 13+ permission handling
 */

import { batteryService } from './battery';

// Smoothing factor for tilt values (0-1, lower = smoother)
const SMOOTHING_FACTOR = 0.15;

// Max tilt angle to normalize against (degrees)
const MAX_TILT_ANGLE = 30;

// Frame rate targets
const NORMAL_FPS = 60;
const LOW_BATTERY_FPS = 30;
const CRITICAL_BATTERY_FPS = 15;

interface MotionState {
  tiltX: number;      // -1 to 1 (left/right)
  tiltY: number;      // -1 to 1 (forward/back)
  rotation: number;   // -1 to 1 (device rotation)
  active: boolean;    // Whether motion is being tracked
}

type MotionChangeCallback = (state: MotionState) => void;

class MotionService {
  private isInitialized = false;
  private hasPermission = false;
  private callbacks: Set<MotionChangeCallback> = new Set();
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private frameInterval = 1000 / NORMAL_FPS;
  private unsubscribeBattery: (() => void) | null = null;

  // Raw orientation values (degrees)
  // Initialize to neutral holding positions so button isn't skewed before first event
  private rawBeta = 45;  // Front-to-back tilt (-180 to 180) - 45° is typical holding angle
  private rawGamma = 0;  // Left-to-right tilt (-90 to 90)
  private rawAlpha = 0;  // Device rotation (0 to 360)
  private hasReceivedData = false;  // Track if we've received actual orientation data

  // Smoothed values (-1 to 1)
  private state: MotionState = {
    tiltX: 0,
    tiltY: 0,
    rotation: 0,
    active: false
  };

  // Bound handler for proper cleanup
  private orientationHandler = this.handleOrientation.bind(this);

  /**
   * Check if DeviceOrientation API is supported
   */
  isSupported(): boolean {
    return 'DeviceOrientationEvent' in window;
  }

  /**
   * Check if iOS 13+ permission is required
   */
  requiresPermission(): boolean {
    return typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission === 'function';
  }

  /**
   * Request motion permission on iOS 13+
   * Must be called from a user gesture (click/tap handler)
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    if (!this.requiresPermission()) {
      // No permission needed on Android/older iOS
      this.hasPermission = true;
      return true;
    }

    try {
      const requestPermission = (DeviceOrientationEvent as unknown as {
        requestPermission: () => Promise<'granted' | 'denied' | 'default'>
      }).requestPermission;

      const result = await requestPermission();
      this.hasPermission = result === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.warn('Motion: Permission request failed:', error);
      return false;
    }
  }

  /**
   * Initialize motion tracking
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (!this.isSupported()) {
      return false;
    }

    // Request permission if needed (must be done in user gesture)
    if (this.requiresPermission() && !this.hasPermission) {
      return false;
    }

    // Subscribe to battery status for adaptive frame rate
    this.unsubscribeBattery = batteryService.subscribe((status) => {
      switch (status.batteryLevel) {
        case 'critical':
          this.frameInterval = 1000 / CRITICAL_BATTERY_FPS;
          break;
        case 'low':
          this.frameInterval = 1000 / LOW_BATTERY_FPS;
          break;
        default:
          this.frameInterval = 1000 / NORMAL_FPS;
      }
    });

    // Start listening to orientation events
    window.addEventListener('deviceorientation', this.orientationHandler);

    // Start the update loop
    this.startUpdateLoop();

    this.isInitialized = true;
    this.state.active = true;
    this.updateCSSProperties();

    return true;
  }

  /**
   * Handle device orientation events
   */
  private handleOrientation(event: DeviceOrientationEvent): void {
    // Beta: front-to-back tilt (-180 to 180)
    // Gamma: left-to-right tilt (-90 to 90)
    // Alpha: compass heading (0 to 360)

    if (event.beta !== null) {
      this.rawBeta = event.beta;
      this.hasReceivedData = true;
    }
    if (event.gamma !== null) {
      this.rawGamma = event.gamma;
      this.hasReceivedData = true;
    }
    if (event.alpha !== null) {
      this.rawAlpha = event.alpha;
    }
  }

  /**
   * Start the RAF update loop for smoothed values
   */
  private startUpdateLoop(): void {
    const update = (timestamp: number) => {
      // Frame throttling based on battery
      if (timestamp - this.lastFrameTime >= this.frameInterval) {
        this.lastFrameTime = timestamp;
        this.updateSmoothedValues();
        this.updateCSSProperties();
        this.notifySubscribers();
      }

      this.rafId = requestAnimationFrame(update);
    };

    this.rafId = requestAnimationFrame(update);
  }

  /**
   * Get current screen orientation angle
   */
  private getScreenOrientation(): number {
    // Use Screen Orientation API if available
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    // Fallback to deprecated window.orientation
    if (typeof window.orientation === 'number') {
      return window.orientation;
    }
    return 0;
  }

  /**
   * Update smoothed tilt values
   */
  private updateSmoothedValues(): void {
    const orientation = this.getScreenOrientation();

    let targetTiltX: number;
    let targetTiltY: number;

    // Adjust gamma/beta mapping based on screen orientation
    // All orientations center around typical holding angle (~45° from horizontal)
    switch (orientation) {
      case 90: // Landscape left (device rotated clockwise)
        // Beta becomes left-right (no offset needed for left-right)
        // Gamma becomes forward-back (adjust for holding angle)
        targetTiltX = Math.max(-1, Math.min(1, -this.rawBeta / MAX_TILT_ANGLE));
        const adjustedGamma90 = this.rawGamma - 45;
        targetTiltY = Math.max(-1, Math.min(1, adjustedGamma90 / MAX_TILT_ANGLE));
        break;
      case -90:
      case 270: // Landscape right (device rotated counter-clockwise)
        targetTiltX = Math.max(-1, Math.min(1, this.rawBeta / MAX_TILT_ANGLE));
        const adjustedGamma270 = this.rawGamma + 45;
        targetTiltY = Math.max(-1, Math.min(1, -adjustedGamma270 / MAX_TILT_ANGLE));
        break;
      case 180: // Upside down portrait
        targetTiltX = Math.max(-1, Math.min(1, -this.rawGamma / MAX_TILT_ANGLE));
        const adjustedBeta180 = this.rawBeta + 45;
        targetTiltY = Math.max(-1, Math.min(1, -adjustedBeta180 / MAX_TILT_ANGLE));
        break;
      default: // Portrait (0)
        // Gamma is left-right tilt (maps to tiltX)
        targetTiltX = Math.max(-1, Math.min(1, this.rawGamma / MAX_TILT_ANGLE));
        // Beta is front-back tilt (maps to tiltY)
        // Subtract ~45 to center around typical phone holding angle
        const adjustedBeta = this.rawBeta - 45;
        targetTiltY = Math.max(-1, Math.min(1, adjustedBeta / MAX_TILT_ANGLE));
    }

    // Alpha is rotation (normalize to -1 to 1, centered at 180)
    const normalizedAlpha = (this.rawAlpha - 180) / 180;
    const targetRotation = Math.max(-1, Math.min(1, normalizedAlpha));

    // Apply exponential smoothing
    this.state.tiltX += (targetTiltX - this.state.tiltX) * SMOOTHING_FACTOR;
    this.state.tiltY += (targetTiltY - this.state.tiltY) * SMOOTHING_FACTOR;
    this.state.rotation += (targetRotation - this.state.rotation) * SMOOTHING_FACTOR;
  }

  /**
   * Update CSS custom properties on :root
   */
  private updateCSSProperties(): void {
    const root = document.documentElement;
    root.style.setProperty('--motion-tilt-x', this.state.tiltX.toFixed(3));
    root.style.setProperty('--motion-tilt-y', this.state.tiltY.toFixed(3));
    root.style.setProperty('--motion-rotation', this.state.rotation.toFixed(3));
    root.style.setProperty('--motion-active', this.state.active ? '1' : '0');
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers(): void {
    for (const callback of this.callbacks) {
      try {
        callback({ ...this.state });
      } catch (error) {
        console.error('Motion: Callback error:', error);
      }
    }
  }

  /**
   * Subscribe to motion state changes
   */
  subscribe(callback: MotionChangeCallback): () => void {
    this.callbacks.add(callback);

    // Immediately notify with current state
    callback({ ...this.state });

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get current motion state
   */
  getState(): MotionState {
    return { ...this.state };
  }

  /**
   * Check if motion tracking is active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Pause motion tracking (e.g., when app is backgrounded)
   */
  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.state.active = false;
    this.updateCSSProperties();
  }

  /**
   * Resume motion tracking
   */
  resume(): void {
    if (this.isInitialized && this.rafId === null) {
      this.state.active = true;
      this.startUpdateLoop();
    }
  }

  /**
   * Cleanup motion service
   */
  cleanup(): void {
    // Stop RAF loop
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Remove orientation listener
    window.removeEventListener('deviceorientation', this.orientationHandler);

    // Unsubscribe from battery
    if (this.unsubscribeBattery) {
      this.unsubscribeBattery();
      this.unsubscribeBattery = null;
    }

    // Reset state
    this.state = {
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      active: false
    };
    // Reset raw values to neutral positions
    this.rawBeta = 45;
    this.rawGamma = 0;
    this.rawAlpha = 0;
    this.hasReceivedData = false;
    this.updateCSSProperties();

    // Clear callbacks
    this.callbacks.clear();

    this.isInitialized = false;
    this.hasPermission = false;
  }
}

// Singleton instance
export const motionService = new MotionService();
