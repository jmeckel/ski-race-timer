/**
 * Shared API Validation Utilities
 * Extracted from sync.js and faults.js to eliminate duplication
 */

// Shared constants
export const MAX_RACE_ID_LENGTH = 50;
export const MAX_DEVICE_NAME_LENGTH = 100;

// Fault type constants
export const VALID_FAULT_TYPES = ['MG', 'STR', 'BR'];

/**
 * Validate race ID format.
 * Race IDs are CASE-INSENSITIVE - they are normalized to lowercase internally.
 */
export function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

/**
 * Check rate limit using Redis
 * @param {Object} client - Redis client
 * @param {string} ip - Client IP
 * @param {string} method - HTTP method
 * @param {Object} config - Rate limit configuration
 * @param {string} config.keyPrefix - Redis key prefix (e.g., 'sync', 'faults')
 * @param {number} config.window - Rate limit window in seconds
 * @param {number} config.maxRequests - Max GET requests per window
 * @param {number} config.maxPosts - Max POST requests per window
 */
export async function checkRateLimit(client, ip, method, config) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % config.window);
  const limit = method === 'POST' ? config.maxPosts : config.maxRequests;
  const key = `ratelimit:${config.keyPrefix}:${method}:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, config.window + 10);
    const results = await multi.exec();
    const count = results[0][1];

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      reset: windowStart + config.window,
      limit
    };
  } catch (error) {
    console.error('Rate limit check error:', error.message);
    // SECURITY: Fail closed - deny request if rate limiting cannot be enforced
    return { allowed: false, remaining: 0, reset: windowStart + config.window, limit, error: 'Rate limiting unavailable' };
  }
}
