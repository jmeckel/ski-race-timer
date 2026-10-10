/**
 * API Tests - atomicOps WATCH serialization
 *
 * WATCH state is per connection and the Redis client is a per-instance
 * singleton, so concurrent transactions must not interleave their
 * WATCH ... EXEC sequences.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/lib/apiLogger.js', () => ({
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { atomicUpdate, withWatchLock } from '../../api/lib/atomicOps.js';

function createClient() {
  const log: string[] = [];
  let value: string | null = JSON.stringify({ n: 0 });
  const tick = () => new Promise((r) => setTimeout(r, 1));
  const client = {
    log,
    watch: vi.fn(async (key: string) => {
      log.push(`watch:${key}`);
      await tick();
    }),
    unwatch: vi.fn(async () => {
      log.push('unwatch');
    }),
    get: vi.fn(async () => {
      await tick();
      return value;
    }),
    multi: vi.fn(() => {
      let pending: string | null = null;
      return {
        set: (_key: string, v: string) => {
          pending = v;
        },
        exec: vi.fn(async () => {
          await tick();
          log.push('exec');
          value = pending;
          return [[null, 'OK']];
        }),
      };
    }),
  };
  return client;
}

describe('atomicOps', () => {
  it('serializes concurrent WATCH sections on one connection', async () => {
    const client = createClient();
    const increment = () =>
      atomicUpdate<{ n: number }, number>(
        client as any,
        'k',
        { n: 0 },
        (cur) => ({ data: { n: cur.n + 1 }, result: cur.n + 1 }),
        'test',
      );

    const results = await Promise.all([increment(), increment(), increment()]);

    // Each WATCH is followed by its own EXEC before the next WATCH starts
    expect(client.log).toEqual([
      'watch:k',
      'exec',
      'watch:k',
      'exec',
      'watch:k',
      'exec',
    ]);
    // No lost updates
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it('releases the lock and unwatches when a section throws', async () => {
    const client = createClient();
    await expect(
      withWatchLock(client as any, async () => {
        await client.watch('k');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(client.unwatch).toHaveBeenCalled();

    // Lock is not stuck
    await expect(withWatchLock(client as any, async () => 'ok')).resolves.toBe(
      'ok',
    );
  });
});
