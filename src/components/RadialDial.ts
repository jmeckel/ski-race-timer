/**
 * RadialDial Component
 * iPod-style rotating dial for bib number input
 * Supports both tap-to-enter and spin-to-increment interactions
 */

import { feedbackTap } from '../services';

export interface RadialDialOptions {
  onChange?: (value: string) => void;
  momentum?: number;
  friction?: number;
  sensitivity?: number;
}

export class RadialDial {
  private container: HTMLElement;
  private dialNumbers: HTMLElement | null = null;
  private dialRing: HTMLElement | null = null;
  private gestureArea: HTMLElement | null = null;
  private options: Required<RadialDialOptions>;

  // State
  private rotation = 0;
  private velocity = 0;
  private isSpinning = false;
  private isDragging = false;
  private lastAngle = 0;
  private lastDragTime = 0;
  private accumulatedRotation = 0;
  private spinAnimationId: number | null = null;
  private snapBackTimeoutId: number | null = null;
  private resizeTimeoutId: number | null = null;
  private dragStartPos: { x: number; y: number } | null = null;
  private hasDraggedSignificantly = false;
  private lastTouchTime = 0; // To prevent synthetic mouse events after touch

  // Bib value
  private bibValue = '';

  constructor(container: HTMLElement, options: RadialDialOptions = {}) {
    this.container = container;
    this.options = {
      onChange: options.onChange || (() => {}),
      momentum: options.momentum ?? 1.5,
      friction: options.friction ?? 0.97,
      sensitivity: options.sensitivity ?? 24
    };

    this.init();
  }

  private init(): void {
    this.dialNumbers = this.container.querySelector('.dial-numbers');
    this.dialRing = this.container.querySelector('.dial-ring');
    this.gestureArea = this.container.querySelector('.dial-gesture-area');

    if (!this.dialNumbers) {
      console.warn('[RadialDial] Required elements not found');
      return;
    }

    this.generateDialNumbers();
    this.generateTicks();
    this.bindEvents();
  }

  private generateDialNumbers(): void {
    if (!this.dialNumbers) return;

    this.dialNumbers.innerHTML = '';
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

    // Calculate radius based on container size
    const containerSize = this.container.offsetWidth || 460;
    const radius = containerSize * 0.38; // ~175px for 460px container
    const center = containerSize / 2;

    numbers.forEach((num, i) => {
      const angle = (i * 36 - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      const el = document.createElement('div');
      el.className = 'dial-number';
      el.dataset.num = String(num);
      el.innerHTML = `<span>${num}</span>`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = 'translate(-50%, -50%)';

      // Note: Tap detection is handled in handleDragEnd to avoid duplicate events

      this.dialNumbers!.appendChild(el);
    });
  }

  private generateTicks(): void {
    const ticksContainer = this.container.querySelector('.dial-ticks');
    if (!ticksContainer) return;

    ticksContainer.innerHTML = '';
    for (let i = 0; i < 60; i++) {
      const tick = document.createElement('div');
      tick.className = 'dial-tick' + (i % 6 === 0 ? ' major' : '');
      tick.style.transform = `rotate(${i * 6}deg)`;
      ticksContainer.appendChild(tick);
    }
  }

  private handleNumberTap(num: number, el: HTMLElement): void {
    if (this.bibValue.length < 3) {
      this.bibValue += String(num);
      this.options.onChange(this.bibValue);
      feedbackTap();

      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 150);
    }
  }

  private bindEvents(): void {
    // Bind drag events to the container itself (not gesture area)
    // This ensures we catch drags even when touching the numbers
    this.container.addEventListener('mousedown', this.handleDragStart);
    window.addEventListener('mousemove', this.handleDragMove);
    window.addEventListener('mouseup', this.handleDragEnd);

    // Touch events
    this.container.addEventListener('touchstart', this.handleDragStart, { passive: false });
    window.addEventListener('touchmove', this.handleDragMove, { passive: false });
    window.addEventListener('touchend', this.handleDragEnd);

    // Re-layout on orientation/resize change
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    // Debounce resize events
    if (this.resizeTimeoutId) {
      clearTimeout(this.resizeTimeoutId);
    }
    this.resizeTimeoutId = window.setTimeout(() => {
      this.generateDialNumbers();
      this.resizeTimeoutId = null;
    }, 100);
  };

