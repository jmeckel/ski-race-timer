import { formatTime, formatDate } from '../utils';
import { store } from '../store';
import { gpsService } from '../services';

/**
 * High-performance clock component using requestAnimationFrame
 * Only updates changed digits to minimize DOM manipulation
 */
export class Clock {
  private container: HTMLElement;
  private timeElement: HTMLElement;
  private dateElement: HTMLElement;
  private lastTimeStr = '';
  private animationId: number | null = null;
  private isRunning = false;

  constructor(container: HTMLElement) {
    this.container = container;
    // Clear container in case of re-initialization
    this.container.innerHTML = '';

    this.timeElement = this.createTimeElement();
    this.dateElement = this.createDateElement();

    this.container.appendChild(this.timeElement);
    this.container.appendChild(this.dateElement);
  }

  /**
   * Create time display element with individual digit spans
   */
  private createTimeElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'clock-time';
    el.setAttribute('role', 'timer');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Current time');
    el.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: clamp(32px, 10vw, 48px);
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-align: center;
    `;

    // Create individual spans for each character position
    // Format: HH:MM:SS.mmm (12 characters)
    for (let i = 0; i < 12; i++) {
      const span = document.createElement('span');
      span.className = 'clock-digit';
      span.dataset.index = String(i);
      el.appendChild(span);
    }

    return el;
  }

  /**
   * Create date display element
   */
  private createDateElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'clock-date';
    el.style.cssText = `
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 4px;
      text-align: center;
    `;
    return el;
  }

  /**
   * Start the clock
   */
  start(): void {
    if (this.isRunning) {
      console.log('Clock already running');
      return;
    }
    console.log('Clock starting');
    this.isRunning = true;
    this.tick();
  }

  /**
   * Stop the clock
   */
  stop(): void {
    console.log('Clock stopping', new Error().stack);
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private tickCount = 0;

  /**
   * Clock tick using requestAnimationFrame
   */
  private tick = (): void => {
    if (!this.isRunning) {
      console.log('Clock tick called but isRunning is false');
      return;
    }

    this.tickCount++;
    // Log every ~60 frames (about 1 second)
    if (this.tickCount % 60 === 0) {
      console.log('Clock tick', this.tickCount);
    }

    try {
      // Use GPS timestamp if available, otherwise use Date.now()
      const gpsTimestamp = gpsService.getTimestamp();
      const now = gpsTimestamp ? new Date(gpsTimestamp) : new Date();

      const timeStr = formatTime(now);

      // Only update changed digits
      if (timeStr !== this.lastTimeStr) {
        this.updateDigits(timeStr);
        this.lastTimeStr = timeStr;
      } else if (this.tickCount % 60 === 1) {
        console.log('timeStr unchanged:', timeStr, '=', this.lastTimeStr);
      }

      // Update date once per second (when seconds change)
      const seconds = now.getSeconds();
      if (seconds === 0 || !this.dateElement.textContent) {
        const state = store.getState();
        this.dateElement.textContent = formatDate(now, state.currentLang);
      }
    } catch (error) {
      console.error('Clock tick error:', error);
    }

    // Always schedule next frame to keep clock running
    this.animationId = requestAnimationFrame(this.tick);
  };

  /**
   * Update only changed digits
   */
  private updateDigits(timeStr: string): void {
    const digits = this.timeElement.querySelectorAll('.clock-digit');

    // Debug: check if elements exist
    if (this.tickCount % 60 === 1) {
      console.log('updateDigits: digits count =', digits.length, 'timeElement in DOM =', document.contains(this.timeElement));
    }

    for (let i = 0; i < timeStr.length && i < digits.length; i++) {
      const digit = digits[i] as HTMLSpanElement;
      const newChar = timeStr[i];

      if (digit.textContent !== newChar) {
        digit.textContent = newChar;

        // Optional: Add subtle animation on change
        digit.style.transform = 'scale(1.02)';
        requestAnimationFrame(() => {
          digit.style.transform = 'scale(1)';
        });
      }
    }
  }

  /**
   * Get current time string
   */
  getCurrentTime(): string {
    return this.lastTimeStr;
  }

  /**
   * Get current timestamp
   */
  getTimestamp(): Date {
    const gpsTimestamp = gpsService.getTimestamp();
    return gpsTimestamp ? new Date(gpsTimestamp) : new Date();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.container.innerHTML = '';
  }
}
