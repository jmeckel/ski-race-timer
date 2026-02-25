/**
 * API Tests - Security Pattern Source Code Assertions
 *
 * Tests that verify critical security patterns exist in API source code.
 * This is a defense-in-depth approach: even if integration tests pass,
 * these tests ensure the actual code contains the expected security mechanisms.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve project root from this test file's location (tests/api/ -> project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Helper to read source file using absolute path from project root
function readSource(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

// All API endpoint source files
const API_ENDPOINTS = [
  'api/v1/auth/token.ts',
  'api/v1/sync.ts',
  'api/v1/faults.ts',
  'api/v1/admin/races.ts',
  'api/v1/admin/pin.ts',
  'api/v1/admin/reset-pin.ts',
  'api/v1/voice.ts',
];

describe('Security Patterns - Source Code Assertions', () => {

  describe('Authentication enforcement', () => {
    // All endpoints except auth/token and reset-pin should use validateAuth
    const endpointsRequiringAuth = [
      'api/v1/sync.ts',
      'api/v1/faults.ts',
      'api/v1/admin/races.ts',
      'api/v1/admin/pin.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of endpointsRequiringAuth) {
      it(`${endpoint} should import validateAuth`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('validateAuth');
      });

      it(`${endpoint} should call validateAuth and check validity`, () => {
        const source = readSource(endpoint);
        // Should check auth result validity (variable may be named auth or authResult)
        const checksValidity = source.includes('!auth.valid') || source.includes('!authResult.valid');
        expect(checksValidity).toBe(true);
      });

      it(`${endpoint} should return auth error when validation fails`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('sendAuthRequired');
      });
    }

    it('auth/token.ts should NOT use validateAuth (it IS the auth endpoint)', () => {
      const source = readSource('api/v1/auth/token.ts');
      // token.ts provides authentication - it verifies PINs directly, not tokens
      expect(source).not.toContain('validateAuth');
    });

    it('reset-pin.ts should use server-side PIN verification (not validateAuth)', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      // reset-pin uses SERVER_API_PIN, not JWT auth
      expect(source).toContain('SERVER_API_PIN');
      expect(source).toContain('timingSafeEqual');
    });
  });

  describe('Timing-safe comparison', () => {
    it('auth/token.ts should use verifyPin (which uses timingSafeEqual internally)', () => {
      const source = readSource('api/v1/auth/token.ts');
      expect(source).toContain('verifyPin');
    });

    it('jwt.ts verifyPin should use timingSafeEqual', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain('timingSafeEqual');
    });

    it('admin/pin.ts should use verifyPin for PIN change verification', () => {
      const source = readSource('api/v1/admin/pin.ts');
      expect(source).toContain('verifyPin');
    });

    it('reset-pin.ts should use timingSafeEqual for server PIN verification', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      expect(source).toContain('timingSafeEqual');
    });
  });

  describe('PBKDF2 hashing', () => {
    it('jwt.ts should use PBKDF2 for PIN hashing', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain('pbkdf2Async');
    });

    it('jwt.ts should use at least 100000 iterations', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toMatch(/PBKDF2_ITERATIONS.*=\s*100000/);
    });

    it('jwt.ts should use random salt for each hash', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain('randomBytes');
    });

    it('jwt.ts should support legacy SHA-256 format for migration', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain("storedHash.includes(':')");
    });
  });

  describe('Rate limiting', () => {
    const rateLimitedEndpoints = [
      'api/v1/auth/token.ts',
      'api/v1/sync.ts',
      'api/v1/faults.ts',
      'api/v1/admin/reset-pin.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of rateLimitedEndpoints) {
      it(`${endpoint} should implement rate limiting`, () => {
        const source = readSource(endpoint);
        // Should contain rate limit related code (case-insensitive check)
        const hasRateLimit = source.includes('rateLimit') || source.includes('RateLimit');
        expect(hasRateLimit).toBe(true);
      });
    }

    it('auth/token.ts should have stricter rate limits (brute-force protection)', () => {
      const source = readSource('api/v1/auth/token.ts');
      // Should have a low rate limit for PIN attempts
      expect(source).toMatch(/RATE_LIMIT_MAX_REQUESTS\s*=\s*5/);
    });

    it('shared checkRateLimit should fail closed on error', () => {
      const source = readSource('api/lib/validation.ts');
      // Should return allowed: false in catch block
      expect(source).toContain('allowed: false');
      // Should have a comment about fail closed
      expect(source).toMatch(/[Ff]ail closed/i);
    });

    it('auth/token.ts checkRateLimit should fail closed on error', () => {
      const source = readSource('api/v1/auth/token.ts');
      // The local checkRateLimit should also fail closed
      expect(source).toContain('allowed: false');
    });
  });

  describe('Fail-closed patterns', () => {
    const failClosedEndpoints = [
      'api/v1/auth/token.ts',
      'api/v1/sync.ts',
      'api/v1/faults.ts',
      'api/v1/admin/races.ts',
      'api/v1/admin/pin.ts',
      'api/v1/admin/reset-pin.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of failClosedEndpoints) {
      it(`${endpoint} should check for Redis errors and return 503`, () => {
        const source = readSource(endpoint);
        // All endpoints should handle Redis unavailability
        expect(source).toContain('sendServiceUnavailable');
      });
    }

    it('voice.ts should fail closed when Redis is unavailable', () => {
      const source = readSource('api/v1/voice.ts');
      // Should check for Redis unavailability before auth (try/catch + hasRedisError)
      expect(source).toContain('hasRedisError()');
      expect(source).toContain('sendServiceUnavailable');
    });
  });

  describe('Structured logging (apiLogger usage)', () => {
    // All API files should use apiLogger instead of raw console.log
    for (const endpoint of API_ENDPOINTS) {
      it(`${endpoint} should import apiLogger`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('apiLogger');
      });

      it(`${endpoint} should not use raw console.log for application logging`, () => {
        const source = readSource(endpoint);
        // Remove comments and string literals to avoid false positives
        const codeOnly = source
          .replace(/\/\/.*$/gm, '')     // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
          .replace(/'[^']*'/g, '')      // Remove single-quoted strings
          .replace(/"[^"]*"/g, '');     // Remove double-quoted strings

        // Should not have bare console.log (apiLogger wraps console internally)
        const consoleLogMatches = codeOnly.match(/console\.log\(/g) || [];
        expect(consoleLogMatches.length).toBe(0);
      });
    }

    // The shared validation module uses inline JSON format (intentionally avoiding circular import)
    it('api/lib/validation.ts should use structured JSON for error logging', () => {
      const source = readSource('api/lib/validation.ts');
      // Uses inline JSON formatting to avoid circular import with apiLogger
      expect(source).toContain('JSON.stringify');
      // In TypeScript source, the object key is unquoted: { level: 'error', ... }
      expect(source).toContain("level: 'error'");
    });
  });

  describe('Input validation', () => {
    it('sync.ts should validate entry format', () => {
      const source = readSource('api/v1/sync.ts');
      expect(source).toContain('isValidEntry');
    });

    it('faults.ts should validate fault format', () => {
      const source = readSource('api/v1/faults.ts');
      expect(source).toContain('isValidFaultEntry');
    });

    it('sync.ts and faults.ts should validate raceId format', () => {
      const syncSource = readSource('api/v1/sync.ts');
      const faultsSource = readSource('api/v1/faults.ts');

      expect(syncSource).toContain('isValidRaceId');
      expect(faultsSource).toContain('isValidRaceId');
    });

    it('sync.ts should sanitize device strings', () => {
      const source = readSource('api/v1/sync.ts');
      expect(source).toContain('sanitizeString');
    });

    it('faults.ts should sanitize device strings', () => {
      const source = readSource('api/v1/faults.ts');
      expect(source).toContain('sanitizeString');
    });
  });

  describe('Role-based access control', () => {
    it('faults.ts DELETE should require chiefJudge role', () => {
      const source = readSource('api/v1/faults.ts');
      // Should check for chiefJudge role on DELETE with 403 response
      expect(source).toContain("userRole !== 'chiefJudge'");
      expect(source).toContain("sendError(res, 'Fault deletion requires Chief Judge role', 403)");
    });

    it('admin/races.ts DELETE should require chiefJudge role', () => {
      const source = readSource('api/v1/admin/races.ts');
      expect(source).toContain("userRole !== 'chiefJudge'");
      expect(source).toContain("sendError(res, 'Race deletion requires Chief Judge role', 403)");
    });
  });

  describe('Security headers', () => {
    // All endpoints should set security headers via handlePreflight or setStandardHeaders
    for (const endpoint of API_ENDPOINTS) {
      it(`${endpoint} should set standard headers (via handlePreflight or directly)`, () => {
        const source = readSource(endpoint);
        const hasHeaderSetup = source.includes('handlePreflight') || source.includes('setSecurityHeaders');
        expect(hasHeaderSetup).toBe(true);
      });
    }
  });

  describe('JWT configuration security', () => {
    it('jwt.ts should fail if JWT_SECRET is not set (no fallback)', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain("!process.env.JWT_SECRET");
      expect(source).toContain('throw new Error');
    });

    it('jwt.ts should use HS256 algorithm', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain("'HS256'");
    });

    it('jwt.ts should set token expiry', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain("JWT_EXPIRY");
      expect(source).toContain("'24h'");
    });

    it('jwt.ts should verify token issuer', () => {
      const source = readSource('api/lib/jwt.ts');
      expect(source).toContain('issuer');
      expect(source).toContain("'ski-race-timer'");
    });
  });

  describe('PIN hash never exposed', () => {
    it('admin/pin.ts GET should return boolean flags, never hashes', () => {
      const source = readSource('api/v1/admin/pin.ts');
      // Should contain boolean conversion
      expect(source).toContain('!!pinHash');
      expect(source).toContain('!!chiefPinHash');
      // The response should use hasPin/hasChiefPin boolean fields
      expect(source).toContain('hasPin');
      expect(source).toContain('hasChiefPin');
    });
  });
});
