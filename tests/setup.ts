/**
 * TypeScript Test Setup
 * Additional setup for TypeScript tests
 */

import { vi } from 'vitest';

// Mock crypto.randomUUID for consistent testing
const mockUUID = vi.fn(() =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }),
);

Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: mockUUID,
  writable: true,
  configurable: true,
});

// Mock MediaDevices for camera tests
const mockMediaStream = {
  getTracks: vi.fn(() => [
    {
      stop: vi.fn(),
      kind: 'video',
      enabled: true,
    },
  ]),
};

const mockMediaDevices = {
  getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream)),
  enumerateDevices: vi.fn(() =>
    Promise.resolve([
      { kind: 'videoinput', deviceId: 'camera1', label: 'Back Camera' },
    ]),
  ),
};

Object.defineProperty(navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true,
});

// Mock HTMLVideoElement for camera tests
class MockHTMLVideoElement {
  srcObject: MediaStream | null = null;
  videoWidth = 1280;
  videoHeight = 720;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play() {
    return Promise.resolve();
  }

  setAttribute() {}
  remove() {}
}

// Mock HTMLCanvasElement for photo capture
class MockHTMLCanvasElement {
  width = 1280;
  height = 720;

  getContext() {
    return {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      font: '',
      fillText: vi.fn(),
    };
  }

  toDataURL() {
    return 'data:image/jpeg;base64,mockBase64ImageData';
  }
}

// Add to global
(globalThis as unknown as Record<string, unknown>).MockHTMLVideoElement =
  MockHTMLVideoElement;
(globalThis as unknown as Record<string, unknown>).MockHTMLCanvasElement =
  MockHTMLCanvasElement;

// Note: beforeEach/afterEach with clearAllMocks/restoreAllMocks is handled
// by setup.js to avoid double-registration which can cause mock instability.

// Export mocks for use in tests
export {
  mockUUID,
  mockMediaStream,
  mockMediaDevices,
  MockHTMLVideoElement,
  MockHTMLCanvasElement,
};
