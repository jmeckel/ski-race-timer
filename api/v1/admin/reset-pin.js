import Redis from 'ioredis';
import crypto from 'crypto';
import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendMethodNotAllowed,
  sendServiceUnavailable
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

/**
 * Reset PIN endpoint
 * Requires SERVER_API_PIN in X-Server-Pin header for authorization
 * Deletes the stored PIN hash, allowing the next PIN entry to become the new PIN
 */
export default async function handler(req, res) {
  // Handle CORS preflight - note custom header for X-Server-Pin
  if (req.method === 'OPTIONS') {
    // Use custom preflight handling for X-Server-Pin header
    const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Server-Pin');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    return res.status(200).end();
  }

  // Set headers for non-preflight requests
  const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  // Verify SERVER_API_PIN with timing-safe comparison
  const serverPin = process.env.SERVER_API_PIN;
  const providedPin = req.headers['x-server-pin'];

  if (!serverPin) {
    return sendError(res, 'SERVER_API_PIN not configured on server', 500);
  }

  if (!providedPin) {
    return sendError(res, 'Invalid server PIN', 401);
  }

  // Use timing-safe comparison to prevent timing attacks
  let pinValid = false;
  try {
    const serverPinBuffer = Buffer.from(serverPin, 'utf8');
    const providedPinBuffer = Buffer.from(providedPin, 'utf8');
    // Only compare if lengths match (timingSafeEqual requires equal lengths)
    if (serverPinBuffer.length === providedPinBuffer.length) {
      pinValid = crypto.timingSafeEqual(serverPinBuffer, providedPinBuffer);
    }
  } catch {
    pinValid = false;
  }

  if (!pinValid) {
    return sendError(res, 'Invalid server PIN', 401);
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  try {
    // Delete the stored PIN hash
    await client.del(CLIENT_PIN_KEY);

    console.log('Client PIN has been reset');

    return sendSuccess(res, {
      success: true,
      message: 'PIN has been reset. The next PIN entered will become the new PIN.'
    });
  } catch (error) {
    console.error('Reset PIN error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
