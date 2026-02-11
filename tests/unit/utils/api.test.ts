/**
 * Unit Tests for API Client (src/utils/api.ts)
 * Tests all exported API functions: fetchRaces, deleteRace, checkRaceExists,
 * getPinStatus, changePin, exchangeToken, fetchTodaysRaces, clearAuthToken
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the auth service before importing the module under test
vi.mock('../../../src/services/auth', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
  getAuthToken: vi.fn(() => 'test-token'),
  hasAuthToken: vi.fn(() => true),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

// Mock the errors module
vi.mock('../../../src/utils/errors', () => ({
  fetchWithTimeout: vi.fn(),
  logError: vi.fn(),
}));

// Mock the recentRaces module
vi.mock('../../../src/utils/recentRaces', () => ({
  addRecentRace: vi.fn(),
  getTodaysRecentRaces: vi.fn(() => []),
}));

import {
  hasAuthToken as authHasAuthToken,
  setAuthToken,
} from '../../../src/services/auth';
import {
  changePin,
  checkRaceExists,
  clearAuthToken,
  deleteRace,
  exchangeToken,
  fetchRaces,
  fetchTodaysRaces,
  getAuthToken,
  getPinStatus,
  hasAuthToken,
} from '../../../src/utils/api';
import { fetchWithTimeout, logError } from '../../../src/utils/errors';
import {
  addRecentRace,
  getTodaysRecentRaces,
} from '../../../src/utils/recentRaces';

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

// Helper to create a mock Response
function mockResponse(data: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Re-exports ───

  describe('Re-exports', () => {
    it('should re-export hasAuthToken', () => {
      expect(typeof hasAuthToken).toBe('function');
    });

    it('should re-export getAuthToken', () => {
      expect(typeof getAuthToken).toBe('function');
    });

    it('should re-export clearAuthToken', () => {
      expect(typeof clearAuthToken).toBe('function');
    });
  });

  // ─── fetchRaces ───

  describe('fetchRaces', () => {
    it('should fetch races with auth headers', async () => {
      const racesData = { races: [{ raceId: 'RACE-001', entryCount: 10 }] };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(racesData));

      const result = await fetchRaces();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(racesData);
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/admin/races',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        }),
        5000, // SHORT_TIMEOUT
      );
    });

    it('should return error on 401 response', async () => {
      const errorData = { error: 'Token expired', expired: true };
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse(errorData, 401, false),
      );

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.expired).toBe(true);
      expect(result.error).toBe('Token expired');
    });

    it('should return error on 429 rate limiting', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({}, 429, false));

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(429);
      expect(result.error).toBe('Too many requests. Please try again later.');
    });

    it('should return error on generic server error', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Server error' }, 500, false),
      );

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
      expect(result.error).toBe('Server error');
    });

    it('should return default error message when response has no error field', async () => {
      const resp = mockResponse({}, 500, false);
      mockFetchWithTimeout.mockResolvedValue(resp);

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Request failed with status 500');
    });

    it('should handle network errors', async () => {
      mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetchWithTimeout.mockRejectedValue('unknown failure');

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle JSON parse failure on 401', async () => {
      const resp = {
        ok: false,
        status: 401,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
        headers: new Headers(),
      } as unknown as Response;
      mockFetchWithTimeout.mockResolvedValue(resp);

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle JSON parse failure on other errors', async () => {
      const resp = {
        ok: false,
        status: 503,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
        headers: new Headers(),
      } as unknown as Response;
      mockFetchWithTimeout.mockResolvedValue(resp);

      const result = await fetchRaces();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Request failed with status 503');
    });
  });

  // ─── deleteRace ───

  describe('deleteRace', () => {
    it('should delete race with correct URL and auth', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({ success: true }));

      const result = await deleteRace('RACE-001');

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/admin/races?raceId=RACE-001',
        expect.objectContaining({ method: 'DELETE' }),
        10000, // DEFAULT_TIMEOUT
      );
    });

    it('should encode raceId in URL', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({ success: true }));

      await deleteRace('race with spaces');

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/admin/races?raceId=race%20with%20spaces',
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should return error on failure', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Not found' }, 404, false),
      );

      const result = await deleteRace('RACE-XXX');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not found');
    });
  });

  // ─── checkRaceExists ───

  describe('checkRaceExists', () => {
    it('should check race existence with correct URL', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ exists: true, entryCount: 42 }),
      );

      const result = await checkRaceExists('RACE-001');

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ exists: true, entryCount: 42 });
      // Should lowercase the raceId
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('raceId=race-001'),
        expect.any(Object),
        5000,
      );
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('checkOnly=true'),
        expect.any(Object),
        5000,
      );
    });

    it('should return result when race does not exist', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ exists: false, entryCount: 0 }),
      );

      const result = await checkRaceExists('NONEXISTENT');

      expect(result.ok).toBe(true);
      expect(result.data?.exists).toBe(false);
    });
  });

  // ─── getPinStatus ───

  describe('getPinStatus', () => {
    it('should fetch PIN status without auth', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ hasPin: true, hasChiefPin: false }),
      );

      const result = await getPinStatus();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ hasPin: true, hasChiefPin: false });
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/admin/pin',
        expect.objectContaining({ method: 'GET' }),
        5000,
      );
    });

    it('should not include auth headers', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ hasPin: false, hasChiefPin: false }),
      );

      await getPinStatus();

      const callArgs = mockFetchWithTimeout.mock.calls[0];
      const headers = (callArgs[1] as RequestInit).headers as Record<
        string,
        string
      >;
      // requiresAuth is false, so no Authorization header should be added by apiRequest
      expect(headers.Authorization).toBeUndefined();
    });
  });

  // ─── changePin ───

  describe('changePin', () => {
    it('should send current and new PIN with auth', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({ success: true }));

      const result = await changePin('1234', '5678');

      expect(result.ok).toBe(true);
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/admin/pin',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ currentPin: '1234', newPin: '5678' }),
        }),
        10000,
      );
    });

    it('should return error on wrong PIN', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Invalid current PIN' }, 400, false),
      );

      const result = await changePin('0000', '5678');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid current PIN');
    });
  });

  // ─── exchangeToken ───

  describe('exchangeToken', () => {
    it('should exchange PIN for token and store it', async () => {
      const tokenData = { success: true, token: 'jwt-token-123' };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(tokenData));

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(tokenData);
      expect(setAuthToken).toHaveBeenCalledWith('jwt-token-123');
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/v1/auth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '1234' }),
        }),
        5000,
      );
    });

    it('should not store token when response is not ok', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Invalid PIN' }, 401, false),
      );

      const result = await exchangeToken('0000');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid PIN');
      expect(setAuthToken).not.toHaveBeenCalled();
    });

    it('should return default error on non-ok response without error field', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({}, 500, false));

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });

    it('should not store token when success is false', async () => {
      const tokenData = { success: false, error: 'PIN mismatch' };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(tokenData));

      const result = await exchangeToken('9999');

      expect(result.ok).toBe(false);
      expect(setAuthToken).not.toHaveBeenCalled();
    });

    it('should not store token when token is missing', async () => {
      const tokenData = { success: true }; // No token field
      mockFetchWithTimeout.mockResolvedValue(mockResponse(tokenData));

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(true);
      expect(setAuthToken).not.toHaveBeenCalled();
    });

    it('should handle isNewPin flag', async () => {
      const tokenData = { success: true, token: 'new-jwt', isNewPin: true };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(tokenData));

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(true);
      expect(result.data?.isNewPin).toBe(true);
    });

    it('should handle network errors', async () => {
      mockFetchWithTimeout.mockRejectedValue(new Error('Failed to fetch'));

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to fetch');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetchWithTimeout.mockRejectedValue('connection refused');

      const result = await exchangeToken('1234');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ─── fetchTodaysRaces ───

  describe('fetchTodaysRaces', () => {
    it('should fetch from API when authenticated and return today races', async () => {
      const now = Date.now();
      const racesData = {
        races: [
          { raceId: 'TODAY-RACE', entryCount: 5, lastUpdated: now },
          {
            raceId: 'OLD-RACE',
            entryCount: 10,
            lastUpdated: now - 2 * 24 * 60 * 60 * 1000,
          },
        ],
      };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(racesData));

      const result = await fetchTodaysRaces();

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].raceId).toBe('TODAY-RACE');
    });

    it('should update localStorage cache with API results', async () => {
      const now = Date.now();
      const racesData = {
        races: [{ raceId: 'RACE-A', entryCount: 3, lastUpdated: now }],
      };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(racesData));

      await fetchTodaysRaces();

      expect(addRecentRace).toHaveBeenCalledWith('RACE-A', now, 3);
    });

    it('should limit results to 5 races', async () => {
      const now = Date.now();
      const races = Array.from({ length: 10 }, (_, i) => ({
        raceId: `RACE-${i}`,
        entryCount: i,
        lastUpdated: now - i * 1000,
      }));
      mockFetchWithTimeout.mockResolvedValue(mockResponse({ races }));

      const result = await fetchTodaysRaces();

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should fallback to localStorage when not authenticated', async () => {
      const mockHasAuth = vi.mocked(authHasAuthToken);
      mockHasAuth.mockReturnValue(false);

      const localRaces = [
        {
          raceId: 'LOCAL-RACE',
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        },
      ];
      vi.mocked(getTodaysRecentRaces).mockReturnValue(localRaces);

      const result = await fetchTodaysRaces();

      expect(result).toEqual(localRaces);
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should fallback to localStorage when API fails', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Server down' }, 500, false),
      );

      const localRaces = [
        {
          raceId: 'CACHED-RACE',
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        },
      ];
      vi.mocked(getTodaysRecentRaces).mockReturnValue(localRaces);

      const result = await fetchTodaysRaces();

      expect(result).toEqual(localRaces);
    });

    it('should fallback to localStorage when API returns no races', async () => {
      mockFetchWithTimeout.mockResolvedValue(mockResponse({ races: null }));

      const localRaces = [
        {
          raceId: 'CACHED-RACE',
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        },
      ];
      vi.mocked(getTodaysRecentRaces).mockReturnValue(localRaces);

      const result = await fetchTodaysRaces();

      expect(result).toEqual(localRaces);
    });

    it('should filter out races not updated today', async () => {
      const now = Date.now();
      const yesterday = now - 2 * 24 * 60 * 60 * 1000; // 2 days ago to be safe
      const racesData = {
        races: [{ raceId: 'OLD-RACE', entryCount: 10, lastUpdated: yesterday }],
      };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(racesData));

      vi.mocked(getTodaysRecentRaces).mockReturnValue([]);

      const result = await fetchTodaysRaces();

      // The old race should be filtered out, and since there are none for today,
      // it may return empty or fall through
      // Either 0 results from API filtering or fallback to localStorage
      expect(result.length).toBe(0);
    });

    it('should handle races without lastUpdated', async () => {
      const racesData = {
        races: [{ raceId: 'NO-UPDATE', entryCount: 5, lastUpdated: undefined }],
      };
      mockFetchWithTimeout.mockResolvedValue(mockResponse(racesData));

      vi.mocked(getTodaysRecentRaces).mockReturnValue([]);

      // Should not throw
      const result = await fetchTodaysRaces();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── 401 with expired flag ───

  describe('401 error handling', () => {
    it('should return expired flag from 401 response', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Token expired', expired: true }, 401, false),
      );

      const result = await fetchRaces();

      expect(result.expired).toBe(true);
    });

    it('should default expired to false when not in response', async () => {
      mockFetchWithTimeout.mockResolvedValue(
        mockResponse({ error: 'Unauthorized' }, 401, false),
      );

      const result = await fetchRaces();

      expect(result.expired).toBe(false);
    });
  });
});
