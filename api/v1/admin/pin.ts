import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAuth, hashPin, verifyPin } from '../../lib/jwt.js';
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

interface ChangePinRequestBody {
  currentPin?: string;
  newPin?: string;
}

/**
 * Admin PIN Status API
 *
 * GET: Returns whether PINs are set (boolean flags only, never hashes)
 * POST: Change PIN - requires current PIN verification
 *
 * SECURITY: PIN hashes are never exposed to clients to prevent:
 * - Offline brute-force attacks (4-digit = only 10,000 possibilities)
 * - Hash replay attacks via legacy authentication path
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['GET', 'POST', 'OPTIONS'])) {
    return;
  }

  let client;
  try {
    client = getRedis();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Redis initialization error:', message);
    return sendServiceUnavailable(res, 'Database service unavailable');
  }

  // Check for recent Redis errors
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Database connection issue. Please try again.');
  }

  // Authenticate request using JWT
  const auth = await validateAuth(req, client, CLIENT_PIN_KEY);
  if (!auth.valid) {
    return sendAuthRequired(res, auth.error, auth.expired || false);
  }

  try {
    if (req.method === 'GET') {
      // Return only boolean flags - NEVER expose actual hashes
      const pinHash = await client.get(CLIENT_PIN_KEY);
      const chiefPinHash = await client.get(CHIEF_JUDGE_PIN_KEY);
      return sendSuccess(res, {
        hasPin: !!pinHash,
        hasChiefPin: !!chiefPinHash
      });
    }

    if (req.method === 'POST') {
      // Change PIN - requires current PIN verification
      const { currentPin, newPin } = (req.body || {}) as ChangePinRequestBody;

      // Validate inputs
      if (!currentPin || !newPin) {
        return sendBadRequest(res, 'currentPin and newPin are required');
      }

      if (typeof currentPin !== 'string' || typeof newPin !== 'string') {
        return sendBadRequest(res, 'PINs must be strings');
      }

      // Validate PIN format (4 digits)
      if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
        return sendBadRequest(res, 'PINs must be exactly 4 digits');
      }

      // Get stored PIN hash
      const storedPinHash = await client.get(CLIENT_PIN_KEY);
      if (!storedPinHash) {
        return sendBadRequest(res, 'No PIN is set. Use authentication to set initial PIN.');
      }

      // Verify current PIN using timing-safe comparison
      const currentPinValid = verifyPin(currentPin, storedPinHash);

      if (!currentPinValid) {
        return sendError(res, 'Current PIN is incorrect', 401);
      }

      // Hash and store new PIN
      const newPinHash = hashPin(newPin);
      await client.set(CLIENT_PIN_KEY, newPinHash);

      console.log('PIN changed successfully via admin/pin API');
      return sendSuccess(res, { success: true });
    }

    return sendMethodNotAllowed(res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Admin PIN API error:', message);
    return sendError(res, 'Internal server error', 500);
  }
}
