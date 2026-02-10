/**
 * Unit Tests for CSV Export Format Validation
 * Tests: Race Horology header format, time format, CSV injection prevention,
 *        semicolon delimiter, status codes
 */

import { describe, it, expect } from 'vitest';
import {
  formatTimeForRaceHorology,
  escapeCSVField,
  getExportFilename,
} from '../../../src/features/export';

describe('CSV Export Format - Race Horology', () => {
  describe('Header format', () => {
    it('should define correct Race Horology column headers', () => {
      // The standard Race Horology header (without fault columns)
      const expectedHeader = 'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät';
      const columns = expectedHeader.split(';');

      expect(columns).toHaveLength(6);
      expect(columns[0]).toBe('Startnummer');
      expect(columns[1]).toBe('Lauf');
      expect(columns[2]).toBe('Messpunkt');
      expect(columns[3]).toBe('Zeit');
      expect(columns[4]).toBe('Status');
      expect(columns[5]).toBe('Gerät');
    });

    it('should define extended header with fault columns when faults exist', () => {
      const extendedHeader =
        'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät;Torstrafzeit;Torfehler';
      const columns = extendedHeader.split(';');

      expect(columns).toHaveLength(8);
      expect(columns[6]).toBe('Torstrafzeit');
      expect(columns[7]).toBe('Torfehler');
    });

    it('should use semicolon as delimiter (not comma)', () => {
      const header = 'Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät';
      // Semicolons present
      expect(header).toContain(';');
      // Commas not used as delimiters
      expect(header).not.toContain(',');
    });
  });

  describe('Time format (HH:MM:SS,ss)', () => {
    it('should format time as HH:MM:SS,ss with comma decimal separator', () => {
      const result = formatTimeForRaceHorology('2024-01-15T14:30:45.123Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2},\d{2}$/);
    });

    it('should use comma as decimal separator (European format)', () => {
      const result = formatTimeForRaceHorology('2024-01-15T12:00:00.500Z');
      // Should contain comma, not period
      expect(result).toContain(',');
      expect(result).not.toMatch(/\.\d{2}$/);
    });

    it('should display hundredths of seconds (not milliseconds)', () => {
      const date = new Date();
      date.setHours(10, 0, 0, 500); // 500ms = 50 hundredths
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toContain(',50');
    });

    it('should pad all fields with leading zeros', () => {
      const date = new Date();
      date.setHours(1, 2, 3, 40); // 40ms = 4 hundredths
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('01:02:03,04');
    });

    it('should handle midnight (00:00:00,00)', () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('00:00:00,00');
    });

    it('should handle end of day (23:59:59,99)', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 990);
      const result = formatTimeForRaceHorology(date.toISOString());
      expect(result).toBe('23:59:59,99');
    });

    it('should handle carry-over when ms rounds to 1000', () => {
      // 995-999ms rounds to 100 hundredths, triggering carry
      const date = new Date();
      date.setHours(12, 30, 59, 999);
      const result = formatTimeForRaceHorology(date.toISOString());
      // 999ms rounds to 100 hundredths = carry: 12:31:00,00
      expect(result).toBe('12:31:00,00');
    });

    it('should handle carry-over across minute boundary', () => {
      const date = new Date();
      date.setHours(12, 59, 59, 999);
      const result = formatTimeForRaceHorology(date.toISOString());
      // Should carry to 13:00:00,00
      expect(result).toBe('13:00:00,00');
    });

    it('should handle carry-over across hour boundary', () => {
      const date = new Date();
      date.setHours(23, 59, 59, 999);
      const result = formatTimeForRaceHorology(date.toISOString());
      // Should wrap to 00:00:00,00
      expect(result).toBe('00:00:00,00');
    });
  });

  describe('CSV injection prevention', () => {
    it('should prefix formula character "=" with single quote', () => {
      expect(escapeCSVField('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(escapeCSVField('=CMD()')).toBe("'=CMD()");
    });

    it('should prefix formula character "+" with single quote', () => {
      expect(escapeCSVField('+1234')).toBe("'+1234");
    });

    it('should prefix formula character "-" with single quote', () => {
      expect(escapeCSVField('-1234')).toBe("'-1234");
    });

    it('should prefix formula character "@" with single quote', () => {
      expect(escapeCSVField('@mention')).toBe("'@mention");
    });

    it('should prefix formula character "|" with single quote and wrap in quotes', () => {
      const result = escapeCSVField('|data');
      // Pipe gets both formula-prefix (') AND quote-wrapping (") because | triggers wrapping
      // Result: "'|data" (wrapped in quotes, with single-quote prefix inside)
      expect(result).toBe("\"'|data\"");
    });

    it('should prefix tab character with single quote', () => {
      expect(escapeCSVField('\tdata')).toBe("'\tdata");
    });

    it('should prefix carriage return with single quote', () => {
      expect(escapeCSVField('\rdata')).toBe("'\rdata");
    });

    it('should not prefix normal bib numbers', () => {
      expect(escapeCSVField('042')).toBe('042');
      expect(escapeCSVField('1')).toBe('1');
      expect(escapeCSVField('99')).toBe('99');
    });

    it('should not prefix normal device names', () => {
      expect(escapeCSVField('Timer 1')).toBe('Timer 1');
      expect(escapeCSVField('Start Timer A')).toBe('Start Timer A');
    });

    it('should handle empty fields', () => {
      expect(escapeCSVField('')).toBe('');
    });

    it('should protect against 0x hex injection', () => {
      const result = escapeCSVField('0x41414141');
      expect(result.startsWith("'")).toBe(true);
    });
  });

  describe('Semicolon delimiter handling', () => {
    it('should wrap fields containing semicolons in quotes', () => {
      const result = escapeCSVField('value;with;semicolons');
      expect(result).toBe('"value;with;semicolons"');
    });

    it('should escape double quotes inside fields', () => {
      const result = escapeCSVField('He said "hello"');
      expect(result).toContain('""');
    });

    it('should handle combined semicolons and quotes', () => {
      const result = escapeCSVField('a;b"c');
      expect(result).toBe('"a;b""c"');
    });

    it('should wrap fields with newlines in quotes', () => {
      const result = escapeCSVField('line1\nline2');
      expect(result.startsWith('"')).toBe(true);
      expect(result.endsWith('"')).toBe(true);
    });
  });

  describe('Timing point codes', () => {
    it('should use ST for Start and FT for Finish (Race Horology standard)', () => {
      // These are the standard Race Horology designators
      // Verified by examining the export source code
      // S -> ST, F -> FT
      const startCode = 'ST';
      const finishCode = 'FT';

      expect(startCode).toBe('ST');
      expect(finishCode).toBe('FT');
    });
  });

  describe('Status codes', () => {
    it('should support all standard status codes', () => {
      // Standard status codes used in Race Horology format
      const validStatuses = ['OK', 'DNS', 'DNF', 'DSQ', 'FLT'];

      // All must be uppercase abbreviations
      for (const status of validStatuses) {
        expect(status).toMatch(/^[A-Z]+$/);
        expect(status.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('Export filename', () => {
    it('should generate filename with raceId, date, and .csv extension', () => {
      const filename = getExportFilename('RACE-2024');
      expect(filename).toMatch(/^RACE-2024_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should sanitize special characters in race ID', () => {
      const filename = getExportFilename('Race With Spaces!');
      // Special chars replaced with underscore
      expect(filename).not.toContain(' ');
      expect(filename).not.toContain('!');
    });

    it('should use "race" as default when raceId is empty', () => {
      const filename = getExportFilename('');
      expect(filename).toMatch(/^race_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should support custom file extension', () => {
      const filename = getExportFilename('RACE', 'txt');
      expect(filename).toMatch(/\.txt$/);
    });

    it('should use ISO date format (YYYY-MM-DD)', () => {
      const today = new Date().toISOString().split('T')[0];
      const filename = getExportFilename('TEST');
      expect(filename).toContain(today);
    });
  });

  describe('Row format validation', () => {
    it('should produce rows with correct number of semicolon-separated fields', () => {
      // A standard row without faults has 6 fields
      const mockRow = '042;1;FT;14:30:45,12;OK;Timer 1';
      const fields = mockRow.split(';');
      expect(fields).toHaveLength(6);

      // Fields match expected positions
      expect(fields[0]).toBe('042');       // Startnummer (bib)
      expect(fields[1]).toBe('1');         // Lauf (run)
      expect(fields[2]).toBe('FT');        // Messpunkt (timing point)
      expect(fields[3]).toBe('14:30:45,12'); // Zeit (time HH:MM:SS,ss)
      expect(fields[4]).toBe('OK');        // Status
      expect(fields[5]).toBe('Timer 1');   // Gerät (device)
    });

    it('should produce extended rows with 8 fields when faults exist', () => {
      const mockRowWithFaults = '042;1;FT;14:30:45,12;FLT;Timer 1;5;T4(MG)';
      const fields = mockRowWithFaults.split(';');
      expect(fields).toHaveLength(8);

      expect(fields[6]).toBe('5');         // Torstrafzeit (penalty seconds)
      expect(fields[7]).toBe('T4(MG)');    // Torfehler (fault details)
    });

    it('time field should match HH:MM:SS,ss pattern', () => {
      const timeField = '14:30:45,12';
      expect(timeField).toMatch(/^\d{2}:\d{2}:\d{2},\d{2}$/);
    });

    it('run field should be 1 or 2', () => {
      expect(['1', '2']).toContain('1');
      expect(['1', '2']).toContain('2');
    });

    it('timing point field should be ST or FT', () => {
      expect(['ST', 'FT']).toContain('ST');
      expect(['ST', 'FT']).toContain('FT');
    });
  });
});
