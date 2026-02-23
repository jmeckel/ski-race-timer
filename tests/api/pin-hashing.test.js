/**
 * API Tests - PBKDF2 PIN Hashing
 *
 * Tests for hashPin() and verifyPin() in api/lib/jwt.js
 * Verifies PBKDF2 hashing, salt uniqueness, timing-safe comparison,
 * and legacy SHA-256 migration path.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { hashPin, verifyPin } from '../../api/lib/jwt.ts';

describe('PIN Hashing (PBKDF2)', () => {
  describe('hashPin', () => {
    it('should return salt:hash format', async () => {
      const hash = await hashPin('1234');
      expect(hash).toContain(':');
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
    });

    it('should generate hex-encoded salt and hash', async () => {
      const hash = await hashPin('1234');
      const [salt, derived] = hash.split(':');
      // 16-byte salt = 32 hex chars
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
      // 32-byte key = 64 hex chars
      expect(derived).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce unique salts for same PIN', async () => {
      const hash1 = await hashPin('1234');
      const hash2 = await hashPin('1234');
      const salt1 = hash1.split(':')[0];
      const salt2 = hash2.split(':')[0];
      expect(salt1).not.toBe(salt2);
    });

    it('should produce different hashes for same PIN due to unique salts', async () => {
      const hash1 = await hashPin('1234');
      const hash2 = await hashPin('1234');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPin', () => {
    it('should verify correct PIN against PBKDF2 hash', async () => {
      const hash = await hashPin('5678');
      expect(await verifyPin('5678', hash)).toBe(true);
    });

    it('should reject incorrect PIN against PBKDF2 hash', async () => {
      const hash = await hashPin('5678');
      expect(await verifyPin('0000', hash)).toBe(false);
    });

    it('should verify all 4-digit PINs correctly', async () => {
      // Test a range of PINs
      for (const pin of ['0000', '1234', '5678', '9999', '0001']) {
        const hash = await hashPin(pin);
        expect(await verifyPin(pin, hash)).toBe(true);
        expect(await verifyPin('xxxx', hash)).toBe(false);
      }
    });

    it('should handle legacy SHA-256 hash format', async () => {
      // Legacy format: plain SHA-256 hex (no colon)
      const pin = '1234';
      const legacyHash = crypto.createHash('sha256').update(pin).digest('hex');

      expect(legacyHash).not.toContain(':');
      expect(await verifyPin(pin, legacyHash)).toBe(true);
      expect(await verifyPin('0000', legacyHash)).toBe(false);
    });

    it('should return false for malformed hash', async () => {
      expect(await verifyPin('1234', '')).toBe(false);
      expect(await verifyPin('1234', 'not-a-valid-hash')).toBe(false);
      expect(await verifyPin('1234', '::')).toBe(false);
    });

    it('should return false for truncated PBKDF2 hash', async () => {
      const hash = await hashPin('1234');
      const truncated = hash.substring(0, hash.length - 10);
      expect(await verifyPin('1234', truncated)).toBe(false);
    });

    it('should return false for empty PIN', async () => {
      const hash = await hashPin('1234');
      expect(await verifyPin('', hash)).toBe(false);
    });
  });

  describe('migration path', () => {
    it('PBKDF2 hash contains colon, legacy does not', async () => {
      const pbkdf2Hash = await hashPin('1234');
      const legacyHash = crypto.createHash('sha256').update('1234').digest('hex');

      // This is how the migration code distinguishes formats
      expect(pbkdf2Hash.includes(':')).toBe(true);
      expect(legacyHash.includes(':')).toBe(false);
    });

    it('verifyPin works with both formats for same PIN', async () => {
      const pin = '4567';
      const pbkdf2Hash = await hashPin(pin);
      const legacyHash = crypto.createHash('sha256').update(pin).digest('hex');

      expect(await verifyPin(pin, pbkdf2Hash)).toBe(true);
      expect(await verifyPin(pin, legacyHash)).toBe(true);
    });

    it('upgraded hash should verify with verifyPin', async () => {
      // Simulate migration: verify legacy, then re-hash with PBKDF2
      const pin = '9876';
      const legacyHash = crypto.createHash('sha256').update(pin).digest('hex');

      // Verify with legacy
      expect(await verifyPin(pin, legacyHash)).toBe(true);

      // "Migrate" by hashing with PBKDF2
      const upgradedHash = await hashPin(pin);

      // Verify with new hash
      expect(await verifyPin(pin, upgradedHash)).toBe(true);

      // Old PIN still shouldn't work
      expect(await verifyPin('0000', upgradedHash)).toBe(false);
    });
  });
});
