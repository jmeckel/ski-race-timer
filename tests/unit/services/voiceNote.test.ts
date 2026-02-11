/**
 * Voice Note Service Tests
 * Tests for the VoiceNoteService including recording lifecycle and callbacks
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  start = vi.fn(() => {
    setTimeout(() => this.onstart?.(), 0);
  });
  stop = vi.fn(() => {
    setTimeout(() => this.onend?.(), 0);
  });
  abort = vi.fn(() => {
    setTimeout(() => this.onend?.(), 0);
  });
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);
}

let mockRecognition: MockSpeechRecognition;

beforeEach(() => {
  mockRecognition = new MockSpeechRecognition();
  (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
    () => mockRecognition,
  );
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
    vi.fn(() => mockRecognition);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('VoiceNoteService', () => {
  describe('isSupported', () => {
    it('should return true when SpeechRecognition is available', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      expect(voiceNoteService.isSupported()).toBe(true);
    });
  });

  describe('initial state', () => {
    it('should have idle status initially', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      expect(voiceNoteService.getStatus()).toBe('idle');
    });

    it('should not be recording initially', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      expect(voiceNoteService.isRecording()).toBe(false);
    });
  });

  describe('start', () => {
    it('should start recognition and return true', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const result = voiceNoteService.start();
      expect(result).toBe(true);
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should return false if recognition throws', async () => {
      mockRecognition.start.mockImplementation(() => {
        throw new Error('fail');
      });
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const result = voiceNoteService.start();
      expect(result).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop recognition', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      voiceNoteService.start();
      voiceNoteService.stop();
      expect(mockRecognition.stop).toHaveBeenCalled();
      expect(voiceNoteService.getStatus()).toBe('idle');
    });
  });

  describe('abort', () => {
    it('should abort recognition', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      voiceNoteService.start();
      voiceNoteService.abort();
      expect(mockRecognition.abort).toHaveBeenCalled();
      expect(voiceNoteService.getStatus()).toBe('idle');
    });
  });

  describe('status callbacks', () => {
    it('should notify on status change', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const callback = vi.fn();
      voiceNoteService.onStatusChange(callback);

      voiceNoteService.start();
      // Trigger onstart to change status to 'listening'
      mockRecognition.onstart?.();

      expect(callback).toHaveBeenCalledWith('listening');
    });

    it('should unsubscribe correctly', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const callback = vi.fn();
      const unsub = voiceNoteService.onStatusChange(callback);
      unsub();

      voiceNoteService.start();
      mockRecognition.onstart?.();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('transcript callbacks', () => {
    it('should return an unsubscribe function', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const callback = vi.fn();
      const unsub = voiceNoteService.onTranscript(callback);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('max duration timeout', () => {
    it('should auto-stop after max duration', async () => {
      vi.useFakeTimers();
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );

      voiceNoteService.start();
      // MAX_DURATION_MS is 30000
      vi.advanceTimersByTime(30001);

      expect(mockRecognition.stop).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should set error status on not-allowed error', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const callback = vi.fn();
      voiceNoteService.onStatusChange(callback);

      voiceNoteService.start();
      mockRecognition.onerror?.({ error: 'not-allowed' } as unknown as Event);

      expect(callback).toHaveBeenCalledWith('error');
    });

    it('should set idle status on no-speech error', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      const callback = vi.fn();
      voiceNoteService.onStatusChange(callback);

      voiceNoteService.start();
      // First set to listening
      mockRecognition.onstart?.();
      callback.mockClear();

      mockRecognition.onerror?.({ error: 'no-speech' } as unknown as Event);
      expect(callback).toHaveBeenCalledWith('idle');
    });
  });

  describe('destroy', () => {
    it('should prevent further starts after destroy', async () => {
      const { voiceNoteService } = await import(
        '../../../src/services/voiceNote'
      );
      voiceNoteService.destroy();
      const result = voiceNoteService.start();
      expect(result).toBe(false);
    });
  });
});
