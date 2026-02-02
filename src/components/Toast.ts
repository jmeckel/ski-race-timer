export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  duration?: number;
  type?: ToastType;
}

const DEFAULT_DURATION = 3000;
const COPY_DEBOUNCE_MS = 1000; // Debounce copy notifications

/**
 * Toast notification component
 */
export class Toast {
  private container: HTMLElement;
  private queue: Array<{ message: string; options: ToastOptions }> = [];
  private isShowing = false;
  private toastEventListener: EventListener;
  private lastCopyTime = 0; // Track last copy to prevent duplicate notifications

  constructor() {
    this.container = this.createContainer();
    document.body.appendChild(this.container);

    // Listen for custom toast events - store reference for cleanup
    this.toastEventListener = ((e: CustomEvent) => {
      this.show(e.detail.message, { type: e.detail.type, duration: e.detail.duration });
    }) as EventListener;
    window.addEventListener('show-toast', this.toastEventListener);
  }

  /**
   * Create toast container
   */
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText = `
      position: fixed;
      bottom: calc(80px + env(safe-area-inset-bottom, 0px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    `;
    return container;
  }

  /**
   * Show a toast notification
   */
  show(message: string, options: ToastOptions = {}): void {
    this.queue.push({ message, options });

    if (!this.isShowing) {
      this.processQueue();
    }
  }

  /**
   * Process toast queue
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const { message, options } = this.queue.shift()!;
    const duration = options.duration || DEFAULT_DURATION;
    const type = options.type || 'info';

    const toast = this.createToast(message, type);
    this.container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto dismiss
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';

      setTimeout(() => {
        toast.remove();
        this.processQueue();
      }, 200);
    }, duration);
  }

  /**
   * Create toast element
   */
  private createToast(message: string, type: ToastType): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const colors = {
      success: 'var(--success)',
      error: 'var(--error)',
      warning: 'var(--warning)',
      info: 'var(--primary)'
    };

    const icons = {
      success: '<path d="M20 6L9 17l-5-5"/>',
      error: '<path d="M18 6L6 18M6 6l12 12"/>',
      warning: '<path d="M12 9v4M12 17h.01"/>',
      info: '<path d="M12 16v-4M12 8h.01"/>'
    };

    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--surface-elevated);
      border-left: 3px solid ${colors[type]};
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-size: 0.875rem;
      color: var(--text-primary);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: auto;
      max-width: 90vw;
    `;

    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        ${icons[type]}
      </svg>
      <span>${this.escapeHtml(message)}</span>
    `;

    // Add click handler to copy message and prevent event propagation
    toast.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.copyToClipboard(message);
    });

    // Also block mousedown/touchstart to prevent any underlying click handlers
    toast.addEventListener('mousedown', (e) => e.stopPropagation());
    toast.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    return toast;
  }

  /**
   * Copy toast message to clipboard with debounced notification
   */
  private async copyToClipboard(message: string): Promise<void> {
    const now = Date.now();

    // Debounce: only show "copied" notification if enough time has passed
    const shouldShowNotification = now - this.lastCopyTime > COPY_DEBOUNCE_MS;
    this.lastCopyTime = now;

    try {
      await navigator.clipboard.writeText(message);

      if (shouldShowNotification) {
        // Show a brief "copied" feedback - use a shorter duration
        this.show('Copied to clipboard', { type: 'success', duration: 1500 });
      }
    } catch {
      // Clipboard API not available or failed - silent fail
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Clear all toasts
   */
  clear(): void {
    this.queue = [];
    this.container.innerHTML = '';
    this.isShowing = false;
  }

  /**
   * Destroy toast instance and cleanup event listeners
   */
  destroy(): void {
    window.removeEventListener('show-toast', this.toastEventListener);
    this.clear();
    this.container.remove();
  }
}

// Singleton instance
let toastInstance: Toast | null = null;

/**
 * Get toast instance
 */
export function getToast(): Toast {
  if (!toastInstance) {
    toastInstance = new Toast();
  }
  return toastInstance;
}

/**
 * Show toast helper
 */
export function showToast(message: string, type: ToastType = 'info', duration?: number): void {
  getToast().show(message, { type, duration });
}

/**
 * Destroy toast instance and cleanup - call on page unload
 */
export function destroyToast(): void {
  if (toastInstance) {
    toastInstance.destroy();
    toastInstance = null;
  }
}
