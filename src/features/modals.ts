/**
 * Modal utilities
 * Shared modal open/close functions and helpers
 */

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
  }, 150);
}

/**
 * Open modal with animation
 */
export function openModal(modal: HTMLElement | null): void {
  if (!modal) return;
  modal.classList.add('show');
}

/**
 * Close all open modals with animation
 */
export function closeAllModalsAnimated(): void {
  document.querySelectorAll('.modal-overlay.show').forEach(modal => {
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
