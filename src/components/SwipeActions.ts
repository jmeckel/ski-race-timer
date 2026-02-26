/**
 * Swipe actions component for list items
 * Swipe left to reveal delete, swipe right to reveal edit
 */

import { ListenerManager } from '../utils/listenerManager';
import { iconEdit, iconTrash } from '../utils/templates';

const SWIPE_THRESHOLD = 64; // Pixels to swipe to trigger action
const SWIPE_VELOCITY_THRESHOLD = 0.35; // Pixels per millisecond

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
  private pointerId: number | null = null;
  private suppressClickUntil = 0;
  private pendingActionTimeoutId: number | null = null;
  private usePointerEvents =
    typeof window !== 'undefined' && 'PointerEvent' in window;
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
      height: 100%;
      transform: translateX(0);
      transition: transform 0.2s ease-out;
      background: inherit;
      z-index: 1;
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
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
    action.innerHTML = this.options.leftContent || iconEdit(24);
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
    action.innerHTML = this.options.rightContent || iconTrash(24);
    return action;
  }

  /**
   * Set up DOM structure
   */
  private setupDOM(): void {
    // Copy parent's layout styles to wrapper so children render identically.
    // Read from inline styles since the element may not be in the DOM yet.
    const es = this.element.style;
    if (es.display) {
      this.wrapper.style.display = es.display;
    }
    if (es.alignItems) this.wrapper.style.alignItems = es.alignItems;
    if (es.justifyContent)
      this.wrapper.style.justifyContent = es.justifyContent;
    if (es.gap) this.wrapper.style.gap = es.gap;
    if (es.gridTemplateColumns) {
      this.wrapper.style.gridTemplateColumns = es.gridTemplateColumns;
    }
    if (es.gridTemplateRows) {
      this.wrapper.style.gridTemplateRows = es.gridTemplateRows;
    }
    if (es.gridTemplateAreas) {
      this.wrapper.style.gridTemplateAreas = es.gridTemplateAreas;
    }
    if (es.gridAutoFlow) {
      this.wrapper.style.gridAutoFlow = es.gridAutoFlow;
    }
    this.wrapper.style.width = '100%';

    // Move padding from parent to wrapper (parent needs clean overflow:hidden)
    if (es.padding) {
      this.wrapper.style.padding = es.padding;
      es.padding = '0';
    }

    // The outer row becomes a neutral container after wrapping.
    // Keeping grid/flex on the outer row can collapse wrapper width.
    if (es.display) {
      es.display = 'block';
    }
    if (es.gridTemplateColumns) es.gridTemplateColumns = '';
    if (es.gridTemplateRows) es.gridTemplateRows = '';
    if (es.gridTemplateAreas) es.gridTemplateAreas = '';
    if (es.gridAutoFlow) es.gridAutoFlow = '';
    if (es.gap) es.gap = '';

    // Move element children into wrapper
    while (this.element.firstChild) {
      this.wrapper.appendChild(this.element.firstChild);
    }

    // Set up element styles — only override position when it's not already
    // a containing block (absolute/fixed/sticky all work for action backgrounds).
    // Overwriting 'absolute' breaks virtual-list translateY positioning.
    const pos = this.element.style.position;
    if (!pos || pos === 'static') {
      this.element.style.position = 'relative';
    }
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
    if (this.usePointerEvents) {
      this.listeners.add(
        this.wrapper,
        'pointerdown',
        this.onPointerDown as EventListener,
        { passive: true },
      );
      this.listeners.add(
        this.wrapper,
        'pointermove',
        this.onPointerMove as EventListener,
        { passive: false },
      );
      this.listeners.add(
        this.wrapper,
        'pointerup',
        this.onPointerUp as EventListener,
        { passive: true },
      );
      this.listeners.add(
        this.wrapper,
        'pointercancel',
        this.onPointerCancel as EventListener,
        { passive: true },
      );
    } else {
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
      this.listeners.add(
        this.wrapper,
        'touchcancel',
        this.onTouchCancel as EventListener,
        {
          passive: true,
        },
      );
    }

    // Prevent synthetic click after swipe gestures from opening modals.
    this.listeners.add(
      this.wrapper,
      'click',
      this.onClickCapture as EventListener,
      {
        capture: true,
      },
    );
  }

  /**
   * Initialize a gesture
   */
  private startGesture(clientX: number, clientY: number): void {
    this.startX = clientX;
    this.startY = clientY;
    this.currentX = 0;
    this.startTime = Date.now();
    this.isHorizontalSwipe = null;
    this.wrapper.style.transition = 'none';
  }

  /**
   * Update swipe offset from the latest pointer/touch position
   */
  private moveGesture(
    clientX: number,
    clientY: number,
    event: Pick<TouchEvent | PointerEvent, 'preventDefault'>,
  ): void {
    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;

    // Determine swipe direction on first significant movement
    if (this.isHorizontalSwipe === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        this.isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only handle horizontal swipes
    if (!this.isHorizontalSwipe) return;

    event.preventDefault();

    // Apply resistance at edges
    const maxSwipe = SWIPE_THRESHOLD * 1.2;
    this.currentX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
    this.wrapper.style.transform = `translateX(${this.currentX}px)`;
  }

  /**
   * Complete a swipe gesture
   */
  private endGesture(): void {
    if (!this.isHorizontalSwipe) {
      this.wrapper.style.transition = 'transform 0.2s ease-out';
      return;
    }

    const duration = Math.max(Date.now() - this.startTime, 1);
    const velocity = Math.abs(this.currentX) / duration;
    const isQuickSwipe =
      Math.abs(this.currentX) >= 24 && velocity > SWIPE_VELOCITY_THRESHOLD;

    this.wrapper.style.transition = 'transform 0.2s ease-out';
    if (Math.abs(this.currentX) > 10) {
      this.suppressClickUntil = Date.now() + 300;
    }

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
  }

  /**
   * Handle touch start
   */
  private onTouchStart = (e: TouchEvent): void => {
    this.startGesture(e.touches[0]!.clientX, e.touches[0]!.clientY);
  };

  /**
   * Handle touch move
   */
  private onTouchMove = (e: TouchEvent): void => {
    this.moveGesture(e.touches[0]!.clientX, e.touches[0]!.clientY, e);
  };

  /**
   * Handle touch end
   */
  private onTouchEnd = (): void => {
    this.endGesture();
  };

  /**
   * Handle touch cancellation (iOS system interruption, notification, scroll)
   */
  private onTouchCancel = (): void => {
    if (this.pendingActionTimeoutId !== null) {
      clearTimeout(this.pendingActionTimeoutId);
      this.pendingActionTimeoutId = null;
    }
    this.reset();
  };

  /**
   * Handle pointer start
   */
  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.pointerId = e.pointerId;
    this.wrapper.setPointerCapture?.(e.pointerId);
    this.startGesture(e.clientX, e.clientY);
  };

  /**
   * Handle pointer move
   */
  private onPointerMove = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.moveGesture(e.clientX, e.clientY, e);
  };

  /**
   * Handle pointer end
   */
  private onPointerUp = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    if (this.wrapper.hasPointerCapture?.(e.pointerId)) {
      this.wrapper.releasePointerCapture(e.pointerId);
    }
    this.endGesture();
  };

  /**
   * Handle pointer cancellation
   */
  private onPointerCancel = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    if (this.wrapper.hasPointerCapture?.(e.pointerId)) {
      this.wrapper.releasePointerCapture(e.pointerId);
    }
    if (this.pendingActionTimeoutId !== null) {
      clearTimeout(this.pendingActionTimeoutId);
      this.pendingActionTimeoutId = null;
    }
    this.reset();
  };

  /**
   * Prevent synthetic click after swipe
   */
  private onClickCapture = (e: MouseEvent): void => {
    if (Date.now() < this.suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
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
