/**
 * Queue Module
 * Handles offline sync queue processing with retry logic
 */

import { store } from '../../store';
import { logger } from '../../utils/logger';
import { QUEUE_PROCESS_INTERVAL, MAX_RETRIES, RETRY_BACKOFF_BASE } from './types';
import type { Entry } from '../../types';

/**
 * Callback type for sending entries to cloud
 */
type SendEntryCallback = (entry: Entry) => Promise<boolean>;

/**
 * Queue processor for offline entry sync with retry logic
 */
class QueueProcessor {
  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessingQueue = false;
  private sendEntryCallback: SendEntryCallback | null = null;

  /**
   * Initialize queue processor with send callback
   */
  initialize(sendCallback: SendEntryCallback): void {
    this.sendEntryCallback = sendCallback;
  }

  /**
   * Start processing sync queue
   */
  start(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
    }

    this.queueInterval = setInterval(() => this.processQueue(), QUEUE_PROCESS_INTERVAL);
  }

  /**
   * Stop processing sync queue
   */
  stop(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
  }

  /**
   * Check if currently processing
   */
  isProcessing(): boolean {
    return this.queueInterval !== null;
  }

  /**
   * Process sync queue with retry logic
   * ATOMICITY FIX: Set flag before any checks to prevent concurrent processing
   */
  async processQueue(): Promise<void> {
    // CRITICAL: Set flag FIRST to prevent race condition
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const state = store.getState();
      if (!state.settings.sync || !state.raceId || state.syncQueue.length === 0) {
        return;
      }

      if (!this.sendEntryCallback) {
        logger.warn('Queue processor: No send callback configured');
        return;
      }

      const now = Date.now();

      for (const item of state.syncQueue) {
        // Skip if max retries exceeded
        if (item.retryCount >= MAX_RETRIES) {
          logger.warn('Max retries exceeded for entry:', item.entry.id);
          store.removeFromSyncQueue(item.entry.id);
          continue;
        }

        // Calculate backoff delay
        const backoffDelay = RETRY_BACKOFF_BASE * Math.pow(2, item.retryCount);
        if (now - item.lastAttempt < backoffDelay) {
          continue; // Not ready to retry yet
        }

        // Attempt to send
        const success = await this.sendEntryCallback(item.entry);

        if (!success) {
          store.updateSyncQueueItem(item.entry.id, {
            retryCount: item.retryCount + 1,
            lastAttempt: now,
            error: 'Failed to sync'
          });
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return store.getState().syncQueue.length;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    this.sendEntryCallback = null;
  }
}

// Singleton instance
export const queueProcessor = new QueueProcessor();
