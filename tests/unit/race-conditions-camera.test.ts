/**
 * Race Condition Tests: Camera start/stop overlap
 *
 * Separated from the main race-conditions test file because
 * vi.mock('../../src/store') is hoisted to file scope and would
 * conflict with tests that need the real store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Top-level mocks (hoisted by vi.mock)
// ============================================================

const mockSetCameraReady = vi.fn();
const mockCameraGetState = vi.fn(() => ({
  settings: { photoCapture: false },
  cameraError: null,
}));

vi.mock('../../src/store', () => ({
  store: {
    getState: () => mockCameraGetState(),
    setCameraReady: (...args: unknown[]) => mockSetCameraReady(...args),
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/services/battery', () => ({
  batteryService: {
    isLowBattery: () => false,
    isCriticalBattery: () => false,
    subscribe: () => () => {},
    initialize: vi.fn(),
    isCharging: () => false,
  },
}));

// ============================================================
// Tests
// ============================================================

describe('Race Condition: Camera start/stop overlap', () => {
  let cameraService: typeof import('../../src/services/camera').cameraService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const cameraModule = await import('../../src/services/camera');
    cameraService = cameraModule.cameraService;
  });

  afterEach(() => {
    cameraService.stop();
  });

  it('should return false for concurrent initialize calls (guard against double init)', async () => {
    // Make getUserMedia block indefinitely
    (navigator.mediaDevices as any).getUserMedia = vi.fn(
      () => new Promise(() => {}), // Never resolves
    );

    // First init starts (state becomes 'initializing')
    const initPromise1 = cameraService.initialize();

    // Second init should return false immediately because state is 'initializing'
    const result2 = await cameraService.initialize();
    expect(result2).toBe(false);

    // Clean up: stop the camera to exit the pending init
    cameraService.stop();
    // The first promise will hang but we don't await it -- stop() resets state
  });

  it('should handle stop() called during initialize() gracefully', async () => {
    // Make getUserMedia block
    let resolveMedia: ((value: unknown) => void) | undefined;
    (navigator.mediaDevices as any).getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    );

    // Start init
    const initPromise = cameraService.initialize();

    // Call stop before init completes
    cameraService.stop();
    expect(cameraService.isReady()).toBe(false);

    // Resolve getUserMedia
    const mockStream = {
      getTracks: () => [{ stop: vi.fn(), kind: 'video', enabled: true }],
    };
    resolveMedia?.(mockStream);

    // The init may complete or fail, but camera should not be in a broken state
    await initPromise.catch(() => {});
    expect(cameraService.isReady()).toBe(false);
  });

  it('should not be ready after rapid toggle(true)/toggle(false)', async () => {
    // getUserMedia resolves immediately
    const mockStream = {
      getTracks: () => [{ stop: vi.fn(), kind: 'video', enabled: true }],
    };
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.resolve(mockStream),
    );

    // Start camera
    const toggleOn = cameraService.toggle(true);

    // Immediately stop
    const toggleOff = cameraService.toggle(false);

    await toggleOff;
    await toggleOn.catch(() => {});

    // Camera should be stopped because toggle(false) called stop()
    expect(cameraService.isReady()).toBe(false);
  });

  it('stop() should be safe to call multiple times', () => {
    expect(() => {
      cameraService.stop();
      cameraService.stop();
      cameraService.stop();
    }).not.toThrow();

    expect(cameraService.isReady()).toBe(false);
  });

  it('should verify that initializing state blocks concurrent init attempts', async () => {
    // Make getUserMedia block
    let resolveMedia: ((value: unknown) => void) | undefined;
    (navigator.mediaDevices as any).getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    );

    // First init starts
    const _initPromise = cameraService.initialize();

    // While first is in 'initializing' state, getUserMedia should have been
    // called exactly once
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    // Second call returns false immediately due to 'initializing' guard
    const result2 = await cameraService.initialize();
    expect(result2).toBe(false);

    // getUserMedia still only called once
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    // Clean up
    cameraService.stop();
  });
});

// ============================================================
// Camera reinitializeCamera retry preservation
// ============================================================

describe('Camera reinitializeCamera retry preservation', () => {
  let cameraService: typeof import('../../src/services/camera').cameraService;

  /** Helper: create a fake MediaStream that satisfies the camera service */
  function createMockStream() {
    const mockTrack = { stop: vi.fn(), kind: 'video', enabled: true };
    return { getTracks: () => [mockTrack] };
  }

  /** Helper: create a video element that immediately fires loadedmetadata */
  function patchVideoElement() {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'video') {
        // Make readyState >= 1 so waitForVideoReady resolves immediately
        Object.defineProperty(el, 'readyState', { value: 2, writable: true });
        (el as HTMLVideoElement).play = vi.fn(() => Promise.resolve());
      }
      return el;
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const cameraModule = await import('../../src/services/camera');
    cameraService = cameraModule.cameraService;
  });

  afterEach(() => {
    cameraService.stop();
    vi.restoreAllMocks();
  });

  it('should set cameraState to paused (not stopped) when reinit fails but retries remain', async () => {
    // 1. Successfully initialize the camera to register the visibility handler
    patchVideoElement();
    const mockStream = createMockStream();
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.resolve(mockStream),
    );

    const initResult = await cameraService.initialize();
    expect(initResult).toBe(true);
    expect(cameraService.isReady()).toBe(true);

    // 2. Simulate page hidden -> camera pauses
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Camera should now be paused (not ready)
    expect(cameraService.isReady()).toBe(false);

    // 3. Make getUserMedia reject on the reinit attempt
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.reject(new Error('Camera busy')),
    );

    // 4. Simulate page visible -> triggers reinitializeCamera which will fail
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Wait for the async reinitializeCamera to complete
    await vi.waitFor(() => {
      // After first failure (retry count = 1 < MAX_REINIT_RETRIES = 3),
      // cameraState should be 'paused', not 'stopped'
      expect(mockSetCameraReady).toHaveBeenCalledWith(false, 'Camera busy');
    });

    // 5. Verify the camera is NOT stopped — it should still respond to visibility
    //    changes (i.e., visibility handler is still registered).
    //    We verify this by showing the page again and checking that getUserMedia
    //    is called once more (proving the handler is still active).
    vi.clearAllMocks();

    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.reject(new Error('Camera busy again')),
    );

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => {
      // If the visibility handler was removed, getUserMedia would NOT be called.
      // Since the handler is preserved (cameraState is 'paused', not 'stopped'),
      // it should be called again.
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
  });

  it('should stop and remove visibility handler after all retries are exhausted', async () => {
    // 1. Successfully initialize the camera
    patchVideoElement();
    const mockStream = createMockStream();
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.resolve(mockStream),
    );

    await cameraService.initialize();
    expect(cameraService.isReady()).toBe(true);

    // 2. Make getUserMedia always reject
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.reject(new Error('Permanent failure')),
    );

    // 3. Simulate MAX_REINIT_RETRIES (3) visibility cycles, each triggering
    //    a failed reinitializeCamera call
    for (let i = 0; i < 3; i++) {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Wait for async reinitializeCamera to complete
      await vi.waitFor(() => {
        expect(mockSetCameraReady).toHaveBeenCalledWith(false, 'Permanent failure');
      });
      vi.clearAllMocks();
    }

    // 4. After 3 failures, the camera should be in 'stopped' state.
    //    Simulate another visibility cycle — getUserMedia should NOT be called
    //    because the visibility handler has been removed.
    (navigator.mediaDevices as any).getUserMedia = vi.fn(() =>
      Promise.reject(new Error('Should not be called')),
    );

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Give a tick for any async handlers
    await new Promise((resolve) => setTimeout(resolve, 50));

    // getUserMedia should NOT have been called — handler was removed
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
