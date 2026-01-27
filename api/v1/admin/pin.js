import { validateAuth } from '../../lib/jwt.js';
import { getRedis, hasRedisError } from '../../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendAuthRequired,
  sendError
} from '../../lib/response.js';

// Redis key for storing admin PIN hash
const ADMIN_PIN_KEY = 'admin:clientPin';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['GET', 'POST', 'OPTIONS'])) {
    return;
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

  // Authenticate request using JWT or PIN hash
  const auth = await validateAuth(req, client, ADMIN_PIN_KEY);
  if (!auth.valid) {
    return sendAuthRequired(res, auth.error, auth.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // Get the stored client admin PIN hash
      const pinHash = await client.get(ADMIN_PIN_KEY);
      return sendSuccess(res, {
        pinHash: pinHash || null,
        synced: !!pinHash
      });
    }

    if (req.method === 'POST') {
      // Save the client admin PIN hash
      const { pinHash } = req.body;

      if (!pinHash || typeof pinHash !== 'string') {
        return sendBadRequest(res, 'pinHash is required');
      }

      await client.set(ADMIN_PIN_KEY, pinHash);
      return sendSuccess(res, { success: true });
    }

    return sendMethodNotAllowed(res);
  } catch (error) {
    console.error('Admin PIN API error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
