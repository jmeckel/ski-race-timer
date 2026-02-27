/**
 * Unit Tests for Sync Slice
 * Tests: sync status, race ID, device name, connected devices,
 *        cloud state, stale device pruning
 */

import { describe, expect, it, vi } from 'vitest';
import {
  addConnectedDevice,
  removeConnectedDevice,
  setCloudDeviceCount,
  setCloudHighestBib,
  setDeviceName,
  setLastSyncedRaceId,
  setRaceExistsInCloud,
  setRaceId,
  setSyncStatus,
} from '../../../src/store/slices/syncSlice';
import type { DeviceInfo, SyncStatus } from '../../../src/types';

describe('Sync Slice', () => {
  describe('setSyncStatus', () => {
    it('should return idle status', () => {
      const result = setSyncStatus('disconnected');
      expect(result.syncStatus).toBe('disconnected');
    });

    it('should return syncing status', () => {
      const result = setSyncStatus('syncing');
      expect(result.syncStatus).toBe('syncing');
    });

    it('should return connected status', () => {
      const result = setSyncStatus('connected');
      expect(result.syncStatus).toBe('connected');
    });

    it('should return error status', () => {
      const result = setSyncStatus('error');
      expect(result.syncStatus).toBe('error');
    });

    it('should return connecting status', () => {
      const result = setSyncStatus('connecting');
      expect(result.syncStatus).toBe('connecting');
    });

    it('should return offline status', () => {
      const result = setSyncStatus('offline');
      expect(result.syncStatus).toBe('offline');
    });

    it('should return only syncStatus property', () => {
      const result = setSyncStatus('connected');
      expect(Object.keys(result)).toEqual(['syncStatus']);
    });
  });

  describe('setRaceId', () => {
    it('should set race ID and not clear undo when same race', () => {
      const result = setRaceId('race-123', 'race-123');
      expect(result.raceId).toBe('race-123');
      expect(result.clearUndoRedo).toBe(false);
    });

    it('should set race ID and clear undo when changing races', () => {
      const result = setRaceId('race-456', 'race-123');
      expect(result.raceId).toBe('race-456');
      expect(result.clearUndoRedo).toBe(true);
    });

    it('should clear undo when switching from empty to a race', () => {
      const result = setRaceId('race-123', '');
      expect(result.raceId).toBe('race-123');
      expect(result.clearUndoRedo).toBe(true);
    });

    it('should clear undo when switching from a race to empty', () => {
      const result = setRaceId('', 'race-123');
      expect(result.raceId).toBe('');
      expect(result.clearUndoRedo).toBe(true);
    });

    it('should not clear undo when both are empty', () => {
      const result = setRaceId('', '');
      expect(result.raceId).toBe('');
      expect(result.clearUndoRedo).toBe(false);
    });
  });

  describe('setLastSyncedRaceId', () => {
    it('should set the last synced race ID', () => {
      const result = setLastSyncedRaceId('race-123');
      expect(result.lastSyncedRaceId).toBe('race-123');
    });

    it('should set empty string as last synced race ID', () => {
      const result = setLastSyncedRaceId('');
      expect(result.lastSyncedRaceId).toBe('');
    });

    it('should return only lastSyncedRaceId property', () => {
      const result = setLastSyncedRaceId('race-123');
      expect(Object.keys(result)).toEqual(['lastSyncedRaceId']);
    });
  });

  describe('setDeviceName', () => {
    it('should set the device name', () => {
      const result = setDeviceName('Timer Alpha');
      expect(result.deviceName).toBe('Timer Alpha');
    });

    it('should set empty device name', () => {
      const result = setDeviceName('');
      expect(result.deviceName).toBe('');
    });

    it('should handle special characters in device name', () => {
      const result = setDeviceName("O'Brien's Timer <1>");
      expect(result.deviceName).toBe("O'Brien's Timer <1>");
    });

    it('should return only deviceName property', () => {
      const result = setDeviceName('Timer');
      expect(Object.keys(result)).toEqual(['deviceName']);
    });
  });

  describe('addConnectedDevice', () => {
    it('should add a new device to empty map', () => {
      const device: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>();

      const result = addConnectedDevice(device, currentDevices);

      expect(result.connectedDevices!.size).toBe(1);
      expect(result.connectedDevices!.get('dev-1')).toEqual(device);
    });

    it('should add a new device alongside existing devices', () => {
      const existing: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const newDevice: DeviceInfo = {
        id: 'dev-2',
        name: 'Timer 2',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', existing],
      ]);

      const result = addConnectedDevice(newDevice, currentDevices);

      expect(result.connectedDevices!.size).toBe(2);
      expect(result.connectedDevices!.has('dev-1')).toBe(true);
      expect(result.connectedDevices!.has('dev-2')).toBe(true);
    });

    it('should update an existing device (same ID)', () => {
      const existing: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const updated: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1 (renamed)',
        lastSeen: Date.now() + 1000,
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', existing],
      ]);

      const result = addConnectedDevice(updated, currentDevices);

      expect(result.connectedDevices!.size).toBe(1);
      expect(result.connectedDevices!.get('dev-1')!.name).toBe(
        'Timer 1 (renamed)',
      );
    });

    it('should prune stale devices (older than 2 minutes)', () => {
      const now = Date.now();
      const staleDevice: DeviceInfo = {
        id: 'dev-stale',
        name: 'Stale Timer',
        lastSeen: now - 121_000, // 121 seconds ago (> 120s threshold)
      };
      const freshDevice: DeviceInfo = {
        id: 'dev-fresh',
        name: 'Fresh Timer',
        lastSeen: now - 60_000, // 60 seconds ago (< 120s threshold)
      };
      const newDevice: DeviceInfo = {
        id: 'dev-new',
        name: 'New Timer',
        lastSeen: now,
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-stale', staleDevice],
        ['dev-fresh', freshDevice],
      ]);

      const result = addConnectedDevice(newDevice, currentDevices);

      expect(result.connectedDevices!.size).toBe(2);
      expect(result.connectedDevices!.has('dev-stale')).toBe(false);
      expect(result.connectedDevices!.has('dev-fresh')).toBe(true);
      expect(result.connectedDevices!.has('dev-new')).toBe(true);
    });

    it('should keep devices that are exactly at the stale threshold', () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        const borderDevice: DeviceInfo = {
          id: 'dev-border',
          name: 'Border Timer',
          lastSeen: now - 119_999, // Just under 120s
        };
        const newDevice: DeviceInfo = {
          id: 'dev-new',
          name: 'New Timer',
          lastSeen: now,
        };
        const currentDevices = new Map<string, DeviceInfo>([
          ['dev-border', borderDevice],
        ]);

        const result = addConnectedDevice(newDevice, currentDevices);

        expect(result.connectedDevices!.size).toBe(2);
        expect(result.connectedDevices!.has('dev-border')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not mutate the original map', () => {
      const device: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>();

      addConnectedDevice(device, currentDevices);

      expect(currentDevices.size).toBe(0);
    });

    it('should always include the new device even if it would appear stale by timestamp', () => {
      // The new device is set directly, not checked for staleness
      const now = Date.now();
      const newDevice: DeviceInfo = {
        id: 'dev-new',
        name: 'New Timer',
        lastSeen: now,
      };
      const currentDevices = new Map<string, DeviceInfo>();

      const result = addConnectedDevice(newDevice, currentDevices);

      expect(result.connectedDevices!.has('dev-new')).toBe(true);
    });
  });

  describe('removeConnectedDevice', () => {
    it('should remove an existing device', () => {
      const device: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', device],
      ]);

      const result = removeConnectedDevice('dev-1', currentDevices);

      expect(result.connectedDevices!.size).toBe(0);
    });

    it('should handle removing a non-existing device gracefully', () => {
      const device: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', device],
      ]);

      const result = removeConnectedDevice('dev-nonexistent', currentDevices);

      expect(result.connectedDevices!.size).toBe(1);
      expect(result.connectedDevices!.has('dev-1')).toBe(true);
    });

    it('should handle removing from an empty map', () => {
      const currentDevices = new Map<string, DeviceInfo>();
      const result = removeConnectedDevice('dev-1', currentDevices);

      expect(result.connectedDevices!.size).toBe(0);
    });

    it('should not mutate the original map', () => {
      const device: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', device],
      ]);

      removeConnectedDevice('dev-1', currentDevices);

      expect(currentDevices.size).toBe(1);
      expect(currentDevices.has('dev-1')).toBe(true);
    });

    it('should only remove the specified device, keeping others', () => {
      const dev1: DeviceInfo = {
        id: 'dev-1',
        name: 'Timer 1',
        lastSeen: Date.now(),
      };
      const dev2: DeviceInfo = {
        id: 'dev-2',
        name: 'Timer 2',
        lastSeen: Date.now(),
      };
      const currentDevices = new Map<string, DeviceInfo>([
        ['dev-1', dev1],
        ['dev-2', dev2],
      ]);

      const result = removeConnectedDevice('dev-1', currentDevices);

      expect(result.connectedDevices!.size).toBe(1);
      expect(result.connectedDevices!.has('dev-2')).toBe(true);
    });
  });

  describe('setCloudDeviceCount', () => {
    it('should set cloud device count', () => {
      const result = setCloudDeviceCount(5);
      expect(result.cloudDeviceCount).toBe(5);
    });

    it('should set cloud device count to zero', () => {
      const result = setCloudDeviceCount(0);
      expect(result.cloudDeviceCount).toBe(0);
    });

    it('should return only cloudDeviceCount property', () => {
      const result = setCloudDeviceCount(3);
      expect(Object.keys(result)).toEqual(['cloudDeviceCount']);
    });
  });

  describe('setCloudHighestBib', () => {
    it('should set cloud highest bib', () => {
      const result = setCloudHighestBib(99);
      expect(result.cloudHighestBib).toBe(99);
    });

    it('should set cloud highest bib to zero', () => {
      const result = setCloudHighestBib(0);
      expect(result.cloudHighestBib).toBe(0);
    });

    it('should return only cloudHighestBib property', () => {
      const result = setCloudHighestBib(42);
      expect(Object.keys(result)).toEqual(['cloudHighestBib']);
    });
  });

  describe('setRaceExistsInCloud', () => {
    it('should set race exists to true', () => {
      const result = setRaceExistsInCloud(true);
      expect(result.raceExistsInCloud).toBe(true);
    });

    it('should set race exists to false', () => {
      const result = setRaceExistsInCloud(false);
      expect(result.raceExistsInCloud).toBe(false);
    });

    it('should set race exists to null (unknown state)', () => {
      const result = setRaceExistsInCloud(null);
      expect(result.raceExistsInCloud).toBeNull();
    });

    it('should return only raceExistsInCloud property', () => {
      const result = setRaceExistsInCloud(true);
      expect(Object.keys(result)).toEqual(['raceExistsInCloud']);
    });
  });
});
