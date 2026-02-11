/**
 * RadialDialAnimation Module
 * Manages spin momentum, snap-back, and flash animations for the RadialDial component.
 * Extracted from RadialDial.ts for separation of concerns.
 */

import { batteryService } from '../services/battery';

/** Callbacks the animation module triggers on the parent RadialDial */
export interface RadialDialAnimationCallbacks {
  /** Called each frame during spin/snap-back to apply rotation */
  onRotationUpdate: (rotation: number) => void;
  /** Called when accumulated rotation crosses a digit threshold */
  onDigitChange: (direction: number) => void;
  /** Called when momentum or snap-back animation completes */
  onAnimationComplete: () => void;
}

/** Configuration for animation behavior */
export interface RadialDialAnimationConfig {
  momentum: number;
  friction: number;
  sensitivity: number;
}

export class RadialDialAnimation {
  private callbacks: RadialDialAnimationCallbacks;
  private config: RadialDialAnimationConfig;

  // Animation state
  private rotation = 0;
  private velocity = 0;
  private accumulatedRotation = 0;
  private spinAnimationId: number | null = null;
  private snapBackAnimationId: number | null = null;
  private snapBackTimeoutId: number | null = null;
  private visualTimeoutIds: Set<number> = new Set();
  private frameCount = 0;

  private isDestroyed = false;

  /** Whether the user prefers reduced motion (OS accessibility setting) */
  private prefersReducedMotion = false;
  private motionMediaQuery: MediaQueryList | null = null;

