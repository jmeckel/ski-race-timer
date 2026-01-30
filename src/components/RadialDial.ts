/**
 * RadialDial Component
 * iPod-style rotating dial for bib number input
 * Supports both tap-to-enter and spin-to-increment interactions
 */

import { feedbackTap } from '../services';

export interface RadialDialOptions {
  onChange?: (value: string) => void;
  onRecordTime?: () => void;
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

  // Bib value
  private bibValue = '';

  constructor(container: HTMLElement, options: RadialDialOptions = {}) {
    this.container = container;
    this.options = {
      onChange: options.onChange || (() => {}),
      onRecordTime: options.onRecordTime || (() => {}),
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

    if (!this.dialNumbers || !this.gestureArea) return;

    this.generateDialNumbers();
    this.generateTicks();
    this.bindEvents();
  }

  private generateDialNumbers(): void {
    if (!this.dialNumbers) return;

    this.dialNumbers.innerHTML = '';
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const radius = 175; // Distance from center
    const center = 230; // Center of 460px dial

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

      // Tap handler
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleNumberTap(num, el);
      });

      el.addEventListener('touchend', (e) => {
        if (!this.isDragging && Math.abs(this.velocity) < 0.5) {
          e.preventDefault();
          this.handleNumberTap(num, el);
        }
      }, { passive: false });

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
    if (!this.gestureArea) return;

    // Mouse events
    this.gestureArea.addEventListener('mousedown', this.handleDragStart);
    window.addEventListener('mousemove', this.handleDragMove);
    window.addEventListener('mouseup', this.handleDragEnd);

    // Touch events
    this.gestureArea.addEventListener('touchstart', this.handleDragStart, { passive: false });
    window.addEventListener('touchmove', this.handleDragMove, { passive: false });
    window.addEventListener('touchend', this.handleDragEnd);
  }

  private handleDragStart = (e: MouseEvent | TouchEvent): void => {
    e.preventDefault();

    const rect = this.gestureArea!.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Check if in ring area (not center)
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = Math.sqrt(Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2));

    if (dist < rect.width * 0.2) return; // Too close to center

    this.isDragging = true;
    this.velocity = 0;
    if (this.spinAnimationId) {
      cancelAnimationFrame(this.spinAnimationId);
      this.spinAnimationId = null;
    }

    this.lastAngle = this.getAngle(clientX, clientY, rect);
    this.lastDragTime = Date.now();
    this.accumulatedRotation = 0;

    this.dialNumbers?.classList.add('momentum');
  };

  private handleDragMove = (e: MouseEvent | TouchEvent): void => {
    if (!this.isDragging) return;
    e.preventDefault();

    const rect = this.gestureArea!.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

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

    // Continue with momentum
    if (Math.abs(this.velocity) > 0.5) {
      this.isSpinning = true;
      this.spinWithMomentum();
    } else {
      this.dialNumbers?.classList.remove('momentum');
    }
  };

  private spinWithMomentum = (): void => {
    if (Math.abs(this.velocity) < 0.2) {
      this.isSpinning = false;
      this.velocity = 0;
      this.dialNumbers?.classList.remove('momentum');
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
    this.options.onChange(this.bibValue);
  }

  clear(): void {
    this.bibValue = '';
    this.options.onChange(this.bibValue);
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

    window.removeEventListener('mousemove', this.handleDragMove);
    window.removeEventListener('mouseup', this.handleDragEnd);
    window.removeEventListener('touchmove', this.handleDragMove);
    window.removeEventListener('touchend', this.handleDragEnd);
  }
}
