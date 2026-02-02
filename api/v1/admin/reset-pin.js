import crypto from 'crypto';
import { getRedis, hasRedisError, CLIENT_PIN_KEY, CHIEF_JUDGE_PIN_KEY } from '../../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendRateLimitExceeded,
  setCorsHeaders,
  setSecurityHeaders
} from '../../lib/response.js';

// Rate limiting for PIN reset (critical security endpoint)
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 3; // Only 3 attempts per minute per IP

/**
 * Check rate limit for PIN reset attempts
 */
async function checkRateLimit(client, clientIP) {
  const key = `reset-pin:rate:${clientIP}`;

  try {
    const current = await client.incr(key);
    if (current === 1) {
      await client.expire(key, RATE_LIMIT_WINDOW);
    }
    return {
      allowed: current <= RATE_LIMIT_MAX_ATTEMPTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - current)
    };
  } catch (error) {
    console.error('Rate limit check failed:', error.message);
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS };
  }
}

/**
 * Reset PIN endpoint
 * Requires SERVER_API_PIN in X-Server-Pin header for authorization
 * Deletes the stored PIN hash, allowing the next PIN entry to become the new PIN
 */
export default async function handler(req, res) {
  // Handle CORS preflight - note custom header for X-Server-Pin
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, ['POST', 'OPTIONS']);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Server-Pin');
    setSecurityHeaders(res);
    return res.status(200).end();
  }

  // Set headers for non-preflight requests
  setCorsHeaders(res, ['POST', 'OPTIONS']);
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  // Verify SERVER_API_PIN with timing-safe comparison
  const serverPin = process.env.SERVER_API_PIN;
  const providedPin = req.headers['x-server-pin'];

  if (!serverPin) {
    // Don't expose internal configuration details
    console.error('SERVER_API_PIN not configured');
    return sendError(res, 'Service configuration error', 500);
  }

  if (!providedPin) {
    return sendError(res, 'Authorization required', 401);
  }

  // Use timing-safe comparison to prevent timing attacks
  let pinValid = false;
  try {
    const serverPinBuffer = Buffer.from(serverPin, 'utf8');
    const providedPinBuffer = Buffer.from(providedPin, 'utf8');
    // Only compare if lengths match (timingSafeEqual requires equal lengths)
    if (serverPinBuffer.length === providedPinBuffer.length) {
      pinValid = crypto.timingSafeEqual(serverPinBuffer, providedPinBuffer);
    }
  } catch {
    pinValid = false;
  }

  if (!pinValid) {
    return sendError(res, 'Authorization required', 401);
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  // Rate limiting (critical security endpoint)
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress ||
                   'unknown';

  const rateLimit = await checkRateLimit(client, clientIP);
  if (!rateLimit.allowed) {
    console.log(`[RATE_LIMIT] PIN reset rate limit exceeded: ip=${clientIP}`);
    return sendRateLimitExceeded(res, RATE_LIMIT_WINDOW);
  }

  try {
    // Delete both PIN hashes (regular and chief judge)
    await client.del(CLIENT_PIN_KEY);
    await client.del(CHIEF_JUDGE_PIN_KEY);

    console.log('Client PIN and Chief Judge PIN have been reset');

    return sendSuccess(res, {
      success: true,
      message: 'PINs have been reset. The next PINs entered will become the new PINs.'
    });
  } catch (error) {
    console.error('Reset PIN error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
