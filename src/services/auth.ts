/**
 * Authentication Service
 * Handles JWT token management and PIN authentication
 */

import { logger } from '../utils/logger';
import { storage } from './storage';

export const AUTH_TOKEN_KEY = 'skiTimerAuthToken';

/**
 * Decode a base64url-encoded string (JWT uses base64url, not standard base64)
 */
function decodeBase64Url(str: string): string {
  // Replace base64url chars with standard base64 chars
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' to make length a multiple of 4
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return atob(base64);
}

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(): HeadersInit {
  const token = storage.getRaw(AUTH_TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Check if we have a valid (non-expired) auth token
 */
export function hasAuthToken(): boolean {
  const token = storage.getRaw(AUTH_TOKEN_KEY);
  if (!token) return false;

  // Check JWT expiry if token is parseable
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(decodeBase64Url(parts[1]!));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return false;
      }
    }
  } catch {
    // Can't parse - let server decide validity
  }
  return true;
}

/**
 * Store auth token
 */
export function setAuthToken(token: string): void {
  storage.setRaw(AUTH_TOKEN_KEY, token);
  storage.flush();
}

/**
 * Clear auth token (on expiry or logout)
 */
export function clearAuthToken(): void {
  storage.remove(AUTH_TOKEN_KEY);
  storage.flush();
}

/**
 * Get the stored auth token
 */
export function getAuthToken(): string | null {
  return storage.getRaw(AUTH_TOKEN_KEY);
}

// Token exchange timeout in milliseconds
const TOKEN_EXCHANGE_TIMEOUT_MS = 10000;

/**
 * Exchange PIN for JWT token
 */
export async function exchangePinForToken(
  pin: string,
  role?: 'timer' | 'gateJudge' | 'chiefJudge',
): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  isNewPin?: boolean;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TOKEN_EXCHANGE_TIMEOUT_MS,
  );

  try {
    const response = await fetch('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, role }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Authentication failed' };
    }

    if (data.token) {
      setAuthToken(data.token);
      return { success: true, token: data.token, isNewPin: data.isNewPin };
    }

    return { success: false, error: 'No token received' };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Token exchange timeout');
      return { success: false, error: 'Request timeout' };
    }

    logger.error('Token exchange error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Dispatch auth expired event for UI to handle
 */
export function dispatchAuthExpired(
  message: string = 'Session expired. Please re-enter your PIN.',
): void {
  window.dispatchEvent(
    new CustomEvent('auth-expired', {
      detail: { message },
    }),
  );
}

/**
 * Exchange Chief Judge PIN for JWT token
 * Chief Judge uses a separate PIN from regular users
 */
export async function exchangeChiefJudgePin(pin: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  isNewPin?: boolean;
}> {
  return exchangePinForToken(pin, 'chiefJudge');
}

/**
 * Get the role from the current JWT token (if present)
 * Returns null if no token or can't parse
 */
export function getTokenRole(): string | null {
  const token = getAuthToken();
  if (!token) return null;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url payload
    const payload = JSON.parse(decodeBase64Url(parts[1]!));
    return payload.role || null;
  } catch {
    return null;
  }
}

/**
 * Check if current token has chief judge role
 */
export function hasChiefJudgeRole(): boolean {
  return getTokenRole() === 'chiefJudge';
}
