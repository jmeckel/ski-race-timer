import { store } from '../store';
import { logger } from '../utils/logger';
import { batteryService } from './battery';

// Audio context for sound feedback
let audioContext: AudioContext | null = null;
let audioIdleTimeoutId: number | null = null;
const AUDIO_IDLE_TIMEOUT = 5000; // 5 seconds before suspending (saves ~10mW)

/**
 * Get or create AudioContext (lazy initialization)
 */
function getAudioContext(): AudioContext | null {
  if (!audioContext) {
    try {
      audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    } catch (error) {
      logger.warn('AudioContext not available:', error);
      return null;
    }
  }
  return audioContext;
}

/**
 * Schedule AudioContext suspension after idle timeout
 * Saves power by releasing audio hardware when not in use
 */
function scheduleAudioSuspend(): void {
  if (audioIdleTimeoutId !== null) {
    clearTimeout(audioIdleTimeoutId);
  }
  audioIdleTimeoutId = window.setTimeout(() => {
    if (audioContext && audioContext.state === 'running') {
      audioContext.suspend().catch(() => {
        // Ignore suspension errors
      });
    }
    audioIdleTimeoutId = null;
  }, AUDIO_IDLE_TIMEOUT);
}

/**
 * Scale a vibration pattern based on battery level.
 * - medium: reduce duration by 25%
 * - low: reduce duration by 50%
 * - critical: disable vibration entirely
 */
function scaledVibrationPattern(
  pattern: number | number[],
): number | number[] | null {
  const { batteryLevel } = batteryService.getStatus();

  if (batteryLevel === 'critical') return null;

  const scale =
    batteryLevel === 'low' ? 0.5 : batteryLevel === 'medium' ? 0.75 : 1;
  if (scale === 1) return pattern;

  return typeof pattern === 'number'
    ? Math.round(pattern * scale)
    : pattern.map((v) => Math.round(v * scale));
}

/**
 * Vibrate device with pattern
 * Battery-aware: reduces duration on medium/low battery, disables on critical
 */
export function vibrate(pattern: number | number[]): void {
  const settings = store.getState().settings;
  if (!settings.haptic) return;

  const scaled = scaledVibrationPattern(pattern);
  if (scaled === null) return; // Critical battery - skip vibration

  if (navigator.vibrate) {
    try {
      navigator.vibrate(scaled);
    } catch (error) {
      logger.warn('Vibration failed:', error);
    }
  }
}

/**
 * Play a beep sound
 */
export function playBeep(
  frequency: number = 880,
  duration: number = 100,
): void {
  const settings = store.getState().settings;
  if (!settings.sound) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (from idle timeout), then schedule oscillator
  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => {
        scheduleOscillator(ctx, frequency, duration);
        scheduleAudioSuspend();
      })
      .catch(() => {});
    return;
  }

  scheduleOscillator(ctx, frequency, duration);
  scheduleAudioSuspend();
}

/** Schedule an oscillator beep on a running AudioContext */
function scheduleOscillator(
  ctx: AudioContext,
  frequency: number,
  duration: number,
): void {
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    // Fade out to avoid clicks
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      ctx.currentTime + duration / 1000,
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (error) {
    logger.warn('Sound playback failed:', error);
  }
}

// Predefined feedback patterns

// Haptic patterns optimized for outdoor use with gloves (30ms minimum)

/**
 * Success feedback (timestamp recorded)
 */
export function feedbackSuccess(): void {
  vibrate(40);
  playBeep(880, 100);
}

/**
 * Warning feedback (duplicate entry)
 */
export function feedbackWarning(): void {
  vibrate([60, 40, 60]);
  playBeep(440, 200);
}

/**
 * Error feedback
 */
export function feedbackError(): void {
  vibrate([100, 50, 100]);
  playBeep(220, 300);
}

/**
 * Light tap feedback (button press)
 */
export function feedbackTap(): void {
  vibrate(30);
}

/**
 * Light dial tap feedback (number tap on radial dial)
 */
export function feedbackDialTap(): void {
  vibrate(10);
}

/**
 * Medium dial detent feedback (spin detent on radial dial)
 */
export function feedbackDialDetent(): void {
  vibrate(20);
}

/**
 * Medium tap feedback (selection)
 */
export function feedbackSelect(): void {
  vibrate(35);
}

/**
 * Delete feedback
 */
export function feedbackDelete(): void {
  vibrate([40, 30, 40]);
  playBeep(330, 150);
}

/**
 * Undo feedback
 */
export function feedbackUndo(): void {
  vibrate([35, 35]);
  playBeep(660, 100);
}

/**
 * Export feedback
 */
export function feedbackExport(): void {
  vibrate(45);
  playBeep(660, 150);
}

/**
 * Sync feedback
 */
export function feedbackSync(): void {
  vibrate(30);
  playBeep(550, 80);
}

/**
 * Cleanup feedback resources (audio context, pending timeouts)
 * Call on page unload to prevent memory leaks
 */
export function cleanupFeedback(): void {
  if (audioIdleTimeoutId !== null) {
    clearTimeout(audioIdleTimeoutId);
    audioIdleTimeoutId = null;
  }
  // Cancel any in-progress speech synthesis to release audio subsystem
  if (typeof speechSynthesis !== 'undefined') {
    try {
      speechSynthesis.cancel();
    } catch {
      // Ignore — not all browsers support speechSynthesis
    }
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

/**
 * Resume AudioContext (needed after user interaction on mobile)
 */
export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      logger.warn('Failed to resume audio:', error);
    }
  }
}
