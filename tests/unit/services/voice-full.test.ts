/**
 * Unit Tests for Voice Mode Service - Full Coverage
 * Tests: initialize, enable, disable, pause, resume, cleanup,
 *        status management, callback subscriptions, network handlers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock speech synthesis
vi.mock('../../../src/services/speechSynthesis', () => ({
  speechSynthesis: {
    isSupported: vi.fn(() => true),
    setLanguage: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(() => Promise.resolve()),
    sayRecorded: vi.fn(() => Promise.resolve()),
    sayNotUnderstood: vi.fn(() => Promise.resolve()),
  },
}));

// Mock LLM provider
vi.mock('../../../src/services/llmProvider', () => ({
  processVoiceCommandWithTimeout: vi.fn(() =>
    Promise.resolve({
      action: 'set_bib',
      bib: '42',
      confidence: 0.9,
    }),
  ),
}));

// Mock store
vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'en',
      deviceRole: 'timer',
      selectedRun: 1,
      entries: [],
      gateAssignment: null,
    })),
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

describe('Voice Mode Service - Full Coverage', () => {
  // Mock SpeechRecognition
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock SpeechRecognition
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

    // Set up SpeechRecognition on window
    (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(
      function () {
        return mockRecognition;
      },
    );

    // Ensure navigator.onLine is true
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });

  // Import after mocks are set up
  async function getService() {
    vi.resetModules();
    const module = await import('../../../src/services/voice');
    return module.voiceModeService;
  }

  describe('isSupported', () => {
    it('should return true when SpeechRecognition is available', async () => {
      const service = await getService();
      expect(service.isSupported()).toBe(true);
    });

    it('should return true when webkitSpeechRecognition is available', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
        vi.fn(() => mockRecognition);

      const service = await getService();
      expect(service.isSupported()).toBe(true);

      delete (window as unknown as Record<string, unknown>)
        .webkitSpeechRecognition;
    });

    it('should return false when neither is available', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      const service = await getService();
      expect(service.isSupported()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return inactive by default', async () => {
      const service = await getService();
      expect(service.getStatus()).toBe('inactive');
    });
  });

  describe('isActive', () => {
    it('should return false by default', async () => {
      const service = await getService();
      expect(service.isActive()).toBe(false);
    });
  });

  describe('isPausedState', () => {
    it('should return false by default', async () => {
      const service = await getService();
      expect(service.isPausedState()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should return true when supported', async () => {
      const service = await getService();
      const result = service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      expect(result).toBe(true);
    });

    it('should return false when not supported', async () => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      const service = await getService();
      const result = service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      expect(result).toBe(false);
    });

    it('should configure recognition properties', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      expect(mockRecognition.continuous).toBe(true);
      expect(mockRecognition.interimResults).toBe(false);
    });
  });

  describe('enable', () => {
    it('should return false when not initialized', async () => {
      const service = await getService();
      const result = service.enable();
      expect(result).toBe(false);
    });

    it('should start recognition when initialized', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      const result = service.enable();
      expect(result).toBe(true);
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should return false when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      const result = service.enable();
      expect(result).toBe(false);
    });

    it('should handle start failure gracefully', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      mockRecognition.start.mockImplementation(() => {
        throw new Error('Already started');
      });
      const result = service.enable();
      expect(result).toBe(false);
    });
  });

  describe('disable', () => {
    it('should stop recognition', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      service.disable();
      expect(mockRecognition.stop).toHaveBeenCalled();
      expect(service.isActive()).toBe(false);
      expect(service.getStatus()).toBe('inactive');
    });

    it('should not throw when not initialized', async () => {
      const service = await getService();
      expect(() => service.disable()).not.toThrow();
    });

    it('should handle stop error gracefully', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      mockRecognition.stop.mockImplementation(() => {
        throw new Error('Not started');
      });
      expect(() => service.disable()).not.toThrow();
    });
  });

  describe('pause', () => {
    it('should abort recognition when enabled', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      service.pause();
      expect(mockRecognition.abort).toHaveBeenCalled();
      expect(service.isPausedState()).toBe(true);
    });

    it('should be a no-op when not enabled', async () => {
      const service = await getService();
      service.pause();
      expect(service.isPausedState()).toBe(false);
    });

    it('should be a no-op when already paused', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      service.pause();
      mockRecognition.abort.mockClear();
      service.pause();
      expect(mockRecognition.abort).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should schedule restart after pause', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      service.pause();
      mockRecognition.start.mockClear();
      service.resume();
      expect(service.isPausedState()).toBe(false);

      // Advance timer to trigger restart
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should be a no-op when not paused', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      mockRecognition.start.mockClear();
      service.resume();
      // Should not schedule restart since not paused
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('should be a no-op when not enabled', async () => {
      const service = await getService();
      service.resume();
      expect(service.isPausedState()).toBe(false);
    });
  });

  describe('onStatusChange', () => {
    it('should call callback when status changes', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      // Simulate onstart event
      mockRecognition.onstart?.();
      expect(callback).toHaveBeenCalledWith('listening');
    });

    it('should return unsubscribe function', async () => {
      const service = await getService();
      const callback = vi.fn();
      const unsub = service.onStatusChange(callback);
      unsub();

      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      mockRecognition.onstart?.();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('onAction', () => {
    it('should return unsubscribe function', async () => {
      const service = await getService();
      const callback = vi.fn();
      const unsub = service.onAction(callback);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('recognition error handling', () => {
    it('should handle network error', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'network' } as unknown);
      expect(callback).toHaveBeenCalledWith('offline');
    });

    it('should handle not-allowed error', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'not-allowed' } as unknown);
      expect(callback).toHaveBeenCalledWith('error');
      expect(service.isActive()).toBe(false);
    });

    it('should handle service-not-allowed error', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'service-not-allowed' } as unknown);
      expect(service.isActive()).toBe(false);
    });

    it('should handle aborted error without restart', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'aborted' } as unknown);
      // Aborted should not set error status
    });

    it('should handle no-speech error (recoverable)', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'no-speech' } as unknown);
      // Should not disable
      expect(service.isActive()).toBe(true);
    });

    it('should handle unknown error', async () => {
      const service = await getService();
      const callback = vi.fn();
      service.onStatusChange(callback);

      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      mockRecognition.onerror?.({ error: 'unknown-error' } as unknown);
      expect(callback).toHaveBeenCalledWith('error');
    });
  });

  describe('recognition end handling', () => {
    it('should restart when enabled and online', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      mockRecognition.start.mockClear();

      // Simulate recognition ending
      mockRecognition.onend?.();

      // Should schedule restart
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should not restart when disabled', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();
      service.disable();
      mockRecognition.start.mockClear();

      mockRecognition.onend?.();
      vi.advanceTimersByTime(600);
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up all resources', async () => {
      const service = await getService();
      service.initialize({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });
      service.enable();

      const statusCb = vi.fn();
      const actionCb = vi.fn();
      service.onStatusChange(statusCb);
      service.onAction(actionCb);

      service.cleanup();

      expect(service.isActive()).toBe(false);
      expect(service.getStatus()).toBe('inactive');
    });
  });
});
