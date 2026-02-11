/**
 * Unit Tests for Fault Sync Module
 * Tests: initializeFaultSync, fetchCloudFaults, sendFaultToCloud,
 *        deleteFaultFromCloudApi, pushLocalFaults, getOtherGateAssignments, cleanupFaultSync
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock store
const mockGetState = vi.fn();
const mockRemoveDeletedCloudFaults = vi.fn();
const mockMergeFaultsFromCloud = vi.fn(() => 0);
const mockMarkFaultSynced = vi.fn();

vi.mock('../../../../src/store', () => ({
  store: {
    getState: () => mockGetState(),
    removeDeletedCloudFaults: (...args: unknown[]) =>
      mockRemoveDeletedCloudFaults(...args),
    mergeFaultsFromCloud: (...args: unknown[]) =>
      mockMergeFaultsFromCloud(...args),
    markFaultSynced: (...args: unknown[]) => mockMarkFaultSynced(...args),
  },
}));

vi.mock('../../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/services/auth', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

// Mock fetchWithTimeout
const mockFetch = vi.fn();
vi.mock('../../../../src/utils/errors', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

import {
  cleanupFaultSync,
  deleteFaultFromCloudApi,
  fetchCloudFaults,
  getOtherGateAssignments,
  initializeFaultSync,
  pushLocalFaults,
  sendFaultToCloud,
} from '../../../../src/services/sync/faultSync';

describe('Fault Sync Module', () => {
  const mockCallbacks = {
    onResetFastPolling: vi.fn(),
    showToast: vi.fn(),
  };

  const baseState = {
    settings: { sync: true },
    raceId: 'RACE-2024',
    deviceId: 'dev_1',
    deviceName: 'Timer 1',
    deviceRole: 'timer' as const,
    gateAssignment: null,
    isJudgeReady: false,
    firstGateColor: 'red' as const,
    currentLang: 'en',
    faultEntries: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue(baseState);
    initializeFaultSync(mockCallbacks);
  });

  afterEach(() => {
    cleanupFaultSync();
  });

  describe('initializeFaultSync', () => {
    it('should store callbacks', () => {
      // Verified by the callbacks being used in other tests
      expect(() => initializeFaultSync(mockCallbacks)).not.toThrow();
    });
  });

  describe('getOtherGateAssignments', () => {
    it('should return empty array initially', () => {
      expect(getOtherGateAssignments()).toEqual([]);
    });
  });

  describe('cleanupFaultSync', () => {
    it('should reset module state', () => {
      cleanupFaultSync();
      expect(getOtherGateAssignments()).toEqual([]);
    });
  });

  describe('fetchCloudFaults', () => {
    it('should do nothing when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { sync: false },
      });

      await fetchCloudFaults();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should do nothing when no raceId', async () => {
      mockGetState.mockReturnValue({ ...baseState, raceId: '' });

      await fetchCloudFaults();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch faults from API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [],
            deletedIds: [],
            gateAssignments: [],
          }),
      });

      await fetchCloudFaults();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should merge cloud faults into store', async () => {
      const cloudFaults = [
        {
          id: 'f1',
          bib: '042',
          run: 1,
          gateNumber: 4,
          faultType: 'MG',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: cloudFaults,
            deletedIds: [],
            gateAssignments: [],
          }),
      });

      mockMergeFaultsFromCloud.mockReturnValue(1);

      await fetchCloudFaults();
      expect(mockMergeFaultsFromCloud).toHaveBeenCalledWith(cloudFaults, []);
    });

    it('should show toast when faults are added', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [{ id: 'f1' }],
            deletedIds: [],
            gateAssignments: [],
          }),
      });

      mockMergeFaultsFromCloud.mockReturnValue(1);

      await fetchCloudFaults();
      expect(mockCallbacks.showToast).toHaveBeenCalled();
    });

    it('should remove deleted cloud faults', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [],
            deletedIds: ['f1', 'f2'],
            gateAssignments: [],
          }),
      });

      await fetchCloudFaults();
      expect(mockRemoveDeletedCloudFaults).toHaveBeenCalledWith(['f1', 'f2']);
    });

    it('should handle 401 response silently', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await fetchCloudFaults();
      // Should not throw
    });

    it('should handle non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await fetchCloudFaults();
      // Should dispatch error event
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await fetchCloudFaults();
      // Should not throw
    });

    it('should handle invalid response data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      await fetchCloudFaults();
      // Should not throw - handles null data
    });

    it('should include gate judge params when role is gateJudge', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        deviceRole: 'gateJudge',
        gateAssignment: [1, 10],
        isJudgeReady: true,
        firstGateColor: 'blue',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [],
            deletedIds: [],
            gateAssignments: [],
          }),
      });

      await fetchCloudFaults();
      expect(mockFetch).toHaveBeenCalled();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('gateStart=1');
      expect(url).toContain('gateEnd=10');
    });

    it('should filter non-string deletedIds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [],
            deletedIds: ['f1', 42, null, 'f2'],
            gateAssignments: [],
          }),
      });

      await fetchCloudFaults();
      expect(mockRemoveDeletedCloudFaults).toHaveBeenCalledWith(['f1', 'f2']);
    });

    it('should update gate assignments from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            faults: [],
            deletedIds: [],
            gateAssignments: [
              { deviceId: 'dev_2', gateStart: 11, gateEnd: 20 },
            ],
          }),
      });

      await fetchCloudFaults();
      const assignments = getOtherGateAssignments();
      expect(assignments).toHaveLength(1);
    });
  });

  describe('sendFaultToCloud', () => {
    const fault = {
      id: 'f1',
      bib: '042',
      run: 1,
      gateNumber: 4,
      faultType: 'MG' as const,
      timestamp: '2024-01-15T10:00:00.000Z',
      deviceId: 'dev_1',
      deviceName: 'Judge 1',
      gateRange: [1, 10] as [number, number],
      currentVersion: 1,
      versionHistory: [],
      markedForDeletion: false,
    };

    it('should return false when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { sync: false },
      });

      const result = await sendFaultToCloud(fault);
      expect(result).toBe(false);
    });

    it('should return false when no raceId', async () => {
      mockGetState.mockReturnValue({ ...baseState, raceId: '' });

      const result = await sendFaultToCloud(fault);
      expect(result).toBe(false);
    });

    it('should send fault and return true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await sendFaultToCloud(fault);
      expect(result).toBe(true);
      expect(mockMarkFaultSynced).toHaveBeenCalledWith('f1');
      expect(mockCallbacks.onResetFastPolling).toHaveBeenCalled();
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await sendFaultToCloud(fault);
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await sendFaultToCloud(fault);
      expect(result).toBe(false);
    });
  });

  describe('deleteFaultFromCloudApi', () => {
    it('should return false when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { sync: false },
      });

      const result = await deleteFaultFromCloudApi('f1');
      expect(result).toBe(false);
    });

    it('should return true on successful delete', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await deleteFaultFromCloudApi('f1', 'dev_1', 'Chief');
      expect(result).toBe(true);
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await deleteFaultFromCloudApi('f1');
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await deleteFaultFromCloudApi('f1');
      expect(result).toBe(false);
    });

    it('should use device defaults when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await deleteFaultFromCloudApi('f1');
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('pushLocalFaults', () => {
    it('should do nothing when sync is disabled', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        settings: { sync: false },
      });

      await pushLocalFaults();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should push unsynced faults from this device', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        faultEntries: [
          {
            id: 'f1',
            deviceId: 'dev_1',
            syncedAt: undefined,
          },
        ],
      });

      mockFetch.mockResolvedValue({ ok: true });

      await pushLocalFaults();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should skip faults from other devices', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        faultEntries: [
          {
            id: 'f1',
            deviceId: 'dev_2', // Different device
            syncedAt: undefined,
          },
        ],
      });

      await pushLocalFaults();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip already synced faults', async () => {
      mockGetState.mockReturnValue({
        ...baseState,
        faultEntries: [
          {
            id: 'f1',
            deviceId: 'dev_1',
            syncedAt: Date.now(), // Already synced
          },
        ],
      });

      await pushLocalFaults();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
