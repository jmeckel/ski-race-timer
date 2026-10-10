/**
 * Unit Tests for ingestion hardening of cloud/broadcast entries
 * Tests: isValidPhotoData, isValidEntry length/run caps, sanitizeEntry bounds
 */

import { describe, expect, it } from 'vitest';
import {
  isValidEntry,
  isValidPhotoData,
  MAX_PHOTO_LENGTH,
} from '../../../shared/validation';
import { sanitizeEntry } from '../../../src/utils/validation';

const baseEntry = {
  id: 'dev_abc-1700000000000-abcd1234',
  bib: '042',
  point: 'F',
  run: 1,
  timestamp: '2024-01-15T10:00:00.000Z',
  status: 'ok',
  deviceId: 'dev_abc',
  deviceName: 'Timer 1',
};

describe('isValidPhotoData', () => {
  it('accepts raw base64 and image data URLs', () => {
    expect(isValidPhotoData('/9j/4AAQSkZJRg==')).toBe(true);
    expect(isValidPhotoData('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('rejects non-base64, markers, other MIME types and oversized data', () => {
    expect(isValidPhotoData('not base64!')).toBe(false);
    expect(isValidPhotoData('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isValidPhotoData('A'.repeat(MAX_PHOTO_LENGTH + 1))).toBe(false);
    expect(isValidPhotoData('')).toBe(false);
  });
});

describe('isValidEntry ingestion caps', () => {
  it('rejects oversized ids and invalid runs', () => {
    expect(isValidEntry(baseEntry)).toBe(true);
    expect(isValidEntry({ ...baseEntry, id: 'x'.repeat(129) })).toBe(false);
    expect(isValidEntry({ ...baseEntry, run: 3 })).toBe(false);
    expect(isValidEntry({ ...baseEntry, run: undefined })).toBe(true);
  });
});

describe('sanitizeEntry', () => {
  it('truncates device fields and preserves GPS timing metadata', () => {
    const result = sanitizeEntry(
      {
        ...baseEntry,
        deviceId: 'd'.repeat(80),
        deviceName: 'n'.repeat(300),
        timeSource: 'gps',
        gpsTimestamp: 1700000000000,
      },
      '',
    );
    expect(result?.deviceId).toHaveLength(50);
    expect(result?.deviceName).toHaveLength(100);
    expect(result?.timeSource).toBe('gps');
    expect(result?.gpsTimestamp).toBe(1700000000000);
  });

  it('keeps the IndexedDB marker and valid base64 photos', () => {
    expect(sanitizeEntry({ ...baseEntry, photo: 'indexeddb' }, '')?.photo).toBe(
      'indexeddb',
    );
    expect(sanitizeEntry({ ...baseEntry, photo: '/9j/4AAQ' }, '')?.photo).toBe(
      '/9j/4AAQ',
    );
  });

  it('drops malformed photo data without dropping the entry', () => {
    const result = sanitizeEntry(
      { ...baseEntry, photo: '<script>alert(1)</script>' },
      '',
    );
    expect(result).not.toBeNull();
    expect(result?.photo).toBeUndefined();
  });
});
