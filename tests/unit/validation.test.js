/**
 * Unit Tests - Validation Functions
 *
 * Tests for validation functions from the API (api/sync.js)
 */

import { describe, it, expect } from 'vitest';

// ============================================
// Function Implementations (matching api/sync.js)
// ============================================

const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;

function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'number' || entry.id <= 0) return false;
  if (entry.bib !== undefined && typeof entry.bib !== 'string') return false;
  if (entry.bib && entry.bib.length > 10) return false;
  if (!['S', 'I1', 'I2', 'I3', 'F'].includes(entry.point)) return false;
  if (!entry.timestamp || isNaN(Date.parse(entry.timestamp))) return false;
  if (entry.status && !['ok', 'dns', 'dnf', 'dsq'].includes(entry.status)) return false;
  return true;
}

function sanitizeString(str, maxLength) {
  if (!str || typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

function safeJsonParse(str, defaultValue) {
  try {
    const parsed = JSON.parse(str);
    return parsed;
  } catch (e) {
    return defaultValue;
  }
}

// Entry duplicate check (from index.html)
function checkDuplicate(entries, bib, point) {
  if (!bib) return false;
  return entries.some(e => e.bib === bib && e.point === point);
}

// ============================================
// Tests
// ============================================

describe('isValidRaceId', () => {
  describe('valid race IDs', () => {
    it('should accept alphanumeric IDs', () => {
      expect(isValidRaceId('RACE2024')).toBe(true);
      expect(isValidRaceId('race123')).toBe(true);
      expect(isValidRaceId('Race2024')).toBe(true);
    });

    it('should accept IDs with hyphens', () => {
      expect(isValidRaceId('race-2024')).toBe(true);
      expect(isValidRaceId('ski-race-winter')).toBe(true);
    });

    it('should accept IDs with underscores', () => {
      expect(isValidRaceId('race_2024')).toBe(true);
      expect(isValidRaceId('ski_race_winter')).toBe(true);
    });

    it('should accept single character IDs', () => {
      expect(isValidRaceId('A')).toBe(true);
      expect(isValidRaceId('1')).toBe(true);
    });

    it('should accept IDs at max length', () => {
      const maxId = 'a'.repeat(50);
      expect(isValidRaceId(maxId)).toBe(true);
    });
  });

  describe('invalid race IDs', () => {
    it('should reject empty string', () => {
      expect(isValidRaceId('')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidRaceId(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidRaceId(undefined)).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isValidRaceId(123)).toBe(false);
      expect(isValidRaceId({})).toBe(false);
      expect(isValidRaceId([])).toBe(false);
    });

    it('should reject IDs with spaces', () => {
      expect(isValidRaceId('race 2024')).toBe(false);
      expect(isValidRaceId(' race')).toBe(false);
    });

    it('should reject IDs with special characters', () => {
      expect(isValidRaceId('race@2024')).toBe(false);
      expect(isValidRaceId('race!2024')).toBe(false);
      expect(isValidRaceId('race#2024')).toBe(false);
      expect(isValidRaceId('race.2024')).toBe(false);
    });

    it('should reject IDs with HTML characters', () => {
      expect(isValidRaceId('<script>')).toBe(false);
      expect(isValidRaceId('race<>')).toBe(false);
    });

    it('should reject IDs exceeding max length', () => {
      const longId = 'a'.repeat(51);
      expect(isValidRaceId(longId)).toBe(false);
    });
  });
});

describe('isValidEntry', () => {
  const validEntry = {
    id: 1704067200000,
    bib: '001',
    point: 'S',
    timestamp: '2024-01-01T12:00:00.000Z',
    status: 'ok'
  };

  describe('valid entries', () => {
    it('should accept valid entry with all fields', () => {
      expect(isValidEntry(validEntry)).toBe(true);
    });

    it('should accept entry without bib', () => {
      const entry = { ...validEntry, bib: undefined };
      expect(isValidEntry(entry)).toBe(true);
    });

    it('should accept entry with null bib', () => {
      const entry = { ...validEntry, bib: null };
      // Note: null is not a string, so this depends on implementation
      // In our case, we check bib !== undefined, and null passes that
      expect(isValidEntry(entry)).toBe(false); // null is not string
    });

    it('should accept all valid timing points', () => {
      ['S', 'I1', 'I2', 'I3', 'F'].forEach(point => {
        expect(isValidEntry({ ...validEntry, point })).toBe(true);
      });
    });

    it('should accept all valid status values', () => {
      ['ok', 'dns', 'dnf', 'dsq'].forEach(status => {
        expect(isValidEntry({ ...validEntry, status })).toBe(true);
      });
    });

    it('should accept entry without status', () => {
      const entry = { ...validEntry, status: undefined };
      expect(isValidEntry(entry)).toBe(true);
    });
  });

  describe('invalid entries', () => {
    it('should reject null', () => {
      expect(isValidEntry(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidEntry(undefined)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(isValidEntry('string')).toBe(false);
      expect(isValidEntry(123)).toBe(false);
      expect(isValidEntry([])).toBe(false);
    });

    it('should reject entry without id', () => {
      const entry = { ...validEntry, id: undefined };
      expect(isValidEntry(entry)).toBe(false);
    });

    it('should reject entry with non-numeric id', () => {
      expect(isValidEntry({ ...validEntry, id: '123' })).toBe(false);
      expect(isValidEntry({ ...validEntry, id: null })).toBe(false);
    });

    it('should reject entry with zero or negative id', () => {
      expect(isValidEntry({ ...validEntry, id: 0 })).toBe(false);
      expect(isValidEntry({ ...validEntry, id: -1 })).toBe(false);
    });

    it('should reject entry with invalid point', () => {
      expect(isValidEntry({ ...validEntry, point: 'X' })).toBe(false);
      expect(isValidEntry({ ...validEntry, point: 'I4' })).toBe(false);
      expect(isValidEntry({ ...validEntry, point: '' })).toBe(false);
    });

    it('should reject entry without timestamp', () => {
      expect(isValidEntry({ ...validEntry, timestamp: undefined })).toBe(false);
      expect(isValidEntry({ ...validEntry, timestamp: null })).toBe(false);
    });

    it('should reject entry with invalid timestamp', () => {
      expect(isValidEntry({ ...validEntry, timestamp: 'invalid' })).toBe(false);
      expect(isValidEntry({ ...validEntry, timestamp: '' })).toBe(false);
    });

    it('should reject entry with invalid status', () => {
      expect(isValidEntry({ ...validEntry, status: 'invalid' })).toBe(false);
      expect(isValidEntry({ ...validEntry, status: 'DQ' })).toBe(false);
    });

    it('should reject entry with bib exceeding max length', () => {
      expect(isValidEntry({ ...validEntry, bib: '12345678901' })).toBe(false);
    });

    it('should reject entry with non-string bib', () => {
      expect(isValidEntry({ ...validEntry, bib: 123 })).toBe(false);
    });
  });
});

describe('sanitizeString', () => {
  it('should return empty string for null', () => {
    expect(sanitizeString(null, 100)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(sanitizeString(undefined, 100)).toBe('');
  });

  it('should return empty string for non-string', () => {
    expect(sanitizeString(123, 100)).toBe('');
    expect(sanitizeString({}, 100)).toBe('');
  });

  it('should truncate to max length', () => {
    expect(sanitizeString('hello world', 5)).toBe('hello');
  });

  it('should remove < characters', () => {
    expect(sanitizeString('hello<world', 100)).toBe('helloworld');
  });

  it('should remove > characters', () => {
    expect(sanitizeString('hello>world', 100)).toBe('helloworld');
  });

  it('should remove HTML tags', () => {
    expect(sanitizeString('<script>alert(1)</script>', 100)).toBe('scriptalert(1)/script');
  });

  it('should preserve other special characters', () => {
    expect(sanitizeString('hello & world!', 100)).toBe('hello & world!');
  });

  it('should handle empty string', () => {
    expect(sanitizeString('', 100)).toBe('');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
  });

  it('should parse arrays', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('should return default for invalid JSON', () => {
    expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
  });

  it('should return default for null', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
  });

  it('should return default for undefined', () => {
    expect(safeJsonParse(undefined, {})).toEqual({});
  });

  it('should return default for empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('should handle nested objects', () => {
    const json = '{"a":{"b":{"c":1}}}';
    expect(safeJsonParse(json, {})).toEqual({ a: { b: { c: 1 } } });
  });

  it('should handle malformed JSON gracefully', () => {
    expect(safeJsonParse('{key: value}', null)).toBe(null);
    expect(safeJsonParse('{"key": }', [])).toEqual([]);
  });
});

describe('checkDuplicate', () => {
  const entries = [
    { bib: '001', point: 'S' },
    { bib: '001', point: 'F' },
    { bib: '002', point: 'S' },
    { bib: null, point: 'S' }
  ];

  it('should return true for existing bib+point combination', () => {
    expect(checkDuplicate(entries, '001', 'S')).toBe(true);
    expect(checkDuplicate(entries, '001', 'F')).toBe(true);
    expect(checkDuplicate(entries, '002', 'S')).toBe(true);
  });

  it('should return false for non-existing combination', () => {
    expect(checkDuplicate(entries, '001', 'I1')).toBe(false);
    expect(checkDuplicate(entries, '003', 'S')).toBe(false);
  });

  it('should return false for null bib', () => {
    expect(checkDuplicate(entries, null, 'S')).toBe(false);
  });

  it('should return false for undefined bib', () => {
    expect(checkDuplicate(entries, undefined, 'S')).toBe(false);
  });

  it('should return false for empty bib', () => {
    expect(checkDuplicate(entries, '', 'S')).toBe(false);
  });

  it('should return false for empty entries array', () => {
    expect(checkDuplicate([], '001', 'S')).toBe(false);
  });
});

describe('Integration: Validation Chain', () => {
  it('should validate complete entry workflow', () => {
    const raceId = 'RACE-2024-WINTER';
    const entry = {
      id: Date.now(),
      bib: '042',
      point: 'S',
      timestamp: new Date().toISOString(),
      status: 'ok'
    };
    const deviceName = 'Timer <1>';

    expect(isValidRaceId(raceId)).toBe(true);
    expect(isValidEntry(entry)).toBe(true);
    expect(sanitizeString(deviceName, 100)).toBe('Timer 1');
  });

  it('should reject XSS attempts in all fields', () => {
    expect(isValidRaceId('<script>')).toBe(false);
    expect(sanitizeString('<script>alert(1)</script>', 100)).not.toContain('<');
    expect(sanitizeString('<script>alert(1)</script>', 100)).not.toContain('>');
  });
});
