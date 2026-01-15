import Redis from 'ioredis';

// Configuration
const MAX_ENTRIES_PER_RACE = 10000;
const MAX_RACE_ID_LENGTH = 50;
const MAX_DEVICE_NAME_LENGTH = 100;
const CACHE_EXPIRY_SECONDS = 86400; // 24 hours

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window per IP
const RATE_LIMIT_MAX_POSTS = 30; // Max POST requests per window per IP

// Create Redis client - reuse connection across invocations
let redis = null;
let redisError = null;

function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not configured');
    }

    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 2000);
      }
    });

    // Handle Redis connection errors
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      redisError = err;
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
      redisError = null;
    });
  }
  return redis;
}

// CORS configuration - use environment variable or default to restrictive
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Get client IP from request
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Rate limiting using Redis
async function checkRateLimit(client, ip, method) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW);

  // Different limits for GET and POST
  const limit = method === 'POST' ? RATE_LIMIT_MAX_POSTS : RATE_LIMIT_MAX_REQUESTS;
  const key = `ratelimit:${method}:${ip}:${windowStart}`;

  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW + 10); // Extra buffer for expiry
    const results = await multi.exec();

    const count = results[0][1];

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      reset: windowStart + RATE_LIMIT_WINDOW
    };
  } catch (error) {
    console.error('Rate limit check error:', error.message);
    // Allow request if rate limiting fails (fail open)
    return { allowed: true, remaining: limit, reset: windowStart + RATE_LIMIT_WINDOW };
  }
}

// Input validation helpers
function isValidRaceId(raceId) {
  if (!raceId || typeof raceId !== 'string') return false;
  if (raceId.length > MAX_RACE_ID_LENGTH) return false;
  // Allow alphanumeric, hyphens, and underscores only
  return /^[a-zA-Z0-9_-]+$/.test(raceId);
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;

  // ID can be string (new format) or number (legacy)
  if (typeof entry.id !== 'number' && typeof entry.id !== 'string') return false;
  if (typeof entry.id === 'number' && entry.id <= 0) return false;
  if (typeof entry.id === 'string' && entry.id.length === 0) return false;

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
  if (str === null || str === undefined || str === '') {
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(str);
    return parsed;
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  setCorsHeaders(res);

  const { raceId } = req.query;

  // Validate raceId
  if (!raceId) {
    return res.status(400).json({ error: 'raceId is required' });
  }

  if (!isValidRaceId(raceId)) {
    return res.status(400).json({
      error: 'Invalid raceId format. Use alphanumeric characters, hyphens, and underscores only (max 50 chars).'
    });
  }

  const redisKey = `race:${raceId}`;

  let client;
  try {
    client = getRedis();
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  // Check for recent Redis errors
  if (redisError) {
    return res.status(503).json({ error: 'Database connection issue. Please try again.' });
  }

  // Apply rate limiting
  const clientIP = getClientIP(req);
  const rateLimitResult = await checkRateLimit(client, clientIP, req.method);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', req.method === 'POST' ? RATE_LIMIT_MAX_POSTS : RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimitResult.reset);

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: rateLimitResult.reset - Math.floor(Date.now() / 1000)
    });
  }

  try {
    if (req.method === 'GET') {
      const data = await client.get(redisKey);
      const parsed = safeJsonParse(data, { entries: [], lastUpdated: null });

      return res.status(200).json({
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastUpdated: parsed.lastUpdated || null
      });
    }

    if (req.method === 'POST') {
      const { entry, deviceId, deviceName } = req.body || {};

      // Validate entry
      if (!entry) {
        return res.status(400).json({ error: 'entry is required' });
      }

      if (!isValidEntry(entry)) {
        return res.status(400).json({ error: 'Invalid entry format' });
      }

      // Sanitize device info
      const sanitizedDeviceId = sanitizeString(deviceId, 50);
      const sanitizedDeviceName = sanitizeString(deviceName, MAX_DEVICE_NAME_LENGTH);

      // Get existing data
      const existingData = await client.get(redisKey);
      const existing = safeJsonParse(existingData, { entries: [], lastUpdated: null });

      // Ensure entries is an array
      if (!Array.isArray(existing.entries)) {
        existing.entries = [];
      }

      // Check entry limit
      if (existing.entries.length >= MAX_ENTRIES_PER_RACE) {
        return res.status(400).json({
          error: `Maximum entries limit (${MAX_ENTRIES_PER_RACE}) reached for this race`
        });
      }

      // Convert ID to string for consistency
      const entryId = String(entry.id);

      // Build enriched entry with only allowed fields
      const enrichedEntry = {
        id: entryId,
        bib: sanitizeString(entry.bib, 10),
        point: entry.point,
        timestamp: entry.timestamp,
        status: entry.status || 'ok',
        deviceId: sanitizedDeviceId,
        deviceName: sanitizedDeviceName,
        syncedAt: Date.now()
      };

      // Include photo if present (base64, limit size)
      if (entry.photo && typeof entry.photo === 'string') {
        // Limit photo size to ~500KB base64 (roughly 375KB image)
        if (entry.photo.length <= 500000) {
          enrichedEntry.photo = entry.photo;
        }
      }

      // Include GPS coords if present
      if (entry.gpsCoords && typeof entry.gpsCoords === 'object') {
        enrichedEntry.gpsCoords = {
          latitude: Number(entry.gpsCoords.latitude) || 0,
          longitude: Number(entry.gpsCoords.longitude) || 0,
          accuracy: Number(entry.gpsCoords.accuracy) || 0
        };
      }

      // Check for duplicates (same entry from same device)
      const isDuplicate = existing.entries.some(
        e => String(e.id) === entryId && e.deviceId === sanitizedDeviceId
      );

      if (!isDuplicate) {
        existing.entries.push(enrichedEntry);
        existing.lastUpdated = Date.now();

        // Store with expiry
        await client.set(redisKey, JSON.stringify(existing), 'EX', CACHE_EXPIRY_SECONDS);
      }

      return res.status(200).json({
        success: true,
        entries: existing.entries,
        lastUpdated: existing.lastUpdated
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sync API error:', error.message);

    // Don't expose internal error details to client
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return res.status(503).json({ error: 'Database connection failed. Please try again.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}
