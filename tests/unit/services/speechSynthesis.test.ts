/**
 * Unit Tests for Speech Synthesis Service
 * Tests: initialization, voice selection, speak, sayOK, sayRecorded,
 * sayNotUnderstood, cancel, language handling, error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
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

// Mock store
vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'de' as const,
    })),
    subscribe: vi.fn(() => () => {}),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock voices
const mockVoices: SpeechSynthesisVoice[] = [
  {
    name: 'Anna',
    lang: 'de-DE',
    voiceURI: 'de-DE-Anna',
    localService: true,
    default: true,
  },
  {
    name: 'Thomas',
    lang: 'de-DE',
    voiceURI: 'de-DE-Thomas',
    localService: true,
    default: false,
  },
  {
    name: 'Karen Female',
    lang: 'en-AU',
    voiceURI: 'en-AU-Karen',
    localService: true,
    default: false,
  },
  {
    name: 'Samantha',
    lang: 'en-US',
    voiceURI: 'en-US-Samantha',
    localService: true,
    default: false,
  },
];

// Track SpeechSynthesisUtterance instances
let lastUtterance: any = null;

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = '';
  onend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onstart: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onmark: (() => void) | null = null;
  onboundary: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
    lastUtterance = this;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}

globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance as any;

// Create speech synthesis mock
let voicesReadyImmediately = true;
let voicesChangedCallback: (() => void) | null = null;

function createMockSpeechSynthesis() {
  return {
    speaking: false,
    pending: false,
    paused: false,
    cancel: vi.fn(),
    speak: vi.fn((utterance: any) => {
      // Auto-resolve after speak
      setTimeout(() => {
        if (utterance.onend) utterance.onend();
      }, 0);
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => {
      if (voicesReadyImmediately) return mockVoices;
      return [];
    }),
    addEventListener: vi.fn(
      (event: string, callback: () => void, options?: any) => {
        if (event === 'voiceschanged') {
          voicesChangedCallback = callback;
        }
      },
    ),
    removeEventListener: vi.fn(),
    onvoiceschanged: null as (() => void) | null,
    dispatchEvent: vi.fn(() => true),
  };
}

describe('Speech Synthesis Service', () => {
  let speechSynthesisService: typeof import('../../../src/services/speechSynthesis').speechSynthesis;
  let mockSynth: ReturnType<typeof createMockSpeechSynthesis>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    voicesReadyImmediately = true;
    voicesChangedCallback = null;
    lastUtterance = null;

    mockSynth = createMockSpeechSynthesis();

    // Set up window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSynth,
      writable: true,
      configurable: true,
    });

    // Reset module for clean singleton state
    vi.resetModules();
    const module = await import('../../../src/services/speechSynthesis');
    speechSynthesisService = module.speechSynthesis;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isSupported', () => {
    it('should return true when speechSynthesis is available', () => {
      expect(speechSynthesisService.isSupported()).toBe(true);
    });

    it('should return false when speechSynthesis is not available', async () => {
      const original = window.speechSynthesis;
      delete (window as any).speechSynthesis;

      vi.resetModules();
      const module = await import('../../../src/services/speechSynthesis');

      expect(module.speechSynthesis.isSupported()).toBe(false);

      // Restore
      Object.defineProperty(window, 'speechSynthesis', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('voice loading', () => {
    it('should load voices immediately if available', () => {
      // Voices were loaded in the constructor (voicesReadyImmediately = true)
      expect(mockSynth.getVoices).toHaveBeenCalled();
    });

    it('should wait for voiceschanged event if voices not immediately available', async () => {
      voicesReadyImmediately = false;

      vi.resetModules();
      const module = await import('../../../src/services/speechSynthesis');

      expect(mockSynth.addEventListener).toHaveBeenCalledWith(
        'voiceschanged',
        expect.any(Function),
        { once: true },
      );

      const callsBefore = mockSynth.getVoices.mock.calls.length;

      // Simulate voices becoming available
      voicesReadyImmediately = true;
      if (voicesChangedCallback) {
        voicesChangedCallback();
      }

      // After voiceschanged, getVoices should be called at least once more
      expect(mockSynth.getVoices.mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });
  });

  describe('setLanguage', () => {
    it('should select voice for the given language', () => {
      speechSynthesisService.setLanguage('en');

      // After setting English, getVoices should be called to find a voice
      expect(mockSynth.getVoices).toHaveBeenCalled();
    });

    it('should select voice for German', () => {
      speechSynthesisService.setLanguage('de');
      expect(mockSynth.getVoices).toHaveBeenCalled();
    });

    it('should not select voice if voices are not loaded yet', async () => {
      voicesReadyImmediately = false;

      vi.resetModules();
      const module = await import('../../../src/services/speechSynthesis');
      const service = module.speechSynthesis;

      // getVoices count before setLanguage
      const callsBefore = mockSynth.getVoices.mock.calls.length;

      service.setLanguage('en');

      // Should not call getVoices again since voicesLoaded is false
      expect(mockSynth.getVoices.mock.calls.length).toBe(callsBefore);
    });
  });

  describe('speak', () => {
    it('should cancel ongoing speech before speaking', async () => {
      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);
      await promise;

      expect(mockSynth.cancel).toHaveBeenCalled();
    });

    it('should create utterance with correct text', async () => {
      const promise = speechSynthesisService.speak('Test text');
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('Test text');
    });

    it('should set default rate and pitch', async () => {
      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.rate).toBe(1.1);
      expect(lastUtterance.pitch).toBe(1.0);
      expect(lastUtterance.volume).toBe(1.0);
    });

    it('should apply custom rate and pitch options', async () => {
      const promise = speechSynthesisService.speak('Hello', {
        rate: 1.5,
        pitch: 0.8,
      });
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.rate).toBe(1.5);
      expect(lastUtterance.pitch).toBe(0.8);
    });

    it('should call synth.speak with the utterance', async () => {
      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);
      await promise;

      expect(mockSynth.speak).toHaveBeenCalledWith(
        expect.any(MockSpeechSynthesisUtterance),
      );
    });

    it('should reject if speech synthesis is not supported', async () => {
      const original = window.speechSynthesis;
      delete (window as any).speechSynthesis;

      vi.resetModules();
      const module = await import('../../../src/services/speechSynthesis');

      await expect(module.speechSynthesis.speak('Hello')).rejects.toThrow(
        'Speech synthesis not supported',
      );

      Object.defineProperty(window, 'speechSynthesis', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('should resolve when utterance ends', async () => {
      // Override speak to trigger onend immediately
      mockSynth.speak.mockImplementation((utterance: any) => {
        setTimeout(() => utterance.onend(), 0);
      });

      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should reject on utterance error', async () => {
      mockSynth.speak.mockImplementation((utterance: any) => {
        setTimeout(() => {
          utterance.onerror({ error: 'audio-busy' });
        }, 0);
      });

      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);

      await expect(promise).rejects.toThrow('audio-busy');
    });

    it('should resolve (not reject) on interrupted error', async () => {
      mockSynth.speak.mockImplementation((utterance: any) => {
        setTimeout(() => {
          utterance.onerror({ error: 'interrupted' });
        }, 0);
      });

      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should set voice on utterance if voice is selected', async () => {
      // Voice should have been selected during construction
      const promise = speechSynthesisService.speak('Hello');
      vi.advanceTimersByTime(10);
      await promise;

      // The voice should be set (it would be the first German voice since store has 'de')
      expect(lastUtterance.voice).not.toBeNull();
    });
  });

  describe('sayOK', () => {
    it('should speak "OK" with rate 1.2', async () => {
      const promise = speechSynthesisService.sayOK();
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('OK');
      expect(lastUtterance.rate).toBe(1.2);
    });
  });

  describe('sayRecorded', () => {
    it('should speak "Erfasst" in German', async () => {
      const { store } = await import('../../../src/store');
      (store.getState as any).mockReturnValue({ currentLang: 'de' });

      const promise = speechSynthesisService.sayRecorded();
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('Erfasst');
      expect(lastUtterance.rate).toBe(1.1);
    });

    it('should speak "Recorded" in English', async () => {
      const { store } = await import('../../../src/store');
      (store.getState as any).mockReturnValue({ currentLang: 'en' });

      const promise = speechSynthesisService.sayRecorded();
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('Recorded');
    });
  });

  describe('sayNotUnderstood', () => {
    it('should speak "Nicht verstanden" in German', async () => {
      const { store } = await import('../../../src/store');
      (store.getState as any).mockReturnValue({ currentLang: 'de' });

      const promise = speechSynthesisService.sayNotUnderstood();
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('Nicht verstanden');
      expect(lastUtterance.rate).toBe(1.0);
    });

    it('should speak "Not understood" in English', async () => {
      const { store } = await import('../../../src/store');
      (store.getState as any).mockReturnValue({ currentLang: 'en' });

      const promise = speechSynthesisService.sayNotUnderstood();
      vi.advanceTimersByTime(10);
      await promise;

      expect(lastUtterance.text).toBe('Not understood');
    });
  });

  describe('cancel', () => {
    it('should call synth.cancel()', () => {
      speechSynthesisService.cancel();
      expect(mockSynth.cancel).toHaveBeenCalled();
    });

    it('should not throw when synth is null', async () => {
      const original = window.speechSynthesis;
      delete (window as any).speechSynthesis;

      vi.resetModules();
      const module = await import('../../../src/services/speechSynthesis');

      expect(() => module.speechSynthesis.cancel()).not.toThrow();

      Object.defineProperty(window, 'speechSynthesis', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('voice selection preference', () => {
    it('should prefer female voices', async () => {
      // The mockVoices include 'Karen Female' for English
      speechSynthesisService.setLanguage('en');

      const promise = speechSynthesisService.speak('Test');
      vi.advanceTimersByTime(10);
      await promise;

      // Should prefer the female voice
      expect(lastUtterance.voice?.name).toBe('Karen Female');
    });

    it('should fallback to any matching language voice if no female found', async () => {
      // German voices don't have "female" in name - should pick first German voice
      speechSynthesisService.setLanguage('de');

      const promise = speechSynthesisService.speak('Test');
      vi.advanceTimersByTime(10);
      await promise;

      // Should pick the first German voice
      expect(lastUtterance.voice?.lang).toMatch(/^de/);
    });

    it('should fallback to English if no matching language voice found', async () => {
      // Replace voices with only English
      const englishOnlyVoices: SpeechSynthesisVoice[] = [
        {
          name: 'Samantha',
          lang: 'en-US',
          voiceURI: 'en-US-Samantha',
          localService: true,
          default: true,
        },
      ];
      mockSynth.getVoices.mockReturnValue(englishOnlyVoices);

      speechSynthesisService.setLanguage('de');

      const promise = speechSynthesisService.speak('Test');
      vi.advanceTimersByTime(10);
      await promise;

      // Should fallback to English voice
      expect(lastUtterance.voice?.lang).toMatch(/^en/);
    });

    it('should set voice to null if no voices at all', async () => {
      mockSynth.getVoices.mockReturnValue([]);

      speechSynthesisService.setLanguage('de');

      const promise = speechSynthesisService.speak('Test');
      vi.advanceTimersByTime(10);
      await promise;

      // Voice will be null, utterance should still work
      expect(lastUtterance.voice).toBeNull();
    });
  });
});
