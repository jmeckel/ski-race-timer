import Redis from 'ioredis';
import crypto from 'crypto';
import { generateToken, hashPin } from '../lib/jwt.js';

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

// CORS configuration
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Redis key for client PIN hash
const CLIENT_PIN_KEY = 'admin:clientPin';

// Rate limiting configuration (per IP)
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max PIN exchanges per minute per IP

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

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
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  try {
    // Apply rate limiting before PIN processing
    const clientIP = getClientIP(req);
    const rateLimitResult = await checkRateLimit(client, clientIP);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.reset);

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Too many attempts. Please try again later.',
        retryAfter: rateLimitResult.reset - Math.floor(Date.now() / 1000)
      });
    }

    const { pin } = req.body || {};

    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ error: 'PIN is required' });
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    // Get stored PIN hash from Redis
    const storedPinHash = await client.get(CLIENT_PIN_KEY);

    if (!storedPinHash) {
      // No PIN set yet - this is the first time setup
      // Hash and store the PIN, then return token
      const newPinHash = hashPin(pin);
      await client.set(CLIENT_PIN_KEY, newPinHash);

      const token = generateToken({
        createdAt: Date.now()
      });

      return res.status(200).json({
        success: true,
        token,
        isNewPin: true,
        message: 'PIN set successfully'
      });
    }

    // Verify provided PIN against stored hash
    const providedPinHash = hashPin(pin);

    try {
      if (!crypto.timingSafeEqual(Buffer.from(providedPinHash), Buffer.from(storedPinHash))) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid PIN format' });
    }

    // PIN is valid, generate JWT token
    const token = generateToken({
      authenticatedAt: Date.now()
    });

    return res.status(200).json({
      success: true,
      token
    });

  } catch (error) {
    console.error('Token API error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
