/**
 * Unit Tests for Error Handling Utilities
 * Tests: ErrorCode, ErrorSeverity, TOAST_DURATION, handleError, logError, logWarning,
 *        logCritical, isApiError, createApiError, createApiSuccess, isNetworkError,
 *        isTimeoutError, FetchTimeoutError, fetchWithTimeout, mapSeverityToToastType
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from '../../../src/utils/errors';
import {
  createApiError,
  createApiSuccess,
  DEFAULT_FETCH_TIMEOUT,
  ErrorCode,
  ErrorSeverity,
  FetchTimeoutError,
  fetchWithTimeout,
  handleError,
  isApiError,
  isNetworkError,
  isTimeoutError,
  logCritical,
  logError,
  logWarning,
  TOAST_DURATION,
} from '../../../src/utils/errors';

// Mock dependencies
const mockShowToast = vi.fn();
vi.mock('../../../src/components', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => ({ currentLang: 'en' }),
  },
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: (key: string) => `translated_${key}`,
}));

describe('Error Handling Utilities', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockShowToast.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('ErrorCode constants', () => {
    it('should define validation error codes', () => {
      expect(ErrorCode.MISSING_RACE_ID).toBe('MISSING_RACE_ID');
      expect(ErrorCode.INVALID_RACE_ID).toBe('INVALID_RACE_ID');
      expect(ErrorCode.INVALID_ENTRY).toBe('INVALID_ENTRY');
      expect(ErrorCode.INVALID_PIN).toBe('INVALID_PIN');
      expect(ErrorCode.MISSING_PIN).toBe('MISSING_PIN');
    });

    it('should define auth error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });

    it('should define rate limit error code', () => {
      expect(ErrorCode.RATE_LIMIT).toBe('RATE_LIMIT');
    });

    it('should define not found error code', () => {
      expect(ErrorCode.RACE_NOT_FOUND).toBe('RACE_NOT_FOUND');
    });

    it('should define service error codes', () => {
      expect(ErrorCode.DATABASE_UNAVAILABLE).toBe('DATABASE_UNAVAILABLE');
      expect(ErrorCode.DATABASE_TIMEOUT).toBe('DATABASE_TIMEOUT');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should define client error codes', () => {
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.STORAGE_ERROR).toBe('STORAGE_ERROR');
      expect(ErrorCode.STORAGE_QUOTA).toBe('STORAGE_QUOTA');
      expect(ErrorCode.CAMERA_ERROR).toBe('CAMERA_ERROR');
      expect(ErrorCode.GPS_ERROR).toBe('GPS_ERROR');
      expect(ErrorCode.SYNC_ERROR).toBe('SYNC_ERROR');
    });
  });

  describe('ErrorSeverity constants', () => {
    it('should define all severity levels', () => {
      expect(ErrorSeverity.CRITICAL).toBe('critical');
      expect(ErrorSeverity.ERROR).toBe('error');
      expect(ErrorSeverity.WARNING).toBe('warning');
      expect(ErrorSeverity.INFO).toBe('info');
    });
  });

  describe('TOAST_DURATION constants', () => {
    it('should define durations for all severity levels', () => {
      expect(TOAST_DURATION.CRITICAL).toBe(8000);
      expect(TOAST_DURATION.ERROR).toBe(5000);
      expect(TOAST_DURATION.WARNING).toBe(4000);
      expect(TOAST_DURATION.INFO).toBe(3000);
    });
  });

  describe('handleError', () => {
    it('should log critical errors with console.error', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.CRITICAL,
        error: new Error('critical failure'),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'critical failure',
        expect.objectContaining({ message: 'critical failure' }),
      );
    });

    it('should log regular errors with console.error', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: new Error('regular error'),
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log warnings with console.warn', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.WARNING,
        error: new Error('warning'),
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'warning',
        expect.objectContaining({ message: 'warning' }),
      );
    });

    it('should log info with console.log', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.INFO,
        error: new Error('info message'),
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'info message',
        expect.objectContaining({ message: 'info message' }),
      );
    });

    it('should handle string errors', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: 'string error message',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'string error message',
        expect.any(Object),
      );
    });

    it('should handle unknown error types', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: 42,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'Unknown error',
        expect.any(Object),
      );
    });

    it('should handle null error as no error details', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: null,
      });

      // null is falsy, so it falls into the "no error" branch
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'No error details',
        expect.any(Object),
      );
    });

    it('should handle context without error', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'No error details',
        expect.any(Object),
      );
    });

    it('should include error code in log data', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        code: ErrorCode.NETWORK_ERROR,
        error: new Error('network down'),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ code: 'NETWORK_ERROR' }),
      );
    });

    it('should include metadata in log data', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: new Error('test'),
        metadata: { raceId: 'RACE001', attempt: 3 },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ raceId: 'RACE001', attempt: 3 }),
      );
    });

    it('should show toast when userMessageKey is provided', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: new Error('test'),
        userMessageKey: 'syncError',
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_syncError',
        'error',
        TOAST_DURATION.ERROR,
      );
    });

    it('should not show toast when userMessageKey is not provided', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: new Error('test'),
      });

      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('should show warning toast for warning severity', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.WARNING,
        error: new Error('test'),
        userMessageKey: 'duplicateWarning',
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_duplicateWarning',
        'warning',
        TOAST_DURATION.WARNING,
      );
    });

    it('should show info toast for info severity', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.INFO,
        error: new Error('test'),
        userMessageKey: 'saved',
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_saved',
        'info',
        TOAST_DURATION.INFO,
      );
    });

    it('should show error toast for critical severity', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.CRITICAL,
        error: new Error('test'),
        userMessageKey: 'syncError',
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_syncError',
        'error',
        TOAST_DURATION.CRITICAL,
      );
    });

    it('should dispatch critical-error event for critical severity', () => {
      const eventHandler = vi.fn();
      window.addEventListener('critical-error', eventHandler);

      try {
        handleError({
          component: 'TestComp',
          operation: 'testOp',
          severity: ErrorSeverity.CRITICAL,
          error: new Error('critical'),
        });

        expect(eventHandler).toHaveBeenCalled();
        const detail = (eventHandler.mock.calls[0][0] as CustomEvent).detail;
        expect(detail.component).toBe('TestComp');
        expect(detail.severity).toBe('critical');
      } finally {
        window.removeEventListener('critical-error', eventHandler);
      }
    });

    it('should not dispatch critical-error event for non-critical severity', () => {
      const eventHandler = vi.fn();
      window.addEventListener('critical-error', eventHandler);

      try {
        handleError({
          component: 'TestComp',
          operation: 'testOp',
          severity: ErrorSeverity.ERROR,
          error: new Error('not critical'),
        });

        expect(eventHandler).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('critical-error', eventHandler);
      }
    });

    it('should include timestamp in log data', () => {
      handleError({
        component: 'TestComp',
        operation: 'testOp',
        severity: ErrorSeverity.ERROR,
        error: new Error('test'),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ timestamp: expect.any(String) }),
      );
    });
  });

  describe('logError', () => {
    it('should call handleError with ERROR severity', () => {
      const error = new Error('test error');
      logError('TestComp', 'testOp', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'test error',
        expect.any(Object),
      );
    });

    it('should pass userMessageKey to handleError', () => {
      logError('TestComp', 'testOp', new Error('test'), 'syncError');

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_syncError',
        'error',
        TOAST_DURATION.ERROR,
      );
    });

    it('should work without userMessageKey', () => {
      logError('TestComp', 'testOp', new Error('test'));

      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('logWarning', () => {
    it('should call handleError with WARNING severity', () => {
      const error = new Error('test warning');
      logWarning('TestComp', 'testOp', error);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'test warning',
        expect.any(Object),
      );
    });

    it('should pass userMessageKey to handleError', () => {
      logWarning('TestComp', 'testOp', new Error('test'), 'duplicateWarning');

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_duplicateWarning',
        'warning',
        TOAST_DURATION.WARNING,
      );
    });
  });

  describe('logCritical', () => {
    it('should call handleError with CRITICAL severity', () => {
      const error = new Error('critical error');
      logCritical('TestComp', 'testOp', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestComp] testOp:',
        'critical error',
        expect.any(Object),
      );
    });

    it('should dispatch critical-error event', () => {
      const eventHandler = vi.fn();
      window.addEventListener('critical-error', eventHandler);

      try {
        logCritical('TestComp', 'testOp', new Error('critical'));
        expect(eventHandler).toHaveBeenCalled();
      } finally {
        window.removeEventListener('critical-error', eventHandler);
      }
    });

    it('should pass userMessageKey to handleError', () => {
      logCritical('TestComp', 'testOp', new Error('test'), 'syncError');

      expect(mockShowToast).toHaveBeenCalledWith(
        'translated_syncError',
        'error',
        TOAST_DURATION.CRITICAL,
      );
    });
  });

  describe('isApiError', () => {
    it('should return true for error responses', () => {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: { code: 'TEST_ERROR', message: 'test' },
      };
      expect(isApiError(errorResponse)).toBe(true);
    });

    it('should return false for success responses', () => {
      const successResponse: ApiSuccessResponse = {
        success: true,
        data: { test: true },
      };
      expect(isApiError(successResponse)).toBe(false);
    });
  });

  describe('createApiError', () => {
    it('should create error response with required fields', () => {
      const result = createApiError('INVALID_PIN', 'Invalid PIN', 400);

      expect(result.status).toBe(400);
      expect(result.body.success).toBe(false);
      expect(result.body.error.code).toBe('INVALID_PIN');
      expect(result.body.error.message).toBe('Invalid PIN');
    });

    it('should include details when provided', () => {
      const result = createApiError('TEST', 'msg', 400, 'extra details');

      expect(result.body.error.details).toBe('extra details');
    });

    it('should not include details when not provided', () => {
      const result = createApiError('TEST', 'msg', 400);

      expect(result.body.error.details).toBeUndefined();
    });

    it('should include retryAfter when provided', () => {
      const result = createApiError(
        'RATE_LIMIT',
        'Too many requests',
        429,
        undefined,
        60,
      );

      expect(result.body.error.retryAfter).toBe(60);
    });

    it('should not include retryAfter when not provided', () => {
      const result = createApiError('TEST', 'msg', 400);

      expect(result.body.error.retryAfter).toBeUndefined();
    });

    it('should handle various status codes', () => {
      expect(createApiError('A', 'a', 401).status).toBe(401);
      expect(createApiError('B', 'b', 404).status).toBe(404);
      expect(createApiError('C', 'c', 500).status).toBe(500);
      expect(createApiError('D', 'd', 503).status).toBe(503);
    });
  });

  describe('createApiSuccess', () => {
    it('should create success response with data', () => {
      const result = createApiSuccess({ entries: [] });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ entries: [] });
    });

    it('should handle various data types', () => {
      expect(createApiSuccess(42).data).toBe(42);
      expect(createApiSuccess('hello').data).toBe('hello');
      expect(createApiSuccess(null).data).toBeNull();
      expect(createApiSuccess([1, 2, 3]).data).toEqual([1, 2, 3]);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for TypeError with fetch in message', () => {
      expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('should return true for Error with "network" in message', () => {
      expect(isNetworkError(new Error('network error occurred'))).toBe(true);
    });

    it('should return true for Error with "failed to fetch" in message', () => {
      expect(isNetworkError(new Error('failed to fetch data'))).toBe(true);
    });

    it('should return true for Error with "econnrefused" in message', () => {
      expect(isNetworkError(new Error('connect ECONNREFUSED'))).toBe(true);
    });

    it('should return true for Error with "etimedout" in message', () => {
      expect(isNetworkError(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isNetworkError(new Error('some random error'))).toBe(false);
    });

    it('should return false for non-Error types', () => {
      expect(isNetworkError('string error')).toBe(false);
      expect(isNetworkError(42)).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });

    it('should return false for TypeError without fetch in message', () => {
      expect(isNetworkError(new TypeError('Cannot read property'))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('should return true for Error with "timeout" in message', () => {
      expect(isTimeoutError(new Error('Request timeout'))).toBe(true);
    });

    it('should return true for Error with "etimedout" in message', () => {
      expect(isTimeoutError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isTimeoutError(new Error('some other error'))).toBe(false);
    });

    it('should return false for non-Error types', () => {
      expect(isTimeoutError('timeout string')).toBe(false);
      expect(isTimeoutError(42)).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError(undefined)).toBe(false);
    });
  });

  describe('FetchTimeoutError', () => {
    it('should create error with correct message', () => {
      const error = new FetchTimeoutError('https://api.example.com', 5000);

      expect(error.message).toBe(
        'Request to https://api.example.com timed out after 5000ms',
      );
      expect(error.name).toBe('FetchTimeoutError');
    });

    it('should be an instance of Error', () => {
      const error = new FetchTimeoutError('https://api.example.com', 5000);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof FetchTimeoutError).toBe(true);
    });
  });

  describe('DEFAULT_FETCH_TIMEOUT', () => {
    it('should be 10 seconds', () => {
      expect(DEFAULT_FETCH_TIMEOUT).toBe(10000);
    });
  });

  describe('fetchWithTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return response on successful fetch', async () => {
      const mockResponse = new Response('ok', { status: 200 });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const response = await fetchWithTimeout('https://api.example.com/test');

      expect(response.status).toBe(200);
      vi.mocked(globalThis.fetch).mockRestore();
    });

    it('should pass options to fetch', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('ok'));

      await fetchWithTimeout('https://api.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: expect.any(AbortSignal),
        }),
      );
      fetchSpy.mockRestore();
    });

    it('should throw FetchTimeoutError on abort', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            (options?.signal as AbortSignal)?.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );

      const promise = fetchWithTimeout(
        'https://api.example.com/slow',
        {},
        1000,
      );
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(FetchTimeoutError);
      await expect(promise).rejects.toThrow('timed out after 1000ms');

      vi.mocked(globalThis.fetch).mockRestore();
    });

    it('should re-throw non-abort errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError);

      await expect(fetchWithTimeout('https://api.example.com')).rejects.toThrow(
        'Failed to fetch',
      );

      vi.mocked(globalThis.fetch).mockRestore();
    });

    it('should use default timeout when not specified', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('ok'));

      await fetchWithTimeout('https://api.example.com');

      // The default timeout is 10000ms - we just verify fetch was called
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should clear timeout after successful fetch', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

      await fetchWithTimeout('https://api.example.com');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
      vi.mocked(globalThis.fetch).mockRestore();
    });

    it('should clear timeout after fetch error', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error'),
      );

      try {
        await fetchWithTimeout('https://api.example.com');
      } catch {
        // Expected
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
      vi.mocked(globalThis.fetch).mockRestore();
    });
  });
});
