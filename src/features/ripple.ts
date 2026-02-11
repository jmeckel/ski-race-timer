/**
 * Ripple effect utilities
 * Material Design-style ripple synced with haptic feedback
 */

import { ListenerManager } from '../utils/listenerManager';

// Module-level listener manager for lifecycle cleanup
const listeners = new ListenerManager();

// Track active ripple timeouts for cleanup
const activeRippleTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

/**
 * Create ripple effect on element
 * Synced with haptic feedback for tactile response
 */
export function createRipple(
  event: MouseEvent | TouchEvent,
  element: HTMLElement,
  variant?: 'primary' | 'success' | 'secondary',
): void {
  // Get click/touch position
  const rect = element.getBoundingClientRect();
  let x: number, y: number;

  // Check for TouchEvent safely (not available in all browsers, e.g., desktop Safari)
  if (
    typeof TouchEvent !== 'undefined' &&
    event instanceof TouchEvent &&
    event.touches.length > 0
  ) {
    x = event.touches[0]!.clientX - rect.left;
    y = event.touches[0]!.clientY - rect.top;
  } else if (typeof MouseEvent !== 'undefined' && event instanceof MouseEvent) {
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  } else {
    // Fallback to center
    x = rect.width / 2;
    y = rect.height / 2;
  }

  // Create ripple element
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  if (variant) {
    ripple.classList.add(`ripple-${variant}`);
  }

  // Size ripple to cover the element
  const size = Math.max(rect.width, rect.height) * 2;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;

  // Add to element
  element.appendChild(ripple);

  // Remove after animation
  const timeoutId = setTimeout(() => {
    ripple.remove();
    activeRippleTimeouts.delete(timeoutId);
  }, 500);
  activeRippleTimeouts.add(timeoutId);
}

/**
 * Initialize ripple effect on buttons
 */
export function initRippleEffects(): void {
  // Number pad buttons
  document.querySelectorAll('.num-btn').forEach((btn) => {
    btn.classList.add('ripple-container');
    listeners.add(
      btn,
      'touchstart',
      (e) => createRipple(e as TouchEvent, btn as HTMLElement),
      { passive: true },
    );
    listeners.add(btn, 'mousedown', (e) =>
      createRipple(e as MouseEvent, btn as HTMLElement),
    );
  });

  // Timestamp button - use primary color
  const timestampBtn = document.querySelector('.timestamp-btn');
  if (timestampBtn) {
    timestampBtn.classList.add('ripple-container');
    listeners.add(
      timestampBtn,
      'touchstart',
      (e) =>
        createRipple(e as TouchEvent, timestampBtn as HTMLElement, 'primary'),
      { passive: true },
    );
    listeners.add(timestampBtn, 'mousedown', (e) =>
      createRipple(e as MouseEvent, timestampBtn as HTMLElement, 'primary'),
    );
  }

  // Timing point buttons
  document.querySelectorAll('.timing-point-btn').forEach((btn) => {
    btn.classList.add('ripple-container');
    const isStart = btn.getAttribute('data-point') === 'S';
    listeners.add(
      btn,
      'touchstart',
      (e) =>
        createRipple(
          e as TouchEvent,
          btn as HTMLElement,
          isStart ? 'success' : 'secondary',
        ),
      { passive: true },
    );
    listeners.add(btn, 'mousedown', (e) =>
      createRipple(
        e as MouseEvent,
        btn as HTMLElement,
        isStart ? 'success' : 'secondary',
      ),
    );
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.add('ripple-container');
    listeners.add(
      btn,
      'touchstart',
      (e) => createRipple(e as TouchEvent, btn as HTMLElement, 'primary'),
      { passive: true },
    );
    listeners.add(btn, 'mousedown', (e) =>
      createRipple(e as MouseEvent, btn as HTMLElement, 'primary'),
    );
  });

  // Action buttons in results view
  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.classList.add('ripple-container');
    listeners.add(
      btn,
      'touchstart',
      (e) => createRipple(e as TouchEvent, btn as HTMLElement),
      { passive: true },
    );
    listeners.add(btn, 'mousedown', (e) =>
      createRipple(e as MouseEvent, btn as HTMLElement),
    );
  });

  // Modal buttons
  document.querySelectorAll('.modal-btn').forEach((btn) => {
    btn.classList.add('ripple-container');
    const isPrimary = btn.classList.contains('primary');
    const isDanger = btn.classList.contains('danger');
    const variant = isPrimary ? 'primary' : isDanger ? 'secondary' : undefined;
    listeners.add(
      btn,
      'touchstart',
      (e) => createRipple(e as TouchEvent, btn as HTMLElement, variant),
      { passive: true },
    );
    listeners.add(btn, 'mousedown', (e) =>
      createRipple(e as MouseEvent, btn as HTMLElement, variant),
    );
  });
}

/**
 * Cleanup ripple timeouts (for page unload)
 */
export function cleanupRippleEffects(): void {
  listeners.removeAll();
  activeRippleTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  activeRippleTimeouts.clear();
}
