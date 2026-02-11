/**
 * Unit Tests for format utilities
 * Tests: getLocale, getPointLabel, getRunLabel for all languages
 */

import { describe, expect, it } from 'vitest';
import {
  getLocale,
  getPointLabel,
  getRunLabel,
} from '../../../src/utils/format';

describe('getLocale', () => {
  it('should return en-US for English', () => {
    expect(getLocale('en')).toBe('en-US');
  });

  it('should return de-DE for German', () => {
    expect(getLocale('de')).toBe('de-DE');
  });

  it('should return fr-FR for French', () => {
    expect(getLocale('fr')).toBe('fr-FR');
  });
});

describe('getPointLabel', () => {
  it('should return Start/Finish for English', () => {
    expect(getPointLabel('S', 'en')).toBe('Start');
    expect(getPointLabel('F', 'en')).toBe('Finish');
  });

  it('should return Start/Ziel for German', () => {
    expect(getPointLabel('S', 'de')).toBe('Start');
    expect(getPointLabel('F', 'de')).toBe('Ziel');
  });

  it('should return Départ/Arrivée for French', () => {
    expect(getPointLabel('S', 'fr')).toBe('Départ');
    expect(getPointLabel('F', 'fr')).toBe('Arrivée');
  });
});

describe('getRunLabel', () => {
  it('should return R1/R2 for English', () => {
    expect(getRunLabel(1, 'en')).toBe('R1');
    expect(getRunLabel(2, 'en')).toBe('R2');
  });

  it('should return L1/L2 for German', () => {
    expect(getRunLabel(1, 'de')).toBe('L1');
    expect(getRunLabel(2, 'de')).toBe('L2');
  });

  it('should return M1/M2 for French', () => {
    expect(getRunLabel(1, 'fr')).toBe('M1');
    expect(getRunLabel(2, 'fr')).toBe('M2');
  });
});
