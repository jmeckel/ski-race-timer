import { apiLogger } from '../../lib/apiLogger.js';
import { createHandler } from '../../lib/handler.js';
import { hashPin, verifyPin } from '../../lib/jwt.js';
import { CHIEF_JUDGE_PIN_KEY, CLIENT_PIN_KEY } from '../../lib/redis.js';
import { sendBadRequest, sendError, sendSuccess } from '../../lib/response.js';

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
export default createHandler(
  {
    methods: ['GET', 'POST'],
    auth: true,
  },
  async (req, res, { client, auth }) => {
    if (req.method === 'GET') {
      // Return only boolean flags - NEVER expose actual hashes
      const pinHash = await client.get(CLIENT_PIN_KEY);
      const chiefPinHash = await client.get(CHIEF_JUDGE_PIN_KEY);
      return sendSuccess(res, {
        hasPin: !!pinHash,
        hasChiefPin: !!chiefPinHash,
      });
    }

    if (req.method === 'POST') {
      // PIN change requires chiefJudge role
      const userRole = auth?.payload?.role as string | undefined;
      if (userRole !== 'chiefJudge') {
        return sendError(res, 'PIN change requires Chief Judge role', 403);
      }

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
        return sendBadRequest(
          res,
          'No PIN is set. Use authentication to set initial PIN.',
        );
      }

      // Verify current PIN using timing-safe comparison
      const currentPinValid = await verifyPin(currentPin, storedPinHash);

      if (!currentPinValid) {
        return sendError(res, 'Current PIN is incorrect', 401);
      }

      // Hash and store new PIN
      const newPinHash = await hashPin(newPin);
      await client.set(CLIENT_PIN_KEY, newPinHash);

      apiLogger.info('PIN changed successfully via admin/pin API');
      return sendSuccess(res, { success: true });
    }
  },
);
