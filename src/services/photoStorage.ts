/**
 * IndexedDB-based photo storage service
 * Stores photos separately from localStorage to avoid quota limits
 *
 * IndexedDB has much larger storage limits (~50MB+ vs 5MB for localStorage)
 * Photos are stored by entry ID for easy retrieval
 */

const DB_NAME = 'ski-timer-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

interface PhotoRecord {
  entryId: string;
  photo: string; // Base64 encoded
  timestamp: number;
}

interface QueuedSave {
  entryId: string;
  photoBase64: string;
  resolve: (success: boolean) => void;
}

class PhotoStorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<boolean> | null = null;
  private saveQueue: QueuedSave[] = [];
  private isProcessingQueue = false;

  /**
   * Initialize IndexedDB connection
   */
  async initialize(): Promise<boolean> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported - photo storage disabled');
        resolve(false);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        resolve(false);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create photos store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'entryId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Store a photo for an entry
   * Uses a queue to serialize saves and prevent IndexedDB transaction conflicts
   */
  async savePhoto(entryId: string, photoBase64: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Add to queue
      this.saveQueue.push({ entryId, photoBase64, resolve });
      // Process queue if not already processing
      this.processQueue();
    });
  }

  /**
   * Process the save queue serially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.saveQueue.length > 0) {
        const item = this.saveQueue.shift()!;
        const success = await this.doSavePhoto(item.entryId, item.photoBase64);
        item.resolve(success);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Actually perform the photo save
   */
  private async doSavePhoto(entryId: string, photoBase64: string): Promise<boolean> {
    if (!this.db) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      try {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const record: PhotoRecord = {
          entryId,
          photo: photoBase64,
          timestamp: Date.now()
        };

        const request = store.put(record);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.error('Photo save error:', request.error);
          resolve(false);
        };
      } catch (error) {
        console.error('Photo save transaction error:', error);
        resolve(false);
      }
    });
  }

  /**
   * Get a photo for an entry
   */
  async getPhoto(entryId: string): Promise<string | null> {
    if (!this.db) {
      const initialized = await this.initialize();
      if (!initialized) return null;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(entryId);

        request.onsuccess = () => {
          const record = request.result as PhotoRecord | undefined;
          resolve(record?.photo || null);
        };

        request.onerror = () => {
          console.error('Photo get error:', request.error);
          resolve(null);
        };
      } catch (error) {
        console.error('Photo get transaction error:', error);
        resolve(null);
      }
    });
  }

  /**
   * Delete a photo for an entry
   */
  async deletePhoto(entryId: string): Promise<boolean> {
    if (!this.db) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      try {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(entryId);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.error('Photo delete error:', request.error);
          resolve(false);
        };
      } catch (error) {
        console.error('Photo delete transaction error:', error);
        resolve(false);
      }
    });
  }

  /**
   * Check if an entry has a photo
   */
  async hasPhoto(entryId: string): Promise<boolean> {
    const photo = await this.getPhoto(entryId);
    return photo !== null;
  }

  /**
   * Delete all photos (for clear all functionality)
   */
  async clearAll(): Promise<boolean> {
    if (!this.db) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      try {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.error('Photo clear error:', request.error);
          resolve(false);
        };
      } catch (error) {
        console.error('Photo clear transaction error:', error);
        resolve(false);
      }
    });
  }

  /**
   * Delete photos for multiple entries
   */
  async deletePhotos(entryIds: string[]): Promise<void> {
    for (const entryId of entryIds) {
      await this.deletePhoto(entryId);
    }
  }

  /**
   * Get storage usage estimate
   */
  async getStorageUsage(): Promise<{ used: number; quota: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Get count of stored photos
   */
  async getPhotoCount(): Promise<number> {
    if (!this.db) {
      const initialized = await this.initialize();
      if (!initialized) return 0;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      try {
        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          resolve(0);
        };
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Close the IndexedDB connection
   * Call this during app cleanup to release resources
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Singleton instance
export const photoStorage = new PhotoStorageService();
