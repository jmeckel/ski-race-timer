/**
 * Pull-to-refresh component for mobile
 */

const PULL_THRESHOLD = 80; // Pixels to pull before triggering refresh
const RESISTANCE = 2.5; // Pull resistance factor

interface PullToRefreshOptions {
  container: HTMLElement;
  onRefresh: () => Promise<void>;
}

export class PullToRefresh {
  private container: HTMLElement;
  private indicator: HTMLElement;
  private onRefresh: () => Promise<void>;
  private startY = 0;
  private currentY = 0;
  private isPulling = false;
  private isRefreshing = false;
  private scrollableParent: HTMLElement | null = null;

  constructor(options: PullToRefreshOptions) {
    this.container = options.container;
    this.onRefresh = options.onRefresh;
    this.indicator = this.createIndicator();
    this.container.insertBefore(this.indicator, this.container.firstChild);

    // Find scrollable parent
    this.scrollableParent = this.findScrollableParent(this.container);

    this.bindEvents();
  }

  /**
   * Create pull indicator element
   */
  private createIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'pull-indicator';
    indicator.style.cssText = `
      position: absolute;
      top: -60px;
      left: 0;
      right: 0;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      font-size: 0.875rem;
      transition: transform 0.2s;
      pointer-events: none;
      z-index: 100;
    `;

    indicator.innerHTML = `
      <div class="pull-indicator-content" style="display: flex; align-items: center; gap: 8px;">
        <svg class="pull-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
        <span class="pull-text">Pull to refresh</span>
      </div>
      <div class="pull-spinner" style="display: none;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      </div>
    `;

    // Add spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    return indicator;
  }

  /**
   * Find scrollable parent element
   */
  private findScrollableParent(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * Bind touch events
   */
  private bindEvents(): void {
    this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  /**
   * Handle touch start
   */
  private onTouchStart = (e: TouchEvent): void => {
    if (this.isRefreshing) return;

    // Only enable pull-to-refresh when scrolled to top
    const scrollTop = this.scrollableParent?.scrollTop ?? 0;
    if (scrollTop > 0) return;

    this.startY = e.touches[0].clientY;
    this.isPulling = true;
  };

  /**
   * Handle touch move
   */
  private onTouchMove = (e: TouchEvent): void => {
    if (!this.isPulling || this.isRefreshing) return;

    const scrollTop = this.scrollableParent?.scrollTop ?? 0;
    if (scrollTop > 0) {
      this.isPulling = false;
      return;
    }

    this.currentY = e.touches[0].clientY;
    const pullDistance = (this.currentY - this.startY) / RESISTANCE;

    if (pullDistance > 0) {
      e.preventDefault();
      this.updateIndicator(pullDistance);
    }
  };

  /**
   * Handle touch end
   * RACE CONDITION FIX: Check and set isRefreshing atomically to prevent double refresh
   */
  private onTouchEnd = async (): Promise<void> => {
    if (!this.isPulling || this.isRefreshing) return;

    const pullDistance = (this.currentY - this.startY) / RESISTANCE;
    this.isPulling = false;

    if (pullDistance >= PULL_THRESHOLD) {
      // Set flag IMMEDIATELY to prevent concurrent refresh triggers
      this.isRefreshing = true;
      await this.triggerRefresh();
    } else {
      this.resetIndicator();
    }
  };

  /**
   * Update indicator based on pull distance
   */
  private updateIndicator(distance: number): void {
    const clampedDistance = Math.min(distance, PULL_THRESHOLD * 1.5);
    this.indicator.style.transform = `translateY(${clampedDistance}px)`;

    const progress = Math.min(distance / PULL_THRESHOLD, 1);
    const icon = this.indicator.querySelector('.pull-icon') as HTMLElement;
    const text = this.indicator.querySelector('.pull-text') as HTMLElement;

    if (icon) {
      icon.style.transform = `rotate(${progress * 180}deg)`;
    }

    if (text) {
      text.textContent = progress >= 1 ? 'Release to refresh' : 'Pull to refresh';
    }
  }

  /**
   * Trigger refresh
   * Note: isRefreshing is set by onTouchEnd before calling this method
   */
  private async triggerRefresh(): Promise<void> {
    const content = this.indicator.querySelector('.pull-indicator-content') as HTMLElement;
    const spinner = this.indicator.querySelector('.pull-spinner') as HTMLElement;

    if (content) content.style.display = 'none';
    if (spinner) spinner.style.display = 'flex';

    this.indicator.style.transform = `translateY(${PULL_THRESHOLD}px)`;

    try {
      await this.onRefresh();
    } finally {
      this.isRefreshing = false;
      if (content) content.style.display = 'flex';
      if (spinner) spinner.style.display = 'none';
      this.resetIndicator();
    }
  }

  /**
   * Reset indicator position
   */
  private resetIndicator(): void {
    this.indicator.style.transform = 'translateY(0)';
    const icon = this.indicator.querySelector('.pull-icon') as HTMLElement;
    if (icon) {
      icon.style.transform = 'rotate(0deg)';
    }
  }

  /**
   * Cleanup
   * Note: Options must match addEventListener for proper removal (capture matters, passive doesn't)
   * but we keep them consistent for clarity
   */
  destroy(): void {
    this.container.removeEventListener('touchstart', this.onTouchStart, { passive: true } as EventListenerOptions);
    this.container.removeEventListener('touchmove', this.onTouchMove, { passive: false } as EventListenerOptions);
    this.container.removeEventListener('touchend', this.onTouchEnd, { passive: true } as EventListenerOptions);
    this.indicator.remove();
  }
}
