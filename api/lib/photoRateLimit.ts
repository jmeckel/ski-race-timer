/**
 * Photo Upload Rate Limiting
 *
 * Prevents memory exhaustion from rapid photo uploads by limiting
 * the number of photos a device can upload per time window.
 */

import type Redis from 'ioredis';
import { apiLogger } from './apiLogger.js';
import type { PhotoRateLimitResult } from './syncTypes.js';

/** Rate limit window in seconds (5 minutes) */
export const PHOTO_RATE_LIMIT_WINDOW = 300;

/** Maximum photos per device per window */
export const PHOTO_RATE_LIMIT_MAX = 20;

/**
 * Check whether a device is allowed to upload another photo.
 * Uses a sliding-window counter in Redis.
 *
 * SECURITY: Fails closed -- if Redis is unavailable, the request is denied
 * to prevent memory exhaustion.
 *
 * @param client - Redis client
 * @param raceId - Normalized race ID
 * @param deviceId - Device identifier
 * @returns Whether the upload is allowed, with current count and limit
 */
export async function checkPhotoRateLimit(
  client: Redis,
  raceId: string,
  deviceId: string,
): Promise<PhotoRateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % PHOTO_RATE_LIMIT_WINDOW);
  const key = `ratelimit:photo:${raceId}:${deviceId}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, PHOTO_RATE_LIMIT_WINDOW + 10);
    const results = await multi.exec();

    const count = (results?.[0]?.[1] as number) ?? 0;
    return {
      allowed: count <= PHOTO_RATE_LIMIT_MAX,
      count,
      limit: PHOTO_RATE_LIMIT_MAX,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Photo rate limit check error', { error: message });
    // SECURITY: Fail closed - deny request if rate limiting cannot be enforced
    // Prevents memory exhaustion if Redis is unavailable
    return {
      allowed: false,
      count: 0,
      limit: PHOTO_RATE_LIMIT_MAX,
      error: 'Rate limiting unavailable',
    };
  }
}
