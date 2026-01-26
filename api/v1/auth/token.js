import Redis from 'ioredis';
import crypto from 'crypto';
import { generateToken, hashPin } from '../../lib/jwt.js';
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

// Redis client
let redis = null;

function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not configured');
    }
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000
    });
  }
  return redis;
}

// Redis key for client PIN hash
const CLIENT_PIN_KEY = 'admin:clientPin';

// Rate limiting configuration (per IP)
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max PIN exchanges per minute per IP

async function checkRateLimit(client, ip) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);
  const key = `ratelimit:auth:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW + 10);
    const results = await multi.exec();
    const count = results?.[0]?.[1] ?? 0;

    return {
      allowed: count <= RATE_LIMIT_MAX_REQUESTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count),
      reset: windowStart + RATE_LIMIT_WINDOW
    };
  } catch (error) {
    console.error('Rate limit check error:', error.message);
    // Fail open to avoid blocking auth if Redis has a hiccup
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS,
      reset: windowStart + RATE_LIMIT_WINDOW
    };
  }
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  try {
    // Apply rate limiting before PIN processing
    const clientIP = getClientIP(req);
    const rateLimitResult = await checkRateLimit(client, clientIP);

    // Set rate limit headers
    setRateLimitHeaders(res, RATE_LIMIT_MAX_REQUESTS, rateLimitResult.remaining, rateLimitResult.reset);

    if (!rateLimitResult.allowed) {
      return sendRateLimitExceeded(res, rateLimitResult.reset - Math.floor(Date.now() / 1000));
    }

    const { pin, role } = req.body || {};

    if (!pin || typeof pin !== 'string') {
      return sendBadRequest(res, 'PIN is required');
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return sendBadRequest(res, 'PIN must be exactly 4 digits');
    }

    // Validate role if provided
    const validRoles = ['timer', 'gateJudge', 'chiefJudge'];
    const userRole = role && validRoles.includes(role) ? role : 'timer';

    // Get stored PIN hash from Redis
    const storedPinHash = await client.get(CLIENT_PIN_KEY);

    if (!storedPinHash) {
      // No PIN set yet - this is the first time setup
      // Hash and store the PIN, then return token
      const newPinHash = hashPin(pin);
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
    // SECURITY: Use constant-time comparison and identical error responses to prevent timing attacks
    const providedPinHash = hashPin(pin);
    let pinValid = false;

    try {
      pinValid = crypto.timingSafeEqual(Buffer.from(providedPinHash), Buffer.from(storedPinHash));
    } catch (e) {
      // Buffer length mismatch - PIN is invalid
      pinValid = false;
    }

    if (!pinValid) {
      return sendError(res, 'Invalid PIN', 401);
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

  } catch (error) {
    console.error('Token API error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
