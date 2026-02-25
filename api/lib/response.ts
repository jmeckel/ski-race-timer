/**
 * Shared API Response Utilities
 * Centralizes CORS headers, security headers, and response formatting
 */

import { createHash } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Standard HTTP methods used in API endpoints */
type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'OPTIONS' | 'PUT' | 'PATCH';

// CORS configuration - use environment variable or default to production domain
const ALLOWED_ORIGIN: string = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';

/**
 * Set CORS headers on response
 * @param res - Response object
 * @param methods - Allowed HTTP methods
 */
export function setCorsHeaders(res: VercelResponse, methods: HttpMethod[] = ['GET', 'POST', 'DELETE', 'OPTIONS']): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Set security headers on response
 * @param res - Response object
 */
export function setSecurityHeaders(res: VercelResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

/**
 * Set all standard headers (CORS + Security)
 * @param res - Response object
 * @param methods - Allowed HTTP methods
 */
export function setStandardHeaders(res: VercelResponse, methods: HttpMethod[] = ['GET', 'POST', 'DELETE', 'OPTIONS']): void {
  setCorsHeaders(res, methods);
  setSecurityHeaders(res);
}

/**
 * Handle CORS preflight request
 * @param req - Request object
 * @param res - Response object
 * @param methods - Allowed HTTP methods
 * @returns True if this was a preflight request (caller should return)
 */
export function handlePreflight(req: VercelRequest, res: VercelResponse, methods: HttpMethod[] = ['GET', 'POST', 'DELETE', 'OPTIONS']): boolean {
  if (req.method === 'OPTIONS') {
    setStandardHeaders(res, methods);
    res.status(200).end();
    return true;
  }
  setStandardHeaders(res, methods);
  return false;
}

/**
 * Send a success JSON response
 * @param res - Response object
 * @param data - Response data
 * @param status - HTTP status code (default 200)
 */
export function sendSuccess(res: VercelResponse, data: Record<string, unknown>, status: number = 200): void {
  res.status(status).json(data);
}

/**
 * Send an error JSON response
 * @param res - Response object
 * @param error - Error message
 * @param status - HTTP status code (default 500)
 * @param extra - Additional fields to include in response
 */
export function sendError(res: VercelResponse, error: string, status: number = 500, extra: Record<string, unknown> = {}): void {
  res.status(status).json({ error, ...extra });
}

/**
 * Send a rate limit exceeded response
 * @param res - Response object
 * @param retryAfter - Seconds until rate limit resets
 */
export function sendRateLimitExceeded(res: VercelResponse, retryAfter: number): void {
  sendError(res, 'Too many requests. Please try again later.', 429, { retryAfter });
}

/**
 * Send an authentication required response
 * @param res - Response object
 * @param message - Error message
 * @param expired - Whether the token was expired
 */
export function sendAuthRequired(res: VercelResponse, message: string = 'Authorization required', expired: boolean = false): void {
  sendError(res, message, 401, expired ? { expired: true } : {});
}

/**
 * Send a method not allowed response
 * @param res - Response object
 */
export function sendMethodNotAllowed(res: VercelResponse): void {
  sendError(res, 'Method not allowed', 405);
}

/**
 * Send a bad request response
 * @param res - Response object
 * @param message - Error message
 */
export function sendBadRequest(res: VercelResponse, message: string): void {
  sendError(res, message, 400);
}

/**
 * Send a service unavailable response
 * @param res - Response object
 * @param message - Error message
 */
export function sendServiceUnavailable(res: VercelResponse, message: string = 'Service temporarily unavailable'): void {
  sendError(res, message, 503);
}

/**
 * Set rate limit headers on response
 * @param res - Response object
 * @param limit - Max requests allowed
 * @param remaining - Remaining requests
 * @param reset - Unix timestamp when limit resets
 */
export function setRateLimitHeaders(res: VercelResponse, limit: number, remaining: number, reset: number): void {
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);
}

/**
 * Get client IP from request
 * @param req - Request object
 * @returns Client IP address
 */
export function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return forwardedStr.split(',')[0].trim();
  }
  return (req.headers['x-real-ip'] as string) || req.socket?.remoteAddress || 'unknown';
}

/**
 * Safely parse JSON with a default value
 * @param str - JSON string to parse
 * @param defaultValue - Value to return if parsing fails
 * @returns Parsed value or default
 */
export function safeJsonParse<T>(str: string | null | undefined, defaultValue: T): T {
  if (str === null || str === undefined || str === '') {
    return defaultValue;
  }
  try {
    return JSON.parse(str) as T;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    // Intentionally using console.error directly here to avoid circular import with apiLogger
    console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'JSON parse error', error: message }));
    return defaultValue;
  }
}

/**
 * Sanitize a string by truncating and removing dangerous characters
 * Removes: < > " ' & and control characters (matching client-side validation)
 * @param str - String to sanitize
 * @param maxLength - Maximum length
 * @returns Sanitized string
 */
export function sanitizeString(str: unknown, maxLength: number): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[<>&]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '');
}

/**
 * Generate an ETag from response data
 * @param data - Data to hash
 * @returns ETag string (quoted MD5 hash)
 */
export function generateETag(data: unknown): string {
  const hash = createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  return `"${hash}"`;
}

/**
 * Check If-None-Match header against ETag
 * Returns true if the client's cached version matches (304 should be returned)
 * @param req - Vercel request object
 * @param etag - Generated ETag to compare against
 * @returns True if client cache is still valid
 */
export function checkIfNoneMatch(req: VercelRequest, etag: string): boolean {
  const ifNoneMatch = req.headers['if-none-match'];
  if (!ifNoneMatch) return false;
  const clientEtag = Array.isArray(ifNoneMatch) ? ifNoneMatch[0] : ifNoneMatch;
  return clientEtag === etag;
}
