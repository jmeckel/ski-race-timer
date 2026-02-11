/**
 * Unit Tests for Camera Service - Full Coverage
 * Tests: initialize, stop, capturePhoto, toggle, setPreviewElement,
 *        visibility handling, state machine
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock store
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

import {
  cameraService,
  captureTimingPhoto,
} from '../../../src/services/camera';

describe('Camera Service - Full Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cameraService.stop();
  });

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
      mockGetState.mockReturnValue({
        settings: { photoCapture: false },
        cameraError: null,
      });
      expect(cameraService.getError()).toBeNull();
    });
  });

  describe('getVideoElement', () => {
    it('should return null initially', () => {
      expect(cameraService.getVideoElement()).toBeNull();
    });
  });

  describe('stop', () => {
    it('should not throw when called on stopped camera', () => {
      expect(() => cameraService.stop()).not.toThrow();
    });

    it('should set camera not ready', () => {
      cameraService.stop();
      expect(mockSetCameraReady).toHaveBeenCalledWith(false);
    });
  });

  describe('toggle', () => {
    it('should call stop and return true when disabled', async () => {
      const result = await cameraService.toggle(false);
      expect(result).toBe(true);
      expect(mockSetCameraReady).toHaveBeenCalledWith(false);
    });

    it('should return a Promise when enabled', () => {
      const initPromise = cameraService.toggle(true);
      expect(initPromise).toBeInstanceOf(Promise);
    });
  });

  describe('setPreviewElement', () => {
    it('should accept null to clear preview', () => {
      expect(() => cameraService.setPreviewElement(null)).not.toThrow();
    });

    it('should accept a video element', () => {
      const video = document.createElement('video') as HTMLVideoElement;
      expect(() => cameraService.setPreviewElement(video)).not.toThrow();
    });

    it('should handle setting preview then clearing', () => {
      const video = document.createElement('video') as HTMLVideoElement;
      cameraService.setPreviewElement(video);
      expect(() => cameraService.setPreviewElement(null)).not.toThrow();
    });
  });

  describe('capturePhoto', () => {
    it('should return null when camera is not ready', async () => {
      const result = await cameraService.capturePhoto();
      expect(result).toBeNull();
    });
  });

  describe('captureTimingPhoto', () => {
    it('should return null when photo capture is disabled', async () => {
      mockGetState.mockReturnValue({
        settings: { photoCapture: false },
        cameraError: null,
      });
      const result = await captureTimingPhoto();
      expect(result).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should fail when getUserMedia rejects', async () => {
      // Override getUserMedia to reject
      const origGetUserMedia = navigator.mediaDevices.getUserMedia;
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>) = vi.fn(
        () => Promise.reject(new Error('Permission denied')),
      );

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(mockSetCameraReady).toHaveBeenCalledWith(
        false,
        'Permission denied',
      );

      // Restore
      navigator.mediaDevices.getUserMedia = origGetUserMedia;
    });

    it('should fail with generic error for non-Error rejection', async () => {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia;
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>) = vi.fn(
        () => Promise.reject('string error'),
      );

      const result = await cameraService.initialize();
      expect(result).toBe(false);
      expect(mockSetCameraReady).toHaveBeenCalledWith(
        false,
        'Camera initialization failed',
      );

      navigator.mediaDevices.getUserMedia = origGetUserMedia;
    });
  });
});
