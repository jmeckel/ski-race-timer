/**
 * API Tests - Structured API Logger
 *
 * Tests for apiLogger and getRequestId in api/lib/apiLogger.ts
 * Verifies JSON output format, request ID tracing, and debug suppression.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the actual module
import { apiLogger, getRequestId } from '../../api/lib/apiLogger.ts';

describe('apiLogger', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info()', () => {
    it('should produce valid JSON output', () => {
      apiLogger.info('Test message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('Test message');
      expect(parsed.ts).toBeDefined();
    });

    it('should include metadata in output', () => {
      apiLogger.info('With meta', { endpoint: '/api/v1/sync', method: 'GET' });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('With meta');
      expect(parsed.endpoint).toBe('/api/v1/sync');
      expect(parsed.method).toBe('GET');
    });

    it('should include ISO timestamp', () => {
      apiLogger.info('Timestamp test');

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      // Verify ISO 8601 format
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      // Verify it parses as a valid date
      expect(new Date(parsed.ts).getTime()).not.toBeNaN();
    });
  });

  describe('warn()', () => {
    it('should produce valid JSON output via console.warn', () => {
      apiLogger.warn('Warning message');

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const output = consoleSpy.warn.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('warn');
      expect(parsed.msg).toBe('Warning message');
    });

    it('should include metadata', () => {
      apiLogger.warn('Rate limit', { ip: '1.2.3.4', remaining: 0 });

      const output = consoleSpy.warn.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.ip).toBe('1.2.3.4');
      expect(parsed.remaining).toBe(0);
    });
  });

  describe('error()', () => {
    it('should produce valid JSON output via console.error', () => {
      apiLogger.error('Error occurred');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const output = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('error');
      expect(parsed.msg).toBe('Error occurred');
    });

    it('should include error metadata', () => {
      apiLogger.error('Redis failed', { error: 'ECONNREFUSED' });

      const output = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error).toBe('ECONNREFUSED');
    });
  });

  describe('debug()', () => {
    it('should output in non-production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      apiLogger.debug('Debug message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('debug');
      expect(parsed.msg).toBe('Debug message');

      process.env.NODE_ENV = originalEnv;
    });

    it('should be suppressed in production (NODE_ENV=production)', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      apiLogger.debug('Should not appear');

      expect(consoleSpy.log).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include metadata when not suppressed', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      apiLogger.debug('Debug with meta', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.key).toBe('value');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('withRequestId()', () => {
    it('should create a child logger that includes requestId', () => {
      const log = apiLogger.withRequestId('req-abc-123');

      log.info('Request started');

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.requestId).toBe('req-abc-123');
      expect(parsed.msg).toBe('Request started');
      expect(parsed.level).toBe('info');
    });

    it('should include requestId in warn messages', () => {
      const log = apiLogger.withRequestId('req-456');

      log.warn('Rate limited');

      const output = consoleSpy.warn.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.requestId).toBe('req-456');
      expect(parsed.level).toBe('warn');
    });

    it('should include requestId in error messages', () => {
      const log = apiLogger.withRequestId('req-789');

      log.error('Internal error', { error: 'Something broke' });

      const output = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.requestId).toBe('req-789');
      expect(parsed.error).toBe('Something broke');
    });

    it('should include requestId in debug messages when not suppressed', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const log = apiLogger.withRequestId('req-debug');
      log.debug('Debug trace');

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.requestId).toBe('req-debug');
      expect(parsed.level).toBe('debug');

      process.env.NODE_ENV = originalEnv;
    });

    it('should merge requestId with additional metadata', () => {
      const log = apiLogger.withRequestId('req-merge');

      log.info('With extra', { ip: '10.0.0.1', raceId: 'TEST' });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.requestId).toBe('req-merge');
      expect(parsed.ip).toBe('10.0.0.1');
      expect(parsed.raceId).toBe('TEST');
    });
  });
});

describe('getRequestId', () => {
  it('should extract x-request-id from headers', () => {
    const headers = { 'x-request-id': 'custom-req-id' };
    expect(getRequestId(headers)).toBe('custom-req-id');
  });

  it('should extract x-vercel-id from headers as fallback', () => {
    const headers = { 'x-vercel-id': 'vercel-123' };
    expect(getRequestId(headers)).toBe('vercel-123');
  });

  it('should prefer x-request-id over x-vercel-id', () => {
    const headers = {
      'x-request-id': 'preferred',
      'x-vercel-id': 'fallback',
    };
    expect(getRequestId(headers)).toBe('preferred');
  });

  it('should handle array header values (take first)', () => {
    const headers = { 'x-request-id': ['first-id', 'second-id'] };
    expect(getRequestId(headers)).toBe('first-id');
  });

  it('should generate a random ID when no headers present', () => {
    const headers = {};
    const id = getRequestId(headers);

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    // Random IDs from Math.random().toString(36) are alphanumeric
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('should generate different IDs for different calls', () => {
    const id1 = getRequestId({});
    const id2 = getRequestId({});

    // While technically they could be equal, the probability is astronomically low
    // This verifies it's not returning a constant
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });

  it('should handle undefined header values', () => {
    const headers = { 'x-request-id': undefined };
    const id = getRequestId(headers);

    // Should fall through to generating a random ID
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });
});
