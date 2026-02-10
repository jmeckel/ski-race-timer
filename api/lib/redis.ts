import Redis from 'ioredis';
import { apiLogger } from './apiLogger.js';

/**
 * Shared Redis connection module with consistent error handling and reconnection logic
 * Used by all API endpoints for reliable database access
 */

// Redis key constants
export const CLIENT_PIN_KEY: string = 'admin:clientPin';
export const CHIEF_JUDGE_PIN_KEY: string = 'admin:chiefJudgePin';

// Singleton Redis client
let redis: Redis | null = null;
let redisError: Error | null = null;
let lastErrorTime: number = 0;

// Configuration
const RECONNECT_DELAY: number = 5000; // 5 seconds before attempting reconnection after error

/**
 * Get or create Redis client with consistent configuration
 * @returns Redis client instance
 * @throws If REDIS_URL is not configured
 */
export function getRedis(): Redis {
  // If we have an error and enough time has passed, reset connection to retry
  if (redisError && redis) {
    const timeSinceError: number = Date.now() - lastErrorTime;
    if (timeSinceError > RECONNECT_DELAY) {
      apiLogger.info('Attempting Redis reconnection after error');
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
      retryStrategy(times: number): number | null {
        if (times > 3) {
          lastErrorTime = Date.now();
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err: Error): boolean {
        // Reconnect on specific recoverable errors
        const targetErrors: string[] = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(e => err.message.includes(e));
      }
    });

    // Handle Redis connection events
    redis.on('error', (err: Error) => {
      apiLogger.error('Redis connection error', { error: err.message });
      redisError = err;
      lastErrorTime = Date.now();
    });

    redis.on('connect', () => {
      apiLogger.info('Redis connected successfully');
      redisError = null;
    });

    redis.on('close', () => {
      apiLogger.info('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      apiLogger.info('Redis reconnecting');
    });
  }

  return redis;
}

/**
 * Check if there's an active Redis error
 * @returns True if there's an error
 */
export function hasRedisError(): boolean {
  return redisError !== null;
}

/**
 * Get the current Redis error (if any)
 * @returns The current error or null
 */
export function getRedisError(): Error | null {
  return redisError;
}