  constructor(
    callbacks: RadialDialAnimationCallbacks,
    config: RadialDialAnimationConfig,
  ) {
    this.callbacks = callbacks;
    this.config = config;

    // Check and listen for prefers-reduced-motion changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.motionMediaQuery = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      );
      this.prefersReducedMotion = this.motionMediaQuery.matches;
      this.motionMediaQuery.addEventListener(
        'change',
        this.onMotionPreferenceChange,
      );
    }
  }

  // --- Public state accessors ---

  getRotation(): number {
    return this.rotation;
  }

  getVelocity(): number {
    return this.velocity;
  }

  // --- Drag lifecycle methods (called by RadialDial in response to interaction events) ---

  /** Called when a drag starts. Cancels pending animations and resets velocity. */
  onDragStart(): void {
    this.cancelAllAnimations();
    this.velocity = 0;
    this.accumulatedRotation = 0;
  }

  /**
   * Called each drag move frame with the angle delta.
   * Updates rotation, velocity, and checks for digit changes.
   */
  onDragMove(deltaAngle: number, deltaTime: number): void {
    // Update velocity
    this.velocity = (deltaAngle / deltaTime) * 16 * this.config.momentum;

    // Update rotation
    this.rotation += deltaAngle;
    this.accumulatedRotation += deltaAngle;
    this.callbacks.onRotationUpdate(this.rotation);

    // Check for digit change
    this.checkDigitChange();
  }

  /** Start momentum spin after drag release. */
  startMomentumSpin(): void {
    if (this.prefersReducedMotion) {
      // Skip visual spin animation but process all digit changes
      // that would have occurred during the momentum phase
      this.processDigitChangesInstantly();
      this.velocity = 0;
      this.rotation = 0;
      this.callbacks.onRotationUpdate(0);
      this.callbacks.onAnimationComplete();
      return;
    }
    this.spinWithMomentum();
  }

  /** Called when drag ends without momentum (schedule snap-back). */
  onDragEndNoMomentum(): void {
    if (this.prefersReducedMotion) {
      // Skip snap-back animation, reset instantly
      this.rotation = 0;
      this.callbacks.onRotationUpdate(0);
      this.callbacks.onAnimationComplete();
      return;
    }
    this.scheduleSnapBack();
  }

  // --- Visibility management ---

  /** Pause all animations (e.g., when page becomes hidden) */
  pauseAnimations(): void {
    this.cancelAllAnimations();
  }

  // --- Flash animation ---

  /**
   * Trigger a flash animation on dial ring and numbers.
   * Skipped when prefers-reduced-motion is enabled.
   * @param dialRing The dial ring element (or null)
   * @param dialNumbers The dial numbers container (or null)
   */
  flash(dialRing: HTMLElement | null, dialNumbers: HTMLElement | null): void {
    if (this.prefersReducedMotion) return;

    dialRing?.classList.add('flash');

    // Flash numbers in sequence
    dialNumbers?.querySelectorAll('.dial-number').forEach((n, i) => {
      const outerTimeoutId = window.setTimeout(() => {
        this.visualTimeoutIds.delete(outerTimeoutId);
        n.classList.add('flash');
        const innerTimeoutId = window.setTimeout(() => {
          n.classList.remove('flash');
          this.visualTimeoutIds.delete(innerTimeoutId);
        }, 200);
        this.visualTimeoutIds.add(innerTimeoutId);
      }, i * 40);
      this.visualTimeoutIds.add(outerTimeoutId);
    });

    const ringTimeoutId = window.setTimeout(() => {
      dialRing?.classList.remove('flash');
      this.visualTimeoutIds.delete(ringTimeoutId);
    }, 1200);
    this.visualTimeoutIds.add(ringTimeoutId);
  }

  /**
   * Flash a single digit element (used during bib adjustment).
   * Skipped when prefers-reduced-motion is enabled.
   * @param el The element to flash
   */
  flashDigit(el: HTMLElement): void {
    if (this.prefersReducedMotion) return;
    this.flashClass(el, 'flash', 150);
  }

  /**
   * Flash a number element on tap (pressed state).
   * Skipped when prefers-reduced-motion is enabled.
   * @param el The element to add pressed class to
   */
  flashPressed(el: HTMLElement): void {
    if (this.prefersReducedMotion) return;
    this.flashClass(el, 'pressed', 150);
  }

  // --- Cleanup ---

  /** Clean up all animation state, timers, and RAF IDs */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.cancelAllAnimations();

    for (const timeoutId of this.visualTimeoutIds) {
      clearTimeout(timeoutId);
    }
    this.visualTimeoutIds.clear();

    // Remove reduced-motion media query listener
    this.motionMediaQuery?.removeEventListener(
      'change',
      this.onMotionPreferenceChange,
    );
    this.motionMediaQuery = null;
  }

  // --- Private helpers ---

  /** Handle changes to the prefers-reduced-motion media query */
  private onMotionPreferenceChange = (e: MediaQueryListEvent): void => {
    this.prefersReducedMotion = e.matches;
    // If reduced motion was just enabled mid-animation, cancel visual animations
    if (this.prefersReducedMotion) {
      this.cancelAllAnimations();
      if (this.rotation !== 0) {
        this.rotation = 0;
        this.callbacks.onRotationUpdate(0);
        this.callbacks.onAnimationComplete();
      }
    }
  };

  /**
   * Process all digit changes that would occur during momentum spin instantly.
   * Used when prefers-reduced-motion is enabled to skip the visual spin
   * but still trigger the correct number of digit change callbacks.
   */
  private processDigitChangesInstantly(): void {
    let v = this.velocity;
    let accumulated = this.accumulatedRotation;

    // Simulate the full momentum decay in one pass
    while (Math.abs(v) >= 0.2) {
      accumulated += v;
      v *= this.config.friction;

      // Check for digit changes
      while (Math.abs(accumulated) >= this.config.sensitivity) {
        const direction = accumulated > 0 ? 1 : -1;
        this.callbacks.onDigitChange(direction);
        accumulated -= direction * this.config.sensitivity;
      }
    }

    this.accumulatedRotation = accumulated;
  }

  /** Cancel all pending RAF animations and snap-back timeout */
  private cancelAllAnimations(): void {
    if (this.spinAnimationId) {
      cancelAnimationFrame(this.spinAnimationId);
      this.spinAnimationId = null;
    }
    if (this.snapBackAnimationId) {
      cancelAnimationFrame(this.snapBackAnimationId);
      this.snapBackAnimationId = null;
    }
    if (this.snapBackTimeoutId) {
      clearTimeout(this.snapBackTimeoutId);
      this.snapBackTimeoutId = null;
    }
  }

  /** Temporarily add a CSS class to an element, removing it after the given duration */
  private flashClass(
    el: HTMLElement,
    className: string,
    duration: number,
  ): void {
    el.classList.add(className);
    const timeoutId = window.setTimeout(() => {
      el.classList.remove(className);
      this.visualTimeoutIds.delete(timeoutId);
    }, duration);
    this.visualTimeoutIds.add(timeoutId);
  }

  // --- Private animation methods ---

  /**
   * Battery-aware frame skipping to reduce CPU usage.
   * Normal: every frame, Low: every 2nd frame, Critical: every 4th frame.
   */
  private shouldSkipFrame(): boolean {
    this.frameCount++;
    const level = batteryService.getStatus().batteryLevel;
    if (level === 'low') return this.frameCount % 2 !== 0;
    if (level === 'critical') return this.frameCount % 4 !== 0;
    return false;
  }

  private spinWithMomentum = (): void => {
    if (Math.abs(this.velocity) < 0.2) {
      this.velocity = 0;
      this.callbacks.onAnimationComplete();
      this.scheduleSnapBack();
      return;
    }

    // Apply physics every frame but skip visual update on low battery
    this.rotation += this.velocity;
    this.accumulatedRotation += this.velocity;
    this.velocity *= this.config.friction;

    if (!this.shouldSkipFrame()) {
      this.callbacks.onRotationUpdate(this.rotation);
    }

    // Check for digit change
    this.checkDigitChange();

    this.spinAnimationId = requestAnimationFrame(this.spinWithMomentum);
  };

  private scheduleSnapBack(): void {
    // Clear any existing snap-back timeout
    if (this.snapBackTimeoutId) {
      clearTimeout(this.snapBackTimeoutId);
    }

    // Schedule snap-back after a short delay
    this.snapBackTimeoutId = window.setTimeout(() => {
      this.snapBack();
    }, 800); // 800ms delay before snapping back
  }

  private snapBack = (): void => {
    // Animate rotation back to 0
    const snapSpeed = 0.15; // How fast to snap back (0-1)

    if (Math.abs(this.rotation) < 1) {
      this.rotation = 0;
      this.callbacks.onRotationUpdate(this.rotation);
      // Clean up state when snap-back completes
      this.snapBackAnimationId = null;
      this.callbacks.onAnimationComplete();
      return;
    }

    this.rotation *= 1 - snapSpeed;

    if (!this.shouldSkipFrame()) {
      this.callbacks.onRotationUpdate(this.rotation);
    }

    this.snapBackAnimationId = requestAnimationFrame(this.snapBack);
  };

  /** Check if accumulated rotation crosses the sensitivity threshold */
  private checkDigitChange(): void {
    if (Math.abs(this.accumulatedRotation) >= this.config.sensitivity) {
      const direction = this.accumulatedRotation > 0 ? 1 : -1;
      this.callbacks.onDigitChange(direction);
      this.accumulatedRotation =
        this.accumulatedRotation % this.config.sensitivity;
    }
  }
}
