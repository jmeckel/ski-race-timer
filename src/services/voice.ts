/**
 * Voice Mode Service
 * Orchestrates speech recognition, LLM processing, and speech synthesis
 * for hands-free operation of the ski race timer
 */

import { t } from '../i18n/translations';
import { store } from '../store';
import type {
  LLMConfig,
  VoiceContext,
  VoiceIntent,
  VoiceStatus,
} from '../types';
import { getLocale } from '../utils/format';
import { logger } from '../utils/logger';
import { processVoiceCommandWithTimeout } from './llmProvider';
import { speechSynthesis } from './speechSynthesis';

// Extend Window for Speech Recognition types
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

type StateCallback = (status: VoiceStatus) => void;
type ActionCallback = (intent: VoiceIntent) => void;

class VoiceModeService {
  private recognition: SpeechRecognition | null = null;
  private llmConfig: LLMConfig | null = null;
  private isEnabled = false;
  private isPaused = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private pendingIntent: VoiceIntent | null = null;
  private status: VoiceStatus = 'inactive';
  private confirmationTimeout: ReturnType<typeof setTimeout> | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  // Callbacks
  private stateCallbacks: Set<StateCallback> = new Set();
  private actionCallbacks: Set<ActionCallback> = new Set();

  // Configuration
  private readonly CONFIRMATION_TIMEOUT_MS = 10000; // 10s to confirm
  private readonly LLM_TIMEOUT_MS = 5000; // 5s for LLM response
  private readonly RESTART_DELAY_MS = 500; // Brief rest for mic between recognition sessions to reduce power draw

  /**
   * Check if voice mode is supported in this browser
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Initialize the voice service with LLM configuration
   */
  initialize(config: LLMConfig): boolean {
    if (!this.isSupported()) {
      logger.warn('[Voice] Speech Recognition not supported');
      return false;
    }

    if (!speechSynthesis.isSupported()) {
      logger.warn('[Voice] Speech Synthesis not supported');
      return false;
    }

    this.llmConfig = config;

    // Set up speech recognition
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    // Set language based on current app language
    this.updateRecognitionLanguage();

    this.setupRecognitionHandlers();

    // Set up network status listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    logger.debug('[Voice] Initialized successfully');
    return true;
  }

  /**
   * Update speech recognition language based on app settings
   */
  private updateRecognitionLanguage(): void {
    if (!this.recognition) return;
    const lang = store.getState().currentLang;
    this.recognition.lang = getLocale(lang);
    speechSynthesis.setLanguage(lang);
  }

