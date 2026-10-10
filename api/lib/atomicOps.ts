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

// WATCH state belongs to the connection, and the Redis client is a per-instance
// singleton. With concurrent requests in one instance (Fluid Compute), request
// B's EXEC/UNWATCH would silently clear request A's WATCH, letting A commit on a
// stale read. Serialize WATCH sections per connection; plain commands are unaffected.
const watchLocks = new WeakMap<Redis, Promise<unknown>>();

/**
 * Run `fn` with exclusive use of the connection's WATCH state.
 * Every WATCH/MULTI/EXEC sequence on a shared client must go through this.
 */
export async function withWatchLock<T>(
  client: Redis,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = watchLocks.get(client) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Keep the chain alive regardless of this section's outcome
  watchLocks.set(
    client,
    run.catch(() => {}),
  );
  try {
    return await run;
  } catch (error) {
    // Never leave a dangling WATCH for the next section on this connection
    await client.unwatch().catch(() => {});
    throw error;
  }
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
  return withWatchLock(client, () =>
    atomicUpdateUnlocked(
      client,
      redisKey,
      defaultData,
      updateFn,
      operationName,
    ),
  );
}

async function atomicUpdateUnlocked<TData, TResult>(
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
