/**
 * Unit Tests for Export Feature Module
 * Tests: formatTimeForRaceHorology, escapeCSVField, getExportFilename
 */

import { describe, it, expect } from 'vitest';
import {
  formatTimeForRaceHorology,
  escapeCSVField,
  getExportFilename
} from '../../../src/features/export';

describe('Export Feature Module', () => {
  describe('formatTimeForRaceHorology', () => {
    it('should format time as HH:MM:SS,ss (European format)', () => {
      const isoTimestamp = '2024-01-15T14:30:45.123Z';
      const result = formatTimeForRaceHorology(isoTimestamp);
      // Should use comma as decimal separator and show hundredths
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2},\d{2}$/);
    });

    it('should convert milliseconds to hundredths correctly', () => {
      // 500ms = 50 hundredths
      const date = new Date();
      date.setHours(12, 30, 45, 500);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toContain(',50');
    });

    it('should pad single digit values with zeros', () => {
      const date = new Date();
      date.setHours(1, 2, 3, 40);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toMatch(/^01:02:03,04$/);
    });

    it('should handle midnight correctly', () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('00:00:00,00');
    });

    it('should handle end of day', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 990);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('23:59:59,99');
    });

    it('should round hundredths correctly', () => {
      // 125ms should round to 13 hundredths (Math.round(125/10) = 13)
      const date = new Date();
      date.setHours(12, 0, 0, 125);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('12:00:00,13');
    });
  });

  describe('escapeCSVField', () => {
    it('should return empty field unchanged', () => {
      expect(escapeCSVField('')).toBe('');
    });

    it('should return simple text unchanged', () => {
      expect(escapeCSVField('Hello')).toBe('Hello');
      expect(escapeCSVField('123')).toBe('123');
    });

    it('should prefix formula characters with single quote (CSV injection prevention)', () => {
      expect(escapeCSVField('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(escapeCSVField('+1234')).toBe("'+1234");
      expect(escapeCSVField('-1234')).toBe("'-1234");
      expect(escapeCSVField('@mention')).toBe("'@mention");
    });

    it('should handle tab and newline formula characters', () => {
      // Tab and carriage return are formula chars but don't trigger quote wrapping
      expect(escapeCSVField('\tdata')).toBe("'\tdata");
      expect(escapeCSVField('\rdata')).toBe("'\rdata");
      // Newline triggers both prefix AND quote wrapping
      expect(escapeCSVField('\ndata')).toBe("\"'\ndata\"");
    });

    it('should escape double quotes by doubling them', () => {
      const result = escapeCSVField('He said "hello"');
      expect(result).toContain('""');
    });

    it('should wrap fields with semicolons in quotes', () => {
      const result = escapeCSVField('a;b');
      expect(result).toBe('"a;b"');
    });

    it('should wrap fields with newlines in quotes', () => {
      const result = escapeCSVField('line1\nline2');
      // Should be wrapped in quotes
      expect(result.startsWith('"')).toBe(true);
      expect(result.endsWith('"')).toBe(true);
      expect(result).toBe('"line1\nline2"');
    });

    it('should handle combined special characters', () => {
      // Quote and semicolon
      const result = escapeCSVField('a;b"c');
      expect(result).toBe('"a;b""c"');
    });
  });

  describe('getExportFilename', () => {
    it('should generate filename with race ID and date', () => {
      const result = getExportFilename('TEST-RACE');
      expect(result).toMatch(/^TEST-RACE_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should use custom extension', () => {
      const result = getExportFilename('RACE-001', 'txt');
      expect(result).toMatch(/^RACE-001_\d{4}-\d{2}-\d{2}\.txt$/);
    });

    it('should sanitize race ID (replace special chars with underscore)', () => {
      const result = getExportFilename('Race With Spaces!@#');
      expect(result).toMatch(/^Race_With_Spaces___/);
    });

    it('should use "race" as default for empty race ID', () => {
      const result = getExportFilename('');
      expect(result).toMatch(/^race_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should include current date in ISO format', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = getExportFilename('RACE');
      expect(result).toContain(today);
    });
  });
});
