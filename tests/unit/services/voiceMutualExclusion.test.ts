/**
 * Voice Services Mutual Exclusion Tests
 * Tests that voiceModeService and voiceNoteService do not fight
 * over the SpeechRecognition API resource
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock SpeechRecognition - track instance count to detect conflicts
let recognitionInstances: MockSpeechRecognition[] = [];
let _activeRecognitions = 0;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  private _active = false;

  constructor() {
    recognitionInstances.push(this);
  }

  start = vi.fn(() => {
    if (this._active) {
      throw new Error('Already started');
    }
    this._active = true;
    _activeRecognitions++;
    setTimeout(() => this.onstart?.(), 0);
  });

  stop = vi.fn(() => {
    if (this._active) {
      this._active = false;
      _activeRecognitions--;
    }
    setTimeout(() => this.onend?.(), 0);
  });

  abort = vi.fn(() => {
    if (this._active) {
      this._active = false;
      _activeRecognitions--;
    }
    setTimeout(() => this.onend?.(), 0);
  });

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);

  get isActive() {
    return this._active;
  }
}

beforeEach(() => {
  recognitionInstances = [];
  _activeRecognitions = 0;
  (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
    () => new MockSpeechRecognition(),
  );
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
    vi.fn(() => new MockSpeechRecognition());
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onvoiceschanged: null,
    paused: false,
    pending: false,
    speaking: false,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Voice Services Mutual Exclusion', () => {
  it('pausing voice mode should stop its recognition', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();

    // Voice mode recognition instance (first one created)
    const voiceModeRecognition = recognitionInstances[0];
    expect(voiceModeRecognition.start).toHaveBeenCalled();

    voiceModeService.pause();
    expect(voiceModeRecognition.abort).toHaveBeenCalled();
    expect(voiceModeService.isPausedState()).toBe(true);

    voiceModeService.cleanup();
  });

  it('voice note can start after voice mode is paused', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');
    const { voiceNoteService } = await import(
      '../../../src/services/voiceNote'
    );

    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();

    // Pause voice mode first
    voiceModeService.pause();

    // Now voice note should be able to start
    const started = voiceNoteService.start();
    expect(started).toBe(true);

    voiceNoteService.stop();
    voiceModeService.cleanup();
  });

  it('resuming voice mode should restart recognition', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();

    const voiceModeRecognition = recognitionInstances[0];

    voiceModeService.pause();
    voiceModeRecognition.start.mockClear();

    voiceModeService.resume();
    vi.advanceTimersByTime(600);

    expect(voiceModeRecognition.start).toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('voice mode should not auto-restart while paused', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();

    const voiceModeRecognition = recognitionInstances[0];

    voiceModeService.pause();
    voiceModeRecognition.start.mockClear();

    // Simulate recognition ending (which would normally trigger restart)
    voiceModeRecognition.onend?.();
    vi.advanceTimersByTime(500);

    // Should NOT restart
    expect(voiceModeRecognition.start).not.toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('complete flow: voice mode -> pause -> voice note -> stop -> resume', async () => {
    vi.useFakeTimers();
    const { voiceModeService } = await import('../../../src/services/voice');
    const { voiceNoteService } = await import(
      '../../../src/services/voiceNote'
    );

    // 1. Start voice mode
    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();
    expect(voiceModeService.isActive()).toBe(true);

    // 2. Pause voice mode (simulating what voiceNoteUI does)
    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(true);

    // 3. Start voice note
    const started = voiceNoteService.start();
    expect(started).toBe(true);

    // 4. Stop voice note
    voiceNoteService.stop();

    // 5. Resume voice mode
    const voiceModeRecognition = recognitionInstances[0];
    voiceModeRecognition.start.mockClear();
    voiceModeService.resume();
    expect(voiceModeService.isPausedState()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(voiceModeRecognition.start).toHaveBeenCalled();

    vi.useRealTimers();
    voiceModeService.cleanup();
  });

  it('resume is no-op when voice mode was not enabled', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    // Not enabled, so resume should be a no-op
    voiceModeService.resume();
    expect(voiceModeService.isPausedState()).toBe(false);
    expect(voiceModeService.isActive()).toBe(false);
  });

  it('pause is no-op when voice mode was not enabled', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(false);
  });

  it('disabling voice mode clears paused state', async () => {
    const { voiceModeService } = await import('../../../src/services/voice');

    voiceModeService.initialize({
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
    });
    voiceModeService.enable();
    voiceModeService.pause();
    expect(voiceModeService.isPausedState()).toBe(true);

    voiceModeService.disable();
    expect(voiceModeService.isPausedState()).toBe(false);
    expect(voiceModeService.isActive()).toBe(false);
  });
});
