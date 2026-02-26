import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { apiLogger } from '../../lib/apiLogger.js';
import {
  CHIEF_JUDGE_PIN_KEY,
  CLIENT_PIN_KEY,
  getRedis,
  hasRedisError,
} from '../../lib/redis.js';
import {
  getClientIP,
  handlePreflight,
  sendError,
  sendMethodNotAllowed,
  sendRateLimitExceeded,
  sendServiceUnavailable,
  sendSuccess,
  setCorsHeaders,
  setRateLimitHeaders,
  setSecurityHeaders,
} from '../../lib/response.js';
import { checkRateLimit } from '../../lib/validation.js';

// Rate limiting for PIN reset (critical security endpoint)
const RESET_PIN_RATE_LIMIT = {
  keyPrefix: 'reset-pin',
  window: 60,
  maxRequests: 3,
  maxPosts: 3,
} as const;

interface ResetPinRequestBody {
  serverPin?: string;
}

/**
 * Reset PIN endpoint
 * Requires SERVER_API_PIN in request body (serverPin field) for authorization
 * Deletes the stored PIN hash, allowing the next PIN entry to become the new PIN
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    handlePreflight(req, res, ['POST', 'OPTIONS']);
    return;
  }

  // Set headers for non-preflight requests
  setCorsHeaders(res, ['POST', 'OPTIONS']);
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  // Parse request body
  const { serverPin: providedPin } = (req.body || {}) as ResetPinRequestBody;

  const serverPin = process.env.SERVER_API_PIN;

  if (!serverPin) {
    // Don't expose internal configuration details
    apiLogger.error('SERVER_API_PIN not configured');
    return sendError(res, 'Service configuration error', 500);
  }

  if (!providedPin) {
    return sendError(res, 'Authorization required', 401);
  }

  let client: Redis;
  try {
    client = getRedis();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Redis initialization error', { error: message });
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(
      res,
      'Database connection issue. Please try again.',
    );
  }

  // Rate limiting BEFORE PIN verification to prevent brute-force
  const clientIP = getClientIP(req);

  const rateLimit = await checkRateLimit(
    client,
    clientIP,
    req.method!,
    RESET_PIN_RATE_LIMIT,
  );
  setRateLimitHeaders(
    res,
    rateLimit.limit,
    rateLimit.remaining,
    rateLimit.reset,
  );
  if (!rateLimit.allowed) {
    apiLogger.warn('PIN reset rate limit exceeded', { ip: clientIP });
    if (rateLimit.error) {
      return sendServiceUnavailable(res, 'Rate limiting unavailable');
    }
    return sendRateLimitExceeded(
      res,
      rateLimit.reset - Math.floor(Date.now() / 1000),
    );
  }

  // Verify SERVER_API_PIN with timing-safe comparison (after rate limit)
  // Hash both values to fixed-length digests to avoid timing side-channel from length differences
  let pinValid = false;
  try {
    const serverDigest = crypto.createHash('sha256').update(serverPin).digest();
    const providedDigest = crypto
      .createHash('sha256')
      .update(providedPin)
      .digest();
    pinValid = crypto.timingSafeEqual(serverDigest, providedDigest);
  } catch {
    pinValid = false;
  }

  if (!pinValid) {
    return sendError(res, 'Authorization required', 401);
  }

  try {
    // Delete both PIN hashes (regular and chief judge)
    await client.del(CLIENT_PIN_KEY);
    await client.del(CHIEF_JUDGE_PIN_KEY);

    apiLogger.info('Client PIN and Chief Judge PIN have been reset');

    return sendSuccess(res, {
      success: true,
      message:
        'PINs have been reset. The next PINs entered will become the new PINs.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Reset PIN error', { error: message });
    return sendError(res, 'Internal server error', 500);
  }
}
