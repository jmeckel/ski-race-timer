/**
 * Unit Tests for Photo Viewer Feature Module
 * Tests: openPhotoViewer, closePhotoViewer, deletePhoto, getCurrentPhotoEntryId
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../../src/components', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackDelete: vi.fn(),
  photoStorage: {
    getPhoto: vi.fn(),
    deletePhoto: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({
      currentLang: 'en',
    })),
    updateEntry: vi.fn(),
  },
}));

vi.mock('../../../src/utils/format', () => ({
  formatTime: vi.fn((_date: Date) => '12:00:00.000'),
  getPointColor: vi.fn((point: string) =>
    point === 'S' ? '#f97316' : '#10b981',
  ),
  getPointLabel: vi.fn((point: string, _lang: string) =>
    point === 'S' ? 'Start' : 'Finish',
  ),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/utils/photoHelpers', () => ({
  isPhotoMarker: vi.fn((photo: string) => photo === 'indexeddb'),
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

import { showToast } from '../../../src/components';
import { closeModal, openModal } from '../../../src/features/modals';
import {
  closePhotoViewer,
  deletePhoto,
  getCurrentPhotoEntryId,
  openPhotoViewer,
} from '../../../src/features/photoViewer';
import { feedbackDelete, photoStorage } from '../../../src/services';
import { store } from '../../../src/store';
import type { Entry } from '../../../src/types';
import { logger } from '../../../src/utils/logger';

describe('Photo Viewer Feature Module', () => {
  let modal: HTMLDivElement;
  let image: HTMLImageElement;
  let bibEl: HTMLSpanElement;
  let pointEl: HTMLSpanElement;
  let timeEl: HTMLSpanElement;

  const createMockEntry = (overrides: Partial<Entry> = {}): Entry => ({
    id: 'entry-1',
    bib: '042',
    point: 'S',
    run: 1,
    timestamp: '2024-01-15T12:00:00.000Z',
    status: 'ok',
    deviceId: 'device-1',
    deviceName: 'Timer 1',
    photo: 'base64encodedphotodata',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();

    modal = document.createElement('div');
    modal.id = 'photo-viewer-modal';
    document.body.appendChild(modal);

    image = document.createElement('img');
    image.id = 'photo-viewer-image';
    modal.appendChild(image);

    bibEl = document.createElement('span');
    bibEl.id = 'photo-viewer-bib';
    modal.appendChild(bibEl);

    pointEl = document.createElement('span');
    pointEl.id = 'photo-viewer-point';
    modal.appendChild(pointEl);

    timeEl = document.createElement('span');
    timeEl.id = 'photo-viewer-time';
    modal.appendChild(timeEl);
  });

  afterEach(() => {
    modal.remove();
    // Reset module state
    closePhotoViewer();
  });

  // -------------------------------------------------------------------------
  // openPhotoViewer — basic functionality
  // -------------------------------------------------------------------------
  describe('openPhotoViewer', () => {
    it('should open modal with entry photo data', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should set bib text', async () => {
      const entry = createMockEntry({ bib: '042' });
      await openPhotoViewer(entry);

      expect(bibEl.textContent).toBe('042');
    });

    it('should show --- for empty bib', async () => {
      const entry = createMockEntry({ bib: '' });
      await openPhotoViewer(entry);

      expect(bibEl.textContent).toBe('---');
    });

    it('should set point label and color', async () => {
      const entry = createMockEntry({ point: 'S' });
      await openPhotoViewer(entry);

      expect(pointEl.textContent).toBe('Start');
      expect(pointEl.style.background).toBeTruthy();
    });

    it('should set time text', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      expect(timeEl.textContent).toBe('12:00:00.000');
    });

    it('should return early if no modal element', async () => {
      modal.remove();
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      expect(openModal).not.toHaveBeenCalled();
    });

    it('should return early if entry has no photo', async () => {
      const entry = createMockEntry({ photo: undefined });
      await openPhotoViewer(entry);

      expect(openModal).not.toHaveBeenCalled();
    });

    it('should set descriptive alt text on image', async () => {
      const entry = createMockEntry({ bib: '042', point: 'S' });
      await openPhotoViewer(entry);

      expect(image.alt).toContain('photoForBib');
      expect(image.alt).toContain('042');
      expect(image.alt).toContain('Start');
    });
  });

  // -------------------------------------------------------------------------
  // openPhotoViewer — IndexedDB loading
  // -------------------------------------------------------------------------
  describe('openPhotoViewer IndexedDB loading', () => {
    it('should load photo from IndexedDB and create blob URL', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('AAAA'); // valid base64

      const entry = createMockEntry({ photo: 'indexeddb' });
      await openPhotoViewer(entry);

      expect(photoStorage.getPhoto).toHaveBeenCalledWith('entry-1');
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(image.src).toContain('blob:');
      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should set currentPhotoEntryId on successful IndexedDB load', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('AAAA');

      const entry = createMockEntry({ id: 'entry-idb-1', photo: 'indexeddb' });
      await openPhotoViewer(entry);

      expect(getCurrentPhotoEntryId()).toBe('entry-idb-1');
    });

    it('should warn and NOT open modal when IndexedDB returns null', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue(null);

      const entry = createMockEntry({
        id: 'entry-missing',
        photo: 'indexeddb',
      });
      await openPhotoViewer(entry);

      expect(logger.warn).toHaveBeenCalledWith(
        'Photo not found in IndexedDB for entry:',
        'entry-missing',
      );
      expect(openModal).not.toHaveBeenCalled();
      // Should clear currentPhotoEntryId
      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should set currentPhotoEntryId before IndexedDB load completes', async () => {
      let resolveGetPhoto!: (value: string) => void;
      vi.mocked(photoStorage.getPhoto).mockReturnValue(
        new Promise<string>((resolve) => {
          resolveGetPhoto = resolve;
        }),
      );

      const entry = createMockEntry({
        id: 'pending-entry',
        photo: 'indexeddb',
      });
      const promise = openPhotoViewer(entry);

      // Entry ID should be set immediately, before IndexedDB resolves
      expect(getCurrentPhotoEntryId()).toBe('pending-entry');

      resolveGetPhoto('AAAA');
      await promise;
      expect(image.src).toContain('blob:');
    });
  });

  // -------------------------------------------------------------------------
  // openPhotoViewer — base64 fallback
  // -------------------------------------------------------------------------
  describe('openPhotoViewer base64 fallback', () => {
    it('should set image src directly for inline base64 photo', async () => {
      const entry = createMockEntry({ photo: 'abc123DEFbase64data' });
      await openPhotoViewer(entry);

      expect(image.src).toContain('data:image/jpeg;base64,abc123DEFbase64data');
      expect(photoStorage.getPhoto).not.toHaveBeenCalled();
    });

    it('should not create blob URL for inline base64 photo', async () => {
      const entry = createMockEntry({ photo: 'inlinePhotoDataHere' });
      await openPhotoViewer(entry);

      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // openPhotoViewer — blob URL revocation
  // -------------------------------------------------------------------------
  describe('openPhotoViewer blob URL revocation', () => {
    it('should revoke previous blob URL when opening a new photo', async () => {
      // First photo from IndexedDB
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('AAAA');

      const entry1 = createMockEntry({ id: 'entry-1', photo: 'indexeddb' });
      await openPhotoViewer(entry1);

      // At this point blob URL is created
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

      // Open second photo — should revoke old blob URL
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('BBBB');
      const entry2 = createMockEntry({ id: 'entry-2', photo: 'indexeddb' });
      await openPhotoViewer(entry2);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should not revoke blob URL when first photo is inline base64', async () => {
      const entry1 = createMockEntry({ photo: 'inlineBase64DataHere' });
      await openPhotoViewer(entry1);

      // Open second photo — no blob URL to revoke
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('AAAA');
      const entry2 = createMockEntry({ id: 'entry-2', photo: 'indexeddb' });
      await openPhotoViewer(entry2);

      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // closePhotoViewer — cleanup
  // -------------------------------------------------------------------------
  describe('closePhotoViewer', () => {
    it('should revoke blob URL on close', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('AAAA');

      const entry = createMockEntry({ photo: 'indexeddb' });
      await openPhotoViewer(entry);

      vi.mocked(URL.revokeObjectURL).mockClear();
      closePhotoViewer();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should not throw when closing without opening', () => {
      expect(() => closePhotoViewer()).not.toThrow();
    });

    it('should reset currentPhotoEntryId to null', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);
      expect(getCurrentPhotoEntryId()).toBe('entry-1');

      closePhotoViewer();
      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should call closeModal with the modal element', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);
      vi.mocked(closeModal).mockClear();

      closePhotoViewer();

      expect(closeModal).toHaveBeenCalledWith(modal);
    });

    it('should handle double close without error', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      closePhotoViewer();
      closePhotoViewer(); // second close

      expect(getCurrentPhotoEntryId()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deletePhoto — removes from IndexedDB and UI
  // -------------------------------------------------------------------------
  describe('deletePhoto removes from IndexedDB and UI', () => {
    it('should delete from IndexedDB using entry ID', async () => {
      const entry = createMockEntry({ id: 'entry-del-1' });
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(photoStorage.deletePhoto).toHaveBeenCalledWith('entry-del-1');
    });

    it('should update entry to remove photo marker', async () => {
      const entry = createMockEntry({ id: 'entry-del-2' });
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(store.updateEntry).toHaveBeenCalledWith('entry-del-2', {
        photo: undefined,
      });
    });

    it('should show success toast after deletion', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(showToast).toHaveBeenCalledWith('photoDeleted', 'success');
    });

    it('should trigger delete feedback haptic', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(feedbackDelete).toHaveBeenCalled();
    });

    it('should close the photo viewer after deletion', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);
      vi.mocked(closeModal).mockClear();

      await deletePhoto();

      expect(closeModal).toHaveBeenCalled();
      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should do nothing when no photo is currently open', async () => {
      closePhotoViewer(); // ensure clean state

      await deletePhoto();

      expect(photoStorage.deletePhoto).not.toHaveBeenCalled();
      expect(store.updateEntry).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentPhotoEntryId
  // -------------------------------------------------------------------------
  describe('getCurrentPhotoEntryId', () => {
    it('should return null when no photo is open', () => {
      closePhotoViewer();
      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should return correct ID after opening', async () => {
      const entry = createMockEntry({ id: 'test-id-456' });
      await openPhotoViewer(entry);

      expect(getCurrentPhotoEntryId()).toBe('test-id-456');
    });

    it('should return null after deleting photo', async () => {
      const entry = createMockEntry({ id: 'test-id-789' });
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should return latest entry ID when opening multiple photos', async () => {
      const entry1 = createMockEntry({ id: 'entry-first' });
      await openPhotoViewer(entry1);
      expect(getCurrentPhotoEntryId()).toBe('entry-first');

      const entry2 = createMockEntry({ id: 'entry-second' });
      await openPhotoViewer(entry2);
      expect(getCurrentPhotoEntryId()).toBe('entry-second');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling: missing DOM elements
  // -------------------------------------------------------------------------
  describe('error handling for missing DOM elements', () => {
    it('should handle missing image element gracefully', async () => {
      image.remove();
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      // Should still open modal and set other fields
      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should handle missing bib element gracefully', async () => {
      bibEl.remove();
      const entry = createMockEntry();
      await expect(openPhotoViewer(entry)).resolves.not.toThrow();
    });

    it('should handle missing point element gracefully', async () => {
      pointEl.remove();
      const entry = createMockEntry();
      await expect(openPhotoViewer(entry)).resolves.not.toThrow();
    });

    it('should handle missing time element gracefully', async () => {
      timeEl.remove();
      const entry = createMockEntry();
      await expect(openPhotoViewer(entry)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Point label and color — Finish entries
  // -------------------------------------------------------------------------
  describe('openPhotoViewer with Finish entry', () => {
    it('should set point label to Finish and use finish color', async () => {
      const entry = createMockEntry({ point: 'F' });
      await openPhotoViewer(entry);

      expect(pointEl.textContent).toBe('Finish');
      expect(pointEl.style.background).toBeTruthy();
    });

    it('should set alt text with point label and bib', async () => {
      const entry = createMockEntry({ bib: '099', point: 'F' });
      await openPhotoViewer(entry);

      expect(image.alt).toContain('099');
      expect(image.alt).toContain('Finish');
    });
  });
});
