import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// JWT configuration
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = '24h'; // Token valid for 24 hours
const JWT_ISSUER = 'ski-race-timer';

/**
 * Get JWT secret from environment
 * SECURITY: Always fails if JWT_SECRET is not set - no fallback
 */
function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('CRITICAL: JWT_SECRET environment variable must be set. Create a .env.local file for local development.');
  }
  return process.env.JWT_SECRET;
}

/**
 * Validate JWT configuration at startup
 * Call this early to fail fast if JWT_SECRET is not configured
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateJwtConfig() {
  try {
    getJwtSecret();
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Generate a JWT token for authenticated users
 * @param {Object} payload - Data to include in token
 * @returns {string} Signed JWT token
 */
export function generateToken(payload = {}) {
  const secret = getJwtSecret();

  return jwt.sign(
    {
      ...payload,
      type: 'race-management'
    },
    secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRY,
      issuer: JWT_ISSUER
    }
  );
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
export function verifyToken(token) {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  const secret = getJwtSecret();

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER
    });

    // Verify token type
    if (payload.type !== 'race-management') {
      return { valid: false, error: 'Invalid token type' };
    }

    return { valid: true, payload };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired', expired: true };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if invalid format
 */
export function extractToken(authHeader) {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Validate request authentication using JWT
 * Falls back to PIN hash validation for backwards compatibility
 * @param {Object} req - Request object
 * @param {Object} redisClient - Redis client for PIN validation
 * @param {string} clientPinKey - Redis key for stored PIN hash
 * @returns {Promise<{ valid: boolean, error?: string, method?: string }>}
 */
export async function validateAuth(req, redisClient, clientPinKey = 'admin:clientPin') {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Check if PIN is required
    const storedPinHash = await redisClient.get(clientPinKey);
    if (!storedPinHash) {
      // No PIN set, allow access
      return { valid: true, method: 'none' };
    }
    return { valid: false, error: 'Authorization required. Set Race Management PIN in settings.' };
  }

  const token = extractToken(authHeader);
  if (!token) {
    return { valid: false, error: 'Invalid authorization format. Use: Bearer <token>' };
  }

  // Try JWT verification first
  const jwtResult = verifyToken(token);
  if (jwtResult.valid) {
    return { valid: true, method: 'jwt', payload: jwtResult.payload };
  }

  // If JWT failed due to expiry, tell the client to re-authenticate
  if (jwtResult.expired) {
    return { valid: false, error: 'Token expired. Please re-authenticate.', expired: true };
  }

  // JWT verification failed - require valid JWT token
  // Legacy PIN hash authentication has been removed for security reasons
  return { valid: false, error: 'Invalid token. Please re-authenticate.' };
}

// PBKDF2 configuration for PIN hashing
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 16;

/**
 * Hash a PIN using PBKDF2 with a random salt
 * @param {string} pin - PIN to hash
 * @returns {string} Format: "salt:hash" (both hex-encoded)
 */
export function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a PIN against a stored hash
 * Handles both new PBKDF2 format (salt:hash) and legacy SHA-256 format
 * Uses timing-safe comparison to prevent timing attacks
 * @param {string} pin - PIN to verify
 * @param {string} storedHash - Stored hash to compare against
 * @returns {boolean} True if PIN matches
 */
export function verifyPin(pin, storedHash) {
  try {
    if (storedHash.includes(':')) {
      // New PBKDF2 format: salt:hash
      const [salt, hash] = storedHash.split(':');
      const computedHash = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));
    } else {
      // Legacy SHA-256 format (for migration from existing PINs)
      const computedHash = crypto.createHash('sha256').update(pin).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
    }
  } catch {
    return false;
  }
}
