/**
 * Centralized error handling utilities
 * Provides consistent error codes, logging, and user notifications
 */

import { showToast } from '../components';
import { t } from '../i18n/translations';
import { store } from '../store';

// ===== Error Codes =====

export const ErrorCode = {
  // Validation errors (4xx)
  MISSING_RACE_ID: 'MISSING_RACE_ID',
  INVALID_RACE_ID: 'INVALID_RACE_ID',
  INVALID_ENTRY: 'INVALID_ENTRY',
  INVALID_PIN: 'INVALID_PIN',
  MISSING_PIN: 'MISSING_PIN',

  // Authentication (401)
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Rate limiting (429)
  RATE_LIMIT: 'RATE_LIMIT',

  // Not found (404)
  RACE_NOT_FOUND: 'RACE_NOT_FOUND',

  // Service errors (5xx)
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  DATABASE_TIMEOUT: 'DATABASE_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Client-side errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  STORAGE_QUOTA: 'STORAGE_QUOTA',
  CAMERA_ERROR: 'CAMERA_ERROR',
  GPS_ERROR: 'GPS_ERROR',
  SYNC_ERROR: 'SYNC_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// ===== Error Severity =====

export const ErrorSeverity = {
  CRITICAL: 'critical',  // Data loss risk, auth failures
  ERROR: 'error',        // Network failures, validation errors
  WARNING: 'warning',    // Duplicates, fallbacks used
  INFO: 'info',          // Status changes
} as const;

export type ErrorSeverityType = typeof ErrorSeverity[keyof typeof ErrorSeverity];

// ===== Toast Durations =====

export const TOAST_DURATION = {
  CRITICAL: 8000,
  ERROR: 5000,
  WARNING: 4000,
  INFO: 3000,
} as const;

// ===== Error Context =====

export interface ErrorContext {
  component: string;
  operation: string;
  severity: ErrorSeverityType;
  code?: ErrorCodeType;
  error?: Error | unknown;
  userMessageKey?: string;
  metadata?: Record<string, unknown>;
}

// ===== API Error Response =====

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
    retryAfter?: number;
  };
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ===== Error Logging =====

function formatLogMessage(context: ErrorContext): string {
  return `[${context.component}] ${context.operation}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

// ===== Main Error Handler =====

/**
 * Centralized error handler
 * Logs errors consistently and optionally shows user notification
 */
export function handleError(context: ErrorContext): void {
  const message = formatLogMessage(context);
  const errorMessage = context.error ? getErrorMessage(context.error) : 'No error details';

  // Log based on severity
  const logData = {
    code: context.code,
    message: errorMessage,
    timestamp: new Date().toISOString(),
    ...context.metadata,
  };

  switch (context.severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.ERROR:
      console.error(`${message}:`, errorMessage, logData);
      break;
    case ErrorSeverity.WARNING:
      console.warn(`${message}:`, errorMessage, logData);
      break;
    case ErrorSeverity.INFO:
      console.log(`${message}:`, errorMessage, logData);
      break;
  }

  // Show toast if user message key provided
  if (context.userMessageKey) {
    const lang = store.getState().currentLang;
    const userMessage = t(context.userMessageKey, lang);
    const toastType = mapSeverityToToastType(context.severity);
    const duration = TOAST_DURATION[context.severity.toUpperCase() as keyof typeof TOAST_DURATION] || TOAST_DURATION.ERROR;

    showToast(userMessage, toastType, duration);
  }

  // Dispatch custom event for critical errors
  if (context.severity === ErrorSeverity.CRITICAL) {
    window.dispatchEvent(new CustomEvent('critical-error', { detail: context }));
  }
}

function mapSeverityToToastType(severity: ErrorSeverityType): 'success' | 'error' | 'warning' | 'info' {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.ERROR:
      return 'error';
    case ErrorSeverity.WARNING:
      return 'warning';
    case ErrorSeverity.INFO:
      return 'info';
    default:
      return 'error';
  }
}

// ===== Convenience Functions =====

/**
 * Log and show error toast
 */
export function logError(
  component: string,
  operation: string,
  error: unknown,
  userMessageKey?: string
): void {
  handleError({
    component,
    operation,
    severity: ErrorSeverity.ERROR,
    error,
    userMessageKey,
  });
}

/**
 * Log and show warning toast
 */
export function logWarning(
  component: string,
  operation: string,
  error: unknown,
  userMessageKey?: string
): void {
  handleError({
    component,
    operation,
    severity: ErrorSeverity.WARNING,
    error,
    userMessageKey,
  });
}

/**
 * Log critical error (storage, data loss)
 */
export function logCritical(
  component: string,
  operation: string,
  error: unknown,
  userMessageKey?: string
): void {
  handleError({
    component,
    operation,
    severity: ErrorSeverity.CRITICAL,
    error,
    userMessageKey,
  });
}

// ===== API Error Helpers =====

/**
 * Check if response is an API error
 */
export function isApiError(response: ApiResponse): response is ApiErrorResponse {
  return !response.success;
}

/**
 * Create standardized API error response (for use in API handlers)
 */
export function createApiError(
  code: string,
  message: string,
  statusCode: number,
  details?: string,
  retryAfter?: number
): { status: number; body: ApiErrorResponse } {
  return {
    status: statusCode,
    body: {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
        ...(retryAfter && { retryAfter }),
      },
    },
  };
}

/**
 * Create standardized API success response
 */
export function createApiSuccess<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

// ===== Network Error Detection =====

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') ||
           msg.includes('failed to fetch') ||
           msg.includes('econnrefused') ||
           msg.includes('etimedout');
  }
  return false;
}

/**
 * Check if error is a timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('etimedout');
  }
  return false;
}

// ===== Fetch with Timeout =====

/** Default timeout in milliseconds */
export const DEFAULT_FETCH_TIMEOUT = 10000; // 10 seconds

/** Timeout error class */
export class FetchTimeoutError extends Error {
  constructor(url: string, timeout: number) {
    super(`Request to ${url} timed out after ${timeout}ms`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * Fetch with timeout support
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns Promise<Response>
 * @throws FetchTimeoutError if request times out
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeout);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
