/**
 * Swipe actions component for list items
 * Swipe left to reveal delete, swipe right to reveal edit
 */

const SWIPE_THRESHOLD = 80; // Pixels to swipe to trigger action
const SWIPE_VELOCITY_THRESHOLD = 0.5; // Pixels per millisecond

interface SwipeActionsOptions {
  element: HTMLElement;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftContent?: string;
  rightContent?: string;
}

export class SwipeActions {
  private element: HTMLElement;
  private wrapper: HTMLElement;
  private leftAction: HTMLElement;
  private rightAction: HTMLElement;
  private options: SwipeActionsOptions;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private startTime = 0;
  private isHorizontalSwipe: boolean | null = null;

  constructor(options: SwipeActionsOptions) {
    this.options = options;
    this.element = options.element;

    // Wrap the element content
    this.wrapper = this.createWrapper();
    this.leftAction = this.createLeftAction();
    this.rightAction = this.createRightAction();

    this.setupDOM();
    this.bindEvents();
  }

  /**
   * Create content wrapper
   */
  private createWrapper(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'swipe-content';
    wrapper.style.cssText = `
      position: relative;
      transform: translateX(0);
      transition: transform 0.2s ease-out;
      background: inherit;
      z-index: 1;
    `;
    return wrapper;
  }

  /**
   * Create left action (edit)
   */
  private createLeftAction(): HTMLElement {
    const action = document.createElement('div');
    action.className = 'swipe-action swipe-action-left';
    action.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: ${SWIPE_THRESHOLD}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--primary);
      color: white;
      font-weight: 600;
      z-index: 0;
    `;
    action.innerHTML =
      this.options.rightContent ||
      `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    `;
    return action;
  }

  /**
   * Create right action (delete)
   */
  private createRightAction(): HTMLElement {
    const action = document.createElement('div');
    action.className = 'swipe-action swipe-action-right';
    action.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${SWIPE_THRESHOLD}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--error);
      color: white;
      font-weight: 600;
      z-index: 0;
    `;
    action.innerHTML =
      this.options.leftContent ||
      `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
    `;
    return action;
  }

  /**
   * Set up DOM structure
   */
  private setupDOM(): void {
    // Move element children into wrapper
    while (this.element.firstChild) {
      this.wrapper.appendChild(this.element.firstChild);
    }

    // Set up element styles
    this.element.style.position = 'relative';
    this.element.style.overflow = 'hidden';

    // Add components
    this.element.appendChild(this.leftAction);
    this.element.appendChild(this.rightAction);
    this.element.appendChild(this.wrapper);
  }

  /**
   * Bind touch events
   */
  private bindEvents(): void {
    this.wrapper.addEventListener('touchstart', this.onTouchStart, {
      passive: true,
    });
    this.wrapper.addEventListener('touchmove', this.onTouchMove, {
      passive: false,
    });
    this.wrapper.addEventListener('touchend', this.onTouchEnd, {
      passive: true,
    });
  }

  /**
   * Handle touch start
   */
  private onTouchStart = (e: TouchEvent): void => {
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.currentX = 0;
    this.startTime = Date.now();
    this.isHorizontalSwipe = null;
    this.wrapper.style.transition = 'none';
  };

  /**
   * Handle touch move
   */
  private onTouchMove = (e: TouchEvent): void => {
    const deltaX = e.touches[0].clientX - this.startX;
    const deltaY = e.touches[0].clientY - this.startY;

    // Determine swipe direction on first significant movement
    if (this.isHorizontalSwipe === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        this.isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only handle horizontal swipes
    if (!this.isHorizontalSwipe) return;

    e.preventDefault();

    // Apply resistance at edges
    const maxSwipe = SWIPE_THRESHOLD * 1.2;
    this.currentX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));

    this.wrapper.style.transform = `translateX(${this.currentX}px)`;
  };

  /**
   * Handle touch end
   */
  private onTouchEnd = (): void => {
    if (!this.isHorizontalSwipe) return;

    const duration = Date.now() - this.startTime;
    const velocity = Math.abs(this.currentX) / duration;
    const isQuickSwipe = velocity > SWIPE_VELOCITY_THRESHOLD;

    this.wrapper.style.transition = 'transform 0.2s ease-out';

    // Check if action should be triggered
    if (Math.abs(this.currentX) >= SWIPE_THRESHOLD || isQuickSwipe) {
      if (this.currentX < 0 && this.options.onSwipeLeft) {
        // Swipe left - delete
        this.wrapper.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
        setTimeout(() => {
          this.options.onSwipeLeft?.();
          this.reset();
        }, 200);
      } else if (this.currentX > 0 && this.options.onSwipeRight) {
        // Swipe right - edit
        this.wrapper.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
        setTimeout(() => {
          this.options.onSwipeRight?.();
          this.reset();
        }, 200);
      } else {
        this.reset();
      }
    } else {
      this.reset();
    }
  };

  /**
   * Reset to original position
   */
  reset(): void {
    this.wrapper.style.transition = 'transform 0.2s ease-out';
    this.wrapper.style.transform = 'translateX(0)';
    this.currentX = 0;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.wrapper.removeEventListener('touchstart', this.onTouchStart);
    this.wrapper.removeEventListener('touchmove', this.onTouchMove);
    this.wrapper.removeEventListener('touchend', this.onTouchEnd);

    // Restore original structure
    while (this.wrapper.firstChild) {
      this.element.appendChild(this.wrapper.firstChild);
    }
    this.wrapper.remove();
    this.leftAction.remove();
    this.rightAction.remove();
  }
}

/**
 * Enable swipe actions on an element
 */
export function enableSwipeActions(
  element: HTMLElement,
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
): SwipeActions {
  return new SwipeActions({
    element,
    onSwipeLeft,
    onSwipeRight,
  });
}
