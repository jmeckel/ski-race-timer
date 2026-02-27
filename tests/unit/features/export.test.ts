/**
 * Core Unit Tests for Export Module
 * Tests pure functions: escapeCSVField, formatTimeForRaceHorology,
 * formatDateForExport, getExportFilename
 */

import { describe, expect, it } from 'vitest';
import {
  escapeCSVField,
  formatDateForExport,
  formatTimeForRaceHorology,
  getExportFilename,
} from '../../../src/features/export';

// ---------------------------------------------------------------------------
// escapeCSVField
// ---------------------------------------------------------------------------
describe('escapeCSVField', () => {
  describe('basic values', () => {
    it('should return empty string unchanged', () => {
      expect(escapeCSVField('')).toBe('');
    });

    it('should return simple text unchanged', () => {
      expect(escapeCSVField('Hello')).toBe('Hello');
      expect(escapeCSVField('OK')).toBe('OK');
      expect(escapeCSVField('123')).toBe('123');
    });

    it('should not alter normal bib numbers', () => {
      expect(escapeCSVField('042')).toBe('042');
      expect(escapeCSVField('1')).toBe('1');
      expect(escapeCSVField('99')).toBe('99');
    });

    it('should not alter normal device names', () => {
      expect(escapeCSVField('Timer 1')).toBe('Timer 1');
      expect(escapeCSVField('Start Timer A')).toBe('Start Timer A');
    });

    it('should handle very long field without corruption', () => {
      const longField = 'A'.repeat(10000);
      const result = escapeCSVField(longField);
      expect(result).toBe(longField);
      expect(result.length).toBe(10000);
    });
  });

  describe('formula injection prevention', () => {
    it('should prefix "=" and wrap in quotes', () => {
      expect(escapeCSVField('=SUM(A1)')).toBe('"\'=SUM(A1)"');
      expect(escapeCSVField('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
      expect(escapeCSVField('=CMD()')).toBe('"\'=CMD()"');
    });

    it('should prefix "+" and wrap in quotes', () => {
      expect(escapeCSVField('+1234')).toBe('"\'+1234"');
      expect(escapeCSVField('+cmd')).toBe('"\'+cmd"');
    });

    it('should prefix "-" and wrap in quotes', () => {
      expect(escapeCSVField('-1234')).toBe('"\'-1234"');
      expect(escapeCSVField('-1+2')).toBe('"\'-1+2"');
    });

    it('should prefix "@" and wrap in quotes', () => {
      expect(escapeCSVField('@mention')).toBe('"\'@mention"');
      expect(escapeCSVField('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    });

    it('should prefix "|" and wrap in quotes', () => {
      expect(escapeCSVField('|data')).toBe('"\'|data"');
      expect(escapeCSVField('|cmd')).toBe('"\'|cmd"');
    });

    it('should prefix tab character and wrap in quotes', () => {
      expect(escapeCSVField('\tdata')).toBe('"\'\tdata"');
      expect(escapeCSVField('\t=cmd')).toContain("'");
    });

    it('should prefix carriage return and wrap in quotes', () => {
      expect(escapeCSVField('\rdata')).toBe('"\'\rdata"');
    });

    it('should prefix newline and wrap in quotes', () => {
      expect(escapeCSVField('\ndata')).toBe('"\'\ndata"');
    });

    it('should protect against 0x hex injection', () => {
      expect(escapeCSVField('0x41414141')).toBe('"\'0x41414141"');
      expect(escapeCSVField('0xFF')).toBe('"\'0xFF"');
    });

    it('should prefix +0xFF only once (no double prefix)', () => {
      // + triggers formula prefix, then hex check tests the prefixed string
      // which starts with ' so hex regex doesn't match
      expect(escapeCSVField('+0xFF')).toBe('"\'+0xFF"');
    });
  });

  describe('special characters (semicolons, quotes, newlines)', () => {
    it('should wrap fields with semicolons in quotes', () => {
      expect(escapeCSVField('a;b')).toBe('"a;b"');
      expect(escapeCSVField('value;with;semicolons')).toBe(
        '"value;with;semicolons"',
      );
    });

    it('should handle field with only semicolons', () => {
      expect(escapeCSVField(';;;')).toBe('";;;"');
    });

    it('should escape double quotes by doubling them and wrap', () => {
      expect(escapeCSVField('He said "hello"')).toBe('"He said ""hello"""');
    });

    it('should handle field that is only double-quote characters', () => {
      expect(escapeCSVField('"')).toBe('""""');
      expect(escapeCSVField('""')).toBe('""""""');
    });

    it('should wrap fields with newlines in quotes', () => {
      expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle combined semicolons, quotes, and newlines', () => {
      const result = escapeCSVField('a;b"c\nd');
      expect(result).toContain('""'); // escaped quote
      expect(result.startsWith('"')).toBe(true);
      expect(result.endsWith('"')).toBe(true);
    });

    it('should handle combined quote and semicolon', () => {
      expect(escapeCSVField('a;b"c')).toBe('"a;b""c"');
    });
  });
});

// ---------------------------------------------------------------------------
// formatTimeForRaceHorology
// ---------------------------------------------------------------------------
describe('formatTimeForRaceHorology', () => {
  describe('basic formatting', () => {
    it('should format time as HH:MM:SS,ss (European format)', () => {
      const { time } = formatTimeForRaceHorology('2024-01-15T14:30:45.123Z');
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2},\d{2}$/);
    });

    it('should use comma as decimal separator, not period', () => {
      const { time } = formatTimeForRaceHorology('2024-01-15T12:00:00.500Z');
      expect(time).toContain(',');
      expect(time).not.toMatch(/\.\d{2}$/);
    });

    it('should convert 500ms to 50 hundredths', () => {
      const date = new Date();
      date.setHours(12, 30, 45, 500);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toContain(',50');
    });

    it('should pad single digit values with zeros', () => {
      const date = new Date();
      date.setHours(1, 2, 3, 40);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('01:02:03,04');
    });

    it('should round 125ms to 13 hundredths', () => {
      const date = new Date();
      date.setHours(12, 0, 0, 125);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('12:00:00,13');
    });

    it('should round 5ms to 1 hundredth', () => {
      const date = new Date();
      date.setHours(10, 0, 0, 5);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('10:00:00,01');
    });

    it('should round 1ms to 0 hundredths', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 1);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('23:59:59,00');
    });
  });

  describe('boundary conditions', () => {
    it('should handle midnight (00:00:00,00) without dateRollover', () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('00:00:00,00');
      expect(dateRollover).toBe(false);
    });

    it('should handle end of day (23:59:59,99)', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 990);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('23:59:59,99');
    });

    it('should NOT signal dateRollover for normal times', () => {
      const date = new Date();
      date.setHours(12, 30, 0, 0);
      const { dateRollover } = formatTimeForRaceHorology(date.toISOString());
      expect(dateRollover).toBe(false);
    });

    it('should NOT carry at 994ms (rounds to 99, not 100)', () => {
      const date = new Date();
      date.setHours(10, 20, 30, 994);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('10:20:30,99');
      expect(dateRollover).toBe(false);
    });

    it('should NOT signal dateRollover at 23:59:59.994', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 994);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('23:59:59,99');
      expect(dateRollover).toBe(false);
    });
  });

  describe('carry-over when ms rounds to 100 hundredths', () => {
    it('should carry 995ms to next second', () => {
      const date = new Date();
      date.setHours(10, 20, 30, 995);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('10:20:31,00');
      expect(dateRollover).toBe(false);
    });

    it('should carry across second boundary (12:30:59.999)', () => {
      const date = new Date();
      date.setHours(12, 30, 59, 999);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('12:31:00,00');
    });

    it('should carry across minute boundary (12:59:59.999)', () => {
      const date = new Date();
      date.setHours(12, 59, 59, 999);
      const { time } = formatTimeForRaceHorology(date.toISOString());
      expect(time).toBe('13:00:00,00');
    });

    it('should cascade carry from seconds to minutes to hours (10:59:59.995)', () => {
      const date = new Date();
      date.setHours(10, 59, 59, 995);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('11:00:00,00');
      expect(dateRollover).toBe(false);
    });

    it('should wrap 23:59:59.995+ to 00:00:00,00 with dateRollover', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 995);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('00:00:00,00');
      expect(dateRollover).toBe(true);
    });

    it('should wrap 23:59:59.999 to 00:00:00,00 with dateRollover', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 999);
      const { time, dateRollover } = formatTimeForRaceHorology(
        date.toISOString(),
      );
      expect(time).toBe('00:00:00,00');
      expect(dateRollover).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// formatDateForExport
