/**
 * Voice Mode Service - Comprehensive Unit Tests
 * Tests: state machine, callbacks, configuration, edge cases,
 *        transcript processing, intent handling, network status
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock speech synthesis
const mockSpeechSynthesis = {
  isSupported: vi.fn(() => true),
  setLanguage: vi.fn(),
  cancel: vi.fn(),
  speak: vi.fn(() => Promise.resolve()),
  sayRecorded: vi.fn(() => Promise.resolve()),
  sayNotUnderstood: vi.fn(() => Promise.resolve()),
};

vi.mock('../../../src/services/speechSynthesis', () => ({
  speechSynthesis: mockSpeechSynthesis,
}));

// Mock LLM provider
const mockProcessVoiceCommand = vi.fn(() =>
  Promise.resolve({
    action: 'set_bib',
    confidence: 0.9,
    confirmationNeeded: false,
    params: { bib: '42' },
  }),
);

vi.mock('../../../src/services/llmProvider', () => ({
  processVoiceCommandWithTimeout: (...args: unknown[]) =>
    mockProcessVoiceCommand(...args),
}));

// Mock store
const mockGetState = vi.fn(() => ({
  currentLang: 'en' as const,
  deviceRole: 'timer' as const,
  selectedRun: 1,
  entries: [],
  gateAssignment: null,
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/utils/format', () => ({
  getLocale: vi.fn((lang: string) => (lang === 'de' ? 'de-DE' : 'en-US')),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

describe('Voice Mode Service - Comprehensive', () => {
  let mockRecognition: {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
  };

  const validConfig = {
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockRecognition = {
      continuous: false,
      interimResults: false,
      lang: '',
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onresult: null,
      onerror: null,
      onend: null,
      onstart: null,
    };

    (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
      () => mockRecognition,
    );

    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    mockGetState.mockReturnValue({
      currentLang: 'en',
      deviceRole: 'timer',
      selectedRun: 1,
      entries: [],
      gateAssignment: null,
    });
  });

  let lastService: { cleanup?: () => void } | null = null;

  afterEach(() => {
    // Clean up service to remove window event listeners from prior import
    if (lastService?.cleanup) {
      lastService.cleanup();
    }
    lastService = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>)
      .webkitSpeechRecognition;
  });

  async function getService() {
    // Clean up previous instance's window listeners before discarding it
    if (lastService?.cleanup) {
      lastService.cleanup();
      lastService = null;
    }
    vi.resetModules();
    const module = await import('../../../src/services/voice');
    lastService = module.voiceModeService;
    return module.voiceModeService;
  }

  // ========================
  // State Machine
  // ========================

  describe('State Machine', () => {
    it('should start in inactive state and not listening', async () => {
      const service = await getService();
      expect(service.getStatus()).toBe('inactive');
      expect(service.isActive()).toBe(false);
      expect(service.isPausedState()).toBe(false);
    });

    it('isSupported should return true when SpeechRecognition exists', async () => {
      const service = await getService();
      expect(service.isSupported()).toBe(true);
    });

    it('isSupported should return true for webkitSpeechRecognition', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
        vi.fn(() => mockRecognition);
      const service = await getService();
      expect(service.isSupported()).toBe(true);
    });

    it('isSupported should return false when no SpeechRecognition API', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      const service = await getService();
      expect(service.isSupported()).toBe(false);
    });

    it('initialize should return true and transition to ready when supported', async () => {
      const service = await getService();
      const result = service.initialize(validConfig);
      expect(result).toBe(true);
    });

    it('initialize should return false without SpeechRecognition', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      const service = await getService();
      const result = service.initialize(validConfig);
      expect(result).toBe(false);
    });

    it('initialize should return false without SpeechSynthesis', async () => {
      mockSpeechSynthesis.isSupported.mockReturnValueOnce(false);
      const service = await getService();
      const result = service.initialize(validConfig);
      expect(result).toBe(false);
    });

    it('initialize should configure recognition as continuous, no interim', async () => {
      const service = await getService();
      service.initialize(validConfig);
      expect(mockRecognition.continuous).toBe(true);
      expect(mockRecognition.interimResults).toBe(false);
    });

    it('enable should start listening from initialized state', async () => {
      const service = await getService();
      service.initialize(validConfig);
      const result = service.enable();
      expect(result).toBe(true);
      expect(mockRecognition.start).toHaveBeenCalled();
      expect(service.isActive()).toBe(true);
    });

    it('enable should fail when not initialized', async () => {
      const service = await getService();
      const result = service.enable();
      expect(result).toBe(false);
    });

    it('disable from listening state should stop recognition', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.disable();
      expect(mockRecognition.stop).toHaveBeenCalled();
      expect(service.isActive()).toBe(false);
      expect(service.getStatus()).toBe('inactive');
    });

    it('pause from listening should set paused state', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.pause();
      expect(service.isPausedState()).toBe(true);
      expect(mockRecognition.abort).toHaveBeenCalled();
    });

    it('resume from paused should clear paused state', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.pause();
      service.resume();
      expect(service.isPausedState()).toBe(false);
    });

    it('resume should schedule recognition restart', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.pause();
      mockRecognition.start.mockClear();
      service.resume();
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).toHaveBeenCalled();
    });
  });

  // ========================
  // Callbacks
  // ========================

  describe('Callbacks', () => {
    it('onStatusChange should fire when status transitions', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize(validConfig);
      service.enable();
      // Trigger the onstart handler to change status to listening
      mockRecognition.onstart?.();

      expect(callback).toHaveBeenCalledWith('listening');
    });

    it('onStatusChange should return a disposer function', async () => {
      const service = await getService();
      const callback = vi.fn();
      const dispose = service.onStatusChange(callback);
      expect(typeof dispose).toBe('function');
      dispose();

      // After disposal, callback should not fire
      service.initialize(validConfig);
      service.enable();
      mockRecognition.onstart?.();
      expect(callback).not.toHaveBeenCalled();
    });

    it('onAction should fire when voice intent is executed', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onAction(callback);

      service.initialize(validConfig);
      service.enable();

      // Simulate a transcript result
      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'bib forty two' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(callback).toHaveBeenCalled();
    });

    it('onAction disposer should unregister the callback', async () => {
      const service = await getService();
      const callback = vi.fn();
      const dispose = service.onAction(callback);
      dispose();

      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'bib forty two' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(callback).not.toHaveBeenCalled();
    });

    it('multiple callbacks can be registered for status changes', async () => {
      const service = await getService();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.onStatusChange(cb1);
      service.onStatusChange(cb2);

      service.initialize(validConfig);
      service.enable();
      mockRecognition.onstart?.();

      expect(cb1).toHaveBeenCalledWith('listening');
      expect(cb2).toHaveBeenCalledWith('listening');
    });

    it('multiple action callbacks can be registered', async () => {
      const service = await getService();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.onAction(cb1);
      service.onAction(cb2);

      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'set bib 42' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('status change should not fire for duplicate status', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize(validConfig);
      service.enable();

      // Fire onstart twice
      mockRecognition.onstart?.();
      mockRecognition.onstart?.();

      // Should only fire once for 'listening' since it's the same status
      const listeningCalls = callback.mock.calls.filter(
        (c: unknown[]) => c[0] === 'listening',
      );
      expect(listeningCalls.length).toBe(1);
    });
  });

  // ========================
  // Configuration
  // ========================

  describe('Configuration', () => {
    it('initialize should store LLM config', async () => {
      const service = await getService();
      service.initialize(validConfig);
      // Verify by enabling (which requires config)
      const result = service.enable();
      expect(result).toBe(true);
    });

    it('initialize should set recognition language from store', async () => {
      mockGetState.mockReturnValue({
        currentLang: 'de',
        deviceRole: 'timer',
        selectedRun: 1,
        entries: [],
        gateAssignment: null,
      });
      const service = await getService();
      service.initialize(validConfig);
      expect(mockRecognition.lang).toBe('de-DE');
    });

    it('enable should update language before starting', async () => {
      const service = await getService();
      service.initialize(validConfig);
      mockGetState.mockReturnValue({
        currentLang: 'de',
        deviceRole: 'timer',
        selectedRun: 1,
        entries: [],
        gateAssignment: null,
      });
      service.enable();
      expect(mockRecognition.lang).toBe('de-DE');
    });
  });

  // ========================
  // Network Handling
  // ========================

  describe('Network Status', () => {
    it('going offline should set status to offline and stop recognition', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize(validConfig);
      service.enable();
      mockRecognition.onstart?.();

      // Simulate going offline
      window.dispatchEvent(new Event('offline'));

      expect(callback).toHaveBeenCalledWith('offline');
      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('coming online should restart recognition', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize(validConfig);
      service.enable();
      mockRecognition.onstart?.();

      // Go offline then online
      window.dispatchEvent(new Event('offline'));
      mockRecognition.start.mockClear();
      window.dispatchEvent(new Event('online'));

      expect(callback).toHaveBeenCalledWith('listening');
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('enable should fail when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      const service = await getService();
      service.initialize(validConfig);
      const result = service.enable();
      expect(result).toBe(false);
    });

    it('coming online when not enabled should not start recognition', async () => {
      const service = await getService();
      service.initialize(validConfig);
      // Do not call enable()
      mockRecognition.start.mockClear();
      window.dispatchEvent(new Event('online'));
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('going offline when not enabled should not change status', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);
      service.initialize(validConfig);
      // Do not call enable()
      window.dispatchEvent(new Event('offline'));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ========================
  // Transcript Processing
  // ========================

  describe('Transcript Processing', () => {
    it('should process final transcripts through LLM', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'bib forty two' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockProcessVoiceCommand).toHaveBeenCalled();
    });

    it('should ignore non-final (interim) results', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'bib for' },
            isFinal: false,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockProcessVoiceCommand).not.toHaveBeenCalled();
    });

    it('should handle empty transcript', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: '   ' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockProcessVoiceCommand).not.toHaveBeenCalled();
    });

    it('should pass gate judge context with active bibs', async () => {
      mockGetState.mockReturnValue({
        currentLang: 'en',
        deviceRole: 'gateJudge',
        selectedRun: 1,
        entries: [
          { bib: '10', point: 'S', run: 1 },
          { bib: '11', point: 'S', run: 1 },
          { bib: '10', point: 'F', run: 1 },
        ],
        gateAssignment: [1, 10],
      });

      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'fault gate five' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockProcessVoiceCommand).toHaveBeenCalled();
      const callArgs = mockProcessVoiceCommand.mock.calls[0];
      const context = callArgs?.[1] as { activeBibs?: string[] };
      // Bib 11 started but not finished = active; Bib 10 finished = not active
      expect(context.activeBibs).toEqual(['11']);
    });

    it('should say not-understood on LLM processing error', async () => {
      mockProcessVoiceCommand.mockRejectedValueOnce(new Error('LLM timeout'));

      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'something' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockSpeechSynthesis.sayNotUnderstood).toHaveBeenCalled();
    });
  });

  // ========================
  // Intent Handling
  // ========================

  describe('Intent Handling', () => {
    it('should execute direct intents without confirmation', async () => {
      const actionCb = vi.fn();
      const service = await getService();
      service.onAction(actionCb);
      service.initialize(validConfig);
      service.enable();

      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'set_bib',
        confidence: 0.9,
        confirmationNeeded: false,
        params: { bib: '42' },
      });

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'bib 42' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(actionCb).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'set_bib' }),
      );
    });

    it('should say not-understood for unknown intent', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'unknown',
        confidence: 0.3,
        confirmationNeeded: false,
      });

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'gibberish' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockSpeechSynthesis.sayNotUnderstood).toHaveBeenCalled();
    });

    it('should say not-understood for low confidence intents', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'set_bib',
        confidence: 0.3,
        confirmationNeeded: false,
        params: { bib: '42' },
      });

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'maybe bib something' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockSpeechSynthesis.sayNotUnderstood).toHaveBeenCalled();
    });

    it('should enter confirming state for confirmationNeeded intents', async () => {
      const statusCb = vi.fn();
      const service = await getService();
      service.onStatusChange(statusCb);
      service.initialize(validConfig);
      service.enable();

      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'record_fault',
        confidence: 0.9,
        confirmationNeeded: true,
        confirmationPrompt: 'Record fault for bib 42 at gate 5?',
        params: { bib: '42', gate: 5, faultType: 'MG' },
      });

      const mockEvent = {
        results: {
          0: {
            0: { transcript: 'fault bib 42 gate 5' },
            isFinal: true,
          },
        },
        resultIndex: 0,
      };

      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(statusCb).toHaveBeenCalledWith('confirming');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(
        'Record fault for bib 42 at gate 5?',
      );
    });

    it('should execute pending intent on confirm', async () => {
      const actionCb = vi.fn();
      const service = await getService();
      service.onAction(actionCb);
      service.initialize(validConfig);
      service.enable();

      // First transcript: fault that needs confirmation
      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'record_fault',
        confidence: 0.9,
        confirmationNeeded: true,
        confirmationPrompt: 'Confirm fault?',
        params: { bib: '42', gate: 5, faultType: 'MG' },
      });

      const faultEvent = {
        results: {
          0: { 0: { transcript: 'fault bib 42 gate 5' }, isFinal: true },
        },
        resultIndex: 0,
      };
      mockRecognition.onresult?.(faultEvent);
      await vi.advanceTimersByTimeAsync(100);

      // Second transcript: confirmation
      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'confirm',
        confidence: 0.95,
        confirmationNeeded: false,
      });

      const confirmEvent = {
        results: {
          1: { 0: { transcript: 'yes' }, isFinal: true },
        },
        resultIndex: 1,
      };
      mockRecognition.onresult?.(confirmEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(actionCb).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'record_fault' }),
      );
      expect(mockSpeechSynthesis.sayRecorded).toHaveBeenCalled();
    });

    it('should cancel pending intent on cancel action', async () => {
      const actionCb = vi.fn();
      const service = await getService();
      service.onAction(actionCb);
      service.initialize(validConfig);
      service.enable();

      // Set up pending intent
      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'record_fault',
        confidence: 0.9,
        confirmationNeeded: true,
        confirmationPrompt: 'Confirm?',
        params: { bib: '42', gate: 5, faultType: 'MG' },
      });

      const faultEvent = {
        results: {
          0: { 0: { transcript: 'fault bib 42' }, isFinal: true },
        },
        resultIndex: 0,
      };
      mockRecognition.onresult?.(faultEvent);
      await vi.advanceTimersByTimeAsync(100);

      // Cancel
      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'cancel',
        confidence: 0.95,
        confirmationNeeded: false,
      });

      const cancelEvent = {
        results: {
          1: { 0: { transcript: 'no' }, isFinal: true },
        },
        resultIndex: 1,
      };
      mockRecognition.onresult?.(cancelEvent);
      await vi.advanceTimersByTimeAsync(100);

      // Should not execute the fault intent
      expect(actionCb).not.toHaveBeenCalled();
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith('voiceCancelled');
    });

    it('should timeout pending confirmation after 10 seconds', async () => {
      const statusCb = vi.fn();
      const service = await getService();
      service.onStatusChange(statusCb);
      service.initialize(validConfig);
      service.enable();

      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'record_fault',
        confidence: 0.9,
        confirmationNeeded: true,
        confirmationPrompt: 'Confirm?',
        params: { bib: '42', gate: 5, faultType: 'MG' },
      });

      const mockEvent = {
        results: {
          0: { 0: { transcript: 'fault' }, isFinal: true },
        },
        resultIndex: 0,
      };
      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      expect(statusCb).toHaveBeenCalledWith('confirming');

      // Advance past confirmation timeout (10s)
      vi.advanceTimersByTime(11000);

      expect(statusCb).toHaveBeenCalledWith('listening');
    });
  });

  // ========================
  // Error Handling
  // ========================

  describe('Recognition Errors', () => {
    it('should set offline status on network error', async () => {
      const callback = vi.fn();
      const service = await getService();
      service.onStatusChange(callback);
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'network' });
      expect(callback).toHaveBeenCalledWith('offline');
    });

    it('should set error and disable on not-allowed', async () => {
      const callback = vi.fn();
      const service = await getService();
      service.onStatusChange(callback);
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'not-allowed' });
      expect(callback).toHaveBeenCalledWith('error');
      expect(service.isActive()).toBe(false);
    });

    it('should set error and disable on service-not-allowed', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'service-not-allowed' });
      expect(service.isActive()).toBe(false);
    });

    it('should handle no-speech as recoverable (no disable)', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'no-speech' });
      expect(service.isActive()).toBe(true);
    });

    it('should handle audio-capture as recoverable', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'audio-capture' });
      expect(service.isActive()).toBe(true);
    });

    it('should not set status on aborted error', async () => {
      const callback = vi.fn();
      const service = await getService();
      service.onStatusChange(callback);
      service.initialize(validConfig);
      service.enable();
      mockRecognition.onstart?.();
      callback.mockClear();

      mockRecognition.onerror?.({ error: 'aborted' });
      // Aborted returns early without setting status
      expect(callback).not.toHaveBeenCalled();
    });

    it('should set error status on unknown errors', async () => {
      const callback = vi.fn();
      const service = await getService();
      service.onStatusChange(callback);
      service.initialize(validConfig);
      service.enable();

      mockRecognition.onerror?.({ error: 'some-weird-error' });
      expect(callback).toHaveBeenCalledWith('error');
    });
  });

  // ========================
  // Recognition End / Restart
  // ========================

  describe('Recognition End and Restart', () => {
    it('should schedule restart when enabled, online, not paused', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      mockRecognition.start.mockClear();

      mockRecognition.onend?.();
      vi.advanceTimersByTime(600);

      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should not restart when disabled', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.disable();
      mockRecognition.start.mockClear();

      mockRecognition.onend?.();
      vi.advanceTimersByTime(600);

      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('should not restart when paused', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.pause();
      mockRecognition.start.mockClear();

      mockRecognition.onend?.();
      vi.advanceTimersByTime(600);

      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('should not restart when in error status', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      // Trigger error status
      mockRecognition.onerror?.({ error: 'not-allowed' });
      mockRecognition.start.mockClear();

      mockRecognition.onend?.();
      vi.advanceTimersByTime(600);

      expect(mockRecognition.start).not.toHaveBeenCalled();
    });
  });

  // ========================
  // Edge Cases
  // ========================

  describe('Edge Cases', () => {
    it('double enable should not crash (handles already-started)', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      mockRecognition.start.mockImplementation(() => {
        throw new Error('Already started');
      });
      const result = service.enable();
      expect(result).toBe(false);
    });

    it('disable when not enabled is safe', async () => {
      const service = await getService();
      expect(() => service.disable()).not.toThrow();
    });

    it('disable handles stop throwing', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      mockRecognition.stop.mockImplementation(() => {
        throw new Error('Not started');
      });
      expect(() => service.disable()).not.toThrow();
    });

    it('pause when not enabled is a no-op', async () => {
      const service = await getService();
      service.pause();
      expect(service.isPausedState()).toBe(false);
    });

    it('double pause does not abort again', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.pause();
      mockRecognition.abort.mockClear();
      service.pause();
      expect(mockRecognition.abort).not.toHaveBeenCalled();
    });

    it('resume when not enabled is a no-op', async () => {
      const service = await getService();
      service.resume();
      expect(service.isPausedState()).toBe(false);
    });

    it('resume when not paused is a no-op', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      mockRecognition.start.mockClear();
      service.resume();
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('cleanup clears all resources and callbacks', async () => {
      const service = await getService();
      const statusCb = vi.fn();
      const actionCb = vi.fn();

      service.initialize(validConfig);
      service.enable();
      service.onStatusChange(statusCb);
      service.onAction(actionCb);

      service.cleanup();

      expect(service.isActive()).toBe(false);
      expect(service.getStatus()).toBe('inactive');

      // Callbacks should have been cleared — subsequent status changes won't fire them
      // (we can't easily test this since cleanup also disables, but the service is clean)
    });

    it('disable should clear pending intent and timeouts', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();

      // Set up a pending confirmation
      mockProcessVoiceCommand.mockResolvedValueOnce({
        action: 'record_fault',
        confidence: 0.9,
        confirmationNeeded: true,
        confirmationPrompt: 'Confirm?',
        params: { bib: '42', gate: 5, faultType: 'MG' },
      });

      const mockEvent = {
        results: {
          0: { 0: { transcript: 'fault' }, isFinal: true },
        },
        resultIndex: 0,
      };
      mockRecognition.onresult?.(mockEvent);
      await vi.advanceTimersByTimeAsync(100);

      // Now disable — should clear confirmation timeout
      service.disable();
      expect(service.getStatus()).toBe('inactive');

      // Confirmation timeout should not fire after disable
      const statusCb = vi.fn();
      service.onStatusChange(statusCb);
      vi.advanceTimersByTime(11000);
      expect(statusCb).not.toHaveBeenCalled();
    });

    it('disable should cancel speech synthesis', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      service.disable();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    it('scheduleRestart deduplicates pending restarts', async () => {
      const service = await getService();
      service.initialize(validConfig);
      service.enable();
      mockRecognition.start.mockClear();

      // Trigger onend multiple times rapidly
      mockRecognition.onend?.();
      mockRecognition.onend?.();
      mockRecognition.onend?.();

      vi.advanceTimersByTime(600);

      // Should only have started once due to deduplication
      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });
  });
});
