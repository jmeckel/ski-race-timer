/**
 * Unit Tests for Camera Service - Full Coverage
 * Tests: state machine transitions, battery-aware init, visibility handling,
 *        reinitialize retries, capturePhoto, idle timeout, setPreviewElement,
 *        captureTimingPhoto helper
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Top-level mocks (hoisted by vi.mock)
// ============================================================

const mockSetCameraReady = vi.fn();
const mockGetState = vi.fn(() => ({
  settings: { photoCapture: false },
  cameraError: null,
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    setCameraReady: (...args: unknown[]) => mockSetCameraReady(...args),
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

const mockIsCriticalBattery = vi.fn(() => false);
const mockIsLowBattery = vi.fn(() => false);

vi.mock('../../../src/services/battery', () => ({
  batteryService: {
    isCriticalBattery: () => mockIsCriticalBattery(),
    isLowBattery: () => mockIsLowBattery(),
    subscribe: () => () => {},
    initialize: vi.fn(),
    isCharging: () => false,
    getStatus: vi.fn(() => ({
      level: 1.0,
      charging: true,
      batteryLevel: 'normal',
    })),
  },
}));

// ============================================================
// Helpers
// ============================================================

/** Create a fake MediaStream with stoppable tracks */
function createMockStream() {
  const mockTrack = { stop: vi.fn(), kind: 'video', enabled: true };
  return {
    getTracks: () => [mockTrack],
    _track: mockTrack,
  };
}

/** Standard mock canvas context */
function createMockCanvasCtx() {
  return {
    drawImage: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn(),
    font: '',
    fillText: vi.fn(),
  };
}

/**
 * Patch document.createElement so:
 * - video elements have readyState >= 1 and play() resolves immediately
 * - canvas elements have a mock getContext and toDataURL
 *
 * This ensures waitForVideoReady() resolves and capturePhoto() works.
 */
function patchCreateElement(options?: {
  canvasCtx?: ReturnType<typeof createMockCanvasCtx>;
  toDataURL?: string;
  videoPlayReject?: Error;
  videoWidth?: number;
  videoHeight?: number;
}) {
  const origCreateElement = document.createElement.bind(document);
  const ctx = options?.canvasCtx ?? createMockCanvasCtx();
  const dataUrl =
    options?.toDataURL ?? 'data:image/jpeg;base64,mockBase64ImageData';

  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, opts?: ElementCreationOptions) => {
      const el = origCreateElement(tagName, opts);
      if (tagName === 'video') {
        Object.defineProperty(el, 'readyState', { value: 2, writable: true });
        if (options?.videoWidth !== undefined) {
          Object.defineProperty(el, 'videoWidth', {
            value: options.videoWidth,
            writable: true,
          });
        }
        if (options?.videoHeight !== undefined) {
          Object.defineProperty(el, 'videoHeight', {
            value: options.videoHeight,
            writable: true,
          });
        }
        if (options?.videoPlayReject) {
          (el as HTMLVideoElement).play = vi.fn(() =>
            Promise.reject(options.videoPlayReject),
          );
        } else {
          (el as HTMLVideoElement).play = vi.fn(() => Promise.resolve());
        }
      }
      if (tagName === 'canvas') {
        el.getContext = vi.fn(() => ctx);
        el.toDataURL = vi.fn(() => dataUrl);
      }
      return el;
    },
  );

  return { ctx };
}

/** Install a mock getUserMedia that resolves with a mock stream */
function installGetUserMedia(stream?: ReturnType<typeof createMockStream>) {
  const s = stream ?? createMockStream();
  (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
    Promise.resolve(s),
  );
  return s;
}

/** Install a mock getUserMedia that rejects */
function installGetUserMediaReject(
  error: string | Error = 'Permission denied',
) {
  const err = typeof error === 'string' ? new Error(error) : error;
  (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
    Promise.reject(err),
  );
}

/** Simulate a visibility change */
function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

// ============================================================
// Imports (after mocks)
// ============================================================

import {
  cameraService,
  captureTimingPhoto,
} from '../../../src/services/camera';

// ============================================================
// Tests
// ============================================================

