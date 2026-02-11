/**
 * Device Heartbeat Tracking
 *
 * Records device heartbeats on sync and counts active devices.
 * Devices are considered stale after DEVICE_STALE_THRESHOLD and are cleaned up
 * during active device count queries.
 */

import type Redis from 'ioredis';
import { CACHE_EXPIRY_SECONDS } from './atomicOps.js';
import type { DeviceData } from './syncTypes.js';

/** Device considered inactive after this many milliseconds */
export const DEVICE_STALE_THRESHOLD = 30000; // 30 seconds

/**
 * Update device heartbeat in Redis.
 * Stores the device name and last-seen timestamp in a hash.
 *
 * @param client - Redis client
 * @param normalizedRaceId - Lowercased race ID
 * @param deviceId - Device identifier
 * @param deviceName - Human-readable device name
 */
export async function updateDeviceHeartbeat(
  client: Redis,
  normalizedRaceId: string,
  deviceId: string,
  deviceName: string
): Promise<void> {
  if (!deviceId) return;

  const devicesKey = `race:${normalizedRaceId}:devices`;
  const deviceData = JSON.stringify({
    name: deviceName || 'Unknown',
    lastSeen: Date.now(),
  } satisfies DeviceData);

  await client.hset(devicesKey, deviceId, deviceData);
  await client.expire(devicesKey, CACHE_EXPIRY_SECONDS);
}

/**
 * Get count of active devices (seen within DEVICE_STALE_THRESHOLD).
 * Also cleans up stale device entries from Redis.
 *
 * @param client - Redis client
 * @param normalizedRaceId - Lowercased race ID
 * @returns Number of active devices
 */
export async function getActiveDeviceCount(
  client: Redis,
  normalizedRaceId: string
): Promise<number> {
  const devicesKey = `race:${normalizedRaceId}:devices`;
  const devices = await client.hgetall(devicesKey);

  if (!devices || Object.keys(devices).length === 0) {
    return 0;
  }

  const now = Date.now();
  let activeCount = 0;
  const staleDevices: string[] = [];

  for (const [deviceId, deviceJson] of Object.entries(devices)) {
    try {
      const device: DeviceData = JSON.parse(deviceJson);
      if (now - device.lastSeen <= DEVICE_STALE_THRESHOLD) {
        activeCount++;
      } else {
        staleDevices.push(deviceId);
      }
    } catch (e: unknown) {
      staleDevices.push(deviceId);
    }
  }

  // Clean up stale devices
  if (staleDevices.length > 0) {
    await client.hdel(devicesKey, ...staleDevices);
  }

  return activeCount;
}