// ---------------------------------------------------------------------------
describe('formatDateForExport', () => {
  describe('basic formatting', () => {
    it('should format date as YYYY-MM-DD', () => {
      const result = formatDateForExport('2024-01-15T14:30:45.123Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle first day of year', () => {
      const date = new Date(2024, 0, 1, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-01-01');
    });

    it('should handle last day of year', () => {
      const date = new Date(2024, 11, 31, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-12-31');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date(2024, 2, 5, 12, 0, 0); // March 5
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-03-05');
    });

    it('should handle leap year Feb 29', () => {
      const date = new Date(2024, 1, 29, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2024-02-29');
    });

    it('should handle century leap year Feb 29 (year 2000)', () => {
      const date = new Date(2000, 1, 29, 12, 0, 0);
      const result = formatDateForExport(date.toISOString());
      expect(result).toBe('2000-02-29');
    });
  });

  describe('dateRollover advancement', () => {
    it('should advance date by one day when dateRollover is true', () => {
      const result = formatDateForExport('2024-01-15T23:59:59.999Z', true);
      const date = new Date('2024-01-15T23:59:59.999Z');
      date.setDate(date.getDate() + 1);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });

    it('should not advance date when dateRollover is false', () => {
      const date = new Date(2024, 0, 15, 12, 0, 0);
      const result = formatDateForExport(date.toISOString(), false);
      expect(result).toBe('2024-01-15');
    });

    it('should handle month boundary rollover (Jan 31 -> Feb 1)', () => {
      const date = new Date(2024, 0, 31, 23, 59, 59);
      const result = formatDateForExport(date.toISOString(), true);
      expect(result).toBe('2024-02-01');
    });

    it('should handle year boundary rollover (Dec 31 -> Jan 1)', () => {
      const date = new Date(2024, 11, 31, 23, 59, 59);
      const result = formatDateForExport(date.toISOString(), true);
      expect(result).toBe('2025-01-01');
    });
  });
});

// ---------------------------------------------------------------------------
// getExportFilename
// ---------------------------------------------------------------------------
describe('getExportFilename', () => {
  it('should generate filename with race ID, date, and .csv extension', () => {
    const result = getExportFilename('RACE-2024');
    expect(result).toMatch(/^RACE-2024_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('should include current date in ISO format', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = getExportFilename('RACE');
    expect(result).toContain(today);
  });

  it('should sanitize special characters to underscores', () => {
    const result = getExportFilename('Race With Spaces!@#');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('!');
    expect(result).not.toContain('@');
    expect(result).not.toContain('#');
    expect(result).toMatch(/^Race_With_Spaces___/);
  });

  it('should preserve hyphens and underscores', () => {
    const result = getExportFilename('SL-2024_Final');
    expect(result).toMatch(/^SL-2024_Final_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('should use "race" as default for empty race ID', () => {
    const result = getExportFilename('');
    expect(result).toMatch(/^race_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('should use custom extension', () => {
    const result = getExportFilename('RACE-001', 'txt');
    expect(result).toMatch(/^RACE-001_\d{4}-\d{2}-\d{2}\.txt$/);
  });

  it('should default to csv extension', () => {
    const result = getExportFilename('RACE');
    expect(result).toMatch(/\.csv$/);
  });

  it('should keep underscores for all-special-char race ID (no "race" fallback)', () => {
    const result = getExportFilename('!!!');
    expect(result).toMatch(/^___/);
  });

  it('should handle extension containing dots', () => {
    const result = getExportFilename('RACE', 'tar.gz');
    expect(result).toMatch(/\.tar\.gz$/);
  });

  it('should handle single character race ID', () => {
    const result = getExportFilename('R');
    expect(result).toMatch(/^R_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

// ---------------------------------------------------------------------------
// Source-code assertions (things that cannot be tested via function calls)
// ---------------------------------------------------------------------------
describe('source-code assertions', () => {
  it('should prepend UTF-8 BOM in export source code for Windows Excel compatibility', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../../src/features/export.ts'),
      'utf-8',
    );
    expect(source).toContain("'\\uFEFF'");
  });
});
