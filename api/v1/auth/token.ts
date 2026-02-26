import { createHandler } from '../../lib/handler.js';
import { generateToken, hashPin, verifyPin } from '../../lib/jwt.js';
import { CHIEF_JUDGE_PIN_KEY, CLIENT_PIN_KEY } from '../../lib/redis.js';
import {
  sendBadRequest,
  sendError,
  sendRateLimitExceeded,
  sendServiceUnavailable,
  sendSuccess,
  setRateLimitHeaders,
} from '../../lib/response.js';
import { checkRateLimit } from '../../lib/validation.js';

// Rate limiting configuration (per IP)
// Stricter limit to prevent brute-force on 4-digit PINs
// 5 attempts/min = 300/hour = 33+ hours to brute-force 10,000 PINs
const AUTH_RATE_LIMIT = {
  keyPrefix: 'auth',
  window: 60,
  maxRequests: 5,
  maxPosts: 5,
} as const;

interface TokenRequestBody {
  pin?: string;
  role?: string;
}

type UserRole = 'timer' | 'gateJudge' | 'chiefJudge';

export default createHandler(
  {
    methods: ['POST'],
    // Auth and rate limiting handled manually (rate limit after PIN format validation)
  },
  async (req, res, { client, clientIP }) => {
    // Validate PIN format before consuming rate limit token
    const { pin, role } = (req.body || {}) as TokenRequestBody;

    if (!pin || typeof pin !== 'string') {
      return sendBadRequest(res, 'PIN is required');
    }

    if (!/^\d{4}$/.test(pin)) {
      return sendBadRequest(res, 'PIN must be exactly 4 digits');
    }

    // Apply rate limiting only for structurally-valid auth attempts
    const rateLimitResult = await checkRateLimit(
      client,
      clientIP,
      'POST',
      AUTH_RATE_LIMIT,
    );

    // Set rate limit headers
    setRateLimitHeaders(
      res,
      rateLimitResult.limit,
      rateLimitResult.remaining,
      rateLimitResult.reset,
    );

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.error) {
        return sendServiceUnavailable(res, 'Rate limiting unavailable');
      }
      return sendRateLimitExceeded(
        res,
        rateLimitResult.reset - Math.floor(Date.now() / 1000),
      );
    }

    // Validate role if provided
    const validRoles: UserRole[] = ['timer', 'gateJudge', 'chiefJudge'];
    const userRole: UserRole =
      role && validRoles.includes(role as UserRole)
        ? (role as UserRole)
        : 'timer';

    // For chiefJudge role, use separate PIN validation
    if (userRole === 'chiefJudge') {
      const chiefPinHash = await client.get(CHIEF_JUDGE_PIN_KEY);

      if (!chiefPinHash) {
        // No chief judge PIN set yet - first request sets the PIN
        // Use SET NX (set-if-not-exists) to prevent race condition where
        // two concurrent requests both observe null and both set their PIN
        const newPinHash = await hashPin(pin);
        const wasSet = await client.set(CHIEF_JUDGE_PIN_KEY, newPinHash, 'NX');

        if (!wasSet) {
          // Another request set the PIN concurrently — verify against it
          const concurrentHash = await client.get(CHIEF_JUDGE_PIN_KEY);
          if (!concurrentHash || !(await verifyPin(pin, concurrentHash))) {
            return sendError(res, 'Invalid Chief Judge PIN', 401);
          }
        }

        const token = generateToken({
          createdAt: Date.now(),
          role: 'chiefJudge',
        });

        return sendSuccess(res, {
          success: true,
          token,
          isNewPin: !!wasSet,
          role: 'chiefJudge',
          message: 'Chief Judge PIN set successfully',
        });
      }

      // Verify provided PIN against stored chief judge PIN hash
      const pinValid = await verifyPin(pin, chiefPinHash);

      if (!pinValid) {
        return sendError(res, 'Invalid Chief Judge PIN', 401);
      }

      // Migrate legacy SHA-256 hash to PBKDF2 on successful verification
      if (!chiefPinHash.includes(':')) {
        const upgradedHash = await hashPin(pin);
        await client.set(CHIEF_JUDGE_PIN_KEY, upgradedHash);
      }

      // Chief Judge PIN is valid, generate JWT token
      const token = generateToken({
        authenticatedAt: Date.now(),
        role: 'chiefJudge',
      });

      return sendSuccess(res, {
        success: true,
        token,
        role: 'chiefJudge',
      });
    }

    // For timer and gateJudge roles, use regular PIN
    const storedPinHash = await client.get(CLIENT_PIN_KEY);

    if (!storedPinHash) {
      // No PIN set yet - first request sets the PIN
      // Use SET NX (set-if-not-exists) to prevent race condition where
      // two concurrent requests both observe null and both set their PIN
      const newPinHash = await hashPin(pin);
      const wasSet = await client.set(CLIENT_PIN_KEY, newPinHash, 'NX');

      if (!wasSet) {
        // Another request set the PIN concurrently — verify against it
        const concurrentHash = await client.get(CLIENT_PIN_KEY);
        if (!concurrentHash || !(await verifyPin(pin, concurrentHash))) {
          return sendError(res, 'Invalid PIN', 401);
        }
      }

      const token = generateToken({
        createdAt: Date.now(),
        role: userRole,
      });

      return sendSuccess(res, {
        success: true,
        token,
        isNewPin: !!wasSet,
        role: userRole,
        message: 'PIN set successfully',
      });
    }

    // Verify provided PIN against stored hash
    // SECURITY: Uses timing-safe comparison internally to prevent timing attacks
    const pinValid = await verifyPin(pin, storedPinHash);

    if (!pinValid) {
      return sendError(res, 'Invalid PIN', 401);
    }

    // Migrate legacy SHA-256 hash to PBKDF2 on successful verification
    if (!storedPinHash.includes(':')) {
      const upgradedHash = await hashPin(pin);
      await client.set(CLIENT_PIN_KEY, upgradedHash);
    }

    // PIN is valid, generate JWT token
    const token = generateToken({
      authenticatedAt: Date.now(),
      role: userRole,
    });

    return sendSuccess(res, {
      success: true,
      token,
      role: userRole,
    });
  },
);
