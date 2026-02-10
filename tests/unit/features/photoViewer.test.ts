/**
 * Unit Tests for Photo Viewer Feature Module
 * Tests: openPhotoViewer, closePhotoViewer, deletePhoto, getCurrentPhotoEntryId
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  formatTime: vi.fn((date: Date) => '12:00:00.000'),
  getPointColor: vi.fn((point: string) => (point === 'S' ? '#f97316' : '#10b981')),
  getPointLabel: vi.fn((point: string, lang: string) => (point === 'S' ? 'Start' : 'Finish')),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

import {
  openPhotoViewer,
  closePhotoViewer,
  deletePhoto,
  getCurrentPhotoEntryId,
} from '../../../src/features/photoViewer';
import { showToast } from '../../../src/components';
import { feedbackDelete, photoStorage } from '../../../src/services';
import { store } from '../../../src/store';
import { openModal, closeModal } from '../../../src/features/modals';
import { logger } from '../../../src/utils/logger';
import type { Entry } from '../../../src/types';

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

    // Create modal DOM structure
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
  });

  describe('openPhotoViewer', () => {
    it('should open modal with entry photo data', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      expect(openModal).toHaveBeenCalledWith(modal);
    });

    it('should set image src from inline base64 photo', async () => {
      const entry = createMockEntry({ photo: 'abc123' });
      await openPhotoViewer(entry);

      expect(image.src).toContain('data:image/jpeg;base64,abc123');
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
      // jsdom may normalize hex to rgb, so check that color was set
      expect(pointEl.style.background).toBeTruthy();
    });

    it('should set time text', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      expect(timeEl.textContent).toBe('12:00:00.000');
    });

    it('should load photo from IndexedDB when photo is "indexeddb"', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue('indexeddbphoto');

      const entry = createMockEntry({ photo: 'indexeddb' });
      await openPhotoViewer(entry);

      expect(photoStorage.getPhoto).toHaveBeenCalledWith('entry-1');
      expect(image.src).toContain('data:image/jpeg;base64,indexeddbphoto');
    });

    it('should warn and return when IndexedDB photo not found', async () => {
      vi.mocked(photoStorage.getPhoto).mockResolvedValue(null);

      const entry = createMockEntry({ photo: 'indexeddb' });
      await openPhotoViewer(entry);

      expect(logger.warn).toHaveBeenCalled();
      // Modal should NOT be opened since photo not found
      expect(openModal).not.toHaveBeenCalled();
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

  describe('closePhotoViewer', () => {
    it('should close the modal', () => {
      closePhotoViewer();
      expect(closeModal).toHaveBeenCalled();
    });

    it('should reset current photo entry ID', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);
      expect(getCurrentPhotoEntryId()).toBe('entry-1');

      closePhotoViewer();
      expect(getCurrentPhotoEntryId()).toBeNull();
    });
  });

  describe('deletePhoto', () => {
    it('should delete photo from IndexedDB and update entry', async () => {
      // First open the viewer to set the current photo entry ID
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(photoStorage.deletePhoto).toHaveBeenCalledWith('entry-1');
      expect(store.updateEntry).toHaveBeenCalledWith('entry-1', {
        photo: undefined,
      });
    });

    it('should close modal and show toast after deletion', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(closeModal).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('photoDeleted', 'success');
    });

    it('should trigger delete feedback', async () => {
      const entry = createMockEntry();
      await openPhotoViewer(entry);

      await deletePhoto();

      expect(feedbackDelete).toHaveBeenCalled();
    });

    it('should do nothing if no current photo entry', async () => {
      // Don't open viewer first
      closePhotoViewer(); // Ensure null state

      await deletePhoto();

      expect(photoStorage.deletePhoto).not.toHaveBeenCalled();
      expect(store.updateEntry).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentPhotoEntryId', () => {
    it('should return null initially', () => {
      closePhotoViewer(); // Reset state
      expect(getCurrentPhotoEntryId()).toBeNull();
    });

    it('should return entry ID after opening viewer', async () => {
      const entry = createMockEntry({ id: 'test-entry-123' });
      await openPhotoViewer(entry);

      expect(getCurrentPhotoEntryId()).toBe('test-entry-123');
    });
  });
});
