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
