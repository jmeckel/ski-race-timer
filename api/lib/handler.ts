/**
 * API Handler Middleware
 * Reduces boilerplate across API endpoints by composing common phases:
 * preflight → Redis init → rate limiting → auth → error handling.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { apiLogger, getRequestId } from './apiLogger.js';
import type { ValidateAuthResult } from './jwt.js';
import { validateAuth } from './jwt.js';
import { CLIENT_PIN_KEY, getRedis, hasRedisError } from './redis.js';
import {
  getClientIP,
  type HttpMethod,
  handlePreflight,
  sendAuthRequired,
  sendError,
  sendRateLimitExceeded,
  sendServiceUnavailable,
  setRateLimitHeaders,
} from './response.js';
import { checkRateLimit, type RateLimitConfig } from './validation.js';

/** Context passed to handler functions after middleware phases complete */
export interface HandlerContext {
  client: Redis;
  clientIP: string;
  reqId: string;
  log: ReturnType<typeof apiLogger.withRequestId>;
  auth?: ValidateAuthResult;
}

/** Configuration for createHandler middleware composition */
export interface HandlerOptions {
  /** Allowed HTTP methods (OPTIONS is added automatically) */
  methods: HttpMethod[];
  /** Rate limit config — omit to skip rate limiting */
  rateLimit?: RateLimitConfig;
  /** Require JWT/PIN authentication — default false */
  auth?: boolean;
  /** Block write ops (POST/DELETE) when auth.method === 'none' — default false */
  writeRequiresAuth?: boolean;
}

/**
 * Create an API handler with composed middleware.
 * Handles: CORS preflight, Redis init, Redis health check,
 * rate limiting, authentication, request ID, and error boundary.
 */
export function createHandler(
  options: HandlerOptions,
  fn: (
    req: VercelRequest,
    res: VercelResponse,
    ctx: HandlerContext,
  ) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    // CORS preflight
    if (handlePreflight(req, res, [...options.methods, 'OPTIONS'])) return;

    // Redis init
    let client: Redis;
    try {
      client = getRedis();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      apiLogger.error('Redis initialization error', { error: message });
      return sendServiceUnavailable(res, 'Database service unavailable');
    }
    if (hasRedisError()) {
      return sendServiceUnavailable(
        res,
        'Database connection issue. Please try again.',
      );
    }

    // Rate limiting
    const clientIP = getClientIP(req);
    if (options.rateLimit) {
      const rl = await checkRateLimit(
        client,
        clientIP,
        req.method!,
        options.rateLimit,
      );
      setRateLimitHeaders(res, rl.limit, rl.remaining, rl.reset);
      if (!rl.allowed) {
        return sendRateLimitExceeded(
          res,
          rl.reset - Math.floor(Date.now() / 1000),
        );
      }
    }

    // Authentication
    let auth: ValidateAuthResult | undefined;
    if (options.auth) {
      auth = await validateAuth(req, client, CLIENT_PIN_KEY);
      if (!auth.valid) {
        return sendAuthRequired(res, auth.error, auth.expired || false);
      }
      if (
        options.writeRequiresAuth &&
        req.method !== 'GET' &&
        auth.method === 'none'
      ) {
        return sendError(res, 'Authentication required to write data', 401);
      }
    }

    // Request ID + logger
    const reqId = getRequestId(req.headers);
    const log = apiLogger.withRequestId(reqId);

    // Error boundary
    try {
      await fn(req, res, { client, clientIP, reqId, log, auth });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('API error', { error: err.message });
      if (
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT')
      ) {
        return sendServiceUnavailable(
          res,
          'Database connection failed. Please try again.',
        );
      }
      return sendError(res, 'Internal server error', 500);
    }
  };
}
