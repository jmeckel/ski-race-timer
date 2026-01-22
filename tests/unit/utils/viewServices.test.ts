/**
 * Unit Tests for view-specific services behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppState } from '../../../src/types';

vi.mock('../../../src/services', () => ({
  gpsService: {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn()
  },
  cameraService: {
    initialize: vi.fn(),
    stop: vi.fn()
  }
}));

import { applyViewServices } from '../../../src/utils/viewServices';
import { gpsService, cameraService } from '../../../src/services';

const baseSettings = {
  auto: true,
  haptic: true,
  sound: false,
  sync: false,
  syncPhotos: false,
  gps: true,
  simple: false,
  photoCapture: false,
  autoFinishTiming: false,
  autoFinishLinePosition: 50,
  autoFinishGateWidth: 20,
  autoFinishSensitivity: 60,
  motionEffects: true,
  glassEffects: true,
  outdoorMode: false
};

function createState(overrides: Partial<AppState>): AppState {
  return {
    currentView: 'timer',
    currentLang: 'en',
    bibInput: '',
    selectedPoint: 'F',
    selectedRun: 1,
    selectMode: false,
    selectedEntries: new Set(),
    isRecording: false,
    lastRecordedEntry: null,
    entries: [],
    undoStack: [],
    redoStack: [],
    settings: { ...baseSettings },
    deviceId: 'device',
    deviceName: 'device-name',
    raceId: '',
    lastSyncedRaceId: '',
    syncStatus: 'disconnected',
    syncQueue: [],
    connectedDevices: new Map(),
    cloudDeviceCount: 0,
    cloudHighestBib: 0,
    raceExistsInCloud: null,
    gpsEnabled: true,
    gpsAccuracy: null,
    gpsStatus: 'inactive',
    cameraReady: false,
    cameraError: null,
    ...overrides
  };
}

describe('applyViewServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts GPS and camera in timer view when enabled', () => {
    const state = createState({
      currentView: 'timer',
      settings: {
        ...baseSettings,
        gps: true,
        photoCapture: true
      }
    });

    applyViewServices(state);

    expect(gpsService.start).toHaveBeenCalled();
    expect(cameraService.initialize).toHaveBeenCalled();
    expect(gpsService.stop).not.toHaveBeenCalled();
    expect(cameraService.stop).not.toHaveBeenCalled();
  });

  it('starts camera in timer view when auto finish timing is enabled', () => {
    const state = createState({
      currentView: 'timer',
      settings: {
        ...baseSettings,
        gps: false,
        photoCapture: false,
        autoFinishTiming: true
      }
    });

    applyViewServices(state);

    expect(cameraService.initialize).toHaveBeenCalled();
    expect(cameraService.stop).not.toHaveBeenCalled();
  });

  it('stops GPS and camera outside timer view', () => {
    const state = createState({
      currentView: 'results',
      settings: {
        ...baseSettings,
        gps: true,
        photoCapture: true
      }
    });

    applyViewServices(state);

    expect(gpsService.pause).toHaveBeenCalled();
    expect(gpsService.stop).not.toHaveBeenCalled();
    expect(cameraService.stop).toHaveBeenCalled();
    expect(gpsService.start).not.toHaveBeenCalled();
    expect(cameraService.initialize).not.toHaveBeenCalled();
  });

  it('stops GPS and camera when settings are disabled', () => {
    const state = createState({
      currentView: 'timer',
      settings: {
        ...baseSettings,
        gps: false,
        photoCapture: false
      }
    });

    applyViewServices(state);

    expect(gpsService.stop).toHaveBeenCalled();
    expect(cameraService.stop).toHaveBeenCalled();
    expect(gpsService.start).not.toHaveBeenCalled();
    expect(cameraService.initialize).not.toHaveBeenCalled();
    expect(gpsService.pause).not.toHaveBeenCalled();
  });
});
