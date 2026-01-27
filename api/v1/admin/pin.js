import { validateAuth } from '../../lib/jwt.js';
import { getRedis, hasRedisError, CLIENT_PIN_KEY, CHIEF_JUDGE_PIN_KEY } from '../../lib/redis.js';
import {
  handlePreflight,
  sendSuccess,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendAuthRequired,
  sendError
} from '../../lib/response.js';

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
  const auth = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!auth.valid) {
    return sendAuthRequired(res, auth.error, auth.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // Get the stored PIN hashes
      const pinHash = await client.get(CLIENT_PIN_KEY);
      const chiefPinHash = await client.get(CHIEF_JUDGE_PIN_KEY);
      return sendSuccess(res, {
        pinHash: pinHash || null,
        chiefPinHash: chiefPinHash || null,
        synced: !!pinHash,
        chiefPinSet: !!chiefPinHash
      });
    }

    if (req.method === 'POST') {
      // Save PIN hash(es)
      const { pinHash, chiefPinHash } = req.body;

      // At least one PIN hash must be provided
      if (!pinHash && !chiefPinHash) {
        return sendBadRequest(res, 'pinHash or chiefPinHash is required');
      }

      // Save regular PIN if provided
      if (pinHash && typeof pinHash === 'string') {
        await client.set(CLIENT_PIN_KEY, pinHash);
      }

      // Save chief judge PIN if provided
      if (chiefPinHash && typeof chiefPinHash === 'string') {
        await client.set(CHIEF_JUDGE_PIN_KEY, chiefPinHash);
      }

      return sendSuccess(res, { success: true });
    }

    return sendMethodNotAllowed(res);
  } catch (error) {
    console.error('Admin PIN API error:', error.message);
    return sendError(res, 'Internal server error', 500);
  }
}
