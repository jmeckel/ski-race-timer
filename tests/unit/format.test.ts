/**
 * Unit Tests for Format Utilities
 * Tests: formatTime, formatDate, formatDuration, formatBib, escapeHtml,
 *        getPointColor, getPointLabel, debounce
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  debounce,
  escapeHtml,
  formatBib,
  formatDate,
  formatDuration,
  formatFileSize,
  formatTime,
  getPointColor,
  getPointLabel,
  truncate,
} from '../../src/utils/format';

describe('Format Utilities', () => {
  describe('formatTime', () => {
    it('should format time as HH:MM:SS.mmm', () => {
      const date = new Date('2024-01-15T14:30:45.123Z');
      // Note: formatTime uses local time
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('should pad single digits with zeros', () => {
      const date = new Date('2024-01-01T01:02:03.004Z');
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('should handle midnight correctly', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = formatTime(date);
      // Will be local time, but format should be valid
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('should handle end of day', () => {
      const date = new Date('2024-01-01T23:59:59.999Z');
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('should preserve millisecond precision', () => {
      const date = new Date('2024-01-01T12:00:00.001Z');
      const result = formatTime(date);
      expect(result).toContain('.001');
    });
  });

  describe('formatDate', () => {
    it('should format date in German locale by default', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = formatDate(date, 'de');
      expect(result).toContain('2024');
    });

    it('should format date in English locale', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = formatDate(date, 'en');
      expect(result).toContain('2024');
    });

    it('should use German locale when not specified', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = formatDate(date);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatDuration', () => {
    it('should format duration as MM:SS.cc', () => {
      const result = formatDuration(65123); // 1:05.12
      expect(result).toBe('01:05.12');
    });

    it('should handle zero duration', () => {
      const result = formatDuration(0);
      expect(result).toBe('00:00.00');
    });

    it('should handle negative duration', () => {
      const result = formatDuration(-1000);
      expect(result).toBe('--:--.--');
    });

    it('should handle exact seconds', () => {
      const result = formatDuration(60000); // 1:00.00
      expect(result).toBe('01:00.00');
    });

    it('should handle large durations', () => {
      const result = formatDuration(3600000); // 60:00.00
      expect(result).toBe('60:00.00');
    });

    it('should round centiseconds correctly', () => {
      const result = formatDuration(1234); // 0:01.23
      expect(result).toBe('00:01.23');
    });
  });

  describe('formatBib', () => {
    it('should pad bib with leading zeros', () => {
      expect(formatBib('1')).toBe('001');
      expect(formatBib('12')).toBe('012');
      expect(formatBib('123')).toBe('123');
    });

    it('should handle numeric input', () => {
      expect(formatBib(1)).toBe('001');
      expect(formatBib(42)).toBe('042');
    });

    it('should allow custom digit count', () => {
      expect(formatBib('1', 4)).toBe('0001');
      expect(formatBib('1', 2)).toBe('01');
    });

    it('should not truncate longer bibs', () => {
      expect(formatBib('1234', 3)).toBe('1234');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('should handle quotes', () => {
      // Note: browser's textContent/innerHTML doesn't escape quotes
      expect(escapeHtml('"quoted"')).toBe('"quoted"');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle numbers by converting to string', () => {
      expect(escapeHtml(123 as unknown as string)).toBe('123');
    });
  });

  describe('getPointColor', () => {
    it('should return start-color for Start', () => {
      expect(getPointColor('S')).toBe('var(--start-color)');
    });

    it('should return finish-color for Finish', () => {
      expect(getPointColor('F')).toBe('var(--finish-color)');
    });
  });

  describe('getPointLabel', () => {
    it('should return German labels by default', () => {
      expect(getPointLabel('S', 'de')).toBe('Start');
      expect(getPointLabel('F', 'de')).toBe('Ziel');
    });

    it('should return English labels', () => {
      expect(getPointLabel('S', 'en')).toBe('Start');
      expect(getPointLabel('F', 'en')).toBe('Finish');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings with ellipsis', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
    });

    it('should not modify strings shorter than maxLength', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should handle exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(2560)).toBe('2.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(1572864)).toBe('1.5 MB');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only execute once for rapid calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on each call', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the function', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});
