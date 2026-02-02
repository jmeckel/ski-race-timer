/**
 * Broadcast Module
 * Handles cross-tab communication via BroadcastChannel
 */

import { store } from '../../store';
import { isValidEntry } from '../../utils/validation';
import { logger } from '../../utils/logger';
import type { Entry, DeviceInfo, FaultEntry } from '../../types';

/**
 * BroadcastChannel manager for cross-tab sync
 */
class BroadcastManager {
  private broadcastChannel: BroadcastChannel | null = null;

  /**
   * Initialize BroadcastChannel for cross-tab communication
   */
  initialize(raceId: string): void {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.close();
      }

      this.broadcastChannel = new BroadcastChannel(`ski-timer-${raceId}`);

      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data;

        if (type === 'entry' && isValidEntry(data)) {
          store.mergeCloudEntries([data]);
        } else if (type === 'presence') {
          const deviceInfo = data as DeviceInfo;
          store.addConnectedDevice(deviceInfo);
        } else if (type === 'fault') {
          const fault = data as FaultEntry;
          if (fault && fault.id) {
            store.mergeFaultsFromCloud([fault]);
          }
        } else if (type === 'fault-deleted') {
          const faultId = data as string;
          if (faultId) {
            store.deleteFaultEntry(faultId);
          }
        }
      };
    } catch (error) {
      logger.warn('BroadcastChannel not supported:', error);
    }
  }

  /**
   * Broadcast entry to other tabs
   */
  broadcastEntry(entry: Entry): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'entry', data: entry });
      } catch (error) {
        logger.error('Broadcast error:', error);
      }
    }
  }

  /**
   * Broadcast presence to other tabs
   */
  broadcastPresence(): void {
    const state = store.getState();
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'presence',
          data: {
            id: state.deviceId,
            name: state.deviceName,
            lastSeen: Date.now()
          }
        });
      } catch (error) {
        logger.error('Presence broadcast error:', error);
      }
    }
  }

  /**
   * Broadcast fault to other tabs
   */
  broadcastFault(fault: FaultEntry): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'fault', data: fault });
      } catch (error) {
        logger.error('Fault broadcast error:', error);
      }
    }
  }

  /**
   * Broadcast fault deletion to other tabs
   */
  broadcastFaultDeletion(faultId: string): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'fault-deleted', data: faultId });
      } catch (error) {
        logger.error('Fault deletion broadcast error:', error);
      }
    }
  }

  /**
   * Close broadcast channel
   */
  cleanup(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // Ignore close errors
      }
      this.broadcastChannel = null;
    }
  }
}

// Singleton instance
export const broadcastManager = new BroadcastManager();
