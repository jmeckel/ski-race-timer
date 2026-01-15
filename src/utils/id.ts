/**
 * Generate a unique entry ID using UUID v4 + timestamp
 * Format: {deviceId}-{timestamp}-{random}
 * This prevents collisions across devices even with simultaneous entries
 */
export function generateEntryId(deviceId: string): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${deviceId}-${timestamp}-${random}`;
}

/**
 * Generate a unique device ID
 * Persisted to localStorage for device identification
 */
export function generateDeviceId(): string {
  return `dev_${crypto.randomUUID().slice(0, 12)}`;
}

/**
 * Parse entry ID to extract components
 */
export function parseEntryId(id: string): { deviceId: string; timestamp: number; random: string } | null {
  const parts = id.split('-');
  if (parts.length < 3) return null;

  // Device ID is everything up to the second-to-last part
  const random = parts.pop()!;
  const timestampStr = parts.pop()!;
  const deviceId = parts.join('-');
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) return null;

  return { deviceId, timestamp, random };
}

/**
 * Check if an ID is in the new UUID format
 */
export function isNewIdFormat(id: string): boolean {
  return typeof id === 'string' && id.includes('-') && id.startsWith('dev_');
}

/**
 * Migrate old numeric ID to new format
 */
export function migrateId(oldId: number | string, deviceId: string): string {
  if (typeof oldId === 'string' && isNewIdFormat(oldId)) {
    return oldId;
  }

  const timestamp = typeof oldId === 'number' ? oldId : parseInt(String(oldId), 10);
  const random = crypto.randomUUID().slice(0, 8);
  return `${deviceId}-${timestamp}-${random}`;
}

/**
 * Generate a secure race ID
 */
export function generateRaceId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar chars: I, O, 0, 1
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
