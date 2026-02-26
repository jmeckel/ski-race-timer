import { store } from '../store';
import { logger } from '../utils/logger';
import { batteryService } from './battery';

// Camera configuration
const CAMERA_CONFIG: MediaStreamConstraints = {
  video: {
    facingMode: 'environment', // Rear camera
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

// Low-battery camera config (reduced resolution to save power)
const CAMERA_CONFIG_LOW_BATTERY: MediaStreamConstraints = {
  video: {
    facingMode: 'environment',
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  audio: false,
};

// Photo quality settings
const PHOTO_QUALITY = 0.8;
const PHOTO_MAX_WIDTH = 1280;
const PHOTO_MAX_HEIGHT = 720;
const PHOTO_MAX_SIZE_KB = 200; // Max base64 size in KB (actual image ~150KB)

// Camera state machine to handle visibility changes correctly
type CameraState = 'stopped' | 'initializing' | 'ready' | 'paused' | 'resuming';

// Maximum time camera can stay in 'resuming' state before allowing retry (ms)
const RESUMING_TIMEOUT = 5000;
// Maximum consecutive reinitialize attempts before giving up
const MAX_REINIT_RETRIES = 3;
// Idle timeout before stopping stream to save battery (ms)
const IDLE_TIMEOUT = 120_000; // 2 minutes

class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private cameraState: CameraState = 'stopped';
  private visibilityHandler: (() => void) | null = null;
  private pendingVisibilityChange: 'hidden' | 'visible' | null = null;
  private previewElement: HTMLVideoElement | null = null;
  private ownsVideoElement = false;
  private resumingStartedAt: number | null = null;
  private reinitRetryCount = 0;
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Create or reuse a video element for camera capture.
   * Uses the preview element if set, otherwise creates a hidden off-screen element.
   */
  private createVideoElement(): HTMLVideoElement {
    if (this.previewElement) {
      this.ownsVideoElement = false;
      return this.previewElement;
    }
    const el = document.createElement('video');
    el.setAttribute('autoplay', '');
    el.setAttribute('playsinline', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    document.body.appendChild(el);
    this.ownsVideoElement = true;
    return el;
  }

  /**
   * Wait for the video element to load metadata and begin playback.
   */
  private waitForVideoReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.videoElement) {
        reject(new Error('Video element not available'));
        return;
      }
      // If metadata already loaded, play immediately
      if (this.videoElement.readyState >= 1) {
        this.videoElement
          .play()
          .then(() => resolve())
          .catch(reject);
        return;
      }
      this.videoElement.onloadedmetadata = () => {
        this.videoElement!.play()
          .then(() => resolve())
          .catch(reject);
      };
      this.videoElement.onerror = () => reject(new Error('Video load error'));
    });
  }

  /**
   * Initialize the camera service
   * Creates hidden video and canvas elements for photo capture
   */
  async initialize(): Promise<boolean> {
    if (this.cameraState === 'ready') return true;
    if (this.cameraState === 'initializing') return false; // Already initializing

    this.cameraState = 'initializing';
    this.reinitRetryCount = 0; // Reset retry counter on fresh init

    try {
      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available');
      }

      // Skip camera on critical battery to save power (stream uses 100-300mW)
      if (batteryService.isCriticalBattery()) {
        logger.debug('[Camera] Critical battery, skipping initialization');
        this.cameraState = 'stopped';
        store.setCameraReady(false, 'Camera disabled on critical battery');
        return false;
      }

      this.videoElement = this.createVideoElement();

      // Create hidden canvas for photo capture
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = PHOTO_MAX_WIDTH;
      this.canvasElement.height = PHOTO_MAX_HEIGHT;

      // Use lower resolution on low battery to save power
      const config = batteryService.isLowBattery()
        ? CAMERA_CONFIG_LOW_BATTERY
        : CAMERA_CONFIG;

      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia(config);
      this.videoElement.srcObject = this.stream;

      await this.waitForVideoReady();

      // Check if visibility changed during initialization
      if (this.pendingVisibilityChange === 'hidden') {
        this.pendingVisibilityChange = null;
        // Clean up canvas before pausing (not needed while paused)
        this.canvasElement = null;
        this.pauseCamera();
        return false;
      }

      this.cameraState = 'ready';
      store.setCameraReady(true);
      this.resetIdleTimeout();

      // Add visibility change handler to pause/resume camera for battery optimization
      if (!this.visibilityHandler) {
        this.visibilityHandler = () => this.handleVisibilityChange();
        document.addEventListener('visibilitychange', this.visibilityHandler);
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Camera initialization failed';
      logger.error('Camera initialization error:', errorMessage);
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
      this.cameraState = 'stopped';
      store.setCameraReady(false, errorMessage);
      return false;
    }
  }

  /**
   * Handle visibility change events with state machine
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Page is hidden
      if (
        this.cameraState === 'initializing' ||
        this.cameraState === 'resuming'
      ) {
        // Mark pending change - will be handled when init/resume completes
        this.pendingVisibilityChange = 'hidden';
      } else if (this.cameraState === 'ready') {
        this.pauseCamera();
      }
    } else {
      // Page is visible
      if (
        this.cameraState === 'initializing' ||
        this.cameraState === 'resuming'
      ) {
        // Clear any pending hidden change
        this.pendingVisibilityChange = null;
      } else if (this.cameraState === 'paused') {
        this.reinitializeCamera();
      }
    }
  }

  /**
   * Pause camera when page becomes hidden
   */
  private pauseCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
    }
    this.cameraState = 'paused';
    store.setCameraReady(false);
  }

  /**
   * Reinitialize camera after visibility change
   * Uses state machine to handle rapid visibility changes correctly
   */
  private async reinitializeCamera(): Promise<void> {
    // Prevent concurrent reinitialize calls, but allow retry if stuck for too long
    if (this.cameraState === 'resuming') {
      if (
        this.resumingStartedAt &&
        Date.now() - this.resumingStartedAt > RESUMING_TIMEOUT
      ) {
        // Stuck in resuming state for too long - reset to allow retry
        logger.warn('Camera stuck in resuming state, resetting for retry');
        this.cameraState = 'paused';
        this.resumingStartedAt = null;
      } else {
        return;
      }
    }

    // Stop retrying after max attempts to avoid infinite loops
    if (this.reinitRetryCount >= MAX_REINIT_RETRIES) {
      logger.warn(
        `Camera reinit failed after ${MAX_REINIT_RETRIES} attempts, giving up`,
      );
      this.cameraState = 'stopped';
      this.resumingStartedAt = null;
      store.setCameraReady(false, 'Camera reinitialization failed');
      return;
    }

    this.cameraState = 'resuming';
    this.resumingStartedAt = Date.now();
    this.reinitRetryCount++;

    try {
      if (!this.videoElement) {
        this.videoElement = this.createVideoElement();
      }

      // Request camera access — use lower resolution on low battery
      const config = batteryService.isLowBattery()
        ? CAMERA_CONFIG_LOW_BATTERY
        : CAMERA_CONFIG;
      this.stream = await navigator.mediaDevices.getUserMedia(config);
      this.videoElement.srcObject = this.stream;

      await this.waitForVideoReady();

      // Check if visibility changed during reinitialization
      if (this.pendingVisibilityChange === 'hidden') {
        this.pendingVisibilityChange = null;
        this.resumingStartedAt = null;
        this.pauseCamera();
        return;
      }

      this.cameraState = 'ready';
      this.resumingStartedAt = null;
      this.reinitRetryCount = 0; // Reset on success
      store.setCameraReady(true);
      this.resetIdleTimeout();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Reinitialize failed';
      logger.error('Failed to reinitialize camera:', error);
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
      this.resumingStartedAt = null;
      // Only permanently stop camera if all retries are exhausted
      if (this.reinitRetryCount >= MAX_REINIT_RETRIES) {
        this.cameraState = 'stopped';
        if (this.visibilityHandler) {
          document.removeEventListener(
            'visibilitychange',
            this.visibilityHandler,
          );
          this.visibilityHandler = null;
        }
      } else {
        this.cameraState = 'paused';
      }
      store.setCameraReady(false, errorMessage);
    }
  }

  /**
   * Capture a photo from the camera
   * Returns base64 encoded JPEG image
   */
  async capturePhoto(): Promise<string | null> {
    if (
      this.cameraState !== 'ready' ||
      !this.videoElement ||
      !this.canvasElement
    ) {
      logger.warn('Camera not ready for capture');
      return null;
    }

    this.resetIdleTimeout();

    try {
      const ctx = this.canvasElement.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Get video dimensions
      const videoWidth = this.videoElement.videoWidth;
      const videoHeight = this.videoElement.videoHeight;

      // Calculate dimensions to maintain aspect ratio
      let width = videoWidth;
      let height = videoHeight;

      if (width > PHOTO_MAX_WIDTH) {
        const ratio = PHOTO_MAX_WIDTH / width;
        width = PHOTO_MAX_WIDTH;
        height = Math.round(height * ratio);
      }

      if (height > PHOTO_MAX_HEIGHT) {
        const ratio = PHOTO_MAX_HEIGHT / height;
        height = PHOTO_MAX_HEIGHT;
        width = Math.round(width * ratio);
      }

      // Update canvas size
      this.canvasElement.width = width;
      this.canvasElement.height = height;

      // Draw video frame to canvas
      ctx.drawImage(this.videoElement, 0, 0, width, height);

      // Add timestamp overlay
      const timestamp = new Date().toISOString();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, height - 30, width, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.fillText(timestamp, 10, height - 10);

      // Convert to base64
      const dataUrl = this.canvasElement.toDataURL('image/jpeg', PHOTO_QUALITY);
      const base64 = dataUrl.split(',')[1] ?? null;
      if (!base64) return null;
      const sizeKB = Math.round(base64.length / 1024);

      // Check size limit
      if (sizeKB > PHOTO_MAX_SIZE_KB) {
        const error = new Error(
          `Photo too large (${sizeKB}KB > ${PHOTO_MAX_SIZE_KB}KB limit)`,
        );
        error.name = 'PhotoTooLargeError';
        throw error;
      }

      return base64;
    } catch (error) {
      if (error instanceof Error && error.name === 'PhotoTooLargeError') {
        throw error;
      }
      logger.error('Photo capture error:', error);
      return null;
    }
  }

  /**
   * Stop the camera stream
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      if (this.ownsVideoElement) {
        this.videoElement.remove();
      }
      this.videoElement = null;
    }

    this.canvasElement = null;

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.pendingVisibilityChange = null;
    this.resumingStartedAt = null;
    this.clearIdleTimeout();
    this.cameraState = 'stopped';
    store.setCameraReady(false);
  }

  /**
   * Check if camera is ready
   */
  isReady(): boolean {
    return this.cameraState === 'ready';
  }

  /**
   * Attach or detach a preview element for camera stream
   */
  setPreviewElement(element: HTMLVideoElement | null): void {
    this.previewElement = element;
    if (!element) {
      if (this.videoElement && !this.ownsVideoElement) {
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }
      return;
    }

    if (this.videoElement !== element) {
      if (this.videoElement && this.ownsVideoElement) {
        this.videoElement.remove();
      }
      this.videoElement = element;
      this.ownsVideoElement = false;
    }

    if (this.stream) {
      this.videoElement.srcObject = this.stream;
      this.videoElement.play().catch(() => null);
    }
  }

  /**
   * Get the active video element (preview or hidden)
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get camera error message
   */
  getError(): string | null {
    return store.getState().cameraError;
  }

  /**
   * Reset the idle timeout - pauses the stream after 2 minutes without capture
   */
  private resetIdleTimeout(): void {
    this.clearIdleTimeout();
    this.idleTimeoutId = setTimeout(() => {
      if (this.cameraState === 'ready') {
        logger.debug('[Camera] Idle timeout, pausing stream to save battery');
        this.pauseCamera();
      }
    }, IDLE_TIMEOUT);
  }

  private clearIdleTimeout(): void {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
  }

  /**
   * Toggle camera based on settings
   */
  async toggle(enabled: boolean): Promise<boolean> {
    if (enabled) {
      return this.initialize();
    } else {
      this.stop();
      return true;
    }
  }
}

// Singleton instance
export const cameraService = new CameraService();

// Helper function to capture photo with timestamp entry
export async function captureTimingPhoto(): Promise<string | null> {
  const settings = store.getState().settings;
  if (!settings.photoCapture) return null;

  if (!cameraService.isReady()) {
    const initialized = await cameraService.initialize();
    if (!initialized) return null;
  }

  return cameraService.capturePhoto();
}
