import Redis from 'ioredis';
import { validateAuth } from '../lib/jwt.js';

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

// CORS configuration - default to production domain
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Redis key for storing admin PIN hash
const ADMIN_PIN_KEY = 'admin:clientPin';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  // Authenticate request using JWT or PIN hash
  const auth = await validateAuth(req, client, ADMIN_PIN_KEY);
  if (!auth.valid) {
    return res.status(401).json({
      error: auth.error,
      expired: auth.expired || false
    });
  }

  try {
    if (req.method === 'GET') {
      // Get the stored client admin PIN hash
      const pinHash = await client.get(ADMIN_PIN_KEY);
      return res.status(200).json({
        pinHash: pinHash || null,
        synced: !!pinHash
      });
    }

    if (req.method === 'POST') {
      // Save the client admin PIN hash
      const { pinHash } = req.body;

      if (!pinHash || typeof pinHash !== 'string') {
        return res.status(400).json({ error: 'pinHash is required' });
      }

      await client.set(ADMIN_PIN_KEY, pinHash);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin PIN API error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
