/**
 * Unit Tests for Feedback Service
 * Tests basic exports and behavior that can be tested in jsdom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    if (key === 'skiTimerSettings') {
      return JSON.stringify({ haptic: true, sound: true });
    }
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Feedback Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('exports', () => {
    it('should export vibrate function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.vibrate).toBe('function');
    });

    it('should export playBeep function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.playBeep).toBe('function');
    });

    it('should export feedbackSuccess function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackSuccess).toBe('function');
    });

    it('should export feedbackWarning function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackWarning).toBe('function');
    });

    it('should export feedbackError function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackError).toBe('function');
    });

    it('should export feedbackTap function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackTap).toBe('function');
    });

    it('should export feedbackSelect function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackSelect).toBe('function');
    });

    it('should export feedbackDelete function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackDelete).toBe('function');
    });

    it('should export feedbackUndo function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackUndo).toBe('function');
    });

    it('should export feedbackExport function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackExport).toBe('function');
    });

    it('should export feedbackSync function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.feedbackSync).toBe('function');
    });

    it('should export resumeAudio function', async () => {
      const module = await import('../../../src/services/feedback');
      expect(typeof module.resumeAudio).toBe('function');
    });
  });

  describe('function calls', () => {
    it('vibrate should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      expect(() => module.vibrate(100)).not.toThrow();
    });

    it('playBeep should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      expect(() => module.playBeep()).not.toThrow();
    });

    it('feedbackSuccess should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      expect(() => module.feedbackSuccess()).not.toThrow();
    });

    it('feedbackWarning should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      expect(() => module.feedbackWarning()).not.toThrow();
    });

    it('feedbackError should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      expect(() => module.feedbackError()).not.toThrow();
    });

    it('resumeAudio should not throw', async () => {
      const module = await import('../../../src/services/feedback');
      await expect(module.resumeAudio()).resolves.not.toThrow();
    });
  });
});
