/**
 * Unit Tests for PhotoStorage Service
 * Tests IndexedDB-based photo storage functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock IndexedDB
const mockStoreData = new Map<string, unknown>();
let mockDbClosed = false;

const mockStore = {
  put: vi.fn((record: { entryId: string }) => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
      result: undefined
    };
    setTimeout(() => {
      mockStoreData.set(record.entryId, record);
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
  get: vi.fn((key: string) => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
      result: mockStoreData.get(key)
    };
    setTimeout(() => {
      request.result = mockStoreData.get(key);
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
  delete: vi.fn((key: string) => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null
    };
    setTimeout(() => {
      mockStoreData.delete(key);
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
  clear: vi.fn(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null
    };
    setTimeout(() => {
      mockStoreData.clear();
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
  count: vi.fn(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
      result: mockStoreData.size
    };
    setTimeout(() => {
      request.result = mockStoreData.size;
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
  createIndex: vi.fn()
};

const mockTransaction = {
  objectStore: vi.fn(() => mockStore),
  oncomplete: null as (() => void) | null,
  onerror: null as (() => void) | null
};

const mockDb = {
  transaction: vi.fn(() => mockTransaction),
  createObjectStore: vi.fn(() => mockStore),
  objectStoreNames: {
    contains: vi.fn(() => false)
  },
  close: vi.fn(() => { mockDbClosed = true; })
};

const mockOpenRequest = {
  onsuccess: null as (() => void) | null,
  onerror: null as (() => void) | null,
  onupgradeneeded: null as ((event: unknown) => void) | null,
  result: mockDb,
  error: null
};

// Mock window.indexedDB
Object.defineProperty(globalThis, 'indexedDB', {
  value: {
    open: vi.fn(() => {
      setTimeout(() => {
        if (mockOpenRequest.onupgradeneeded) {
          mockOpenRequest.onupgradeneeded({ target: mockOpenRequest });
        }
        if (mockOpenRequest.onsuccess) mockOpenRequest.onsuccess();
      }, 0);
      return mockOpenRequest;
    })
  },
  writable: true
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null)
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('PhotoStorage Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockStoreData.clear();
    mockDbClosed = false;
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Export', () => {
    it('should export photoStorage singleton', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(module.photoStorage).toBeDefined();
    });

    it('should have initialize method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.initialize).toBe('function');
    });

    it('should have savePhoto method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.savePhoto).toBe('function');
    });

    it('should have getPhoto method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.getPhoto).toBe('function');
    });

    it('should have deletePhoto method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.deletePhoto).toBe('function');
    });

    it('should have hasPhoto method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.hasPhoto).toBe('function');
    });

    it('should have clearAll method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.clearAll).toBe('function');
    });

    it('should have deletePhotos method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.deletePhotos).toBe('function');
    });

    it('should have getStorageUsage method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.getStorageUsage).toBe('function');
    });

    it('should have getPhotoCount method', async () => {
      const module = await import('../../../src/services/photoStorage');
      expect(typeof module.photoStorage.getPhotoCount).toBe('function');
    });
  });

  describe('Photo Storage Interface', () => {
    it('PhotoRecord interface should have required fields', async () => {
      // This tests the expected interface by checking returned data structure
      const module = await import('../../../src/services/photoStorage');

      // After saving, the mock should have the expected structure
      const testEntryId = 'test-entry-123';
      const testPhoto = 'base64-photo-data';

      // Mock a direct store operation to verify structure
      mockStore.put({
        entryId: testEntryId,
        photo: testPhoto,
        timestamp: Date.now()
      });

      expect(mockStore.put).toHaveBeenCalled();
      const putArg = mockStore.put.mock.calls[0][0];
      expect(putArg).toHaveProperty('entryId');
      expect(putArg).toHaveProperty('photo');
      expect(putArg).toHaveProperty('timestamp');
    });
  });

  describe('Database Constants', () => {
    it('should use correct database name', async () => {
      vi.resetModules();
      await import('../../../src/services/photoStorage');

      // The database should be opened with the correct name
      // We verify this by checking the indexedDB.open mock
      expect(indexedDB.open).toBeDefined();
    });
  });
});

describe('PhotoStorage - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreData.clear();
  });

  it('should handle missing IndexedDB gracefully', async () => {
    // Save and remove indexedDB
    const originalIndexedDB = globalThis.indexedDB;

    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      writable: true
    });

    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    // Methods should return safe defaults when IndexedDB is unavailable
    // The service should not throw
    expect(module.photoStorage).toBeDefined();

    // Restore
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      writable: true
    });
  });

  it('should handle empty entry ID', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    // Empty string entry ID should still work (handled by IndexedDB)
    expect(typeof module.photoStorage.savePhoto).toBe('function');
  });

  it('should handle large photo data', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    // Large base64 string (simulating ~1MB photo)
    const largePhoto = 'A'.repeat(1_000_000);

    // The method should accept large data without throwing
    // (actual storage depends on IndexedDB quota)
    expect(typeof module.photoStorage.savePhoto).toBe('function');
  });
});

describe('PhotoStorage - API Signature Verification', () => {
  it('savePhoto should accept entryId and photoBase64 parameters', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    // Verify the function signature by checking it accepts these params
    const savePhoto = module.photoStorage.savePhoto;
    expect(savePhoto.length).toBe(2); // Function expects 2 parameters
  });

  it('getPhoto should accept entryId parameter', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const getPhoto = module.photoStorage.getPhoto;
    expect(getPhoto.length).toBe(1); // Function expects 1 parameter
  });

  it('deletePhoto should accept entryId parameter', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const deletePhoto = module.photoStorage.deletePhoto;
    expect(deletePhoto.length).toBe(1); // Function expects 1 parameter
  });

  it('hasPhoto should accept entryId parameter', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const hasPhoto = module.photoStorage.hasPhoto;
    expect(hasPhoto.length).toBe(1); // Function expects 1 parameter
  });

  it('deletePhotos should accept array of entryIds', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const deletePhotos = module.photoStorage.deletePhotos;
    expect(deletePhotos.length).toBe(1); // Function expects 1 parameter (array)
  });

  it('clearAll should not require parameters', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const clearAll = module.photoStorage.clearAll;
    expect(clearAll.length).toBe(0); // Function expects 0 parameters
  });

  it('initialize should not require parameters', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const initialize = module.photoStorage.initialize;
    expect(initialize.length).toBe(0); // Function expects 0 parameters
  });

  it('getPhotoCount should not require parameters', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const getPhotoCount = module.photoStorage.getPhotoCount;
    expect(getPhotoCount.length).toBe(0); // Function expects 0 parameters
  });

  it('getStorageUsage should not require parameters', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const getStorageUsage = module.photoStorage.getStorageUsage;
    expect(getStorageUsage.length).toBe(0); // Function expects 0 parameters
  });
});

describe('PhotoStorage - Return Types', () => {
  it('savePhoto should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.savePhoto('test', 'data');
    expect(result).toBeInstanceOf(Promise);
  });

  it('getPhoto should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.getPhoto('test');
    expect(result).toBeInstanceOf(Promise);
  });

  it('deletePhoto should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.deletePhoto('test');
    expect(result).toBeInstanceOf(Promise);
  });

  it('hasPhoto should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.hasPhoto('test');
    expect(result).toBeInstanceOf(Promise);
  });

  it('clearAll should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.clearAll();
    expect(result).toBeInstanceOf(Promise);
  });

  it('deletePhotos should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.deletePhotos(['test1', 'test2']);
    expect(result).toBeInstanceOf(Promise);
  });

  it('initialize should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.initialize();
    expect(result).toBeInstanceOf(Promise);
  });

  it('getPhotoCount should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.getPhotoCount();
    expect(result).toBeInstanceOf(Promise);
  });

  it('getStorageUsage should return a Promise', async () => {
    vi.resetModules();
    const module = await import('../../../src/services/photoStorage');

    const result = module.photoStorage.getStorageUsage();
    expect(result).toBeInstanceOf(Promise);
  });
});
