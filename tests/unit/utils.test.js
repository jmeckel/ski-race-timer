/**
 * Unit Tests - Utility Functions
 *
 * Tests for utility functions from the Ski Race Timer application.
 * Functions are reimplemented here to match the inline code in index.html.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorageMock } from '../setup.js';

// ============================================
// Function Implementations (matching index.html)
// ============================================

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatTime(date) {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function formatDate(date, lang = 'en') {
  return new Date(date).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (ms < 0) return '--:--.--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

let entryIdCounter = 0;
function generateEntryId() {
  entryIdCounter++;
  const timestamp = Date.now();
  return timestamp * 1000 + (entryIdCounter % 1000);
}

function generateDeviceId() {
  const id = 'dev_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('skiTimerDeviceId', id);
  return id;
}

function getPointColor(point) {
  const colors = { S: 'var(--success)', F: 'var(--secondary)' };
  return colors[point] || 'var(--text-secondary)';
}

const translations = {
  en: { timer: 'Timer', results: 'Results', settings: 'Settings' },
  de: { timer: 'Timer', results: 'Ergebnisse', settings: 'Einstellungen' },
};

function t(key, lang = 'en') {
  return translations[lang][key] || key;
}

// ============================================
// Tests
// ============================================

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('"quoted"');
  });

  it('should handle null input', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined input', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should convert numbers to strings', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should preserve safe characters', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('formatTime', () => {
  it('should format time as HH:MM:SS.mmm', () => {
    const date = new Date('2024-01-15T10:30:45.123');
    expect(formatTime(date)).toBe('10:30:45.123');
  });

  it('should pad single digits with zeros', () => {
    const date = new Date('2024-01-15T01:02:03.004');
    expect(formatTime(date)).toBe('01:02:03.004');
  });

  it('should handle midnight', () => {
    const date = new Date('2024-01-15T00:00:00.000');
    expect(formatTime(date)).toBe('00:00:00.000');
  });

  it('should handle 23:59:59.999', () => {
    const date = new Date('2024-01-15T23:59:59.999');
    expect(formatTime(date)).toBe('23:59:59.999');
  });

  it('should handle ISO string input', () => {
    const result = formatTime('2024-01-15T12:00:00.500Z');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('should handle timestamp number input', () => {
    const timestamp = new Date('2024-01-15T12:00:00.000').getTime();
    const result = formatTime(timestamp);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

describe('formatDate', () => {
  it('should format date in English locale', () => {
    const date = new Date('2024-01-15T10:30:00');
    const result = formatDate(date, 'en');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('should format date in German locale', () => {
    const date = new Date('2024-01-15T10:30:00');
    const result = formatDate(date, 'de');
    expect(result).toContain('15');
  });

  it('should include time', () => {
    const date = new Date('2024-01-15T10:30:00');
    const result = formatDate(date, 'en');
    expect(result).toMatch(/10.*30|10:30/);
  });
});

describe('formatDuration', () => {
  it('should format milliseconds as MM:SS.cc', () => {
    expect(formatDuration(65230)).toBe('01:05.23');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('00:00.00');
  });

  it('should handle negative values', () => {
    expect(formatDuration(-100)).toBe('--:--.--');
  });

  it('should handle exact minutes', () => {
    expect(formatDuration(120000)).toBe('02:00.00');
  });

  it('should handle large values', () => {
    expect(formatDuration(599999)).toBe('09:59.99');
  });

  it('should round centiseconds correctly', () => {
    expect(formatDuration(1555)).toBe('00:01.55');
  });
});

describe('generateEntryId', () => {
  it('should return a number', () => {
    const id = generateEntryId();
    expect(typeof id).toBe('number');
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateEntryId());
    }
    expect(ids.size).toBe(1000);
  });

  it('should be based on timestamp', () => {
    const before = Date.now() * 1000;
    const id = generateEntryId();
    const after = (Date.now() + 1) * 1000;
    expect(id).toBeGreaterThan(before);
    expect(id).toBeLessThan(after + 1000);
  });
});

describe('generateDeviceId', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should generate ID starting with dev_', () => {
    const id = generateDeviceId();
    expect(id).toMatch(/^dev_[a-z0-9]+$/);
  });

  it('should store ID in localStorage', () => {
    const id = generateDeviceId();
    expect(localStorage.setItem).toHaveBeenCalledWith('skiTimerDeviceId', id);
  });

  it('should generate different IDs each time', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();
    expect(id1).not.toBe(id2);
  });
});

describe('getPointColor', () => {
  it('should return success color for Start', () => {
    expect(getPointColor('S')).toBe('var(--success)');
  });

  it('should return secondary color for Finish', () => {
    expect(getPointColor('F')).toBe('var(--secondary)');
  });

  it('should return default for unknown points', () => {
    expect(getPointColor('X')).toBe('var(--text-secondary)');
  });
});

describe('t (translation helper)', () => {
  it('should return English translation', () => {
    expect(t('timer', 'en')).toBe('Timer');
    expect(t('results', 'en')).toBe('Results');
    expect(t('settings', 'en')).toBe('Settings');
  });

  it('should return German translation', () => {
    expect(t('results', 'de')).toBe('Ergebnisse');
    expect(t('settings', 'de')).toBe('Einstellungen');
  });

  it('should return key if translation not found', () => {
    expect(t('unknownKey', 'en')).toBe('unknownKey');
  });
});

describe('Edge Cases', () => {
  it('should handle special characters in escapeHtml', () => {
    expect(escapeHtml('Test < > & " \' `')).toContain('&lt;');
    expect(escapeHtml('Test < > & " \' `')).toContain('&gt;');
    expect(escapeHtml('Test < > & " \' `')).toContain('&amp;');
  });

  it('should handle invalid date in formatTime', () => {
    const result = formatTime('invalid');
    expect(result).toBe('NaN:NaN:NaN.NaN');
  });

  it('should handle very large durations', () => {
    // 100 minutes
    expect(formatDuration(6000000)).toBe('100:00.00');
  });
});
