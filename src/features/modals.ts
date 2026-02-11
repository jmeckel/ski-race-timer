/**
 * Modal utilities
 * Shared modal open/close functions and helpers
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type FocusState = {
  previousFocus: HTMLElement | null;
  keydownHandler: (event: KeyboardEvent) => void;
};

const focusStateMap = new WeakMap<HTMLElement, FocusState>();

function getFocusableElements(modal: HTMLElement): HTMLElement[] {
  return Array.from(
    modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

function focusFirstElement(modal: HTMLElement): void {
  const focusables = getFocusableElements(modal);
  if (focusables.length > 0) {
    focusables[0]!.focus();
    return;
  }

  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus();
}

function trapFocus(modal: HTMLElement): void {
  const keydownHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeModal(modal);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = getFocusableElements(modal);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (!active || active === first || active === modal) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  modal.addEventListener('keydown', keydownHandler);
  focusStateMap.set(modal, {
    previousFocus: document.activeElement as HTMLElement | null,
    keydownHandler,
  });
}

function releaseFocus(modal: HTMLElement): void {
  const state = focusStateMap.get(modal);
  if (!state) return;

  modal.removeEventListener('keydown', state.keydownHandler);
  focusStateMap.delete(modal);

  const previousFocus = state.previousFocus;
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
}

/**
 * Close modal with animation
 * Adds closing class, waits for animation, then removes show class
 */
export function closeModal(modal: HTMLElement | null): void {
  if (!modal || !modal.classList.contains('show')) return;

  modal.classList.add('closing');

  // Wait for animation to complete (150ms)
  setTimeout(() => {
    modal.classList.remove('show', 'closing');
    releaseFocus(modal);
  }, 150);
}

/**
 * Open modal with animation
 */
export function openModal(modal: HTMLElement | null): void {
  if (!modal) return;
  if (!modal.hasAttribute('role')) {
    modal.setAttribute('role', 'dialog');
  }
  modal.setAttribute('aria-modal', 'true');
  const wasOpen = modal.classList.contains('show');
  modal.classList.add('show');
  if (!focusStateMap.has(modal)) {
    trapFocus(modal);
  }
  if (!wasOpen) {
    setTimeout(() => focusFirstElement(modal), 0);
  }
}

/**
 * Close all open modals with animation
 */
export function closeAllModalsAnimated(): void {
  document.querySelectorAll('.modal-overlay.show').forEach((modal) => {
    closeModal(modal as HTMLElement);
  });
}

/**
 * Check if any modal is open
 */
export function isAnyModalOpen(): boolean {
  return document.querySelectorAll('.modal-overlay.show').length > 0;
}

/**
 * Get open modal element
 */
export function getOpenModal(): HTMLElement | null {
  return document.querySelector('.modal-overlay.show');
}
