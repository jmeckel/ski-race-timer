/**
 * Direct unit tests for api/lib/jwt.ts
 * Tests real crypto operations, not mocks
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set JWT_SECRET before importing jwt module
process.env.JWT_SECRET = 'test-secret-key-for-jwt-unit-tests-32chars';

const {
  generateToken,
  verifyToken,
  extractToken,
  validateAuth,
  validateJwtConfig,
  hashPin,
  verifyPin,
} = await import('../../api/lib/jwt.js');

describe('jwt.ts — direct unit tests', () => {
  describe('validateJwtConfig', () => {
    it('should return valid when JWT_SECRET is set', () => {
      const result = validateJwtConfig();
      expect(result.valid).toBe(true);
    });

    it('should return invalid when JWT_SECRET is not set', () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        const result = validateJwtConfig();
        expect(result.valid).toBe(false);
        expect(result.error).toContain('JWT_SECRET');
      } finally {
        process.env.JWT_SECRET = original;
      }
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT string', () => {
      const token = generateToken();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // header.payload.signature
    });

    it('should include type: race-management in payload', () => {
      const token = generateToken();
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.type).toBe('race-management');
    });

    it('should merge custom payload fields', () => {
      const token = generateToken({ role: 'chiefJudge' });
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.role).toBe('chiefJudge');
    });

    it('should always override type to race-management', () => {
      const token = generateToken({ type: 'evil' });
      const result = verifyToken(token);
      expect(result.payload?.type).toBe('race-management');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken({ role: 'timer' });
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.role).toBe('timer');
    });

    it('should reject empty token', () => {
      const result = verifyToken('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No token provided');
    });

    it('should reject malformed token', () => {
      const result = verifyToken('not-a-jwt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject token signed with wrong secret', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'race-management' },
        'wrong-secret',
        { algorithm: 'HS256', issuer: 'ski-race-timer' },
      );
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject token with wrong type', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'wrong-type' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', issuer: 'ski-race-timer' },
      );
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });

    it('should detect expired tokens', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'race-management' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', issuer: 'ski-race-timer', expiresIn: '-1s' },
      );
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.error).toBe('Token expired');
    });

    it('should reject token with wrong issuer', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'race-management' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', issuer: 'wrong-issuer' },
      );
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
    });
  });

  describe('extractToken', () => {
    it('should extract token from valid Bearer header', () => {
      expect(extractToken('Bearer abc123')).toBe('abc123');
    });

    it('should return null for undefined header', () => {
      expect(extractToken(undefined)).toBeNull();
    });

    it('should return null for empty header', () => {
      expect(extractToken('')).toBeNull();
    });

    it('should return null for wrong scheme', () => {
      expect(extractToken('Basic abc123')).toBeNull();
    });

    it('should return null for missing token part', () => {
      expect(extractToken('Bearer')).toBeNull();
    });

    it('should return null for too many parts', () => {
      expect(extractToken('Bearer abc 123')).toBeNull();
    });
  });

  describe('validateAuth', () => {
    let mockRedis: { get: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockRedis = { get: vi.fn() };
    });

    it('should allow access when no auth header and no PIN set', async () => {
      mockRedis.get.mockResolvedValue(null);
      const req = { headers: {} } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(true);
      expect(result.method).toBe('none');
    });

    it('should require auth when no header but PIN is set', async () => {
      mockRedis.get.mockResolvedValue('some-hash');
      const req = { headers: {} } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Authorization required');
    });

    it('should reject invalid authorization format', async () => {
      const req = { headers: { authorization: 'InvalidFormat' } } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid authorization format');
    });

    it('should validate valid JWT token', async () => {
      const token = generateToken({ role: 'timer' });
      const req = { headers: { authorization: `Bearer ${token}` } } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(true);
      expect(result.method).toBe('jwt');
      expect(result.payload?.role).toBe('timer');
    });

    it('should detect expired JWT with expired flag', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'race-management' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', issuer: 'ski-race-timer', expiresIn: '-1s' },
      );
      const req = { headers: { authorization: `Bearer ${token}` } } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
    });

    it('should reject invalid JWT with re-auth message', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
      } as any;
      const result = await validateAuth(req, mockRedis as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('re-authenticate');
    });
  });

  describe('hashPin', () => {
    it('should return salt:hash format', async () => {
      const hash = await hashPin('1234');
      expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    });

    it('should produce different hashes for different salts', async () => {
      const hash1 = await hashPin('1234');
      const hash2 = await hashPin('1234');
      // Different salts → different full hash strings
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 32-byte (64 hex char) hash part', async () => {
      const hash = await hashPin('1234');
      const hashPart = hash.split(':')[1];
      expect(hashPart).toHaveLength(64);
    });
  });

  describe('verifyPin', () => {
    it('should verify correct PIN against PBKDF2 hash', async () => {
      const hash = await hashPin('5678');
      const result = await verifyPin('5678', hash);
      expect(result).toBe(true);
    });

    it('should reject wrong PIN against PBKDF2 hash', async () => {
      const hash = await hashPin('5678');
      const result = await verifyPin('9999', hash);
      expect(result).toBe(false);
    });

    it('should verify correct PIN against legacy SHA-256 hash', async () => {
      const crypto = await import('node:crypto');
      const legacyHash = crypto
        .createHash('sha256')
        .update('4321')
        .digest('hex');
      const result = await verifyPin('4321', legacyHash);
      expect(result).toBe(true);
    });

    it('should reject wrong PIN against legacy SHA-256 hash', async () => {
      const crypto = await import('node:crypto');
      const legacyHash = crypto
        .createHash('sha256')
        .update('4321')
        .digest('hex');
      const result = await verifyPin('0000', legacyHash);
      expect(result).toBe(false);
    });

    it('should return false for malformed stored hash', async () => {
      const result = await verifyPin('1234', 'totally-broken');
      expect(result).toBe(false);
    });

    it('should return false for empty stored hash', async () => {
      const result = await verifyPin('1234', '');
      expect(result).toBe(false);
    });
  });
});
