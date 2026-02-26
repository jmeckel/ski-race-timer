/**
 * RadialDialInteraction Module
 * Handles all drag/touch/tap interaction logic for the RadialDial component.
 * Extracted from RadialDial.ts for separation of concerns.
 */

import { ListenerManager } from '../utils/listenerManager';

/** Callbacks the interaction module triggers on the parent RadialDial */
export interface RadialDialInteractionCallbacks {
  /** Called when a drag actually starts (after exclusion zone checks pass) */
  onDragStart: () => void;
  /** Called when a number is tapped (angle-based detection) */
  onNumberTap: (num: number) => void;
  /** Called during drag with the angle delta */
  onDragMove: (deltaAngle: number, deltaTime: number) => void;
  /** Called when drag ends with significant movement (has momentum) */
  onDragEndWithMomentum: () => void;
  /** Called when drag ends without significant movement (was a tap) */
  onDragEndAsTap: () => void;
  /** Called when any drag ends (regardless of type) to do common cleanup */
  onDragEndCommon: () => void;
  /** Returns the current rotation of the dial (needed for tap angle calculation) */
  getRotation: () => number;
  /** Returns the velocity threshold check */
  getVelocity: () => number;
}

/** Drag state exposed for the parent to read */
export interface DragState {
  isDragging: boolean;
  hasDraggedSignificantly: boolean;
}

export class RadialDialInteraction {
  private container: HTMLElement;
  private callbacks: RadialDialInteractionCallbacks;
  private listeners = new ListenerManager();

  // Drag state
  private isDragging = false;
  private lastAngle = 0;
  private lastDragTime = 0;
  private dragStartPos: { x: number; y: number } | null = null;
  private hasDraggedSignificantly = false;
  private lastTouchTime = 0; // Suppress synthetic mouse events after touch

  private isDestroyed = false;

  constructor(
    container: HTMLElement,
    callbacks: RadialDialInteractionCallbacks,
  ) {
    this.container = container;
    this.callbacks = callbacks;
  }

  /** Bind all interaction events. Called once during init. */
  bindEvents(): void {
    // Mouse events
    this.listeners.add(
      this.container,
      'mousedown',
      this.handleDragStart as EventListener,
    );
    this.listeners.add(
      window,
      'mousemove',
      this.handleDragMove as EventListener,
    );
    this.listeners.add(window, 'mouseup', this.handleDragEnd as EventListener);

    // Touch events
    this.listeners.add(
      this.container,
      'touchstart',
      this.handleDragStart as EventListener,
      { passive: false },
    );
    // Touch events follow the touchstart target, so touchmove/touchend
    // on the container receives events even when the finger moves outside it.
    // Scoping to container avoids a non-passive window-level listener.
    this.listeners.add(
      this.container,
      'touchmove',
      this.handleDragMove as EventListener,
      { passive: false },
    );
    this.listeners.add(
      this.container,
      'touchend',
      this.handleDragEnd as EventListener,
    );
  }

  /** Get current drag state */
  getDragState(): DragState {
    return {
      isDragging: this.isDragging,
      hasDraggedSignificantly: this.hasDraggedSignificantly,
    };
  }

