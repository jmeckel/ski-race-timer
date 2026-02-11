/**
 * API Validation Utilities
 * Core validation (isValidRaceId, isValidEntry, etc.) imported from shared/validation.ts
 */

import type Redis from 'ioredis';

// Re-export shared validation functions and constants
export {
  isValidRaceId,
  isValidEntry,
  isValidDeviceId,
  VALID_POINTS,
  VALID_STATUSES,
  VALID_FAULT_TYPES,
  MAX_RACE_ID_LENGTH,
  MAX_BIB_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
} from '../../shared/validation.js';

/** Valid fault type codes */
export type FaultType = 'MG' | 'STR' | 'BR';

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Redis key prefix (e.g., 'sync', 'faults') */
  keyPrefix: string;
  /** Rate limit window in seconds */
  window: number;
  /** Max GET requests per window */
  maxRequests: number;
  /** Max POST requests per window */
  maxPosts: number;
}

/** Rate limit check result */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Unix timestamp when limit resets */
  reset: number;
  /** Max requests allowed */
  limit: number;
  /** Error message if rate limiting unavailable */
  error?: string;
}

/**
 * Check rate limit using Redis
 * @param client - Redis client
 * @param ip - Client IP
 * @param method - HTTP method
 * @param config - Rate limit configuration
 */
export async function checkRateLimit(client: Redis, ip: string, method: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now: number = Math.floor(Date.now() / 1000);
  const windowStart: number = now - (now % config.window);
  const limit: number = method === 'POST' ? config.maxPosts : config.maxRequests;
  const key: string = `ratelimit:${config.keyPrefix}:${method}:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, config.window + 10);
    const results = await multi.exec();
    const count = (results?.[0]?.[1] as number) ?? 0;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      reset: windowStart + config.window,
      limit
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Use structured format inline (avoid importing apiLogger into shared validation)
    console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'Rate limit check error', error: message }));
    // SECURITY: Fail closed - deny request if rate limiting cannot be enforced
    return { allowed: false, remaining: 0, reset: windowStart + config.window, limit, error: 'Rate limiting unavailable' };
  }
}
