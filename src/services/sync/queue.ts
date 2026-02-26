/**
 * Queue Module
 * Handles offline sync queue processing with retry logic and batching
 */

import { store } from '../../store';
import type { Entry } from '../../types';
import { logger } from '../../utils/logger';
import {
  MAX_RETRIES,
  QUEUE_PROCESS_INTERVAL,
  RETRY_BACKOFF_BASE,
  SYNC_BATCH_SIZE,
} from './types';

/**
 * Callback type for sending a single entry to cloud
 */
type SendEntryCallback = (entry: Entry) => Promise<boolean>;

/**
 * Callback type for sending a batch of entries to cloud
 */
type SendBatchCallback = (entries: Entry[]) => Promise<Map<string, boolean>>;

/**
 * Queue processor for offline entry sync with retry logic and batching
 */
class QueueProcessor {
  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessingQueue = false;
  private sendEntryCallback: SendEntryCallback | null = null;
  private sendBatchCallback: SendBatchCallback | null = null;

  /**
   * Initialize queue processor with send callback
   */
  initialize(sendCallback: SendEntryCallback): void {
    this.sendEntryCallback = sendCallback;
  }

  /**
   * Initialize batch callback for sending multiple entries at once
   */
  initializeBatch(batchCallback: SendBatchCallback): void {
    this.sendBatchCallback = batchCallback;
  }

  /**
   * Start processing sync queue
   */
  start(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
    }

    this.queueInterval = setInterval(
      () => this.processQueue(),
      QUEUE_PROCESS_INTERVAL,
    );
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
   * Process sync queue with retry logic and batching support.
   * When 2+ entries are ready, sends them as a batch for efficiency.
   * Falls back to single-entry sends when only 1 entry is ready.
   * ATOMICITY FIX: Set flag before any checks to prevent concurrent processing
   */
  async processQueue(): Promise<void> {
    // CRITICAL: Set flag FIRST to prevent race condition
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const state = store.getState();
      if (
        !state.settings.sync ||
        !state.raceId ||
        state.syncQueue.length === 0
      ) {
        return;
      }

      if (!this.sendEntryCallback) {
        logger.warn('Queue processor: No send callback configured');
        return;
      }

      const now = Date.now();

      // Collect ready items and items to remove
      const readyItems: { entry: Entry; retryCount: number }[] = [];
      const expiredIds: string[] = [];

      for (const item of state.syncQueue) {
        // Remove if max retries exceeded
        if (item.retryCount >= MAX_RETRIES) {
          logger.warn('Max retries exceeded for entry:', item.entry.id);
          expiredIds.push(item.entry.id);
          continue;
        }

        // Check backoff delay with jitter to prevent thundering herd
        // when multiple devices reconnect simultaneously after cellular drop
        const baseDelay = RETRY_BACKOFF_BASE * 2 ** item.retryCount;
        const backoffDelay = baseDelay * (0.5 + Math.random());
        if (now - item.lastAttempt < backoffDelay) {
          continue; // Not ready to retry yet
        }

        readyItems.push({ entry: item.entry, retryCount: item.retryCount });

        // Limit batch size
        if (readyItems.length >= SYNC_BATCH_SIZE) break;
      }

      // Remove expired items
      for (const id of expiredIds) {
        store.removeFromSyncQueue(id);
      }

      if (readyItems.length === 0) return;

      // Use batch if 2+ entries are ready and batch callback is available
      if (readyItems.length >= 2 && this.sendBatchCallback) {
        const entries = readyItems.map((item) => item.entry);
        const results = await this.sendBatchCallback(entries);

        // Handle individual results
        for (const item of readyItems) {
          const success = results.get(item.entry.id);
          if (success !== true) {
            store.updateSyncQueueItem(item.entry.id, {
              retryCount: item.retryCount + 1,
              lastAttempt: now,
              error: 'Failed to sync',
            });
          }
          // Successful entries are removed from queue by sendBatchCallback
        }
      } else {
        // Single entry path (1 item or no batch callback)
        for (const item of readyItems) {
          const success = await this.sendEntryCallback(item.entry);

          if (!success) {
            store.updateSyncQueueItem(item.entry.id, {
              retryCount: item.retryCount + 1,
              lastAttempt: now,
              error: 'Failed to sync',
            });
          }
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
    this.sendBatchCallback = null;
  }
}

// Singleton instance
export const queueProcessor = new QueueProcessor();
