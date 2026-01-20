import { store } from '../store';

// Camera configuration
const CAMERA_CONFIG: MediaStreamConstraints = {
  video: {
    facingMode: 'environment', // Rear camera
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  audio: false
};

// Photo quality settings
const PHOTO_QUALITY = 0.8;
const PHOTO_MAX_WIDTH = 1280;
const PHOTO_MAX_HEIGHT = 720;
const PHOTO_MAX_SIZE_KB = 200; // Max base64 size in KB (actual image ~150KB)

class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private isInitialized = false;
  private isReinitializing = false; // Guard against concurrent reinitialize calls
  private visibilityHandler: (() => void) | null = null;
  private wasActiveBeforeHidden = false;

  /**
   * Initialize the camera service
   * Creates hidden video and canvas elements for photo capture
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available');
      }

      // Create hidden video element
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('autoplay', '');
      this.videoElement.setAttribute('playsinline', '');
      this.videoElement.style.position = 'absolute';
      this.videoElement.style.left = '-9999px';
      this.videoElement.style.top = '-9999px';
      document.body.appendChild(this.videoElement);

      // Create hidden canvas for photo capture
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = PHOTO_MAX_WIDTH;
      this.canvasElement.height = PHOTO_MAX_HEIGHT;

      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONFIG);
      this.videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not available'));
          return;
        }
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play()
            .then(() => resolve())
            .catch(reject);
        };
        this.videoElement.onerror = () => reject(new Error('Video load error'));
      });

      this.isInitialized = true;
      store.setCameraReady(true);

      // Add visibility change handler to pause/resume camera for battery optimization
      if (!this.visibilityHandler) {
        this.visibilityHandler = () => {
          if (document.hidden) {
            // Page is hidden - pause camera stream to save battery
            this.wasActiveBeforeHidden = this.isInitialized;
            if (this.stream) {
              // Stop all tracks to release camera hardware
              this.stream.getTracks().forEach(track => track.stop());
              this.stream = null;
              if (this.videoElement) {
                this.videoElement.srcObject = null;
              }
              this.isInitialized = false;
              store.setCameraReady(false);
              console.log('Camera paused (page hidden)');
            }
          } else {
            // Page is visible again - reinitialize camera if it was active before
            if (this.wasActiveBeforeHidden && !this.isInitialized) {
              this.reinitializeCamera();
            }
          }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
      }

      console.log('Camera initialized successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Camera initialization failed';
      console.error('Camera initialization error:', errorMessage);
      store.setCameraReady(false, errorMessage);
      return false;
    }
  }

  /**
   * Reinitialize camera after visibility change
   * Uses guard flag to prevent overlapping calls on rapid visibility changes
   */
  private async reinitializeCamera(): Promise<void> {
    // Prevent concurrent reinitialize calls
    if (this.isReinitializing) {
      console.log('Camera reinitialization already in progress, skipping');
      return;
    }
    this.isReinitializing = true;

    try {
      if (!this.videoElement) {
        // Video element was removed, need to recreate
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('autoplay', '');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.left = '-9999px';
        this.videoElement.style.top = '-9999px';
        document.body.appendChild(this.videoElement);
      }

      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONFIG);
      this.videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not available'));
          return;
        }
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play()
            .then(() => resolve())
            .catch(reject);
        };
        this.videoElement.onerror = () => reject(new Error('Video load error'));
      });

      this.isInitialized = true;
      store.setCameraReady(true);
      console.log('Camera reinitialized (page visible)');
    } catch (error) {
      console.error('Failed to reinitialize camera:', error);
      this.wasActiveBeforeHidden = false;
    } finally {
      this.isReinitializing = false;
    }
  }

  /**
   * Capture a photo from the camera
   * Returns base64 encoded JPEG image
   */
  async capturePhoto(): Promise<string | null> {
    if (!this.isInitialized || !this.videoElement || !this.canvasElement) {
      console.warn('Camera not initialized');
      return null;
    }

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
      const base64 = dataUrl.split(',')[1];
      const sizeKB = Math.round(base64.length / 1024);

      console.log(`Photo captured: ${sizeKB}KB`);

      // Check size limit
      if (sizeKB > PHOTO_MAX_SIZE_KB) {
        console.warn(`Photo too large (${sizeKB}KB > ${PHOTO_MAX_SIZE_KB}KB limit), discarding`);
        return null;
      }

      return base64;
    } catch (error) {
      console.error('Photo capture error:', error);
      return null;
    }
  }

  /**
   * Stop the camera stream
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Clean up canvas element reference
    if (this.canvasElement) {
      this.canvasElement = null;
    }

    // Remove visibility change handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.wasActiveBeforeHidden = false;
    this.isReinitializing = false;

    this.isInitialized = false;
    store.setCameraReady(false);
    console.log('Camera stopped');
  }

  /**
   * Check if camera is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get camera error message
   */
  getError(): string | null {
    return store.getState().cameraError;
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