  /** Clean up all event listeners and state */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.listeners.removeAll();
  }

  // --- Private event handlers ---

  private handleDragStart = (e: MouseEvent | TouchEvent): void => {
    const isTouch = 'touches' in e;

    // Ignore synthetic mouse events after touch (500ms window)
    if (!isTouch && Date.now() - this.lastTouchTime < 500) {
      return;
    }

    if (isTouch) {
      this.lastTouchTime = Date.now();
    }

    const rect = this.container.getBoundingClientRect();
    const clientX = isTouch ? e.touches[0]!.clientX : (e as MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0]!.clientY : (e as MouseEvent).clientY;

    // Check if in ring area (not center)
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = Math.sqrt((clientX - centerX) ** 2 + (clientY - centerY) ** 2);

    // Don't start drag if in center area (allow buttons to work)
    // dial-center is 52% of container, so radius is 26%
    if (dist < rect.width * 0.27) return;
    // Don't start drag if outside the dial
    if (dist > rect.width * 0.5) return;

    // Notify parent that a drag is starting (for animation state reset)
    this.callbacks.onDragStart();

    // Track start position to detect taps vs drags
    this.dragStartPos = { x: clientX, y: clientY };
    this.hasDraggedSignificantly = false;
    this.isDragging = true;

    this.lastAngle = this.getAngle(clientX, clientY, rect);
    this.lastDragTime = Date.now();
  };

  private handleDragMove = (e: MouseEvent | TouchEvent): void => {
    if (!this.isDragging) return;

    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    // Check if we've moved enough to consider this a drag (not a tap)
    if (this.dragStartPos && !this.hasDraggedSignificantly) {
      const moveDistance = Math.sqrt(
        (clientX - this.dragStartPos.x) ** 2 +
          (clientY - this.dragStartPos.y) ** 2,
      );
      if (moveDistance > 10) {
        this.hasDraggedSignificantly = true;
      } else {
        return; // Not enough movement yet, might be a tap
      }
    }

    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const currentAngle = this.getAngle(clientX, clientY, rect);
    let deltaAngle = currentAngle - this.lastAngle;

    // Handle wrap-around
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    const now = Date.now();
    const deltaTime = Math.max(now - this.lastDragTime, 1);

    // Delegate angle delta to parent
    this.callbacks.onDragMove(deltaAngle, deltaTime);

    this.lastAngle = currentAngle;
    this.lastDragTime = now;
  };

  private handleDragEnd = (): void => {
    if (!this.isDragging) return;
    this.isDragging = false;

    // If we didn't drag significantly, treat as a tap
    if (!this.hasDraggedSignificantly && this.dragStartPos) {
      this.detectNumberTap();
      this.dragStartPos = null;
      this.callbacks.onDragEndAsTap();
      return;
    }

    this.dragStartPos = null;

    // Check velocity to determine if we should apply momentum
    if (Math.abs(this.callbacks.getVelocity()) > 0.5) {
      this.callbacks.onDragEndWithMomentum();
    } else {
      this.callbacks.onDragEndCommon();
    }
  };

  /**
   * Detect which number was tapped based on angle from center.
   * Uses angle-based calculation (not elementFromPoint) for reliability after rotation.
   */
  private detectNumberTap(): void {
    if (!this.dragStartPos) return;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Get angle of tap relative to center (in degrees, 0 = right, 90 = down)
    let tapAngle =
      Math.atan2(this.dragStartPos.y - centerY, this.dragStartPos.x - centerX) *
      (180 / Math.PI);

    // Adjust for current rotation of the dial
    tapAngle -= this.callbacks.getRotation();

    // Normalize to 0-360
    tapAngle = ((tapAngle % 360) + 360) % 360;

    // Numbers are positioned at angles: 1=(-54deg), 2=(-18deg), 3=(18deg), etc.
    // Starting from angle -90 (top), each number is 36deg apart
    // Number positions: 1@-54, 2@-18, 3@18, 4@54, 5@90, 6@126, 7@162, 8@198, 9@234, 0@270
    // Convert to 0-360: 1@306, 2@342, 3@18, 4@54, 5@90, 6@126, 7@162, 8@198, 9@234, 0@270

    // Find closest number based on angle
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    let closestNum = 0;
    let closestDiff = 360;

    numbers.forEach((num, i) => {
      // Each number is at angle (i * 36 - 90) degrees from top
      const numAngle = (i * 36 - 90 + 360) % 360;
      let diff = Math.abs(tapAngle - numAngle);
      if (diff > 180) diff = 360 - diff;

      if (diff < closestDiff && diff < 20) {
        // 20deg tolerance (half of 36deg spacing)
        closestDiff = diff;
        closestNum = num;
      }
    });

    if (closestDiff < 20) {
      this.callbacks.onNumberTap(closestNum);
    }
  }

  /** Calculate angle from a point to the center of the container */
  private getAngle(x: number, y: number, rect: DOMRect): number {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
  }
}
