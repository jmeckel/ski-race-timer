import type Redis from 'ioredis';
import { apiLogger } from './apiLogger.js';
import { safeJsonParse } from './response.js';

// Shared constants
export const CACHE_EXPIRY_SECONDS: number = 86400; // 24 hours
export const MAX_ATOMIC_RETRIES: number = 5;

/** Outcome of a successful update function - data to write back */
interface AtomicUpdateOutcome<TData, TResult> {
  /** Modified data to write back to Redis */
  data: TData;
  /** Return value passed through to caller */
  result: TResult;
  abort?: false;
}

/** Outcome of an aborted update function - no write, just return result */
interface AtomicAbortOutcome<TResult> {
  /** If true, unwatch and return result without writing */
  abort: true;
  /** Return value passed through to caller */
  result: TResult;
  data?: never;
}

/** Union of possible outcomes from the update function */
type AtomicOutcome<TData, TResult> =
  | AtomicUpdateOutcome<TData, TResult>
  | AtomicAbortOutcome<TResult>;

/** Error result returned when max retries exceeded */
interface AtomicConflictError {
  success: false;
  error: string;
  existing: null;
}

/**
 * Execute an atomic Redis operation with WATCH/MULTI/EXEC retry loop.
 *
 * @param client - Redis client
 * @param redisKey - Redis key to operate on
 * @param defaultData - Default data if key doesn't exist (e.g. \{ entries: [], lastUpdated: null \})
 * @param updateFn - Called with current data, returns \{ data, result \} or \{ abort: true, result \}
 *   - data: modified data to write back (set lastUpdated inside updateFn)
 *   - result: return value passed through to caller
 *   - abort: if true, unwatch and return result without writing
 * @param operationName - Name for logging retries
 * @returns The result from updateFn, or an error object on max retries
 */
export async function atomicUpdate<TData, TResult>(
  client: Redis,
  redisKey: string,
  defaultData: TData,
  updateFn: (current: TData) => AtomicOutcome<TData, TResult>,
  operationName: string,
): Promise<TResult | AtomicConflictError> {
  for (let retry = 0; retry < MAX_ATOMIC_RETRIES; retry++) {
    await client.watch(redisKey);

    const existingData: string | null = await client.get(redisKey);
    const current: TData = safeJsonParse<TData>(existingData, defaultData);

    const outcome = updateFn(current);

    if (outcome.abort) {
      await client.unwatch();
      return outcome.result;
    }

    const multi = client.multi();
    multi.set(
      redisKey,
      JSON.stringify(outcome.data),
      'EX',
      CACHE_EXPIRY_SECONDS,
    );
    const execResult = await multi.exec();

    if (execResult !== null) {
      return outcome.result;
    }

    apiLogger.warn(`${operationName}: retry due to concurrent modification`, {
      retry: retry + 1,
      maxRetries: MAX_ATOMIC_RETRIES,
    });
  }

  // Release stale WATCH from the last failed retry to prevent spurious
  // MULTI/EXEC failures on subsequent requests reusing this connection
  await client.unwatch();

  return {
    success: false,
    error: 'Concurrent modification conflict, please retry',
    existing: null,
  };
}
