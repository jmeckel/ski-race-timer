/**
 * RadialDial Component
 * iPod-style rotating dial for bib number input
 * Supports both tap-to-enter and spin-to-increment interactions
 *
 * Delegates interaction handling to RadialDialInteraction and
 * animation management to RadialDialAnimation.
 */

import { t } from '../i18n/translations';
import { feedbackDialDetent, feedbackDialTap } from '../services';
import { store } from '../store';
import { logger } from '../utils/logger';
import { RadialDialAnimation } from './RadialDialAnimation';
import { RadialDialInteraction } from './RadialDialInteraction';

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
  private options: Required<RadialDialOptions>;

  // Sub-modules
  private interaction: RadialDialInteraction | null = null;
  private animation: RadialDialAnimation;

  // Layout state
  private resizeObserver: ResizeObserver | null = null;
  private lastContainerWidth = 0;
  private numberKeydownListeners: Map<HTMLElement, (e: Event) => void> =
    new Map(); // Track for cleanup
  private cachedNumberSpans: HTMLElement[] = []; // Cached for hot-path animation
  private cachedNumberElements: Map<string, HTMLElement> = new Map(); // digit -> element map
  private isDestroyed = false;
  private visibilityHandler: (() => void) | null = null;

  // Bib value
  private bibValue = '';

  constructor(container: HTMLElement, options: RadialDialOptions = {}) {
    this.container = container;
    this.options = {
      onChange: options.onChange || (() => {}),
      momentum: options.momentum ?? 1.5,
      friction: options.friction ?? 0.97,
      sensitivity: options.sensitivity ?? 24,
    };

    // Initialize animation module
    this.animation = new RadialDialAnimation(
      {
        onRotationUpdate: (rotation: number) =>
          this.updateDialRotation(rotation),
        onDigitChange: (direction: number) => this.adjustBib(direction),
        onAnimationComplete: () =>
          this.dialNumbers?.classList.remove('momentum'),
      },
      {
        momentum: this.options.momentum,
        friction: this.options.friction,
        sensitivity: this.options.sensitivity,
      },
    );

    this.init();
  }

  private init(): void {
    this.dialNumbers = this.container.querySelector('.dial-numbers');
    this.dialRing = this.container.querySelector('.dial-ring');
    if (!this.dialNumbers) {
      logger.warn('[RadialDial] Required elements not found');
      return;
    }

    this.generateDialNumbers();
    this.generateTicks();
    this.bindEvents();
  }

  private generateDialNumbers(): void {
    if (!this.dialNumbers) return;

    this.dialNumbers.innerHTML = '';
    this.cachedNumberSpans = [];
    this.cachedNumberElements.clear();
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

      // Keyboard accessibility
      const lang = store.getState().currentLang;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${t('numberLabel', lang)} ${num}`);
      const keydownHandler = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          this.handleNumberTap(num, el);
        }
      };
      el.addEventListener('keydown', keydownHandler);
      this.numberKeydownListeners.set(el, keydownHandler);

      // Note: Tap detection is handled in handleDragEnd to avoid duplicate events

      this.dialNumbers!.appendChild(el);

      // Cache elements for hot-path animation (avoids querySelectorAll per frame)
      const span = el.querySelector('span') as HTMLElement;
      if (span) this.cachedNumberSpans.push(span);
      this.cachedNumberElements.set(String(num), el);
    });
  }

  private generateTicks(): void {
    const ticksContainer = this.container.querySelector('.dial-ticks');
    if (!ticksContainer) return;

    ticksContainer.innerHTML = '';
    for (let i = 0; i < 60; i++) {
      const tick = document.createElement('div');
      tick.className = `dial-tick${i % 6 === 0 ? ' major' : ''}`;
      tick.style.transform = `rotate(${i * 6}deg)`;
      ticksContainer.appendChild(tick);
    }
  }

  private handleNumberTap(num: number, el: HTMLElement): void {
    if (this.bibValue.length < 3) {
      this.bibValue += String(num);
      this.options.onChange(this.bibValue);
      feedbackDialTap();

      this.animation.flashPressed(el);
    }
  }

  private bindEvents(): void {
    // Initialize interaction module with callbacks
    this.interaction = new RadialDialInteraction(this.container, {
      onDragStart: () => {
        // Notify animation module to cancel pending animations and reset state
        this.animation.onDragStart();

        // Reset momentum class and re-add for new interaction
        this.dialNumbers?.classList.remove('momentum');
        this.dialNumbers?.classList.add('momentum');
      },
      onNumberTap: (num: number) => {
        // Find the element to flash
        const numberEl = this.dialNumbers?.querySelector(
          `[data-num="${num}"]`,
        ) as HTMLElement | null;
        if (numberEl) {
          this.handleNumberTap(num, numberEl);
        }
      },
      onDragMove: (deltaAngle: number, deltaTime: number) => {
        this.animation.onDragMove(deltaAngle, deltaTime);
      },
      onDragEndWithMomentum: () => {
        this.animation.startMomentumSpin();
      },
      onDragEndAsTap: () => {
        this.dialNumbers?.classList.remove('momentum');
      },
      onDragEndCommon: () => {
        this.dialNumbers?.classList.remove('momentum');
        this.animation.onDragEndNoMomentum();
      },
      getRotation: () => this.animation.getRotation(),
      getVelocity: () => this.animation.getVelocity(),
    });

    this.interaction.bindEvents();

    // Pause animations when page is hidden to save battery
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.animation.pauseAnimations();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Re-layout when container size actually changes (fires after layout)
    this.lastContainerWidth = this.container.offsetWidth;
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newWidth = Math.round(entry.contentRect.width);
      if (newWidth > 0 && newWidth !== this.lastContainerWidth) {
        this.lastContainerWidth = newWidth;
        this.generateDialNumbers();
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private adjustBib(direction: number): void {
    let num = parseInt(this.bibValue || '0', 10);
    num += direction;
    if (num < 0) num = 0;
    if (num > 999) num = 999;
    this.bibValue = String(num);
    this.options.onChange(this.bibValue);
    feedbackDialDetent();

    // Flash corresponding digit (uses cached map for O(1) lookup)
    const lastDigit = String(num % 10);
    const digitEl = this.cachedNumberElements.get(lastDigit);
    if (digitEl) {
      this.animation.flashDigit(digitEl);
    }
  }

  private updateDialRotation(rotation: number): void {
    if (!this.dialNumbers) return;
    this.dialNumbers.style.transform = `rotate(${rotation}deg)`;

    // Counter-rotate text to stay upright (uses cached elements for O(1) access)
    const counterRotation = `rotate(${-rotation}deg)`;
    for (const span of this.cachedNumberSpans) {
      span.style.transform = counterRotation;
    }
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
    this.animation.flash(this.dialRing, this.dialNumbers);
  }

  updateAriaLabels(): void {
    const lang = store.getState().currentLang;
    for (const [digit, el] of this.cachedNumberElements) {
      el.setAttribute('aria-label', `${t('numberLabel', lang)} ${digit}`);
    }
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Destroy sub-modules
    this.animation.destroy();
    if (this.interaction) {
      this.interaction.destroy();
      this.interaction = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Remove visibility handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // Remove number element keydown listeners (prevents memory leak)
    for (const [el, handler] of this.numberKeydownListeners) {
      el.removeEventListener('keydown', handler);
    }
    this.numberKeydownListeners.clear();
  }
}
