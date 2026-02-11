/**
 * Swipe actions component for list items
 * Swipe left to reveal delete, swipe right to reveal edit
 */

import { ListenerManager } from '../utils/listenerManager';
import { iconEdit, iconTrash } from '../utils/templates';

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
  private pendingActionTimeoutId: number | null = null;
  private listeners = new ListenerManager();

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
    action.innerHTML = this.options.rightContent || iconEdit(24);
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
    action.innerHTML = this.options.leftContent || iconTrash(24);
    return action;
  }

  /**
   * Set up DOM structure
   */
  private setupDOM(): void {
    // Copy parent's flex layout to wrapper so children render identically.
    // Read from inline styles since the element may not be in the DOM yet.
    const es = this.element.style;
    if (es.display === 'flex' || es.display === 'inline-flex') {
      this.wrapper.style.display = es.display;
      if (es.alignItems) this.wrapper.style.alignItems = es.alignItems;
      if (es.justifyContent)
        this.wrapper.style.justifyContent = es.justifyContent;
      if (es.gap) this.wrapper.style.gap = es.gap;
      this.wrapper.style.width = '100%';
      // Move padding from parent to wrapper (parent needs clean overflow:hidden)
      if (es.padding) {
        this.wrapper.style.padding = es.padding;
        es.padding = '0';
      }
    }

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
    this.listeners.add(
      this.wrapper,
      'touchstart',
      this.onTouchStart as EventListener,
      {
        passive: true,
      },
    );
    this.listeners.add(
      this.wrapper,
      'touchmove',
      this.onTouchMove as EventListener,
      {
        passive: false,
      },
    );
    this.listeners.add(
      this.wrapper,
      'touchend',
      this.onTouchEnd as EventListener,
      {
        passive: true,
      },
    );
  }

  /**
   * Handle touch start
   */
  private onTouchStart = (e: TouchEvent): void => {
    this.startX = e.touches[0]!.clientX;
    this.startY = e.touches[0]!.clientY;
    this.currentX = 0;
    this.startTime = Date.now();
    this.isHorizontalSwipe = null;
    this.wrapper.style.transition = 'none';
  };

  /**
   * Handle touch move
   */
  private onTouchMove = (e: TouchEvent): void => {
    const deltaX = e.touches[0]!.clientX - this.startX;
    const deltaY = e.touches[0]!.clientY - this.startY;

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

    // Clear any pending action from a previous swipe
    if (this.pendingActionTimeoutId !== null) {
      clearTimeout(this.pendingActionTimeoutId);
      this.pendingActionTimeoutId = null;
    }

    // Check if action should be triggered
    if (Math.abs(this.currentX) >= SWIPE_THRESHOLD || isQuickSwipe) {
      if (this.currentX < 0 && this.options.onSwipeLeft) {
        // Swipe left - delete
        this.wrapper.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
        this.pendingActionTimeoutId = window.setTimeout(() => {
          this.pendingActionTimeoutId = null;
          this.options.onSwipeLeft?.();
          this.reset();
        }, 200);
      } else if (this.currentX > 0 && this.options.onSwipeRight) {
        // Swipe right - edit
        this.wrapper.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
        this.pendingActionTimeoutId = window.setTimeout(() => {
          this.pendingActionTimeoutId = null;
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
    if (this.pendingActionTimeoutId !== null) {
      clearTimeout(this.pendingActionTimeoutId);
      this.pendingActionTimeoutId = null;
    }
    this.listeners.removeAll();

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