  /**
   * Set up speech recognition event handlers
   */
  private setupRecognitionHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      logger.debug('[Voice] Recognition started');
      this.setStatus('listening');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.resultIndex]!;
      if (result.isFinal) {
        const transcript = result[0]!.transcript.trim();
        logger.debug('[Voice] Transcript:', transcript);
        this.processTranscript(transcript);
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      logger.warn('[Voice] Recognition error:', event.error);

      // Handle specific errors
      switch (event.error) {
        case 'network':
          this.setStatus('offline');
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          this.setStatus('error');
          this.disable();
          break;
        case 'no-speech':
        case 'audio-capture':
          // These are recoverable - will restart
          break;
        case 'aborted':
          // Intentional stop, don't restart
          return;
        default:
          this.setStatus('error');
      }
    };

    this.recognition.onend = () => {
      logger.debug('[Voice] Recognition ended');

      // Restart if still enabled, online, and not paused
      if (
        this.isEnabled &&
        this.isOnline &&
        !this.isPaused &&
        this.status !== 'error'
      ) {
        this.scheduleRestart();
      }
    };
  }

  /**
   * Schedule recognition restart with small delay
   */
  private scheduleRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    this.restartTimeout = setTimeout(() => {
      if (this.isEnabled && this.isOnline && !this.isPaused) {
        try {
          this.recognition?.start();
        } catch (_e) {
          // Already started, ignore
        }
      }
    }, this.RESTART_DELAY_MS);
  }

  /**
   * Process transcribed text through LLM
   */
  private async processTranscript(transcript: string): Promise<void> {
    if (!transcript || !this.llmConfig) return;

    this.setStatus('processing');

    const state = store.getState();
    const context: VoiceContext = {
      role: state.deviceRole,
      language: state.currentLang,
      currentRun: state.selectedRun,
      activeBibs:
        state.deviceRole === 'gateJudge'
          ? this.getActiveBibs(state.selectedRun)
          : undefined,
      gateRange: state.gateAssignment || undefined,
      pendingConfirmation: this.pendingIntent || undefined,
    };

    try {
      const intent = await processVoiceCommandWithTimeout(
        transcript,
        context,
        this.llmConfig,
        this.LLM_TIMEOUT_MS,
      );

      await this.handleIntent(intent);
    } catch (error) {
      logger.error('[Voice] Processing error:', error);
      this.setStatus('error');
      await speechSynthesis.sayNotUnderstood();
      this.setStatus('listening');
    }
  }

  /**
   * Get active bibs for gate judge (racers currently on course)
   */
  private getActiveBibs(run: number): string[] {
    const state = store.getState();
    // Get bibs that have a start time but no finish time for this run
    const startedBibs = new Set<string>();
    const finishedBibs = new Set<string>();

    for (const entry of state.entries) {
      if (entry.run === run) {
        if (entry.point === 'S') {
          startedBibs.add(entry.bib);
        } else if (entry.point === 'F') {
          finishedBibs.add(entry.bib);
        }
      }
    }

    // Active = started but not finished
    return Array.from(startedBibs).filter((bib) => !finishedBibs.has(bib));
  }

  /**
   * Handle parsed intent from LLM
   */
  private async handleIntent(intent: VoiceIntent): Promise<void> {
    // Clear any existing confirmation timeout
    if (this.confirmationTimeout) {
      clearTimeout(this.confirmationTimeout);
      this.confirmationTimeout = null;
    }

    // Handle confirmation responses
    if (
      this.pendingIntent &&
      (intent.action === 'confirm' || intent.action === 'cancel')
    ) {
      if (intent.action === 'confirm') {
        this.executeIntent(this.pendingIntent);
        await speechSynthesis.sayRecorded();
      } else {
        // Cancelled - just acknowledge
        const lang = store.getState().currentLang;
        await speechSynthesis.speak(t('voiceCancelled', lang));
      }
      this.pendingIntent = null;
      this.setStatus('listening');
      return;
    }

    // Handle unknown intent
    if (intent.action === 'unknown' || intent.confidence < 0.5) {
      await speechSynthesis.sayNotUnderstood();
      this.setStatus('listening');
      return;
    }

    // Confirmatory path for faults
    if (intent.confirmationNeeded && intent.confirmationPrompt) {
      this.pendingIntent = intent;
      this.setStatus('confirming');
      await speechSynthesis.speak(intent.confirmationPrompt);

      // Set timeout for confirmation
      this.confirmationTimeout = setTimeout(() => {
        if (this.pendingIntent) {
          logger.debug('[Voice] Confirmation timeout');
          this.pendingIntent = null;
          this.setStatus('listening');
        }
      }, this.CONFIRMATION_TIMEOUT_MS);
      return;
    }

    // Direct execution for other intents (set_bib, set_point, etc.)
    this.executeIntent(intent);
    this.setStatus('listening');
  }

  /**
   * Execute a confirmed intent by notifying action callbacks
   */
  private executeIntent(intent: VoiceIntent): void {
    logger.debug('[Voice] Executing intent:', intent.action);
    for (const callback of this.actionCallbacks) {
      callback(intent);
    }
  }

  /**
   * Handle coming online
   */
  private handleOnline = (): void => {
    this.isOnline = true;
    if (this.isEnabled) {
      this.setStatus('listening');
      try {
        this.recognition?.start();
      } catch (_e) {
        // Already started
      }
    }
  };

  /**
   * Handle going offline
   */
  private handleOffline = (): void => {
    this.isOnline = false;
    if (this.isEnabled) {
      this.setStatus('offline');
      this.recognition?.stop();
    }
  };

  /**
   * Update and notify status change
   */
  private setStatus(status: VoiceStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const callback of this.stateCallbacks) {
      callback(status);
    }
  }

  /**
   * Enable voice mode
   */
  enable(): boolean {
    if (!this.recognition || !this.llmConfig) {
      logger.warn('[Voice] Not initialized');
      return false;
    }

    if (!this.isOnline) {
      this.setStatus('offline');
      return false;
    }

    this.isEnabled = true;
    this.updateRecognitionLanguage();

    try {
      this.recognition.start();
      return true;
    } catch (e) {
      logger.warn('[Voice] Failed to start recognition:', e);
      this.setStatus('error');
      return false;
    }
  }

  /**
   * Disable voice mode
   */
  disable(): void {
    this.isEnabled = false;
    this.isPaused = false;
    this.pendingIntent = null;

    if (this.confirmationTimeout) {
      clearTimeout(this.confirmationTimeout);
      this.confirmationTimeout = null;
    }

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    try {
      this.recognition?.stop();
    } catch (_e) {
      // Ignore
    }

    speechSynthesis.cancel();
    this.setStatus('inactive');
  }

  /**
   * Pause voice mode temporarily (e.g., while voice note is recording)
   * Stops recognition without triggering auto-restart.
   * Call resume() to re-enable.
   */
  pause(): void {
    if (!this.isEnabled || this.isPaused) return;

    this.isPaused = true;

    // Cancel any pending restart so it doesn't fight back
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    try {
      this.recognition?.abort();
    } catch (_e) {
      // Ignore
    }

    logger.debug('[Voice] Paused');
  }

  /**
   * Resume voice mode after a pause.
   * No-op if not previously paused or if voice mode was disabled.
   */
  resume(): void {
    if (!this.isEnabled || !this.isPaused) return;

    this.isPaused = false;

    if (this.isOnline && this.status !== 'error') {
      this.scheduleRestart();
    }

    logger.debug('[Voice] Resumed');
  }

  /**
   * Get current status
   */
  getStatus(): VoiceStatus {
    return this.status;
  }

  /**
   * Check if voice mode is enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Subscribe to intent actions
   */
  onAction(callback: ActionCallback): () => void {
    this.actionCallbacks.add(callback);
    return () => this.actionCallbacks.delete(callback);
  }

  /**
   * Check if voice mode is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.disable();
    this.stateCallbacks.clear();
    this.actionCallbacks.clear();

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    this.recognition = null;
    this.llmConfig = null;
  }
}

export const voiceModeService = new VoiceModeService();
