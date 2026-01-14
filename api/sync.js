import { Redis } from '@upstash/redis';

// Initialize Redis client from environment variables
// Vercel Redis sets these automatically when connected
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const { raceId } = req.query;

  if (!raceId) {
    return res.status(400).json({ error: 'raceId is required' });
  }

  const redisKey = `race:${raceId}`;

  try {
    if (req.method === 'GET') {
      // Fetch all entries for this race
      const data = await redis.get(redisKey);
      return res.status(200).json({
        entries: data?.entries || [],
        lastUpdated: data?.lastUpdated || null
      });
    }

    if (req.method === 'POST') {
      const { entry, deviceId, deviceName } = req.body;

      if (!entry) {
        return res.status(400).json({ error: 'entry is required' });
      }

      // Get existing data
      const existing = await redis.get(redisKey) || { entries: [], lastUpdated: null };

      // Add device info to entry
      const enrichedEntry = {
        ...entry,
        deviceId,
        deviceName,
        syncedAt: Date.now()
      };

      // Check for duplicates (same id from same device)
      const isDuplicate = existing.entries.some(
        e => e.id === entry.id && e.deviceId === deviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();

        // Store with 24-hour expiry (races typically don't last longer)
        await redis.set(redisKey, existing, { ex: 86400 });
      }

      return res.status(200).json({
        success: true,
        entries: existing.entries,
        lastUpdated: existing.lastUpdated
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sync API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
