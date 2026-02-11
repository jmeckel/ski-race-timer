/**
 * Test Setup - Mocks for browser APIs and test utilities
 */

import { afterEach, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(() => true),
  writable: true,
});

// Mock navigator.geolocation
const geolocationMock = {
  getCurrentPosition: vi.fn((success, error) => {
    success({
      coords: {
        latitude: 47.0,
        longitude: 11.0,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
  }),
  watchPosition: vi.fn((success, error) => {
    success({
      coords: {
        latitude: 47.0,
        longitude: 11.0,
        accuracy: 10,
      },
      timestamp: Date.now(),
    });
    return 1; // Return watch ID
  }),
  clearWatch: vi.fn(),
};

Object.defineProperty(navigator, 'geolocation', {
  value: geolocationMock,
  writable: true,
});

// Mock AudioContext
class AudioContextMock {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
  }

  createOscillator() {
    return {
      connect: vi.fn(),
      frequency: { value: 440 },
      type: 'sine',
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createGain() {
    return {
      connect: vi.fn(),
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    };
  }

  get destination() {
    return {};
  }
}

globalThis.AudioContext = AudioContextMock;
globalThis.webkitAudioContext = AudioContextMock;

// Mock BroadcastChannel
class BroadcastChannelMock {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
  }

  postMessage(message) {
    // Simulate message to self (for testing)
    if (this.onmessage) {
      setTimeout(() => {
        this.onmessage({ data: message });
      }, 0);
    }
  }

  close() {}
}

globalThis.BroadcastChannel = BroadcastChannelMock;

// Mock fetch
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ entries: [], lastUpdated: null }),
  }),
);

// Mock URL.createObjectURL and URL.revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock FileReader
class FileReaderMock {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
  }

  readAsText(blob) {
    setTimeout(() => {
      this.result = '{"version":"2.1.0","entries":[],"settings":{}}';
      if (this.onload) this.onload({ target: this });
    }, 0);
  }
}

globalThis.FileReader = FileReaderMock;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

// Cleanup after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Export mocks for use in tests
export {
  localStorageMock,
  geolocationMock,
  AudioContextMock,
  BroadcastChannelMock,
  FileReaderMock,
};

// Test helper utilities
export const createMockEntry = (overrides = {}) => ({
  id: Date.now(),
  bib: '001',
  point: 'S',
  timestamp: new Date().toISOString(),
  status: 'ok',
  deviceId: 'test-device',
  deviceName: 'Test Device',
  ...overrides,
});

export const createMockSettings = (overrides = {}) => ({
  auto: true,
  haptic: true,
  sound: false,
  sync: false,
  gps: false,
  ...overrides,
});

// Wait for async operations
export const waitFor = (ms = 0) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Simulate user events
export const simulateClick = (element) => {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  element.dispatchEvent(event);
};

export const simulateKeydown = (element, key) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
};