  private handleDragStart = (e: MouseEvent | TouchEvent): void => {
    const isTouch = 'touches' in e;

    // Ignore synthetic mouse events after touch
    if (!isTouch && Date.now() - this.lastTouchTime < 500) {
      return;
    }

    if (isTouch) {
      this.lastTouchTime = Date.now();
    }

    const rect = this.container.getBoundingClientRect();
    const clientX = isTouch ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as MouseEvent).clientY;

    // Check if in ring area (not center)
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = Math.sqrt(Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2));

    // Don't start drag if in center area (allow buttons to work)
    // dial-center is 52% of container, so radius is 26%
    if (dist < rect.width * 0.27) return;
    // Don't start drag if outside the dial
    if (dist > rect.width * 0.5) return;

    // Cancel any pending snap-back
    if (this.snapBackTimeoutId) {
      clearTimeout(this.snapBackTimeoutId);
      this.snapBackTimeoutId = null;
    }

    // Track start position to detect taps vs drags
    this.dragStartPos = { x: clientX, y: clientY };
    this.hasDraggedSignificantly = false;
    this.isDragging = true;
    this.velocity = 0;

    if (this.spinAnimationId) {
      cancelAnimationFrame(this.spinAnimationId);
      this.spinAnimationId = null;
    }
    this.isSpinning = false;

    this.lastAngle = this.getAngle(clientX, clientY, rect);
    this.lastDragTime = Date.now();
    this.accumulatedRotation = 0;

    // Reset momentum class and re-add for new interaction
    this.dialNumbers?.classList.remove('momentum');
    this.dialNumbers?.classList.add('momentum');
  };

  private handleDragMove = (e: MouseEvent | TouchEvent): void => {
    if (!this.isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Check if we've moved enough to consider this a drag (not a tap)
    if (this.dragStartPos && !this.hasDraggedSignificantly) {
      const moveDistance = Math.sqrt(
        Math.pow(clientX - this.dragStartPos.x, 2) +
        Math.pow(clientY - this.dragStartPos.y, 2)
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

    // Update velocity
    this.velocity = (deltaAngle / deltaTime) * 16 * this.options.momentum;

    // Update rotation
    this.rotation += deltaAngle;
    this.accumulatedRotation += deltaAngle;
    this.updateDialRotation();

    // Check for digit change
    if (Math.abs(this.accumulatedRotation) >= this.options.sensitivity) {
      const direction = this.accumulatedRotation > 0 ? 1 : -1;
      this.adjustBib(direction);
      this.accumulatedRotation = this.accumulatedRotation % this.options.sensitivity;
    }

    this.lastAngle = currentAngle;
    this.lastDragTime = now;
  };

  private handleDragEnd = (): void => {
    if (!this.isDragging) return;
    this.isDragging = false;

    // If we didn't drag significantly, treat as a tap
    if (!this.hasDraggedSignificantly && this.dragStartPos) {
      // Calculate which number was tapped based on angle
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Get angle of tap relative to center (in degrees, 0 = right, 90 = down)
      let tapAngle = Math.atan2(
        this.dragStartPos.y - centerY,
        this.dragStartPos.x - centerX
      ) * (180 / Math.PI);

      // Adjust for current rotation of the dial
      tapAngle -= this.rotation;

      // Normalize to 0-360
      tapAngle = ((tapAngle % 360) + 360) % 360;

      // Numbers are positioned at angles: 1=(-54°), 2=(-18°), 3=(18°), etc.
      // Starting from angle -90 (top), each number is 36° apart
      // Number positions: 1@-54°, 2@-18°, 3@18°, 4@54°, 5@90°, 6@126°, 7@162°, 8@198°, 9@234°, 0@270°
      // Convert to 0-360: 1@306°, 2@342°, 3@18°, 4@54°, 5@90°, 6@126°, 7@162°, 8@198°, 9@234°, 0@270°

      // Find closest number based on angle
      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
      let closestNum = 0;
      let closestDiff = 360;

      numbers.forEach((num, i) => {
        // Each number is at angle (i * 36 - 90) degrees from top
        let numAngle = (i * 36 - 90 + 360) % 360;
        let diff = Math.abs(tapAngle - numAngle);
        if (diff > 180) diff = 360 - diff;

        if (diff < closestDiff && diff < 20) { // 20° tolerance (half of 36° spacing)
          closestDiff = diff;
          closestNum = num;
        }
      });

      if (closestDiff < 20) {
        // Find the element to flash
        const numberEl = this.dialNumbers?.querySelector(`[data-num="${closestNum}"]`) as HTMLElement | null;
        if (numberEl) {
          this.handleNumberTap(closestNum, numberEl);
        }
      }

      this.dragStartPos = null;
      this.dialNumbers?.classList.remove('momentum');
      return;
    }

    this.dragStartPos = null;

    // Continue with momentum
    if (Math.abs(this.velocity) > 0.5) {
      this.isSpinning = true;
      this.spinWithMomentum();
    } else {
      this.dialNumbers?.classList.remove('momentum');
      this.scheduleSnapBack();
    }
  };

  private spinWithMomentum = (): void => {
    if (Math.abs(this.velocity) < 0.2) {
      this.isSpinning = false;
      this.velocity = 0;
      this.dialNumbers?.classList.remove('momentum');
      this.scheduleSnapBack();
      return;
    }

    // Apply rotation
    this.rotation += this.velocity;
    this.accumulatedRotation += this.velocity;
    this.updateDialRotation();

    // Check for digit change
    if (Math.abs(this.accumulatedRotation) >= this.options.sensitivity) {
      const direction = this.accumulatedRotation > 0 ? 1 : -1;
      this.adjustBib(direction);
      this.accumulatedRotation = this.accumulatedRotation % this.options.sensitivity;
    }

    // Apply friction
    this.velocity *= this.options.friction;

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
      this.updateDialRotation();
      // Clean up state when snap-back completes
      this.spinAnimationId = null;
      this.isSpinning = false;
      this.dialNumbers?.classList.remove('momentum');
      return;
    }

    this.rotation *= (1 - snapSpeed);
    this.updateDialRotation();

    this.spinAnimationId = requestAnimationFrame(this.snapBack);
  };

  private adjustBib(direction: number): void {
    let num = parseInt(this.bibValue || '0', 10);
    num += direction;
    if (num < 0) num = 0;
    if (num > 999) num = 999;
    this.bibValue = String(num);
    this.options.onChange(this.bibValue);
    feedbackTap();

    // Flash corresponding digit
    const lastDigit = String(num % 10);
    this.dialNumbers?.querySelectorAll('.dial-number').forEach(n => {
      if ((n as HTMLElement).dataset.num === lastDigit) {
        n.classList.add('flash');
        setTimeout(() => n.classList.remove('flash'), 150);
      }
    });
  }

  private getAngle(x: number, y: number, rect: DOMRect): number {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
  }

  private updateDialRotation(): void {
    if (!this.dialNumbers) return;
    this.dialNumbers.style.transform = `rotate(${this.rotation}deg)`;

    // Counter-rotate text to stay upright
    this.dialNumbers.querySelectorAll('.dial-number span').forEach(span => {
      (span as HTMLElement).style.transform = `rotate(${-this.rotation}deg)`;
    });
  }

  // Public methods
  getValue(): string {
    return this.bibValue;
  }

  setValue(value: string): void {
    this.bibValue = value.slice(0, 3);
  }

  clear(): void {
    this.bibValue = '';
  }

  flash(): void {
    this.dialRing?.classList.add('flash');

    // Flash numbers in sequence
    this.dialNumbers?.querySelectorAll('.dial-number').forEach((n, i) => {
      setTimeout(() => {
        n.classList.add('flash');
        setTimeout(() => n.classList.remove('flash'), 200);
      }, i * 40);
    });

    setTimeout(() => {
      this.dialRing?.classList.remove('flash');
    }, 1200);
  }

  destroy(): void {
    if (this.spinAnimationId) {
      cancelAnimationFrame(this.spinAnimationId);
    }
    if (this.snapBackTimeoutId) {
      clearTimeout(this.snapBackTimeoutId);
    }
    if (this.resizeTimeoutId) {
      clearTimeout(this.resizeTimeoutId);
    }

    // Remove container event listeners (prevents memory leak)
    this.container.removeEventListener('mousedown', this.handleDragStart);
    this.container.removeEventListener('touchstart', this.handleDragStart);

    // Remove window event listeners
    window.removeEventListener('mousemove', this.handleDragMove);
    window.removeEventListener('mouseup', this.handleDragEnd);
    window.removeEventListener('touchmove', this.handleDragMove);
    window.removeEventListener('touchend', this.handleDragEnd);
    window.removeEventListener('resize', this.handleResize);
  }
}
