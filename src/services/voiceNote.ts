/**
 * Voice Note Transcription Service
 * Uses Web Speech Recognition API for offline transcription of voice notes
 * This is distinct from voice command mode - it only transcribes text, no LLM parsing
 */

import { store } from '../store';
import { logger } from '../utils/logger';

// Speech Recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export type VoiceNoteStatus = 'idle' | 'listening' | 'error' | 'unsupported';

type StatusCallback = (status: VoiceNoteStatus) => void;
type TranscriptCallback = (transcript: string, isFinal: boolean) => void;

class VoiceNoteService {
  private recognition: SpeechRecognition | null = null;
  private status: VoiceNoteStatus = 'idle';
  private isDestroyed = false;

  // Callbacks
  private statusCallbacks: Set<StatusCallback> = new Set();
  private transcriptCallbacks: Set<TranscriptCallback> = new Set();

  // Configuration
  private readonly MAX_DURATION_MS = 30000; // 30 seconds max recording
  private recordingTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Check if voice transcription is supported in this browser
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Initialize the service (lazy initialization on first use)
   * Can be called early to pre-warm the browser's SpeechRecognition object.
   */
  initialize(): boolean {
    if (this.recognition) return true;

    if (!this.isSupported()) {
      logger.warn('[VoiceNote] Speech Recognition not supported');
      this.setStatus('unsupported');
      return false;
    }

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.setupRecognitionHandlers();
    this.updateLanguage();

    logger.debug('[VoiceNote] Initialized successfully');
    return true;
  }

  /**
   * Update recognition language based on app settings
   */
  private updateLanguage(): void {
    if (!this.recognition) return;
    const lang = store.getState().currentLang;
    this.recognition.lang = lang === 'de' ? 'de-DE' : 'en-US';
  }

  /**
   * Set up speech recognition event handlers
   */
  private setupRecognitionHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      logger.debug('[VoiceNote] Recognition started');
      this.setStatus('listening');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Notify callbacks of interim results
      if (interimTranscript) {
        this.notifyTranscript(interimTranscript, false);
      }

      // Notify callbacks of final results
      if (finalTranscript) {
        this.notifyTranscript(finalTranscript, true);
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      logger.warn('[VoiceNote] Recognition error:', event.error);

      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          this.setStatus('error');
          break;
        case 'no-speech':
        case 'audio-capture':
          // Recoverable errors - just stop gracefully
          this.setStatus('idle');
          break;
        case 'aborted':
          // Intentional stop
          this.setStatus('idle');
          break;
        default:
          this.setStatus('error');
      }

      this.clearRecordingTimeout();
    };

    this.recognition.onend = () => {
      logger.debug('[VoiceNote] Recognition ended');
      this.clearRecordingTimeout();
      if (this.status === 'listening') {
        this.setStatus('idle');
      }
    };
  }

  /**
   * Start voice note recording
   */
  start(): boolean {
    if (this.isDestroyed) return false;

    if (!this.initialize()) {
      return false;
    }

    this.updateLanguage();

    try {
      this.recognition?.start();

      // Set max recording timeout
      this.recordingTimeout = setTimeout(() => {
        logger.debug('[VoiceNote] Max duration reached, stopping');
        this.stop();
      }, this.MAX_DURATION_MS);

      return true;
    } catch (e) {
      logger.warn('[VoiceNote] Failed to start:', e);
      this.setStatus('error');
      return false;
    }
  }

  /**
   * Stop voice note recording
   */
  stop(): void {
    this.clearRecordingTimeout();

    try {
      this.recognition?.stop();
    } catch (_e) {
      // Ignore
    }

    this.setStatus('idle');
  }

  /**
   * Abort voice note recording (discard results)
   */
  abort(): void {
    this.clearRecordingTimeout();

    try {
      this.recognition?.abort();
    } catch (_e) {
      // Ignore
    }

    this.setStatus('idle');
  }

  /**
   * Clear recording timeout
   */
  private clearRecordingTimeout(): void {
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
  }

  /**
   * Update and notify status change
   */
  private setStatus(status: VoiceNoteStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const callback of this.statusCallbacks) {
      try {
        callback(status);
      } catch (e) {
        logger.error('[VoiceNote] Status callback error:', e);
      }
    }
  }

  /**
   * Notify transcript callbacks
   */
  private notifyTranscript(transcript: string, isFinal: boolean): void {
    for (const callback of this.transcriptCallbacks) {
      try {
        callback(transcript, isFinal);
      } catch (e) {
        logger.error('[VoiceNote] Transcript callback error:', e);
      }
    }
  }

  /**
   * Get current status
   */
  getStatus(): VoiceNoteStatus {
    return this.status;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.status === 'listening';
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Subscribe to transcript updates
   */
  onTranscript(callback: TranscriptCallback): () => void {
    this.transcriptCallbacks.add(callback);
    return () => this.transcriptCallbacks.delete(callback);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.abort();
    this.statusCallbacks.clear();
    this.transcriptCallbacks.clear();
    this.recognition = null;
  }
}

// Export singleton instance
export const voiceNoteService = new VoiceNoteService();
