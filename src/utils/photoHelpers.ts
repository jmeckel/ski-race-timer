/**
 * Photo Validation Helpers
 * Shared predicates for checking photo data state across the app.
 * Photos are stored in IndexedDB with a marker string 'indexeddb'
 * replacing the full base64 data in the entry object.
 */

/** Minimum base64 length for valid photo data (filters out markers and empty strings) */
const MIN_PHOTO_DATA_LENGTH = 20;

/**
 * Check if a photo field contains the IndexedDB storage marker.
 * True when the photo has been stored locally and the entry only holds a placeholder.
 */
export function isPhotoMarker(
  photo: string | undefined | null,
): photo is string {
  return photo === 'indexeddb';
}

/**
 * Check if a photo field contains full base64-encoded image data
 * (i.e. not a marker and long enough to be a real image).
 */
export function hasFullPhotoData(
  photo: string | undefined | null,
): photo is string {
  return (
    !!photo && photo !== 'indexeddb' && photo.length > MIN_PHOTO_DATA_LENGTH
  );
}
