/**
 * Generate a random hex string as fallback for crypto.randomUUID()
 * Needed for Safari < 15.4 (older iPads)
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Generate a unique entry ID using UUID v4 + timestamp
 * Format: {deviceId}-{timestamp}-{random}
 * This prevents collisions across devices even with simultaneous entries
 */
export function generateEntryId(deviceId: string): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID?.().slice(0, 8) ?? randomHex(8);
  return `${deviceId}-${timestamp}-${random}`;
}

// Word lists for human-readable device IDs
const ADJECTIVES = [
  'swift',
  'bold',
  'cool',
  'fast',
  'keen',
  'wild',
  'calm',
  'warm',
  'bright',
  'sharp',
  'quick',
  'brave',
  'fresh',
  'grand',
  'prime',
  'clear',
  'snow',
  'ice',
  'frost',
  'peak',
  'alpine',
  'polar',
  'winter',
  'crisp',
];

const NOUNS = [
  'fox',
  'bear',
  'wolf',
  'hawk',
  'eagle',
  'tiger',
  'lion',
  'deer',
  'pine',
  'oak',
  'cedar',
  'birch',
  'maple',
  'spruce',
  'aspen',
  'willow',
  'peak',
  'ridge',
  'slope',
  'trail',
  'summit',
  'valley',
  'glacier',
  'cliff',
];

/**
 * Capitalize first letter of a word
 */
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Generate a unique device ID in human-readable format
 * Format: dev_{adjective}-{noun}-{number}
 * Example: dev_swift-fox-42
 * Persisted to localStorage for device identification
 */
export function generateDeviceId(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 100); // 0-99
  return `dev_${adjective}-${noun}-${number}`;
}

/**
 * Generate a human-readable device name for display
 * Format: {Adjective} {Noun} {number}
 * Example: "Swift Fox 42"
 */
export function generateDeviceName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 100); // 0-99
  return `${capitalize(adjective)} ${capitalize(noun)} ${number}`;
}

/**
 * Parse entry ID to extract components
 */
export function parseEntryId(
  id: string,
): { deviceId: string; timestamp: number; random: string } | null {
  const parts = id.split('-');
  if (parts.length < 3) return null;

  // Device ID is everything up to the second-to-last part
  const random = parts.pop()!;
  const timestampStr = parts.pop()!;
  const deviceId = parts.join('-');
  const timestamp = parseInt(timestampStr, 10);

  if (Number.isNaN(timestamp)) return null;

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

  const timestamp =
    typeof oldId === 'number' ? oldId : parseInt(String(oldId), 10);
  const random = crypto.randomUUID?.().slice(0, 8) ?? randomHex(8);
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
