/**
 * Global Error Boundary
 * Catches unhandled errors and provides graceful recovery
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { store } from '../store';
import { logCritical, logError } from './errors';

// Track if we've shown error UI to avoid spam
let errorOverlayShown = false;
let recentErrors: { message: string; timestamp: number }[] = [];
let focusTimerId: ReturnType<typeof setTimeout> | null = null;
const ERROR_THRESHOLD = 3;
const ERROR_WINDOW_MS = 10000; // 10 seconds

/**
 * Initialize global error handlers
 * Call this once at app startup
 */
export function initGlobalErrorHandlers(): void {
  // Handle uncaught errors
  window.addEventListener('error', handleGlobalError);

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  // Handle critical errors from our error system
  window.addEventListener(
    'critical-error',
    handleCriticalError as EventListener,
  );
}

/**
 * Clean up error handlers (for testing)
 */
export function cleanupGlobalErrorHandlers(): void {
  window.removeEventListener('error', handleGlobalError);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  window.removeEventListener(
    'critical-error',
    handleCriticalError as EventListener,
  );
  if (focusTimerId !== null) {
    clearTimeout(focusTimerId);
    focusTimerId = null;
  }
}

/**
 * Handle global window.onerror events
 */
function handleGlobalError(event: ErrorEvent): void {
  const { message, error } = event;

  // Log the error
  logError('Global', 'uncaught error', error || message, undefined);

  // Track error for threshold detection
  trackError(message);

  // Check if we should show error UI
  if (shouldShowErrorUI()) {
    showErrorOverlay(message);
  }

  // Prevent default browser error handling
  event.preventDefault();
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);

  // Log the error
  logError('Global', 'unhandled rejection', reason, undefined);

  // Track error for threshold detection
  trackError(message);

  // Check if we should show error UI
  if (shouldShowErrorUI()) {
    showErrorOverlay(message);
  }

  // Prevent default browser handling
  event.preventDefault();
}

/**
 * Handle critical errors from our error system
 */
function handleCriticalError(event: CustomEvent): void {
  const context = event.detail;
  const message = context?.error?.message || 'Critical error occurred';

  logCritical('Global', 'critical error event', context?.error, undefined);

  // Always show UI for critical errors
  showErrorOverlay(message);
}

/**
 * Track errors for threshold detection
 */
function trackError(message: string): void {
  const now = Date.now();

  // Add new error
  recentErrors.push({ message, timestamp: now });

  // Clean old errors
  recentErrors = recentErrors.filter(
    (e) => now - e.timestamp < ERROR_WINDOW_MS,
  );
}

/**
 * Check if we should show error UI (multiple errors in short time)
 */
function shouldShowErrorUI(): boolean {
  return recentErrors.length >= ERROR_THRESHOLD;
}

/**
 * Show error overlay to user
 */
function showErrorOverlay(message: string): void {
  // Avoid showing multiple overlays
  if (errorOverlayShown) return;
  errorOverlayShown = true;

  const lang = store.getState().currentLang;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'error-boundary-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 24px;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    text-align: center;
    color: #fff;
  `;

  content.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
    <h2 style="margin: 0 0 8px; font-size: 1.25rem;">${t('errorOccurred', lang)}</h2>
    <p style="color: #999; font-size: 0.875rem; margin: 0 0 16px;">
      ${t('errorRecoveryMessage', lang)}
    </p>
    <p style="color: #666; font-size: 0.75rem; font-family: monospace; margin: 0 0 24px; word-break: break-word;">
      ${escapeHtml(message.substring(0, 200))}
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="error-dismiss-btn" style="
        padding: 12px 24px;
        border: 1px solid #444;
        border-radius: 8px;
        background: transparent;
        color: #fff;
        font-size: 0.875rem;
        cursor: pointer;
      ">${t('dismiss', lang)}</button>
      <button id="error-reload-btn" style="
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        background: #3B82F6;
        color: #fff;
        font-size: 0.875rem;
        cursor: pointer;
      ">${t('reload', lang)}</button>
    </div>
  `;

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // Focus the dismiss button for keyboard accessibility
  focusTimerId = setTimeout(() => {
    focusTimerId = null;
    const dismissBtn = document.getElementById('error-dismiss-btn');
    dismissBtn?.focus();
  }, 100);

  // Add button handlers
  document
    .getElementById('error-dismiss-btn')
    ?.addEventListener('click', () => {
      if (focusTimerId !== null) {
        clearTimeout(focusTimerId);
        focusTimerId = null;
      }
      overlay.remove();
      errorOverlayShown = false;
      recentErrors = []; // Reset error tracking
    });

  document.getElementById('error-reload-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Wrap an async function with error handling
 */
export function withErrorBoundary<
  T extends (...args: unknown[]) => Promise<unknown>,
>(fn: T, component: string, operation: string): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(component, operation, error);
      const lang = store.getState().currentLang;
      showToast(t('operationFailed', lang), 'error');
      throw error; // Re-throw for caller to handle if needed
    }
  }) as T;
}

/**
 * Safe wrapper for DOM event handlers
 */
export function safeHandler<E extends Event>(
  handler: (event: E) => void | Promise<void>,
  component: string,
  operation: string,
): (event: E) => void {
  return (event: E) => {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((error) => {
          logError(component, operation, error);
        });
      }
    } catch (error) {
      logError(component, operation, error);
    }
  };
}
