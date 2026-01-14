import Redis from 'ioredis';

// Create Redis client - reuse connection across invocations
let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

// CORS headers
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

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const { raceId } = req.query;

  if (!raceId) {
    return res.status(400).json({ error: 'raceId is required' });
  }

  const redisKey = `race:${raceId}`;
  const client = getRedis();

  try {
    if (req.method === 'GET') {
      const data = await client.get(redisKey);
      const parsed = data ? JSON.parse(data) : { entries: [], lastUpdated: null };
      return res.status(200).json({
        entries: parsed.entries || [],
        lastUpdated: parsed.lastUpdated || null
      });
    }

    if (req.method === 'POST') {
      const { entry, deviceId, deviceName } = req.body;

      if (!entry) {
        return res.status(400).json({ error: 'entry is required' });
      }

      // Get existing data
      const existingData = await client.get(redisKey);
      const existing = existingData ? JSON.parse(existingData) : { entries: [], lastUpdated: null };

      // Add device info to entry
      const enrichedEntry = {
        ...entry,
        deviceId,
        deviceName,
        syncedAt: Date.now()
      };

      // Check for duplicates
      const isDuplicate = existing.entries.some(
        e => e.id === entry.id && e.deviceId === deviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();

        // Store with 24-hour expiry
        await client.set(redisKey, JSON.stringify(existing), 'EX', 86400);
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
