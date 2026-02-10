/**
 * Unit Tests for Error Boundary Utility
 * Tests: initGlobalErrorHandlers, cleanupGlobalErrorHandlers, withErrorBoundary, safeHandler
 *        handleGlobalError, handleUnhandledRejection, handleCriticalError,
 *        showErrorOverlay, trackError, shouldShowErrorUI, escapeHtml
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the dependencies
const mockShowToast = vi.fn();
vi.mock('../../../src/components', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => ({ currentLang: 'en' })
  }
}));

const mockLogError = vi.fn();
const mockLogCritical = vi.fn();
vi.mock('../../../src/utils/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logCritical: (...args: unknown[]) => mockLogCritical(...args),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: (key: string) => key
}));

// Helper type for the module
type ErrorBoundaryModule = typeof import('../../../src/utils/errorBoundary');

describe('Error Boundary Utility', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mod: ErrorBoundaryModule;

  beforeEach(async () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockShowToast.mockClear();
    mockLogError.mockClear();
    mockLogCritical.mockClear();

    // Reset module to get fresh module-level state (errorOverlayShown, recentErrors)
    vi.resetModules();
    mod = await import('../../../src/utils/errorBoundary');
  });

  afterEach(() => {
    mod.cleanupGlobalErrorHandlers();
    consoleLogSpy.mockRestore();
    // Remove any error UI elements
    document.getElementById('error-boundary-overlay')?.remove();
  });

  describe('initGlobalErrorHandlers', () => {
    it('should set up window error handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      mod.initGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should set up unhandled rejection handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      mod.initGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should set up critical-error handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      mod.initGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('critical-error', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });
  });

  describe('cleanupGlobalErrorHandlers', () => {
    it('should remove window error handler', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      mod.initGlobalErrorHandlers();
      mod.cleanupGlobalErrorHandlers();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('should remove unhandled rejection handler', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      mod.initGlobalErrorHandlers();
      mod.cleanupGlobalErrorHandlers();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('should remove critical-error handler', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      mod.initGlobalErrorHandlers();
      mod.cleanupGlobalErrorHandlers();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('critical-error', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('handleGlobalError via window error event', () => {
    beforeEach(() => {
      mod.initGlobalErrorHandlers();
    });

    it('should log error when global error occurs', () => {
      const errorEvent = new ErrorEvent('error', {
        message: 'Uncaught error',
        error: new Error('test global error'),
      });
      window.dispatchEvent(errorEvent);

      expect(mockLogError).toHaveBeenCalledWith(
        'Global',
        'uncaught error',
        expect.any(Error),
        undefined,
      );
    });

    it('should log message string when no error object available', () => {
      const errorEvent = new ErrorEvent('error', {
        message: 'Script error.',
      });
      window.dispatchEvent(errorEvent);

      expect(mockLogError).toHaveBeenCalledWith(
        'Global',
        'uncaught error',
        'Script error.',
        undefined,
      );
    });

    it('should show error overlay after threshold errors', () => {
      // Dispatch 3 errors (threshold = 3) to trigger overlay
      for (let i = 0; i < 3; i++) {
        const errorEvent = new ErrorEvent('error', {
          message: `Error ${i}`,
          error: new Error(`test error ${i}`),
        });
        window.dispatchEvent(errorEvent);
      }

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();
    });

    it('should not show error overlay for a single error', () => {
      const errorEvent = new ErrorEvent('error', {
        message: 'Single error',
        error: new Error('one-off'),
      });
      window.dispatchEvent(errorEvent);

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).toBeNull();
    });
  });

  describe('handleUnhandledRejection via window event', () => {
    // PromiseRejectionEvent is not available in jsdom, so create a shim
    function createRejectionEvent(reason: unknown): Event {
      const event = new Event('unhandledrejection', { cancelable: true });
      Object.defineProperty(event, 'reason', { value: reason });
      Object.defineProperty(event, 'promise', { value: Promise.resolve() });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      return event;
    }

    beforeEach(() => {
      mod.initGlobalErrorHandlers();
    });

    it('should log unhandled promise rejections with Error reason', () => {
      const event = createRejectionEvent(new Error('unhandled promise error'));
      window.dispatchEvent(event);

      expect(mockLogError).toHaveBeenCalledWith(
        'Global',
        'unhandled rejection',
        expect.any(Error),
        undefined,
      );
    });

    it('should log unhandled promise rejections with string reason', () => {
      const event = createRejectionEvent('string rejection reason');
      window.dispatchEvent(event);

      expect(mockLogError).toHaveBeenCalledWith(
        'Global',
        'unhandled rejection',
        'string rejection reason',
        undefined,
      );
    });

    it('should show error overlay after threshold rejections', () => {
      for (let i = 0; i < 3; i++) {
        const event = createRejectionEvent(new Error(`rejection ${i}`));
        window.dispatchEvent(event);
      }

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();
    });
  });

  describe('handleCriticalError via custom event', () => {
    beforeEach(() => {
      mod.initGlobalErrorHandlers();
    });

    it('should log critical error and show overlay immediately', () => {
      const event = new CustomEvent('critical-error', {
        detail: {
          error: new Error('critical failure'),
          component: 'Store',
        },
      });
      window.dispatchEvent(event);

      expect(mockLogCritical).toHaveBeenCalledWith(
        'Global',
        'critical error event',
        expect.any(Error),
        undefined,
      );

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();
    });

    it('should handle critical error without error object in detail', () => {
      const event = new CustomEvent('critical-error', {
        detail: {
          component: 'Store',
        },
      });
      window.dispatchEvent(event);

      expect(mockLogCritical).toHaveBeenCalledWith(
        'Global',
        'critical error event',
        undefined,
        undefined,
      );
    });

    it('should handle critical error with empty detail', () => {
      const event = new CustomEvent('critical-error', {
        detail: null,
      });
      window.dispatchEvent(event);

      expect(mockLogCritical).toHaveBeenCalled();
    });
  });

  describe('Error overlay behavior', () => {
    beforeEach(() => {
      mod.initGlobalErrorHandlers();
    });

    it('should only show one overlay at a time', () => {
      // Trigger critical error twice
      for (let i = 0; i < 2; i++) {
        const event = new CustomEvent('critical-error', {
          detail: { error: new Error(`critical ${i}`) },
        });
        window.dispatchEvent(event);
      }

      const overlays = document.querySelectorAll('#error-boundary-overlay');
      expect(overlays.length).toBe(1);
    });

    it('should dismiss overlay when dismiss button is clicked', () => {
      const event = new CustomEvent('critical-error', {
        detail: { error: new Error('critical') },
      });
      window.dispatchEvent(event);

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();

      const dismissBtn = document.getElementById('error-dismiss-btn');
      expect(dismissBtn).not.toBeNull();
      dismissBtn?.click();

      expect(document.getElementById('error-boundary-overlay')).toBeNull();
    });

    it('should allow showing overlay again after dismiss', () => {
      // First overlay
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: new Error('first') },
      }));
      expect(document.getElementById('error-boundary-overlay')).not.toBeNull();

      // Dismiss
      document.getElementById('error-dismiss-btn')?.click();
      expect(document.getElementById('error-boundary-overlay')).toBeNull();

      // Second overlay should appear
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: new Error('second') },
      }));
      expect(document.getElementById('error-boundary-overlay')).not.toBeNull();
    });

    it('should contain dismiss and reload buttons', () => {
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: new Error('test') },
      }));

      expect(document.getElementById('error-dismiss-btn')).not.toBeNull();
      expect(document.getElementById('error-reload-btn')).not.toBeNull();
    });

    it('should escape HTML in error messages to prevent XSS', () => {
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: new Error('<script>alert("xss")</script>') },
      }));

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();
      // Should not contain raw script tags
      expect(overlay!.innerHTML).not.toContain('<script>');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'A'.repeat(300);
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: new Error(longMessage) },
      }));

      const overlay = document.getElementById('error-boundary-overlay');
      expect(overlay).not.toBeNull();
      // The source code does message.substring(0, 200), so the displayed text
      // should be shorter than the original 300-char message
      const monospaceText = overlay!.querySelector('p[style*="monospace"]');
      if (monospaceText) {
        // The full message was 300 chars, truncated to 200 should be noticeably shorter
        expect(monospaceText.textContent!.length).toBeLessThan(300);
      }
    });
  });

  describe('withErrorBoundary', () => {
    it('should return wrapped function', () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = mod.withErrorBoundary(fn, 'TestComponent', 'testOperation');
      expect(typeof wrapped).toBe('function');
    });

    it('should execute wrapped function and return result', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = mod.withErrorBoundary(fn, 'TestComponent', 'testOperation');
      const result = await wrapped();
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = mod.withErrorBoundary(fn, 'TestComponent', 'testOperation');
      await wrapped('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should re-throw error after logging', async () => {
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = mod.withErrorBoundary(fn, 'TestComponent', 'testOperation');
      await expect(wrapped()).rejects.toThrow('test error');
    });

    it('should call logError when function throws', async () => {
      const error = new Error('boundary error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = mod.withErrorBoundary(fn, 'MyComp', 'myOp');

      try {
        await wrapped();
      } catch {
        // Expected
      }

      expect(mockLogError).toHaveBeenCalledWith('MyComp', 'myOp', error);
    });

    it('should show error toast when function throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('test'));
      const wrapped = mod.withErrorBoundary(fn, 'Comp', 'op');

      try {
        await wrapped();
      } catch {
        // Expected
      }

      expect(mockShowToast).toHaveBeenCalledWith('operationFailed', 'error');
    });
  });

  describe('safeHandler', () => {
    it('should return a function', () => {
      const handler = vi.fn();
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      expect(typeof safe).toBe('function');
    });

    it('should execute handler on success', () => {
      const handler = vi.fn();
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      safe(new Event('click'));
      expect(handler).toHaveBeenCalled();
    });

    it('should pass event to handler', () => {
      const handler = vi.fn();
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      const mockEvent = new Event('click');
      safe(mockEvent);
      expect(handler).toHaveBeenCalledWith(mockEvent);
    });

    it('should not throw on handler error', () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      expect(() => safe(new Event('click'))).not.toThrow();
    });

    it('should log error when synchronous handler throws', () => {
      const error = new Error('sync handler error');
      const handler = vi.fn().mockImplementation(() => {
        throw error;
      });
      const safe = mod.safeHandler(handler, 'SyncComp', 'syncOp');
      safe(new Event('click'));

      expect(mockLogError).toHaveBeenCalledWith('SyncComp', 'syncOp', error);
    });

    it('should handle async handlers that resolve', async () => {
      const handler = vi.fn().mockResolvedValue('done');
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      safe(new Event('click'));
      expect(handler).toHaveBeenCalled();
    });

    it('should not throw on async handler rejection', () => {
      const handler = vi.fn().mockRejectedValue(new Error('async error'));
      const safe = mod.safeHandler(handler, 'TestComponent', 'testOperation');
      // Should not throw - error is caught internally
      expect(() => safe(new Event('click'))).not.toThrow();
    });

    it('should log error when async handler rejects', async () => {
      const error = new Error('async handler error');
      const handler = vi.fn().mockRejectedValue(error);
      const safe = mod.safeHandler(handler, 'AsyncComp', 'asyncOp');
      safe(new Event('click'));

      // Wait for the promise rejection to be handled
      await vi.waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith('AsyncComp', 'asyncOp', error);
      });
    });

    it('should handle handler that returns non-promise value', () => {
      const handler = vi.fn().mockReturnValue('sync result');
      const safe = mod.safeHandler(handler, 'Comp', 'op');
      expect(() => safe(new Event('click'))).not.toThrow();
    });

    it('should handle handler that returns undefined', () => {
      const handler = vi.fn().mockReturnValue(undefined);
      const safe = mod.safeHandler(handler, 'Comp', 'op');
      expect(() => safe(new Event('click'))).not.toThrow();
    });
  });

  describe('Error threshold detection', () => {
    beforeEach(() => {
      mod.initGlobalErrorHandlers();
    });

    it('should track errors within time window', () => {
      // 2 errors should not trigger overlay
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(new ErrorEvent('error', {
          message: `Error ${i}`,
          error: new Error(`error ${i}`),
        }));
      }
      expect(document.getElementById('error-boundary-overlay')).toBeNull();

      // 3rd error should trigger overlay
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'Error 3',
        error: new Error('error 3'),
      }));
      expect(document.getElementById('error-boundary-overlay')).not.toBeNull();
    });
  });
});
