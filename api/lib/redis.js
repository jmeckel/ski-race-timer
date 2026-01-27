import Redis from 'ioredis';

/**
 * Shared Redis connection module with consistent error handling and reconnection logic
 * Used by all API endpoints for reliable database access
 */

// Redis key constants
export const CLIENT_PIN_KEY = 'admin:clientPin';
export const CHIEF_JUDGE_PIN_KEY = 'admin:chiefJudgePin';

// Singleton Redis client
let redis = null;
let redisError = null;
let lastErrorTime = 0;

// Configuration
const RECONNECT_DELAY = 5000; // 5 seconds before attempting reconnection after error

/**
 * Get or create Redis client with consistent configuration
 * @returns {Redis} Redis client instance
 * @throws {Error} If REDIS_URL is not configured
 */
export function getRedis() {
  // If we have an error and enough time has passed, reset connection to retry
  if (redisError && redis) {
    const timeSinceError = Date.now() - lastErrorTime;
    if (timeSinceError > RECONNECT_DELAY) {
      console.log('Attempting Redis reconnection after error...');
      try {
        redis.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      redis = null;
      redisError = null;
    }
  }

  if (!redis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not configured');
    }

    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy(times) {
        if (times > 3) {
          lastErrorTime = Date.now();
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err) {
        // Reconnect on specific recoverable errors
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(e => err.message.includes(e));
      }
    });

    // Handle Redis connection events
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      redisError = err;
      lastErrorTime = Date.now();
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
      redisError = null;
    });

    redis.on('close', () => {
      console.log('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
  }

  return redis;
}

/**
 * Check if there's an active Redis error
 * @returns {boolean} True if there's an error
 */
export function hasRedisError() {
  return redisError !== null;
}

/**
 * Get the current Redis error (if any)
 * @returns {Error|null} The current error or null
 */
export function getRedisError() {
  return redisError;
}
