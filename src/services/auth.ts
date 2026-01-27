/**
 * Authentication Service
 * Handles JWT token management and PIN authentication
 */

import { logger } from '../utils/logger';

export const AUTH_TOKEN_KEY = 'skiTimerAuthToken';

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

/**
 * Check if we have a valid auth token
 */
export function hasAuthToken(): boolean {
  return !!localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Store auth token
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Clear auth token (on expiry or logout)
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Get the stored auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Exchange PIN for JWT token
 */
export async function exchangePinForToken(pin: string, role?: 'timer' | 'gateJudge' | 'chiefJudge'): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  isNewPin?: boolean;
}> {
  try {
    const response = await fetch('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, role })
    });

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
    logger.error('Token exchange error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Dispatch auth expired event for UI to handle
 */
export function dispatchAuthExpired(message: string = 'Session expired. Please re-enter your PIN.'): void {
  window.dispatchEvent(new CustomEvent('auth-expired', {
    detail: { message }
  }));
}
