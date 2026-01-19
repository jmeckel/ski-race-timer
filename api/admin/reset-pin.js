import Redis from 'ioredis';

// Redis client
let redis = null;

function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not configured');
    }
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000
    });
  }
  return redis;
}

// CORS configuration
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://ski-race-timer.vercel.app';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Server-Pin');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Redis key for client PIN hash
const CLIENT_PIN_KEY = 'admin:clientPin';

/**
 * Reset PIN endpoint
 * Requires SERVER_API_PIN in X-Server-Pin header for authorization
 * Deletes the stored PIN hash, allowing the next PIN entry to become the new PIN
 */
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify SERVER_API_PIN
  const serverPin = process.env.SERVER_API_PIN;
  const providedPin = req.headers['x-server-pin'];

  if (!serverPin) {
    return res.status(500).json({ error: 'SERVER_API_PIN not configured on server' });
  }

  if (!providedPin || providedPin !== serverPin) {
    return res.status(401).json({ error: 'Invalid server PIN' });
  }

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  try {
    // Delete the stored PIN hash
    await client.del(CLIENT_PIN_KEY);

    console.log('Client PIN has been reset');

    return res.status(200).json({
      success: true,
      message: 'PIN has been reset. The next PIN entered will become the new PIN.'
    });
  } catch (error) {
    console.error('Reset PIN error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
