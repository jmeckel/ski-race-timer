/**
 * Speech Synthesis Service
 * Provides text-to-speech functionality for voice mode confirmations
 */

import { store } from '../store';
import { logger } from '../utils/logger';

class SpeechSynthesisService {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
    }
  }

  /**
   * Check if speech synthesis is supported
   */
  isSupported(): boolean {
    return this.synth !== null;
  }

  /**
   * Load voices - may need to wait for voiceschanged event
   */
  private loadVoices(): void {
    if (!this.synth) return;

    const voices = this.synth.getVoices();
    if (voices.length > 0) {
      this.voicesLoaded = true;
      this.selectVoiceForLanguage(store.getState().currentLang);
    } else {
      // Voices not loaded yet, wait for event
      this.synth.addEventListener('voiceschanged', () => {
        this.voicesLoaded = true;
        this.selectVoiceForLanguage(store.getState().currentLang);
      }, { once: true });
    }
  }

  /**
   * Select appropriate voice for the current language
   */
  private selectVoiceForLanguage(lang: 'de' | 'en'): void {
    if (!this.synth) return;

    const voices = this.synth.getVoices();
    const langCode = lang === 'de' ? 'de' : 'en';

    // Try to find a voice that matches the language
    // Prefer female voices as they're often clearer
    this.voice = voices.find(v =>
      v.lang.startsWith(langCode) && v.name.toLowerCase().includes('female')
    ) || voices.find(v =>
      v.lang.startsWith(langCode)
    ) || voices.find(v =>
      v.lang.startsWith('en') // Fallback to English
    ) || null;

    if (this.voice) {
      logger.debug('[SpeechSynthesis] Selected voice:', this.voice.name, this.voice.lang);
    }
  }

  /**
   * Update voice when language changes
   */
  setLanguage(lang: 'de' | 'en'): void {
    if (this.voicesLoaded) {
      this.selectVoiceForLanguage(lang);
    }
  }

  /**
   * Speak the given text
   */
  speak(text: string, options?: { rate?: number; pitch?: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      if (this.voice) {
        utterance.voice = this.voice;
      }

      utterance.rate = options?.rate ?? 1.1; // Slightly faster for snappy confirmations
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        // Ignore 'interrupted' errors (happens when we cancel)
        if (e.error === 'interrupted') {
          resolve();
        } else {
          logger.warn('[SpeechSynthesis] Error:', e.error);
          reject(new Error(e.error));
        }
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * Quick "OK" confirmation (used for timer recordings)
   */
  sayOK(): Promise<void> {
    return this.speak('OK', { rate: 1.2 });
  }

  /**
   * Say "Recorded" / "Erfasst" in current language
   */
  sayRecorded(): Promise<void> {
    const lang = store.getState().currentLang;
    const text = lang === 'de' ? 'Erfasst' : 'Recorded';
    return this.speak(text, { rate: 1.1 });
  }

  /**
   * Say "Not understood" in current language
   */
  sayNotUnderstood(): Promise<void> {
    const lang = store.getState().currentLang;
    const text = lang === 'de' ? 'Nicht verstanden' : 'Not understood';
    return this.speak(text, { rate: 1.0 });
  }

  /**
   * Cancel any ongoing speech
   */
  cancel(): void {
    this.synth?.cancel();
  }
}

export const speechSynthesis = new SpeechSynthesisService();
