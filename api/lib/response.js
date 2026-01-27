/**
 * Shared API Response Utilities
 * Centralizes CORS headers, security headers, and response formatting
 */

// CORS configuration - use environment variable or default to production domain
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';

/**
 * Set CORS headers on response
 * @param {Object} res - Response object
 * @param {string[]} methods - Allowed HTTP methods
 */
export function setCorsHeaders(res, methods = ['GET', 'POST', 'DELETE', 'OPTIONS']) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Set security headers on response
 * @param {Object} res - Response object
 */
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

/**
 * Set all standard headers (CORS + Security)
 * @param {Object} res - Response object
 * @param {string[]} methods - Allowed HTTP methods
 */
export function setStandardHeaders(res, methods = ['GET', 'POST', 'DELETE', 'OPTIONS']) {
  setCorsHeaders(res, methods);
  setSecurityHeaders(res);
}

/**
 * Handle CORS preflight request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string[]} methods - Allowed HTTP methods
 * @returns {boolean} True if this was a preflight request (caller should return)
 */
export function handlePreflight(req, res, methods = ['GET', 'POST', 'DELETE', 'OPTIONS']) {
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
 * @param {Object} res - Response object
 * @param {Object} data - Response data
 * @param {number} status - HTTP status code (default 200)
 */
export function sendSuccess(res, data, status = 200) {
  return res.status(status).json(data);
}

/**
 * Send an error JSON response
 * @param {Object} res - Response object
 * @param {string} error - Error message
 * @param {number} status - HTTP status code (default 500)
 * @param {Object} extra - Additional fields to include in response
 */
export function sendError(res, error, status = 500, extra = {}) {
  return res.status(status).json({ error, ...extra });
}

/**
 * Send a rate limit exceeded response
 * @param {Object} res - Response object
 * @param {number} retryAfter - Seconds until rate limit resets
 */
export function sendRateLimitExceeded(res, retryAfter) {
  return sendError(res, 'Too many requests. Please try again later.', 429, { retryAfter });
}

/**
 * Send an authentication required response
 * @param {Object} res - Response object
 * @param {string} message - Error message
 * @param {boolean} expired - Whether the token was expired
 */
export function sendAuthRequired(res, message = 'Authorization required', expired = false) {
  return sendError(res, message, 401, expired ? { expired: true } : {});
}

/**
 * Send a method not allowed response
 * @param {Object} res - Response object
 */
export function sendMethodNotAllowed(res) {
  return sendError(res, 'Method not allowed', 405);
}

/**
 * Send a bad request response
 * @param {Object} res - Response object
 * @param {string} message - Error message
 */
export function sendBadRequest(res, message) {
  return sendError(res, message, 400);
}

/**
 * Send a service unavailable response
 * @param {Object} res - Response object
 * @param {string} message - Error message
 */
export function sendServiceUnavailable(res, message = 'Service temporarily unavailable') {
  return sendError(res, message, 503);
}

/**
 * Set rate limit headers on response
 * @param {Object} res - Response object
 * @param {number} limit - Max requests allowed
 * @param {number} remaining - Remaining requests
 * @param {number} reset - Unix timestamp when limit resets
 */
export function setRateLimitHeaders(res, limit, remaining, reset) {
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);
}

/**
 * Get client IP from request
 * @param {Object} req - Request object
 * @returns {string} Client IP address
 */
export function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Safely parse JSON with a default value
 * @param {string} str - JSON string to parse
 * @param {*} defaultValue - Value to return if parsing fails
 * @returns {*} Parsed value or default
 */
export function safeJsonParse(str, defaultValue) {
  if (str === null || str === undefined || str === '') {
    return defaultValue;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

/**
 * Sanitize a string by truncating and removing dangerous characters
 * Removes: < > " ' & and control characters (matching client-side validation)
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized string
 */
export function sanitizeString(str, maxLength) {
  if (!str || typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[<>"'&]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '');
}
