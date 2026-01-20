/**
 * Unit Tests for Error Boundary Utility
 * Tests: initGlobalErrorHandlers, cleanupGlobalErrorHandlers, withErrorBoundary, safeHandler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initGlobalErrorHandlers,
  cleanupGlobalErrorHandlers,
  withErrorBoundary,
  safeHandler
} from '../../../src/utils/errorBoundary';

// Mock the dependencies
vi.mock('../../../src/components', () => ({
  showToast: vi.fn()
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => ({ currentLang: 'en' })
  }
}));

vi.mock('../../../src/utils/errors', () => ({
  logError: vi.fn(),
  logCritical: vi.fn()
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: (key: string) => key
}));

describe('Error Boundary Utility', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupGlobalErrorHandlers();
    consoleLogSpy.mockRestore();
    // Remove any error UI elements
    document.getElementById('error-boundary-overlay')?.remove();
  });

  describe('initGlobalErrorHandlers', () => {
    it('should set up window error handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      initGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should set up unhandled rejection handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      initGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should log initialization message', () => {
      initGlobalErrorHandlers();
      expect(consoleLogSpy).toHaveBeenCalledWith('[ErrorBoundary] Global error handlers initialized');
    });
  });

  describe('cleanupGlobalErrorHandlers', () => {
    it('should remove window error handler', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      initGlobalErrorHandlers();
      cleanupGlobalErrorHandlers();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('should remove unhandled rejection handler', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      initGlobalErrorHandlers();
      cleanupGlobalErrorHandlers();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('withErrorBoundary', () => {
    it('should return wrapped function', () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = withErrorBoundary(fn, 'TestComponent', 'testOperation');
      expect(typeof wrapped).toBe('function');
    });

    it('should execute wrapped function and return result', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = withErrorBoundary(fn, 'TestComponent', 'testOperation');
      const result = await wrapped();
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = withErrorBoundary(fn, 'TestComponent', 'testOperation');
      await wrapped('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should re-throw error after logging', async () => {
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = withErrorBoundary(fn, 'TestComponent', 'testOperation');
      await expect(wrapped()).rejects.toThrow('test error');
    });
  });

  describe('safeHandler', () => {
    it('should return a function', () => {
      const handler = vi.fn();
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      expect(typeof safe).toBe('function');
    });

    it('should execute handler on success', () => {
      const handler = vi.fn();
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      safe(new Event('click'));
      expect(handler).toHaveBeenCalled();
    });

    it('should pass event to handler', () => {
      const handler = vi.fn();
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      const mockEvent = new Event('click');
      safe(mockEvent);
      expect(handler).toHaveBeenCalledWith(mockEvent);
    });

    it('should not throw on handler error', () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      expect(() => safe(new Event('click'))).not.toThrow();
    });

    it('should handle async handlers that resolve', async () => {
      const handler = vi.fn().mockResolvedValue('done');
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      safe(new Event('click'));
      expect(handler).toHaveBeenCalled();
    });

    it('should not throw on async handler rejection', () => {
      const handler = vi.fn().mockRejectedValue(new Error('async error'));
      const safe = safeHandler(handler, 'TestComponent', 'testOperation');
      // Should not throw - error is caught internally
      expect(() => safe(new Event('click'))).not.toThrow();
    });
  });
});
