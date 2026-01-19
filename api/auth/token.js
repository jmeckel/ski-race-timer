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
