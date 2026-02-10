/**
 * Type-safe modal context storage
 * Replaces fragile data-attribute pattern (setAttribute/getAttribute)
 * Uses WeakMap so context is automatically garbage collected when modal elements are removed
 */
const contexts = new WeakMap<HTMLElement, Record<string, unknown>>();

/**
 * Set typed context for a modal element
 */
export function setModalContext<T extends Record<string, unknown>>(
  modal: HTMLElement,
  ctx: T,
): void {
  contexts.set(modal, ctx);
}

/**
 * Get typed context from a modal element
 */
export function getModalContext<T extends Record<string, unknown>>(
  modal: HTMLElement,
): T | null {
  return (contexts.get(modal) as T) ?? null;
}

/**
 * Clear context for a modal element
 * Call this when closing modals to prevent stale data
 */
export function clearModalContext(modal: HTMLElement): void {
  contexts.delete(modal);
}
