/**
 * Unit Tests for Photo Helpers
 * Tests: isPhotoMarker, hasFullPhotoData
 */

import { describe, expect, it } from 'vitest';
import {
  hasFullPhotoData,
  isPhotoMarker,
} from '../../../src/utils/photoHelpers';

describe('isPhotoMarker', () => {
  it('returns true for "indexeddb"', () => {
    expect(isPhotoMarker('indexeddb')).toBe(true);
  });

  it('returns false for other strings', () => {
    expect(isPhotoMarker('other')).toBe(false);
    expect(isPhotoMarker('IndexedDB')).toBe(false);
    expect(isPhotoMarker('INDEXEDDB')).toBe(false);
    expect(isPhotoMarker('indexeddb ')).toBe(false);
    expect(isPhotoMarker(' indexeddb')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPhotoMarker(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPhotoMarker(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPhotoMarker('')).toBe(false);
  });

  it('returns false for a long base64 string', () => {
    expect(isPhotoMarker('data:image/jpeg;base64,/9j/4AAQ')).toBe(false);
  });
});

describe('hasFullPhotoData', () => {
  it('returns true for a long base64 string', () => {
    const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
    expect(base64.length).toBeGreaterThan(20);
    expect(hasFullPhotoData(base64)).toBe(true);
  });

  it('returns false for "indexeddb" marker', () => {
    expect(hasFullPhotoData('indexeddb')).toBe(false);
  });

  it('returns false for short strings', () => {
    expect(hasFullPhotoData('abc')).toBe(false);
    expect(hasFullPhotoData('short')).toBe(false);
    expect(hasFullPhotoData('x')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasFullPhotoData(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasFullPhotoData(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasFullPhotoData('')).toBe(false);
  });

  it('returns false for a string of exactly 20 characters', () => {
    const exactly20 = 'a'.repeat(20);
    expect(exactly20.length).toBe(20);
    expect(hasFullPhotoData(exactly20)).toBe(false);
  });

  it('returns true for a string of 21 characters', () => {
    const chars21 = 'a'.repeat(21);
    expect(chars21.length).toBe(21);
    expect(hasFullPhotoData(chars21)).toBe(true);
  });

  it('returns false for "indexeddb" even though it is a non-empty string', () => {
    // "indexeddb" is 9 chars (< 20) and is the marker — both conditions reject it
    expect(hasFullPhotoData('indexeddb')).toBe(false);
  });

  it('returns true for a long non-marker string', () => {
    const longString = 'this-is-not-a-marker-but-is-long-enough';
    expect(longString.length).toBeGreaterThan(20);
    expect(hasFullPhotoData(longString)).toBe(true);
  });
});
