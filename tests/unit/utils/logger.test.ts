/**
 * Unit Tests for Logger Utility
 *
 * The logger binds methods at module load time via .bind(console).
 * To test dev vs prod behavior, we use vi.stubEnv('DEV', ...) before
 * importing the module with vi.resetModules() + dynamic import().
 * Spies are set up BEFORE the import so .bind() captures the spy.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const loggerPath = resolve(__filename, '../../../../src/utils/logger.ts');

describe('Logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('in development mode', () => {
    it('should call console.log for debug()', async () => {
      vi.stubEnv('DEV', true);
      const { logger } = await import('../../../src/utils/logger');
      logger.debug('test debug message');
      expect(logSpy).toHaveBeenCalledWith('test debug message');
    });

    it('should call console.log for log()', async () => {
      vi.stubEnv('DEV', true);
      const { logger } = await import('../../../src/utils/logger');
      logger.log('test log message');
      expect(logSpy).toHaveBeenCalledWith('test log message');
    });

    it('should call console.info for info()', async () => {
      vi.stubEnv('DEV', true);
      const { logger } = await import('../../../src/utils/logger');
      logger.info('test info message');
      expect(infoSpy).toHaveBeenCalledWith('test info message');
    });

    it('should call console.warn for warn()', async () => {
      vi.stubEnv('DEV', true);
      const { logger } = await import('../../../src/utils/logger');
      logger.warn('test warn message');
      expect(warnSpy).toHaveBeenCalledWith('test warn message');
    });

    it('should call console.error for error()', async () => {
      vi.stubEnv('DEV', true);
      const { logger } = await import('../../../src/utils/logger');
      logger.error('test error message');
      expect(errorSpy).toHaveBeenCalledWith('test error message');
    });
  });

  describe('in production mode', () => {
    it('should suppress debug() calls', async () => {
      vi.stubEnv('DEV', false);
      const { logger } = await import('../../../src/utils/logger');
      logger.debug('should not appear');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should suppress log() calls', async () => {
      vi.stubEnv('DEV', false);
      const { logger } = await import('../../../src/utils/logger');
      logger.log('should not appear');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should suppress info() calls', async () => {
      vi.stubEnv('DEV', false);
      const { logger } = await import('../../../src/utils/logger');
      logger.info('should not appear');
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should still call console.warn in production', async () => {
      vi.stubEnv('DEV', false);
      const { logger } = await import('../../../src/utils/logger');
      logger.warn('production warning');
      expect(warnSpy).toHaveBeenCalledWith('production warning');
    });

    it('should still call console.error in production', async () => {
      vi.stubEnv('DEV', false);
      const { logger } = await import('../../../src/utils/logger');
      logger.error('production error');
      expect(errorSpy).toHaveBeenCalledWith('production error');
    });
  });

  describe('argument pass-through', () => {
    it('should pass multiple arguments to warn()', async () => {
      const { logger } = await import('../../../src/utils/logger');
      logger.warn('message', { detail: 'value' }, 42);
      expect(warnSpy).toHaveBeenCalledWith('message', { detail: 'value' }, 42);
    });

    it('should pass multiple arguments to error()', async () => {
      const { logger } = await import('../../../src/utils/logger');
      const err = new Error('test error');
      logger.error('Failed:', err);
      expect(errorSpy).toHaveBeenCalledWith('Failed:', err);
    });

    it('should pass zero arguments without error', async () => {
      const { logger } = await import('../../../src/utils/logger');
      logger.warn();
      expect(warnSpy).toHaveBeenCalledWith();
    });
  });

  describe('method binding and destructuring', () => {
    it('should work when warn is destructured', async () => {
      const { logger } = await import('../../../src/utils/logger');
      const { warn } = logger;
      warn('destructured warn');
      expect(warnSpy).toHaveBeenCalledWith('destructured warn');
    });

    it('should work when error is destructured', async () => {
      const { logger } = await import('../../../src/utils/logger');
      const { error } = logger;
      error('destructured error');
      expect(errorSpy).toHaveBeenCalledWith('destructured error');
    });

    it('should work when assigned to a variable', async () => {
      const { logger } = await import('../../../src/utils/logger');
      const warnFn = logger.warn;
      warnFn('variable warn');
      expect(warnSpy).toHaveBeenCalledWith('variable warn');
    });
  });

  describe('logger structure', () => {
    it('should export logger as named export', async () => {
      const mod = await import('../../../src/utils/logger');
      expect(mod.logger).toBeDefined();
      expect(typeof mod.logger.debug).toBe('function');
      expect(typeof mod.logger.log).toBe('function');
      expect(typeof mod.logger.info).toBe('function');
      expect(typeof mod.logger.warn).toBe('function');
      expect(typeof mod.logger.error).toBe('function');
    });

    it('should export logger as default export', async () => {
      const mod = await import('../../../src/utils/logger');
      expect(mod.default).toBeDefined();
      expect(typeof mod.default.debug).toBe('function');
      expect(typeof mod.default.log).toBe('function');
      expect(typeof mod.default.info).toBe('function');
      expect(typeof mod.default.warn).toBe('function');
      expect(typeof mod.default.error).toBe('function');
    });

    it('should have exactly five methods', async () => {
      const mod = await import('../../../src/utils/logger');
      const methodNames = Object.keys(mod.logger).sort();
      expect(methodNames).toEqual(['debug', 'error', 'info', 'log', 'warn']);
    });
  });

  describe('source code verification', () => {
    it('should use import.meta.env.DEV for environment detection', () => {
      const source = readFileSync(loggerPath, 'utf-8');
      expect(source).toContain('import.meta.env.DEV');
    });

    it('should use .bind(console) for warn and error (always active)', () => {
      const source = readFileSync(loggerPath, 'utf-8');
      expect(source).toMatch(/warn:\s*console\.warn\.bind\(console\)/);
      expect(source).toMatch(/error:\s*console\.error\.bind\(console\)/);
    });

    it('should conditionally enable debug/log/info based on isDev', () => {
      const source = readFileSync(loggerPath, 'utf-8');
      expect(source).toMatch(/debug:\s*isDev\s*\?/);
      expect(source).toMatch(/log:\s*isDev\s*\?/);
      expect(source).toMatch(/info:\s*isDev\s*\?/);
    });

    it('should use no-op function for production debug/log/info', () => {
      const source = readFileSync(loggerPath, 'utf-8');
      expect(source).toContain('() => {}');
    });
  });
});
