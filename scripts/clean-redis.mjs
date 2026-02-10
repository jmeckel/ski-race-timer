#!/usr/bin/env node

/**
 * Clean Redis database - removes all race data and optionally PINs
 *
 * Usage:
 *   node scripts/clean-redis.mjs           # List all keys (dry run)
 *   node scripts/clean-redis.mjs --delete  # Delete all race data
 *   node scripts/clean-redis.mjs --all     # Delete everything including PINs
 */

import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually (no dotenv dependency needed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^(\w+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch { /* .env.local not found - rely on existing env vars */ }

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('REDIS_URL not found in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const doDelete = args.includes('--delete') || args.includes('--all');
const deleteAll = args.includes('--all');

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10000
});

async function scanAllKeys() {
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys.sort();
}

try {
  const allKeys = await scanAllKeys();

  if (allKeys.length === 0) {
    console.log('Redis is empty - nothing to clean.');
    process.exit(0);
  }

  // Categorize keys
  const pinKeys = allKeys.filter(k => k.startsWith('admin:'));
  const raceKeys = allKeys.filter(k => k.startsWith('race:'));
  const rateLimitKeys = allKeys.filter(k => k.startsWith('reset-pin:'));
  const otherKeys = allKeys.filter(k => !k.startsWith('admin:') && !k.startsWith('race:') && !k.startsWith('reset-pin:'));

  console.log(`\nFound ${allKeys.length} keys in Redis:\n`);

  if (pinKeys.length > 0) {
    console.log(`  Admin/PIN keys (${pinKeys.length}):`);
    for (const k of pinKeys) console.log(`    ${k}`);
  }

  if (raceKeys.length > 0) {
    console.log(`  Race keys (${raceKeys.length}):`);
    for (const k of raceKeys) console.log(`    ${k}`);
  }

  if (rateLimitKeys.length > 0) {
    console.log(`  Rate limit keys (${rateLimitKeys.length}):`);
    for (const k of rateLimitKeys) console.log(`    ${k}`);
  }

  if (otherKeys.length > 0) {
    console.log(`  Other keys (${otherKeys.length}):`);
    for (const k of otherKeys) console.log(`    ${k}`);
  }

  if (!doDelete) {
    console.log('\nDry run. Use --delete to remove race data, or --all to remove everything.');
    process.exit(0);
  }

  // Determine which keys to delete
  const keysToDelete = deleteAll
    ? allKeys
    : [...raceKeys, ...rateLimitKeys];

  if (keysToDelete.length === 0) {
    console.log('\nNo keys to delete.');
    process.exit(0);
  }

  console.log(`\nDeleting ${keysToDelete.length} keys...`);
  await redis.del(...keysToDelete);
  console.log('Done.');

  if (!deleteAll && pinKeys.length > 0) {
    console.log(`\nKept ${pinKeys.length} admin/PIN key(s). Use --all to remove those too.`);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  redis.disconnect();
}
