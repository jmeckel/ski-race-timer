/**
 * Tests for Authentication Service
 * Covers token management, PIN exchange, role checking, and event dispatch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpiredJWT, createJWT } from '../../helpers/factories';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../src/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const storageStore = new Map<string, string>();

vi.mock('../../../src/services/storage', () => ({
  storage: {
    getRaw: vi.fn((key: string) => storageStore.get(key) ?? null),
    setRaw: vi.fn((key: string, val: string) => storageStore.set(key, val)),
    remove: vi.fn((key: string) => storageStore.delete(key)),
    flush: vi.fn(),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────

import {
  AUTH_TOKEN_KEY,
  clearAuthToken,
  dispatchAuthExpired,
  exchangeChiefJudgePin,
  exchangePinForToken,
  getAuthHeaders,
  getAuthToken,
  getTokenRole,
  hasAuthToken,
  hasChiefJudgeRole,
  setAuthToken,
} from '../../../src/services/auth';
import { storage } from '../../../src/services/storage';

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  storageStore.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AUTH_TOKEN_KEY', () => {
  it('equals the expected localStorage key', () => {
    expect(AUTH_TOKEN_KEY).toBe('skiTimerAuthToken');
  });
});

describe('getAuthHeaders', () => {
  it('returns Authorization header when a token is stored', () => {
    const token = createJWT();
    storageStore.set(AUTH_TOKEN_KEY, token);

    const headers = getAuthHeaders();
    expect(headers).toEqual({ Authorization: `Bearer ${token}` });
  });

  it('returns an empty object when no token is stored', () => {
    const headers = getAuthHeaders();
    expect(headers).toEqual({});
  });
});

describe('hasAuthToken', () => {
  it('returns false when no token is stored', () => {
    expect(hasAuthToken()).toBe(false);
  });

  it('returns true for a valid (non-expired) JWT', () => {
    const token = createJWT({ exp: Math.floor(Date.now() / 1000) + 3600 });
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasAuthToken()).toBe(true);
  });

  it('returns false for an expired JWT', () => {
    const token = createExpiredJWT();
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasAuthToken()).toBe(false);
  });

  it('returns true for a malformed (unparseable) token — lets server decide', () => {
    storageStore.set(AUTH_TOKEN_KEY, 'not-a-jwt');

    // The token is present but not parseable as JWT.
    // The code catches the error and returns true (lets server decide).
    expect(hasAuthToken()).toBe(true);
  });

  it('returns true for a JWT with no exp claim', () => {
    // Create a JWT without exp by overriding it to undefined
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({ sub: 'test', iat: Math.floor(Date.now() / 1000) }),
    );
    const sig = btoa('fake-signature');
    const token = `${header}.${payload}.${sig}`;
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasAuthToken()).toBe(true);
  });
});

describe('setAuthToken / clearAuthToken', () => {
  it('stores a token and retrieves it', () => {
    const token = createJWT();
    setAuthToken(token);

    expect(storage.setRaw).toHaveBeenCalledWith(AUTH_TOKEN_KEY, token);
    expect(storage.flush).toHaveBeenCalled();
    expect(storageStore.get(AUTH_TOKEN_KEY)).toBe(token);
  });

  it('clears the stored token', () => {
    const token = createJWT();
    storageStore.set(AUTH_TOKEN_KEY, token);

    clearAuthToken();

    expect(storage.remove).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
    expect(storage.flush).toHaveBeenCalled();
    expect(storageStore.has(AUTH_TOKEN_KEY)).toBe(false);
  });
});

describe('getAuthToken', () => {
  it('returns the raw token when stored', () => {
    const token = createJWT();
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(getAuthToken()).toBe(token);
  });

  it('returns null when no token is stored', () => {
    expect(getAuthToken()).toBeNull();
  });
});

describe('exchangePinForToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the token and returns success on successful exchange', async () => {
    const token = createJWT();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token, isNewPin: false }),
    });

    const result = await exchangePinForToken('1234');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234', role: undefined }),
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ success: true, token, isNewPin: false });
    expect(storageStore.get(AUTH_TOKEN_KEY)).toBe(token);
  });

  it('returns isNewPin when the server indicates a new PIN was set', async () => {
    const token = createJWT();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token, isNewPin: true }),
    });

    const result = await exchangePinForToken('5678');

    expect(result.isNewPin).toBe(true);
    expect(result.success).toBe(true);
  });

  it('returns error on failed authentication (non-ok response)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid PIN' }),
    });

    const result = await exchangePinForToken('0000');

    expect(result).toEqual({ success: false, error: 'Invalid PIN' });
    expect(storageStore.has(AUTH_TOKEN_KEY)).toBe(false);
  });

  it('returns default error message when server error has no message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const result = await exchangePinForToken('0000');

    expect(result).toEqual({ success: false, error: 'Authentication failed' });
  });

  it('returns network error on fetch failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await exchangePinForToken('1234');

    expect(result).toEqual({ success: false, error: 'Network error' });
  });

  it('returns timeout error on AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    const result = await exchangePinForToken('1234');

    expect(result).toEqual({ success: false, error: 'Request timeout' });
  });

  it('returns error when response has no token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'ok but no token field' }),
    });

    const result = await exchangePinForToken('1234');

    expect(result).toEqual({ success: false, error: 'No token received' });
    expect(storageStore.has(AUTH_TOKEN_KEY)).toBe(false);
  });

  it('passes the role parameter correctly', async () => {
    const token = createJWT({ role: 'gateJudge' });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token }),
    });

    await exchangePinForToken('1234', 'gateJudge');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234', role: 'gateJudge' }),
      signal: expect.any(AbortSignal),
    });
  });
});

describe('dispatchAuthExpired', () => {
  it('dispatches auth-expired event with default message', () => {
    const handler = vi.fn();
    window.addEventListener('auth-expired', handler);

    dispatchAuthExpired();

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('auth-expired');
    expect(event.detail.message).toBe(
      'Session expired. Please re-enter your PIN.',
    );

    window.removeEventListener('auth-expired', handler);
  });

  it('dispatches auth-expired event with custom message', () => {
    const handler = vi.fn();
    window.addEventListener('auth-expired', handler);

    dispatchAuthExpired('Custom expiry reason');

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.message).toBe('Custom expiry reason');

    window.removeEventListener('auth-expired', handler);
  });
});

describe('exchangeChiefJudgePin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates to exchangePinForToken with chiefJudge role', async () => {
    const token = createJWT({ role: 'chiefJudge' });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token }),
    });

    const result = await exchangeChiefJudgePin('9999');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999', role: 'chiefJudge' }),
      signal: expect.any(AbortSignal),
    });
    expect(result.success).toBe(true);
    expect(result.token).toBe(token);
  });
});

describe('getTokenRole', () => {
  it('returns the role from a valid JWT', () => {
    const token = createJWT({ role: 'timer' });
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(getTokenRole()).toBe('timer');
  });

  it('returns null when token has no role claim', () => {
    const token = createJWT({ sub: 'user123' });
    storageStore.set(AUTH_TOKEN_KEY, token);

    // The factory includes sub:'test' by default which gets overridden,
    // but no role field means payload.role is undefined -> returns null.
    expect(getTokenRole()).toBeNull();
  });

  it('returns null when no token is stored', () => {
    expect(getTokenRole()).toBeNull();
  });

  it('returns null for a malformed (unparseable) token', () => {
    storageStore.set(AUTH_TOKEN_KEY, 'garbage.data.here');

    expect(getTokenRole()).toBeNull();
  });

  it('returns null for a token that is not three-part', () => {
    storageStore.set(AUTH_TOKEN_KEY, 'only-one-part');

    expect(getTokenRole()).toBeNull();
  });
});

describe('hasChiefJudgeRole', () => {
  it('returns true when token has chiefJudge role', () => {
    const token = createJWT({ role: 'chiefJudge' });
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasChiefJudgeRole()).toBe(true);
  });

  it('returns false when token has timer role', () => {
    const token = createJWT({ role: 'timer' });
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasChiefJudgeRole()).toBe(false);
  });

  it('returns false when token has gateJudge role', () => {
    const token = createJWT({ role: 'gateJudge' });
    storageStore.set(AUTH_TOKEN_KEY, token);

    expect(hasChiefJudgeRole()).toBe(false);
  });

  it('returns false when no token is stored', () => {
    expect(hasChiefJudgeRole()).toBe(false);
  });
});
