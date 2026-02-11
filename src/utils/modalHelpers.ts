import { openModal } from '../features/modals';
import { setModalContext } from './modalContext';

/**
 * Open a modal with typed context in one step.
 * Combines setModalContext + openModal to avoid forgetting either.
 */
export function openModalWithContext<T extends Record<string, unknown>>(
  modal: HTMLElement | null,
  context: T,
): void {
  if (!modal) return;
  setModalContext(modal, context);
  openModal(modal);
}
