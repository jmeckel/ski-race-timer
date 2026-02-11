/**
 * Storage Service - Abstraction layer over localStorage
 *
 * Provides an in-memory cache for fast reads and deferred writes
 * via requestIdleCallback (with setTimeout fallback for Safari).
 *
 * - Typed get<T> with JSON parse
 * - Raw string methods for the store's bulk persistence (avoids double-serialize)
 * - Synchronous API: cache makes reads instant, writes are fire-and-forget to disk
 */

import { logger } from '../utils/logger';

// Use requestIdleCallback where available, setTimeout(fn, 50) as fallback
const scheduleIdle: (callback: () => void) => number =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb)
    : (cb) => setTimeout(cb, 50) as unknown as number;

const cancelIdle: (id: number) => void =
  typeof cancelIdleCallback === 'function'
    ? (id) => cancelIdleCallback(id)
    : (id) => clearTimeout(id);

class StorageService {
  private cache = new Map<string, string>();
  private pendingWrites = new Map<string, string | null>(); // null = pending removal
  private flushId: number | null = null;

  /**
   * Get a JSON-parsed value from storage.
   * Returns from cache if available, otherwise reads from localStorage.
   */
  get<T>(key: string): T | null {
    // Check cache first
    if (this.cache.has(key)) {
      const raw = this.cache.get(key)!;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }

    // Read from localStorage and populate cache
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      this.cache.set(key, raw);
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a JSON value in storage.
   * Updates cache immediately, defers localStorage write.
   */
  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.cache.set(key, raw);
    this.pendingWrites.set(key, raw);
    this.scheduleFlush();
  }

  /**
   * Remove a key from storage.
   * Removes from cache immediately, defers localStorage removal.
   */
  remove(key: string): void {
    this.cache.delete(key);
    this.pendingWrites.set(key, null);
    this.scheduleFlush();
  }

  /**
   * Set a raw string value without JSON serialization.
   * Useful for the store's bulk persistence where values are already JSON strings.
   */
  setRaw(key: string, value: string): void {
    this.cache.set(key, value);
    this.pendingWrites.set(key, value);
    this.scheduleFlush();
  }

  /**
   * Get a raw string value without JSON parsing.
   * Returns from cache if available, otherwise reads from localStorage.
   */
  getRaw(key: string): string | null {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        this.cache.set(key, raw);
      }
      return raw;
    } catch {
      return null;
    }
  }

  /**
   * Schedule a flush of pending writes to localStorage.
   * Uses requestIdleCallback for non-blocking writes.
   */
  private scheduleFlush(): void {
    if (this.flushId !== null) return;
    this.flushId = scheduleIdle(() => this.flush());
  }

  /**
   * Flush all pending writes to localStorage.
   * Can be called directly for synchronous persistence (e.g., beforeunload).
   * Processes all pending writes even if some fail. If any write fails,
   * the first error is rethrown after all writes are attempted so callers
   * can handle it (e.g., dispatching storage-error events).
   */
  flush(): void {
    if (this.flushId !== null) {
      cancelIdle(this.flushId);
      this.flushId = null;
    }

    const writes = new Map(this.pendingWrites);
    this.pendingWrites.clear();

    let firstError: unknown = null;
    for (const [key, value] of writes) {
      try {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      } catch (e) {
        logger.error(`Storage write failed for key "${key}":`, e);
        if (firstError === null) {
          firstError = e;
        }
      }
    }

    if (firstError !== null) {
      throw firstError;
    }
  }

  /**
   * Check if there are pending writes that haven't been flushed yet.
   * Useful for testing.
   */
  hasPendingWrites(): boolean {
    return this.pendingWrites.size > 0;
  }

  /**
   * Clear the in-memory cache. Does NOT clear localStorage.
   * Useful for testing.
   */
  clearCache(): void {
    this.cache.clear();
    this.pendingWrites.clear();
    if (this.flushId !== null) {
      cancelIdle(this.flushId);
      this.flushId = null;
    }
  }
}

// Singleton export
export const storage = new StorageService();
