/**
 * Tests for BroadcastChannel manager
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    if (key === 'skiTimerDeviceId') return 'dev_test';
    if (key === 'skiTimerDeviceName') return 'Test Device';
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Track created channels
let createdChannels: MockBroadcastChannel[] = [];

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();

  constructor(name: string) {
    this.name = name;
    createdChannels.push(this);
  }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
});

// Import after mocks
const { broadcastManager } = await import(
  '../../../src/services/sync/broadcast'
);

describe('BroadcastManager', () => {
  beforeEach(() => {
    createdChannels = [];
  });

  afterEach(() => {
    broadcastManager.cleanup();
  });

  it('creates channel with race-specific name', () => {
    broadcastManager.initialize('RACE001');
    expect(createdChannels.length).toBeGreaterThan(0);
    const lastChannel = createdChannels[createdChannels.length - 1]!;
    expect(lastChannel.name).toBe('ski-timer-RACE001');
  });

  it('closes previous channel when reinitializing', () => {
    broadcastManager.initialize('RACE001');
    const firstChannel = createdChannels[createdChannels.length - 1]!;

    broadcastManager.initialize('RACE002');
    expect(firstChannel.close).toHaveBeenCalled();
    const secondChannel = createdChannels[createdChannels.length - 1]!;
    expect(secondChannel.name).toBe('ski-timer-RACE002');
  });

  it('broadcastEntry sends entry message', () => {
    broadcastManager.initialize('RACE001');
    const channel = createdChannels[createdChannels.length - 1]!;

    const entry = {
      id: 'e1',
      bib: '42',
      point: 'S' as const,
      run: 1 as const,
      timestamp: new Date().toISOString(),
      status: 'ok' as const,
      deviceId: 'dev_test',
      deviceName: 'Test',
    };

    broadcastManager.broadcastEntry(entry);
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: 'entry',
      data: entry,
    });
  });

  it('broadcastFault sends fault message', () => {
    broadcastManager.initialize('RACE001');
    const channel = createdChannels[createdChannels.length - 1]!;

    const fault = {
      id: 'f1',
      bib: '42',
      run: 1 as const,
      gateNumber: 5,
      faultType: 'MG' as const,
      timestamp: new Date().toISOString(),
      deviceId: 'dev_test',
      deviceName: 'Test',
      currentVersion: 1,
      versionHistory: [],
      markedForDeletion: false,
    };

    broadcastManager.broadcastFault(fault);
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: 'fault',
      data: fault,
    });
  });

  it('broadcastFaultDeletion sends deletion message', () => {
    broadcastManager.initialize('RACE001');
    const channel = createdChannels[createdChannels.length - 1]!;

    broadcastManager.broadcastFaultDeletion('f1');
    expect(channel.postMessage).toHaveBeenCalledWith({
      type: 'fault-deleted',
      data: 'f1',
    });
  });

  it('cleanup closes channel and nullifies it', () => {
    broadcastManager.initialize('RACE001');
    const channel = createdChannels[createdChannels.length - 1]!;

    broadcastManager.cleanup();
    expect(channel.close).toHaveBeenCalled();

    // After cleanup, broadcasting should not throw
    expect(() => broadcastManager.broadcastEntry({} as never)).not.toThrow();
  });

  it('handles postMessage errors gracefully', () => {
    broadcastManager.initialize('RACE001');
    const channel = createdChannels[createdChannels.length - 1]!;
    channel.postMessage.mockImplementation(() => {
      throw new Error('Channel closed');
    });

    expect(() => broadcastManager.broadcastEntry({} as never)).not.toThrow();
  });
});
