/**
 * Photo Helpers
 * Shared utilities for photo validation and marker detection.
 * Replaces scattered magic-string checks across the codebase.
 */

/** Minimum length to distinguish real base64 photo data from markers/empty strings */
const MIN_PHOTO_DATA_LENGTH = 20;

/**
 * Check if a photo field contains the IndexedDB storage marker
 */
export function isPhotoMarker(
  photo: string | undefined | null,
): photo is string {
  return photo === 'indexeddb';
}

/**
 * Check if a photo field contains full base64 photo data (not a marker)
 */
export function hasFullPhotoData(
  photo: string | undefined | null,
): photo is string {
  return (
    !!photo && photo !== 'indexeddb' && photo.length > MIN_PHOTO_DATA_LENGTH
  );
}
