import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { promisify } from 'util';
import type { VercelRequest } from '@vercel/node';
import type Redis from 'ioredis';

const pbkdf2Async = promisify(crypto.pbkdf2);

/** Role types for JWT token claims */
export type UserRole = 'timer' | 'gateJudge' | 'chiefJudge';

/** Payload included in JWT tokens */
export interface TokenPayload {
  type: string;
  role?: UserRole;
  [key: string]: unknown;
}

/** Result of JWT configuration validation */
export interface JwtConfigResult {
  valid: boolean;
  error?: string;
}

/** Result of JWT token verification */
export interface VerifyTokenResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
  expired?: boolean;
}

/** Result of request authentication validation */
export interface ValidateAuthResult {
  valid: boolean;
  error?: string;
  method?: 'none' | 'jwt';
  payload?: TokenPayload;
  expired?: boolean;
}

// JWT configuration
const JWT_ALGORITHM = 'HS256' as const;
const JWT_EXPIRY: string = '24h'; // Token valid for 24 hours
const JWT_ISSUER: string = 'ski-race-timer';

/**
 * Get JWT secret from environment
 * SECURITY: Always fails if JWT_SECRET is not set - no fallback
 */
function getJwtSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('CRITICAL: JWT_SECRET environment variable must be set. Create a .env.local file for local development.');
  }
  return process.env.JWT_SECRET;
}

/**
 * Validate JWT configuration at startup
 * Call this early to fail fast if JWT_SECRET is not configured
 */
export function validateJwtConfig(): JwtConfigResult {
  try {
    getJwtSecret();
    return { valid: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: message };
  }
}

/**
 * Generate a JWT token for authenticated users
 * @param payload - Data to include in token
 * @returns Signed JWT token
 */
export function generateToken(payload: Record<string, unknown> = {}): string {
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
 * @param token - JWT token to verify
 */
export function verifyToken(token: string): VerifyTokenResult {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  const secret = getJwtSecret();

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER
    }) as TokenPayload;

    // Verify token type
    if (payload.type !== 'race-management') {
      return { valid: false, error: 'Invalid token type' };
    }

    return { valid: true, payload };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired', expired: true };
    }
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 * @param authHeader - Authorization header value
 * @returns Token or null if invalid format
 */
export function extractToken(authHeader: string | undefined): string | null {
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
 * @param req - Request object
 * @param redisClient - Redis client for PIN validation
 * @param clientPinKey - Redis key for stored PIN hash
 */
export async function validateAuth(req: VercelRequest, redisClient: Redis, clientPinKey: string = 'admin:clientPin'): Promise<ValidateAuthResult> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Check if PIN is required
    const storedPinHash = await redisClient.get(clientPinKey);
    if (!storedPinHash) {
      // No PIN set — allow read-only access (data sync, race listing)
      // Role-restricted operations must still check auth.method !== 'none'
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
const PBKDF2_ITERATIONS: number = 100000;
const PBKDF2_KEY_LENGTH: number = 32;
const PBKDF2_DIGEST: string = 'sha256';
const SALT_LENGTH: number = 16;

/**
 * Hash a PIN using PBKDF2 with a random salt
 * @param pin - PIN to hash
 * @returns Format: "salt:hash" (both hex-encoded)
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = (await pbkdf2Async(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a PIN against a stored hash
 * Handles both new PBKDF2 format (salt:hash) and legacy SHA-256 format
 * Uses timing-safe comparison to prevent timing attacks
 * @param pin - PIN to verify
 * @param storedHash - Stored hash to compare against
 * @returns True if PIN matches
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    if (storedHash.includes(':')) {
      // New PBKDF2 format: salt:hash
      const [salt, hash] = storedHash.split(':');
      const computedHash = (await pbkdf2Async(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)).toString('hex');
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
