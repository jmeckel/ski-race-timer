/**
 * Voice Mode Service - Pause/Resume Tests
 * Tests the pause() and resume() methods for mutual exclusion
 * with the voice note service (SpeechRecognition conflict prevention)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    // Simulate async start
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

// Set up global SpeechRecognition mock before imports
let mockRecognition: MockSpeechRecognition;

beforeEach(() => {
  mockRecognition = new MockSpeechRecognition();
  (globalThis as unknown as Record<string, unknown>).SpeechRecognition = undefined;
  (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(() => mockRecognition);
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = vi.fn(() => mockRecognition);

  // Mock speechSynthesis for initialize()
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onvoiceschanged: null,
    paused: false,
    pending: false,
    speaking: false
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('VoiceModeService pause/resume', () => {
  it('should export pause and resume methods', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');
    expect(typeof voiceModeService.pause).toBe('function');
    expect(typeof voiceModeService.resume).toBe('function');
  });

  it('should export isPausedState method', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');
    expect(typeof voiceModeService.isPausedState).toBe('function');
    expect(voiceModeService.isPausedState()).toBe(false);
  });

  it('pause should be a no-op when not enabled', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');
    // Not enabled, not initialized
    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(false);
  });

  it('resume should be a no-op when not paused', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');
    voiceModeService.resume();
    // No error, still not paused
    expect(voiceModeService.isPausedState()).toBe(false);
  });

  it('pause should abort recognition when enabled', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    // Initialize and enable
    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();

    voiceModeService.pause();

    expect(voiceModeService.isPausedState()).toBe(true);
    expect(mockRecognition.abort).toHaveBeenCalled();
  });

  it('resume should schedule restart after pause', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();
    mockRecognition.start.mockClear();

    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(true);

    voiceModeService.resume();
    expect(voiceModeService.isPausedState()).toBe(false);

    // After RESTART_DELAY_MS (100ms), recognition should restart
    vi.advanceTimersByTime(150);
    expect(mockRecognition.start).toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('pause should prevent auto-restart on recognition end', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();

    voiceModeService.pause();
    mockRecognition.start.mockClear();

    // Simulate recognition ending (which normally triggers auto-restart)
    mockRecognition.onend?.();
    vi.advanceTimersByTime(500);

    // Should NOT have restarted because we're paused
    expect(mockRecognition.start).not.toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('pause should clear pending restart timeout', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();

    // Simulate recognition ending to schedule restart
    mockRecognition.onend?.();
    mockRecognition.start.mockClear();

    // Now pause before the restart fires
    voiceModeService.pause();

    // Advance past restart delay
    vi.advanceTimersByTime(500);

    // Restart should not have fired
    expect(mockRecognition.start).not.toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('disable should reset isPaused', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();
    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(true);

    voiceModeService.disable();
    expect(voiceModeService.isPausedState()).toBe(false);

    voiceModeService.cleanup();
  });

  it('double pause should be a no-op', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();

    voiceModeService.pause();
    mockRecognition.abort.mockClear();

    // Second pause should be no-op
    voiceModeService.pause();
    expect(mockRecognition.abort).not.toHaveBeenCalled();

    voiceModeService.cleanup();
  });

  it('resume without prior pause should be a no-op', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();
    mockRecognition.start.mockClear();

    // Resume without pause
    voiceModeService.resume();

    vi.advanceTimersByTime(500);
    // Should not have called start again (was never paused)
    expect(mockRecognition.start).not.toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('scheduleRestart should check isPaused flag', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({ provider: 'openai', apiKey: 'test', model: 'gpt-4' });
    voiceModeService.enable();

    // Pause, then resume, then trigger onend
    voiceModeService.pause();
    voiceModeService.resume();
    mockRecognition.start.mockClear();

    // Simulate recognition ending
    mockRecognition.onend?.();
    vi.advanceTimersByTime(150);

    // Should restart because we resumed
    expect(mockRecognition.start).toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });
});