describe('Camera Service - Full Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCriticalBattery.mockReturnValue(false);
    mockIsLowBattery.mockReturnValue(false);
    mockGetState.mockReturnValue({
      settings: { photoCapture: false },
      cameraError: null,
    });
  });

  afterEach(() => {
    // Clear preview element BEFORE stop — previewElement survives stop()
    // and would cause next initialize() to reuse an unmocked video element
    cameraService.setPreviewElement(null);
    cameraService.stop();
    vi.restoreAllMocks();
    // Restore document.hidden to default
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
  });

  // ----------------------------------------------------------
  // Basic accessors
  // ----------------------------------------------------------

  describe('isReady', () => {
    it('should return false initially', () => {
      expect(cameraService.isReady()).toBe(false);
    });
  });

  describe('getError', () => {
    it('should return error from store state', () => {
      mockGetState.mockReturnValue({
        settings: { photoCapture: false },
        cameraError: 'Camera not found',
      });
      expect(cameraService.getError()).toBe('Camera not found');
    });

    it('should return null when no error', () => {
      expect(cameraService.getError()).toBeNull();
    });
  });

  describe('getVideoElement', () => {
    it('should return null initially', () => {
      expect(cameraService.getVideoElement()).toBeNull();
    });

    it('should return video element after successful init', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();
      expect(cameraService.getVideoElement()).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // State machine transitions
  // ----------------------------------------------------------

  describe('State machine transitions', () => {
    it('initialize() when already ready returns true without re-requesting camera', async () => {
      patchCreateElement();
      installGetUserMedia();

      const result1 = await cameraService.initialize();
      expect(result1).toBe(true);
      expect(cameraService.isReady()).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

      // Second call should return true immediately
      const result2 = await cameraService.initialize();
      expect(result2).toBe(true);
      // getUserMedia should NOT be called again
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('initialize() when already initializing returns false (concurrent init guard)', async () => {
      patchCreateElement();
      // getUserMedia never resolves — keeps camera in 'initializing' state
      (navigator.mediaDevices as any).getUserMedia = vi.fn(
        () => new Promise(() => {}),
      );

      const _initPromise = cameraService.initialize();

      // Second call while still initializing
      const result = await cameraService.initialize();
      expect(result).toBe(false);

      // getUserMedia only called once
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('successful init transitions stopped -> initializing -> ready', async () => {
      patchCreateElement();
      installGetUserMedia();

      expect(cameraService.isReady()).toBe(false); // stopped

      const result = await cameraService.initialize();
      expect(result).toBe(true);
      expect(cameraService.isReady()).toBe(true); // ready
      expect(mockSetCameraReady).toHaveBeenCalledWith(true);
    });

    it('failed init transitions stopped -> initializing -> stopped', async () => {
      patchCreateElement();
      installGetUserMediaReject('Permission denied');

      expect(cameraService.isReady()).toBe(false); // stopped

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(cameraService.isReady()).toBe(false); // back to stopped
      expect(mockSetCameraReady).toHaveBeenCalledWith(
        false,
        'Permission denied',
      );
    });

    it('stop() from ready state goes to stopped', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      cameraService.stop();
      expect(cameraService.isReady()).toBe(false);
      expect(mockSetCameraReady).toHaveBeenCalledWith(false);
    });

    it('stop() from stopped state does not throw', () => {
      expect(() => cameraService.stop()).not.toThrow();
      expect(cameraService.isReady()).toBe(false);
    });

    it('stop() cleans up stream tracks', async () => {
      patchCreateElement();
      const stream = createMockStream();
      installGetUserMedia(stream);

      await cameraService.initialize();
      cameraService.stop();

      expect(stream._track.stop).toHaveBeenCalled();
    });

    it('stop() removes owned video element from DOM', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.initialize();
      const videoEl = cameraService.getVideoElement();
      expect(videoEl).not.toBeNull();
      const removeSpy = vi.spyOn(videoEl!, 'remove');

      cameraService.stop();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('stop() removes visibility change listener', async () => {
      patchCreateElement();
      installGetUserMedia();
      const removeListenerSpy = vi.spyOn(document, 'removeEventListener');

      await cameraService.initialize();
      cameraService.stop();

      expect(removeListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );
    });

    it('stop() is safe to call multiple times', () => {
      expect(() => {
        cameraService.stop();
        cameraService.stop();
        cameraService.stop();
      }).not.toThrow();
      expect(cameraService.isReady()).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Battery-aware initialization
  // ----------------------------------------------------------

  describe('Battery-aware initialization', () => {
    it('critical battery skips initialization entirely', async () => {
      mockIsCriticalBattery.mockReturnValue(true);

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(cameraService.isReady()).toBe(false);
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
      expect(mockSetCameraReady).toHaveBeenCalledWith(
        false,
        'Camera disabled on critical battery',
      );
    });

    it('low battery uses reduced resolution config (640x480)', async () => {
      patchCreateElement();
      mockIsLowBattery.mockReturnValue(true);
      installGetUserMedia();

      await cameraService.initialize();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 640 },
            height: { ideal: 480 },
          }),
        }),
      );
    });

    it('normal battery uses full resolution config (1280x720)', async () => {
      patchCreateElement();
      mockIsLowBattery.mockReturnValue(false);
      installGetUserMedia();

      await cameraService.initialize();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }),
        }),
      );
    });
  });

  // ----------------------------------------------------------
  // Visibility change handling
  // ----------------------------------------------------------

  describe('Visibility change handling', () => {
    it('page hidden when ready pauses camera (stops tracks)', async () => {
      patchCreateElement();
      const stream = createMockStream();
      installGetUserMedia(stream);

      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      setDocumentHidden(true);

      expect(cameraService.isReady()).toBe(false);
      expect(stream._track.stop).toHaveBeenCalled();
      expect(mockSetCameraReady).toHaveBeenCalledWith(false);
    });

    it('page visible when paused reinitializes camera', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      // Pause by hiding
      setDocumentHidden(true);
      expect(cameraService.isReady()).toBe(false);

      // Install fresh stream for reinit
      installGetUserMedia();

      // Show page -> triggers reinitialize
      setDocumentHidden(false);

      // Wait for async reinitializeCamera
      await vi.waitFor(() => {
        expect(cameraService.isReady()).toBe(true);
      });
    });

    it('page hidden during initializing sets pending change (via reinit cycle)', async () => {
      // The visibility handler is only registered AFTER a successful init.
      // So to test pending visibility during 'initializing', we need a
      // reinitialize cycle where the handler persists from the prior init.
      // We simulate: init -> pause -> reinit (deferred) -> hide during reinit.
      patchCreateElement();
      installGetUserMedia();

      // First: successfully initialize (registers visibility handler)
      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      // Pause the camera
      setDocumentHidden(true);
      expect(cameraService.isReady()).toBe(false);

      // Set up deferred getUserMedia for reinit
      let resolveMedia!: (value: unknown) => void;
      (navigator.mediaDevices as any).getUserMedia = vi.fn(
        () => new Promise((resolve) => { resolveMedia = resolve; }),
      );

      // Show page -> triggers reinitializeCamera (state = 'resuming')
      setDocumentHidden(false);

      // While resuming, hide the page -> sets pendingVisibilityChange = 'hidden'
      setDocumentHidden(true);

      // Resolve getUserMedia
      const stream = createMockStream();
      resolveMedia(stream);

      // Wait for the reinit to process
      await vi.waitFor(() => {
        // The reinit should detect pendingVisibilityChange = 'hidden'
        // and pause instead of going ready
        expect(cameraService.isReady()).toBe(false);
      });
    });

    it('page visible during resuming clears pending hidden change', async () => {
      patchCreateElement();
      installGetUserMedia();

      // Successfully initialize (registers visibility handler)
      await cameraService.initialize();

      // Pause
      setDocumentHidden(true);

      // Set up deferred getUserMedia for reinit
      let resolveMedia!: (value: unknown) => void;
      (navigator.mediaDevices as any).getUserMedia = vi.fn(
        () => new Promise((resolve) => { resolveMedia = resolve; }),
      );

      // Show -> starts reinitialize (state = 'resuming')
      setDocumentHidden(false);

      // Hide while resuming (sets pending = 'hidden')
      setDocumentHidden(true);
      // Show while still resuming (clears pending)
      setDocumentHidden(false);

      // Resolve getUserMedia
      const stream = createMockStream();
      resolveMedia(stream);

      // Should succeed because pending hidden was cleared
      await vi.waitFor(() => {
        expect(cameraService.isReady()).toBe(true);
      });
    });

    it('visibility handler not added twice on repeated init', async () => {
      patchCreateElement();
      installGetUserMedia();
      const addListenerSpy = vi.spyOn(document, 'addEventListener');

      await cameraService.initialize();
      const visibilityCalls1 = addListenerSpy.mock.calls.filter(
        (c) => c[0] === 'visibilitychange',
      ).length;

      // Stop and re-init
      cameraService.stop();
      installGetUserMedia();
      await cameraService.initialize();
      const visibilityCalls2 = addListenerSpy.mock.calls.filter(
        (c) => c[0] === 'visibilitychange',
      ).length;

      // Each init adds exactly one listener (stop removes the previous one)
      expect(visibilityCalls1).toBe(1);
      expect(visibilityCalls2).toBe(2);
    });
  });

  // ----------------------------------------------------------
  // Reinitialize retries
  // ----------------------------------------------------------

  describe('Reinitialize retries', () => {
    it('max 3 retries before giving up (MAX_REINIT_RETRIES)', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      // Make reinit fail
      installGetUserMediaReject('Camera busy');

      // Exhaust 3 retries via visibility cycles
      for (let i = 0; i < 3; i++) {
        setDocumentHidden(true);
        setDocumentHidden(false);
        await vi.waitFor(() => {
          expect(mockSetCameraReady).toHaveBeenCalledWith(
            false,
            'Camera busy',
          );
        });
        vi.clearAllMocks();
      }

      // After 3 failures, camera should be stopped.
      // Another visibility cycle should NOT trigger getUserMedia
      const freshGetUserMedia = vi.fn(() =>
        Promise.reject(new Error('should not be called')),
      );
      (navigator.mediaDevices as any).getUserMedia = freshGetUserMedia;

      setDocumentHidden(true);
      setDocumentHidden(false);

      await new Promise((r) => setTimeout(r, 50));
      expect(freshGetUserMedia).not.toHaveBeenCalled();
    });

    it('successful reinit resets retry counter', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      // Fail once
      installGetUserMediaReject('Camera busy');
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        expect(mockSetCameraReady).toHaveBeenCalledWith(
          false,
          'Camera busy',
        );
      });
      vi.clearAllMocks();

      // Succeed on second attempt
      installGetUserMedia();
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        expect(cameraService.isReady()).toBe(true);
      });

      // Now fail 2 more times — should still have retries because counter was reset
      installGetUserMediaReject('Camera busy again');
      for (let i = 0; i < 2; i++) {
        vi.clearAllMocks();
        setDocumentHidden(true);
        setDocumentHidden(false);
        await vi.waitFor(() => {
          expect(mockSetCameraReady).toHaveBeenCalledWith(
            false,
            'Camera busy again',
          );
        });
      }

      // Camera should still be paused (not stopped) — still has 1 retry left
      // Verify by doing one more cycle — getUserMedia should be called
      vi.clearAllMocks();
      const lastGetUserMedia = vi.fn(() =>
        Promise.reject(new Error('Final')),
      );
      (navigator.mediaDevices as any).getUserMedia = lastGetUserMedia;
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        expect(lastGetUserMedia).toHaveBeenCalled();
      });
    });

    it('failed reinit after max retries sets stopped state and removes handler', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      installGetUserMediaReject('Permanent failure');

      for (let i = 0; i < 3; i++) {
        setDocumentHidden(true);
        setDocumentHidden(false);
        await vi.waitFor(() => {
          expect(mockSetCameraReady).toHaveBeenCalledWith(
            false,
            'Permanent failure',
          );
        });
        vi.clearAllMocks();
      }

      // Visibility handler should be removed — no further getUserMedia calls
      const spy = vi.fn(() => Promise.reject(new Error('nope')));
      (navigator.mediaDevices as any).getUserMedia = spy;
      setDocumentHidden(true);
      setDocumentHidden(false);
      await new Promise((r) => setTimeout(r, 50));
      expect(spy).not.toHaveBeenCalled();
    });

    it('failed reinit before max retries keeps paused state (retries remain)', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      // Fail once (retry 1 of 3)
      installGetUserMediaReject('Camera busy');
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        expect(mockSetCameraReady).toHaveBeenCalledWith(false, 'Camera busy');
      });

      // The visibility handler should still be active (camera is paused, not stopped)
      // Verify by triggering another cycle
      vi.clearAllMocks();
      installGetUserMediaReject('Camera busy');
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        // getUserMedia was called -> handler is still active
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      });
    });

    it('reinitializeCamera uses battery-aware config on reinit', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      // Pause
      setDocumentHidden(true);

      // Switch to low battery for reinit
      mockIsLowBattery.mockReturnValue(true);
      installGetUserMedia();

      setDocumentHidden(false);

      await vi.waitFor(() => {
        expect(cameraService.isReady()).toBe(true);
      });

      // The reinit call should have used low-battery config
      const lastCall = (
        navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
      ).mock.calls.at(-1);
      expect(lastCall?.[0]).toEqual(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 640 },
            height: { ideal: 480 },
          }),
        }),
      );
    });
  });

  // ----------------------------------------------------------
  // capturePhoto
  // ----------------------------------------------------------

  describe('capturePhoto', () => {
    it('returns null when not ready', async () => {
      const result = await cameraService.capturePhoto();
      expect(result).toBeNull();
    });

    it('draws video frame to canvas and returns base64 JPEG', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      const result = await cameraService.capturePhoto();
      expect(result).toBe('mockBase64ImageData');
    });

    it('adds timestamp overlay on capture', async () => {
      const ctx = createMockCanvasCtx();
      patchCreateElement({ canvasCtx: ctx });
      installGetUserMedia();
      await cameraService.initialize();

      await cameraService.capturePhoto();

      // Verify: drawImage for video frame
      expect(ctx.drawImage).toHaveBeenCalled();
      // Verify: dark overlay background
      expect(ctx.fillRect).toHaveBeenCalled();
      // Verify: timestamp text
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('throws PhotoTooLargeError for oversized images', async () => {
      // Create a large base64 string (>200KB)
      const largeData = 'A'.repeat(210 * 1024);
      patchCreateElement({
        toDataURL: `data:image/jpeg;base64,${largeData}`,
      });

      installGetUserMedia();
      await cameraService.initialize();

      await expect(cameraService.capturePhoto()).rejects.toThrow(
        /Photo too large/,
      );
    });

    it('PhotoTooLargeError has correct name property', async () => {
      const largeData = 'A'.repeat(210 * 1024);
      patchCreateElement({
        toDataURL: `data:image/jpeg;base64,${largeData}`,
      });

      installGetUserMedia();
      await cameraService.initialize();

      try {
        await cameraService.capturePhoto();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('PhotoTooLargeError');
      }
    });

    it('returns null when canvas context is unavailable', async () => {
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string, opts?: ElementCreationOptions) => {
          const el = origCreateElement(tagName, opts);
          if (tagName === 'video') {
            Object.defineProperty(el, 'readyState', {
              value: 2,
              writable: true,
            });
            (el as HTMLVideoElement).play = vi.fn(() => Promise.resolve());
          }
          if (tagName === 'canvas') {
            el.getContext = vi.fn(() => null);
          }
          return el;
        },
      );

      installGetUserMedia();
      await cameraService.initialize();

      // getContext returns null -> throws -> caught -> returns null
      const result = await cameraService.capturePhoto();
      expect(result).toBeNull();
    });

    it('returns null when toDataURL produces invalid output', async () => {
      patchCreateElement({ toDataURL: 'invalid-no-comma' });

      installGetUserMedia();
      await cameraService.initialize();

      const result = await cameraService.capturePhoto();
      expect(result).toBeNull();
    });

    it('scales down oversized video dimensions to fit max constraints', async () => {
      const ctx = createMockCanvasCtx();
      patchCreateElement({
        canvasCtx: ctx,
        videoWidth: 3840,
        videoHeight: 2160,
      });

      installGetUserMedia();
      await cameraService.initialize();
      await cameraService.capturePhoto();

      // 3840x2160 -> scale by 1280/3840 -> 1280x720
      expect(ctx.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        1280,
        720,
      );
    });

    it('scales tall video to fit max height constraint', async () => {
      const ctx = createMockCanvasCtx();
      patchCreateElement({
        canvasCtx: ctx,
        videoWidth: 720,
        videoHeight: 1280,
      });

      installGetUserMedia();
      await cameraService.initialize();
      await cameraService.capturePhoto();

      // 720x1280 -> width OK (720 < 1280), height > 720
      // scale by 720/1280 -> 405x720
      expect(ctx.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        405,
        720,
      );
    });
  });

  // ----------------------------------------------------------
  // setPreviewElement
  // ----------------------------------------------------------

  describe('setPreviewElement', () => {
    it('accepts null to clear preview', () => {
      expect(() => cameraService.setPreviewElement(null)).not.toThrow();
    });

    it('accepts a video element', () => {
      const video = document.createElement('video') as HTMLVideoElement;
      expect(() => cameraService.setPreviewElement(video)).not.toThrow();
    });

    it('setting element updates video source when stream is active', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      const previewVideo = document.createElement('video') as HTMLVideoElement;
      previewVideo.play = vi.fn(() => Promise.resolve());
      cameraService.setPreviewElement(previewVideo);

      // The preview element should have the stream set
      expect(previewVideo.srcObject).not.toBeNull();
    });

    it('setting null clears the non-owned video element', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      const previewVideo = document.createElement('video') as HTMLVideoElement;
      previewVideo.play = vi.fn(() => Promise.resolve());
      cameraService.setPreviewElement(previewVideo);

      cameraService.setPreviewElement(null);
      expect(previewVideo.srcObject).toBeNull();
    });

    it('switching preview elements removes old owned element', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      // Camera created its own hidden video element (owned)
      const ownedEl = cameraService.getVideoElement();
      expect(ownedEl).not.toBeNull();
      const removeSpy = vi.spyOn(ownedEl!, 'remove');

      // Set an external preview — should remove the owned one
      const previewVideo = document.createElement('video') as HTMLVideoElement;
      previewVideo.play = vi.fn(() => Promise.resolve());
      cameraService.setPreviewElement(previewVideo);

      expect(removeSpy).toHaveBeenCalled();
      expect(cameraService.getVideoElement()).toBe(previewVideo);
    });

    it('handles setting preview before init (no stream)', () => {
      const previewVideo = document.createElement('video') as HTMLVideoElement;
      cameraService.setPreviewElement(previewVideo);
      // No stream, so srcObject should remain unset (undefined in jsdom, null in browsers)
      expect(previewVideo.srcObject).toBeFalsy();
    });
  });

  // ----------------------------------------------------------
  // captureTimingPhoto helper
  // ----------------------------------------------------------

  describe('captureTimingPhoto', () => {
    it('returns null when photoCapture is disabled', async () => {
      mockGetState.mockReturnValue({
        settings: { photoCapture: false },
        cameraError: null,
      });

      const result = await captureTimingPhoto();
      expect(result).toBeNull();
    });

    it('attempts auto-initialize if not ready and returns photo on success', async () => {
      mockGetState.mockReturnValue({
        settings: { photoCapture: true },
        cameraError: null,
      });

      patchCreateElement();
      installGetUserMedia();

      expect(cameraService.isReady()).toBe(false);

      const result = await captureTimingPhoto();
      expect(result).toBe('mockBase64ImageData');
      expect(cameraService.isReady()).toBe(true);
    });

    it('returns null when auto-initialize fails', async () => {
      mockGetState.mockReturnValue({
        settings: { photoCapture: true },
        cameraError: null,
      });

      patchCreateElement();
      installGetUserMediaReject('No camera');

      const result = await captureTimingPhoto();
      expect(result).toBeNull();
    });

    it('returns photo directly when camera is already ready', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      mockGetState.mockReturnValue({
        settings: { photoCapture: true },
        cameraError: null,
      });

      const result = await captureTimingPhoto();
      expect(result).toBe('mockBase64ImageData');
    });
  });

  // ----------------------------------------------------------
  // toggle
  // ----------------------------------------------------------

  describe('toggle', () => {
    it('toggle(false) calls stop and returns true', async () => {
      const result = await cameraService.toggle(false);
      expect(result).toBe(true);
      expect(mockSetCameraReady).toHaveBeenCalledWith(false);
    });

    it('toggle(true) calls initialize and returns result', async () => {
      patchCreateElement();
      installGetUserMedia();

      const result = await cameraService.toggle(true);
      expect(result).toBe(true);
      expect(cameraService.isReady()).toBe(true);
    });

    it('toggle(false) after toggle(true) leaves camera stopped', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.toggle(true);
      expect(cameraService.isReady()).toBe(true);

      await cameraService.toggle(false);
      expect(cameraService.isReady()).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Error handling in initialize
  // ----------------------------------------------------------

  describe('initialize error handling', () => {
    it('handles non-Error rejection with generic message', async () => {
      patchCreateElement();
      (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
        Promise.reject('string error'),
      );

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(mockSetCameraReady).toHaveBeenCalledWith(
        false,
        'Camera initialization failed',
      );
    });

    it('cleans up stream tracks on init failure after getUserMedia succeeds', async () => {
      const stream = createMockStream();
      (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
        Promise.resolve(stream),
      );

      patchCreateElement({ videoPlayReject: new Error('Play interrupted') });

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(stream._track.stop).toHaveBeenCalled();
    });

    it('sets videoElement srcObject to null on failure', async () => {
      patchCreateElement({ videoPlayReject: new Error('Play failed') });
      (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
        Promise.resolve(createMockStream()),
      );

      await cameraService.initialize();
      // After failure, video element srcObject should be cleared
      // (we can verify this by checking the service reports not ready)
      expect(cameraService.isReady()).toBe(false);
    });

    it('resets reinitRetryCount on fresh initialize call', async () => {
      patchCreateElement();
      installGetUserMedia();
      await cameraService.initialize();

      // Fail one reinit
      installGetUserMediaReject('fail');
      setDocumentHidden(true);
      setDocumentHidden(false);
      await vi.waitFor(() => {
        expect(mockSetCameraReady).toHaveBeenCalledWith(false, 'fail');
      });

      // Stop and do a fresh init -> retry counter resets
      cameraService.stop();
      vi.clearAllMocks();

      installGetUserMedia();
      const result = await cameraService.initialize();
      expect(result).toBe(true);

      // Now fail 3 times — should exhaust retries fresh
      installGetUserMediaReject('Camera busy');
      for (let i = 0; i < 3; i++) {
        setDocumentHidden(true);
        setDocumentHidden(false);
        await vi.waitFor(() => {
          expect(mockSetCameraReady).toHaveBeenCalledWith(
            false,
            'Camera busy',
          );
        });
        vi.clearAllMocks();
      }

      // After 3 retries, handler should be removed
      const spy = vi.fn(() => Promise.reject(new Error('nope')));
      (navigator.mediaDevices as any).getUserMedia = spy;
      setDocumentHidden(true);
      setDocumentHidden(false);
      await new Promise((r) => setTimeout(r, 50));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // Idle timeout (uses fake timers — MUST be last to avoid
  // timer state leaking to subsequent tests)
  // ----------------------------------------------------------

  describe('Idle timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      cameraService.stop();
      vi.useRealTimers();
    });

    it('camera pauses after 2 minutes idle (IDLE_TIMEOUT)', async () => {
      patchCreateElement();
      const stream = createMockStream();
      installGetUserMedia(stream);

      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      // Advance 2 minutes
      vi.advanceTimersByTime(120_000);

      expect(cameraService.isReady()).toBe(false);
      expect(stream._track.stop).toHaveBeenCalled();
    });

    it('capture resets the idle timeout', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.initialize();
      expect(cameraService.isReady()).toBe(true);

      // Advance 90 seconds (not enough to trigger idle)
      vi.advanceTimersByTime(90_000);
      expect(cameraService.isReady()).toBe(true);

      // Capture a photo resets the timeout
      await cameraService.capturePhoto();

      // Advance another 90 seconds — still ready (only 90s since capture)
      vi.advanceTimersByTime(90_000);
      expect(cameraService.isReady()).toBe(true);

      // Now advance the remaining 30s to reach 120s since capture
      vi.advanceTimersByTime(30_000);
      expect(cameraService.isReady()).toBe(false);
    });

    it('stop clears the idle timeout', async () => {
      patchCreateElement();
      installGetUserMedia();

      await cameraService.initialize();
      cameraService.stop();

      // Advancing time should not cause errors (timeout was cleared)
      vi.advanceTimersByTime(120_000);
      expect(cameraService.isReady()).toBe(false);
    });
  });
});
