/**
 * Manages event listeners with guaranteed cleanup.
 * Prevents memory leaks from orphaned listeners by tracking all registrations.
 *
 * Usage:
 *   const listeners = new ListenerManager();
 *   listeners.add(element, 'click', handleClick);
 *   listeners.add(window, 'resize', handleResize);
 *   // Later:
 *   listeners.removeAll(); // Removes all tracked listeners
 */
export class ListenerManager {
  private listeners: Array<[EventTarget, string, EventListener, boolean | AddEventListenerOptions | undefined]> = [];

  /**
   * Add an event listener and track it for later removal
   */
  add(target: EventTarget, event: string, handler: EventListener, options?: boolean | AddEventListenerOptions): void {
    target.addEventListener(event, handler, options);
    this.listeners.push([target, event, handler, options]);
  }

  /**
   * Remove all tracked event listeners
   */
  removeAll(): void {
    for (const [target, event, handler, options] of this.listeners) {
      target.removeEventListener(event, handler, options);
    }
    this.listeners = [];
  }

  /**
   * Get the number of tracked listeners
   */
  get count(): number {
    return this.listeners.length;
  }
}
