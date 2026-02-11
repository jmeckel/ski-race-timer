/**
 * RadialDialAnimation Module
 * Manages spin momentum, snap-back, and flash animations for the RadialDial component.
 * Extracted from RadialDial.ts for separation of concerns.
 */

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

  private isDestroyed = false;

  constructor(
    callbacks: RadialDialAnimationCallbacks,
    config: RadialDialAnimationConfig,
  ) {
    this.callbacks = callbacks;
    this.config = config;
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
    this.spinWithMomentum();
  }

  /** Called when drag ends without momentum (schedule snap-back). */
  onDragEndNoMomentum(): void {
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
   * @param dialRing The dial ring element (or null)
   * @param dialNumbers The dial numbers container (or null)
   */
  flash(dialRing: HTMLElement | null, dialNumbers: HTMLElement | null): void {
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
   * @param el The element to flash
   */
  flashDigit(el: HTMLElement): void {
    this.flashClass(el, 'flash', 150);
  }

  /**
   * Flash a number element on tap (pressed state).
   * @param el The element to add pressed class to
   */
  flashPressed(el: HTMLElement): void {
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
  }

  // --- Private helpers ---

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
  private flashClass(el: HTMLElement, className: string, duration: number): void {
    el.classList.add(className);
    const timeoutId = window.setTimeout(() => {
      el.classList.remove(className);
      this.visualTimeoutIds.delete(timeoutId);
    }, duration);
    this.visualTimeoutIds.add(timeoutId);
  }

  // --- Private animation methods ---

  private spinWithMomentum = (): void => {
    if (Math.abs(this.velocity) < 0.2) {
      this.velocity = 0;
      this.callbacks.onAnimationComplete();
      this.scheduleSnapBack();
      return;
    }

    // Apply rotation
    this.rotation += this.velocity;
    this.accumulatedRotation += this.velocity;
    this.callbacks.onRotationUpdate(this.rotation);

    // Check for digit change
    this.checkDigitChange();

    // Apply friction
    this.velocity *= this.config.friction;

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
    this.callbacks.onRotationUpdate(this.rotation);

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
