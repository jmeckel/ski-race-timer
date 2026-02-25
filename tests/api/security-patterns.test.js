/**
 * API Tests - Security Pattern Source Code Assertions
 *
 * Tests that verify critical security patterns exist in API source code.
 * This is a defense-in-depth approach: even if integration tests pass,
 * these tests ensure the actual code contains the expected security mechanisms.
 *
 * Architecture: Most endpoints use createHandler() middleware from api/lib/handler.ts
 * which centralizes: CORS preflight, Redis init, Redis health check, rate limiting,
 * authentication, request ID, and error boundary. The assertions check both:
 * - handler.ts for the centralized security patterns
 * - Individual endpoints for createHandler usage + endpoint-specific patterns
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

// Endpoints that use createHandler middleware
const HANDLER_ENDPOINTS = [
  'api/v1/auth/token.ts',
  'api/v1/sync.ts',
  'api/v1/faults.ts',
  'api/v1/admin/races.ts',
  'api/v1/admin/pin.ts',
  'api/v1/voice.ts',
];

describe('Security Patterns - Source Code Assertions', () => {

  describe('createHandler middleware adoption', () => {
    for (const endpoint of HANDLER_ENDPOINTS) {
      it(`${endpoint} should use createHandler middleware`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('createHandler');
      });
    }

    it('reset-pin.ts should NOT use createHandler (manages its own auth flow)', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      expect(source).not.toContain('createHandler');
    });
  });

  describe('Authentication enforcement', () => {
    // Endpoints requiring auth use createHandler with auth: true
    const endpointsRequiringAuth = [
      'api/v1/sync.ts',
      'api/v1/faults.ts',
      'api/v1/admin/races.ts',
      'api/v1/admin/pin.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of endpointsRequiringAuth) {
      it(`${endpoint} should enable auth via createHandler`, () => {
        const source = readSource(endpoint);
        // Should use createHandler with auth: true option
        expect(source).toContain('auth: true');
      });
    }

    it('handler.ts should import and call validateAuth', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('validateAuth');
      expect(source).toContain('!auth.valid');
      expect(source).toContain('sendAuthRequired');
    });

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
    // Endpoints using createHandler with rateLimit option
    const rateLimitedViaHandler = [
      'api/v1/sync.ts',
      'api/v1/faults.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of rateLimitedViaHandler) {
      it(`${endpoint} should implement rate limiting via createHandler`, () => {
        const source = readSource(endpoint);
        const hasRateLimit = source.includes('rateLimit') || source.includes('RateLimit');
        expect(hasRateLimit).toBe(true);
      });
    }

    // auth/token.ts handles rate limiting manually (after PIN format validation)
    it('auth/token.ts should implement rate limiting', () => {
      const source = readSource('api/v1/auth/token.ts');
      const hasRateLimit = source.includes('rateLimit') || source.includes('RateLimit');
      expect(hasRateLimit).toBe(true);
    });

    // reset-pin.ts has its own local checkRateLimit
    it('reset-pin.ts should implement rate limiting', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      const hasRateLimit = source.includes('rateLimit') || source.includes('RateLimit');
      expect(hasRateLimit).toBe(true);
    });

    it('auth/token.ts should have stricter rate limits (brute-force protection)', () => {
      const source = readSource('api/v1/auth/token.ts');
      // Should have a low rate limit for PIN attempts (maxRequests: 5 or maxPosts: 5)
      expect(source).toMatch(/max(?:Requests|Posts)\s*:\s*5/);
    });

    it('shared checkRateLimit should fail closed on error', () => {
      const source = readSource('api/lib/validation.ts');
      // Should return allowed: false in catch block
      expect(source).toContain('allowed: false');
      // Should have a comment about fail closed
      expect(source).toMatch(/[Ff]ail closed/i);
    });

    it('handler.ts should use shared checkRateLimit from validation.ts', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('checkRateLimit');
    });
  });

  describe('Fail-closed patterns', () => {
    it('handler.ts should check for Redis errors and return 503', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('hasRedisError()');
      expect(source).toContain('sendServiceUnavailable');
      expect(source).toContain('getRedis()');
    });

    // All createHandler endpoints inherit fail-closed behavior from handler.ts
    for (const endpoint of HANDLER_ENDPOINTS) {
      it(`${endpoint} should use createHandler (which provides fail-closed Redis checks)`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('createHandler');
      });
    }

    // reset-pin.ts manages Redis directly
    it('reset-pin.ts should check for Redis errors and return 503', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      expect(source).toContain('sendServiceUnavailable');
      expect(source).toContain('hasRedisError()');
    });

    it('handler.ts error boundary should handle ECONNREFUSED/ETIMEDOUT', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('ECONNREFUSED');
      expect(source).toContain('ETIMEDOUT');
    });
  });

  describe('Structured logging (apiLogger usage)', () => {
    // handler.ts uses apiLogger for centralized logging
    it('handler.ts should use apiLogger for error logging', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('apiLogger');
    });

    // Endpoints that have their own logging beyond what createHandler provides
    // Endpoints with their own logging (apiLogger import or log from handler context)
    // auth/token.ts delegates all logging to createHandler's error boundary
    const endpointsWithOwnLogging = [
      'api/v1/sync.ts',
      'api/v1/admin/races.ts',
      'api/v1/admin/pin.ts',
      'api/v1/admin/reset-pin.ts',
      'api/v1/voice.ts',
    ];

    for (const endpoint of endpointsWithOwnLogging) {
      it(`${endpoint} should import apiLogger or use log from context`, () => {
        const source = readSource(endpoint);
        // Either imports apiLogger directly or uses log from handler context
        const hasLogging = source.includes('apiLogger') || source.includes('log.');
        expect(hasLogging).toBe(true);
      });
    }

    // All endpoints should not use raw console.log
    for (const endpoint of API_ENDPOINTS) {
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
    it('sync.ts should validate entry format (via Valibot EntrySchema)', () => {
      const source = readSource('api/v1/sync.ts');
      // Migrated from isValidEntry to validate(EntrySchema, ...)
      expect(source).toContain('EntrySchema');
      expect(source).toContain('validate');
    });

    it('faults.ts should validate fault format (via Valibot FaultEntrySchema)', () => {
      const source = readSource('api/v1/faults.ts');
      // Migrated from isValidFaultEntry to validate(FaultEntrySchema, ...)
      expect(source).toContain('FaultEntrySchema');
      expect(source).toContain('validate');
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
    // handler.ts uses handlePreflight which sets standard headers for all createHandler endpoints
    it('handler.ts should set standard headers via handlePreflight', () => {
      const source = readSource('api/lib/handler.ts');
      expect(source).toContain('handlePreflight');
    });

    // All createHandler endpoints inherit security headers from handler.ts
    for (const endpoint of HANDLER_ENDPOINTS) {
      it(`${endpoint} should use createHandler (which sets security headers)`, () => {
        const source = readSource(endpoint);
        expect(source).toContain('createHandler');
      });
    }

    // reset-pin.ts sets headers directly
    it('reset-pin.ts should set standard headers directly', () => {
      const source = readSource('api/v1/admin/reset-pin.ts');
      const hasHeaderSetup = source.includes('handlePreflight') || source.includes('setSecurityHeaders');
      expect(hasHeaderSetup).toBe(true);
    });
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
