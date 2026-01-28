import { formatTime, formatDate } from '../utils';
import { store } from '../store';
import { gpsService, batteryService, type BatteryLevel } from '../services';

// Frame throttling for battery optimization
// Normal: 60fps, Low battery: 30fps, Critical: 15fps
const FRAME_SKIP_NORMAL = 0;
const FRAME_SKIP_LOW = 1; // Skip every other frame (30fps)
const FRAME_SKIP_CRITICAL = 3; // Skip 3 of 4 frames (15fps)

/**
 * High-performance clock component using requestAnimationFrame
 * Only updates changed digits to minimize DOM manipulation
 * Battery-aware: reduces frame rate when battery is low
 */
export class Clock {
  private container: HTMLElement;
  private timeElement: HTMLElement;
  private dateElement: HTMLElement;
  private dateRow: HTMLElement;
  private lastTimeStr = '';
  private animationId: number | null = null;
  private isRunning = false;
  private visibilityHandler: (() => void) | null = null;

  // Battery-aware throttling
  private frameSkipCount = FRAME_SKIP_NORMAL;
  private currentFrame = 0;
  private batteryUnsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    // Clear container in case of re-initialization
    this.container.innerHTML = '';

    this.timeElement = this.createTimeElement();
    this.dateRow = this.createDateRow();
    this.dateElement = this.dateRow.querySelector('.clock-date') as HTMLElement;

    this.container.appendChild(this.timeElement);
    this.container.appendChild(this.dateRow);

    // Move timing points into the date row
    this.moveTimingPointsToDateRow();
  }

  /**
   * Move timing controls (timing points and run selector) into the date row
   */
  private moveTimingPointsToDateRow(): void {
    const timingControls = document.querySelector('.timing-controls');
    if (timingControls && this.dateRow) {
      this.dateRow.appendChild(timingControls);
    }
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
      background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-align: center;
      text-shadow: 0 0 40px rgba(56, 189, 248, 0.3);
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
   * Create date row with date and timing points container
   */
  private createDateRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'clock-date-row';
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
      padding: 0 8px;
      width: 100%;
    `;

    const dateEl = document.createElement('div');
    dateEl.className = 'clock-date';
    dateEl.style.cssText = `
      font-size: 0.875rem;
      color: var(--text-secondary);
    `;

    row.appendChild(dateEl);
    return row;
  }

  /**
   * Start the clock
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick();

    // Add visibility change handler to pause/resume clock for battery optimization
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          // Page is hidden - stop animation loop but keep isRunning true
          if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
          }
        } else {
          // Page is visible again - resume if still running
          if (this.isRunning && this.animationId === null) {
            this.tick();
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (document.hidden && this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }

    // Subscribe to battery changes for adaptive frame rate
    if (!this.batteryUnsubscribe) {
      batteryService.initialize().then(() => {
        this.batteryUnsubscribe = batteryService.subscribe((status) => {
          this.updateFrameSkipFromBattery(status.batteryLevel);
        });
      });
    }
  }

  /**
   * Update frame skip count based on battery level
   */
  private updateFrameSkipFromBattery(level: BatteryLevel): void {
    const previousSkip = this.frameSkipCount;
    switch (level) {
      case 'critical':
        this.frameSkipCount = FRAME_SKIP_CRITICAL;
        break;
      case 'low':
        this.frameSkipCount = FRAME_SKIP_LOW;
        break;
      default:
        this.frameSkipCount = FRAME_SKIP_NORMAL;
    }
  }

  /**
   * Stop the clock
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Remove visibility change handler to prevent memory leak
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // Unsubscribe from battery changes
    if (this.batteryUnsubscribe) {
      this.batteryUnsubscribe();
      this.batteryUnsubscribe = null;
    }
  }

  /**
   * Clock tick using requestAnimationFrame
   * Entire method wrapped in try-catch to ensure clock keeps running even if RAF throws
   * Battery-aware: skips frames when battery is low to reduce CPU usage
   */
  private tick = (): void => {
    if (!this.isRunning) return;

    try {
      // Frame skipping for battery optimization
      // Always schedule next frame first, then decide whether to update display
      this.currentFrame++;
      const shouldUpdate = this.frameSkipCount === 0 || (this.currentFrame % (this.frameSkipCount + 1)) === 0;

      if (shouldUpdate) {
        // Always use Date.now() for display - GPS timestamp is only for recording entries
        const now = new Date();
        const timeStr = formatTime(now);

        // Only update changed digits
        if (timeStr !== this.lastTimeStr) {
          this.updateDigits(timeStr);
          this.lastTimeStr = timeStr;
        }

        // Update date once per second (when seconds change)
        const seconds = now.getSeconds();
        if (seconds === 0 || !this.dateElement.textContent) {
          const state = store.getState();
          this.dateElement.textContent = formatDate(now, state.currentLang);
        }
      }

      // Schedule next frame inside try block
      this.animationId = requestAnimationFrame(this.tick);
    } catch (error) {
      console.error('Clock tick error:', error);
      // Try to recover by scheduling next frame even after error
      try {
        this.animationId = requestAnimationFrame(this.tick);
      } catch (rafError) {
        console.error('Clock RAF scheduling failed:', rafError);
        // If RAF fails completely, fall back to setTimeout
        setTimeout(() => {
          if (this.isRunning) {
            this.tick();
          }
        }, 16); // ~60fps
      }
    }
  };

  /**
   * Update only changed digits
   */
  private updateDigits(timeStr: string): void {
    const digits = this.timeElement.querySelectorAll('.clock-digit');

    for (let i = 0; i < timeStr.length && i < digits.length; i++) {
      const digit = digits[i] as HTMLSpanElement;
      const newChar = timeStr[i];

      if (digit.textContent !== newChar) {
        digit.textContent = newChar;

        // Subtle animation on change
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

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.container.innerHTML = '';
  }
}
