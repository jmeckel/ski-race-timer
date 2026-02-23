import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { generateToken, hashPin, verifyPin } from '../../lib/jwt.js';
import { getRedis, hasRedisError, CLIENT_PIN_KEY, CHIEF_JUDGE_PIN_KEY } from '../../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendRateLimitExceeded,
  setRateLimitHeaders,
  getClientIP
} from '../../lib/response.js';
import { apiLogger, getRequestId } from '../../lib/apiLogger.js';

// Rate limiting configuration (per IP)
// Stricter limit to prevent brute-force on 4-digit PINs
// 5 attempts/min = 300/hour = 33+ hours to brute-force 10,000 PINs
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 5; // Max PIN exchanges per minute per IP

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  error?: string;
}

interface TokenRequestBody {
  pin?: string;
  role?: string;
}

type UserRole = 'timer' | 'gateJudge' | 'chiefJudge';

async function checkRateLimit(client: Redis, ip: string): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);
  const key = `ratelimit:auth:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW + 10);
    const results = await multi.exec();
    const count = (results?.[0]?.[1] as number) ?? 0;

    return {
      allowed: count <= RATE_LIMIT_MAX_REQUESTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count),
      reset: windowStart + RATE_LIMIT_WINDOW
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Rate limit check error', { error: message });
    // SECURITY: Fail closed if rate limiting cannot be enforced
    return {
      allowed: false,
      remaining: 0,
      reset: windowStart + RATE_LIMIT_WINDOW,
      error: 'Rate limiting unavailable'
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
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
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  const reqId = getRequestId(req.headers);
  const log = apiLogger.withRequestId(reqId);

  try {
    // Apply rate limiting before PIN processing
    const clientIP = getClientIP(req);
    const rateLimitResult = await checkRateLimit(client, clientIP);

    // Set rate limit headers
    setRateLimitHeaders(res, RATE_LIMIT_MAX_REQUESTS, rateLimitResult.remaining, rateLimitResult.reset);

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.error) {
        return sendServiceUnavailable(res, 'Rate limiting unavailable');
      }
      return sendRateLimitExceeded(res, rateLimitResult.reset - Math.floor(Date.now() / 1000));
    }

    const { pin, role } = (req.body || {}) as TokenRequestBody;

    if (!pin || typeof pin !== 'string') {
      return sendBadRequest(res, 'PIN is required');
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return sendBadRequest(res, 'PIN must be exactly 4 digits');
    }

    // Validate role if provided
    const validRoles: UserRole[] = ['timer', 'gateJudge', 'chiefJudge'];
    const userRole: UserRole = role && validRoles.includes(role as UserRole) ? (role as UserRole) : 'timer';

    // For chiefJudge role, use separate PIN validation
    if (userRole === 'chiefJudge') {
      const chiefPinHash = await client.get(CHIEF_JUDGE_PIN_KEY);

      if (!chiefPinHash) {
        // No chief judge PIN set yet - this is the first time setup
        // First chief judge sets the PIN
        const newPinHash = await hashPin(pin);
        await client.set(CHIEF_JUDGE_PIN_KEY, newPinHash);

        const token = generateToken({
          createdAt: Date.now(),
          role: 'chiefJudge'
        });

        return sendSuccess(res, {
          success: true,
          token,
          isNewPin: true,
          role: 'chiefJudge',
          message: 'Chief Judge PIN set successfully'
        });
      }

      // Verify provided PIN against stored chief judge PIN hash
      const pinValid = await verifyPin(pin, chiefPinHash);

      if (!pinValid) {
        return sendError(res, 'Invalid Chief Judge PIN', 401);
      }

      // Migrate legacy SHA-256 hash to PBKDF2 on successful verification
      if (!chiefPinHash.includes(':')) {
        const upgradedHash = await hashPin(pin);
        await client.set(CHIEF_JUDGE_PIN_KEY, upgradedHash);
      }

      // Chief Judge PIN is valid, generate JWT token
      const token = generateToken({
        authenticatedAt: Date.now(),
        role: 'chiefJudge'
      });

      return sendSuccess(res, {
        success: true,
        token,
        role: 'chiefJudge'
      });
    }

    // For timer and gateJudge roles, use regular PIN
    const storedPinHash = await client.get(CLIENT_PIN_KEY);

    if (!storedPinHash) {
      // No PIN set yet - this is the first time setup
      // Hash and store the PIN, then return token
      const newPinHash = await hashPin(pin);
      await client.set(CLIENT_PIN_KEY, newPinHash);

      const token = generateToken({
        createdAt: Date.now(),
        role: userRole
      });

      return sendSuccess(res, {
        success: true,
        token,
        isNewPin: true,
        role: userRole,
        message: 'PIN set successfully'
      });
    }

    // Verify provided PIN against stored hash
    // SECURITY: Uses timing-safe comparison internally to prevent timing attacks
    const pinValid = await verifyPin(pin, storedPinHash);

    if (!pinValid) {
      return sendError(res, 'Invalid PIN', 401);
    }

    // Migrate legacy SHA-256 hash to PBKDF2 on successful verification
    if (!storedPinHash.includes(':')) {
      const upgradedHash = await hashPin(pin);
      await client.set(CLIENT_PIN_KEY, upgradedHash);
    }

    // PIN is valid, generate JWT token
    const token = generateToken({
      authenticatedAt: Date.now(),
      role: userRole
    });

    return sendSuccess(res, {
      success: true,
      token,
      role: userRole
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Token API error', { error: message });
    return sendError(res, 'Internal server error', 500);
  }
}
