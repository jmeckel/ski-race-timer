import { store } from '../store';

// Audio context for sound feedback
let audioContext: AudioContext | null = null;

/**
 * Get or create AudioContext (lazy initialization)
 */
function getAudioContext(): AudioContext | null {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch (error) {
      console.warn('AudioContext not available:', error);
      return null;
    }
  }
  return audioContext;
}

/**
 * Vibrate device with pattern
 */
export function vibrate(pattern: number | number[]): void {
  const settings = store.getState().settings;
  if (!settings.haptic) return;

  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('Vibration failed:', error);
    }
  }
}

/**
 * Play a beep sound
 */
export function playBeep(frequency: number = 880, duration: number = 100): void {
  const settings = store.getState().settings;
  if (!settings.sound) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    // Fade out to avoid clicks
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (error) {
    console.warn('Sound playback failed:', error);
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
 * Resume AudioContext (needed after user interaction on mobile)
 */
export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      console.warn('Failed to resume audio:', error);
    }
  }
}
