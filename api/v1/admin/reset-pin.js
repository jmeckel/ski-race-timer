import crypto from 'crypto';
import { getRedis, hasRedisError, CLIENT_PIN_KEY, CHIEF_JUDGE_PIN_KEY } from '../../lib/redis.js';
import {
  sendSuccess,
  sendError,
  sendMethodNotAllowed,
  sendServiceUnavailable
} from '../../lib/response.js';

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

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  try {
    // Delete both PIN hashes (regular and chief judge)
    await client.del(CLIENT_PIN_KEY);
    await client.del(CHIEF_JUDGE_PIN_KEY);

    console.log('Client PIN and Chief Judge PIN have been reset');

    return sendSuccess(res, {
      success: true,
      message: 'PINs have been reset. The next PINs entered will become the new PINs.'
    });
  } catch (error) {
    console.error('Reset PIN error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
