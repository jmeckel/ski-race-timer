/**
 * DOM Cache Utility
 * Caches DOM element lookups to avoid repeated querySelector calls
 */

// Cache storage
const elementCache = new Map<string, HTMLElement | null>();

/**
 * Get an element by ID with caching
 * Returns null if element doesn't exist
 */
export function getElement<T extends HTMLElement = HTMLElement>(
  id: string,
): T | null {
  if (!elementCache.has(id)) {
    elementCache.set(id, document.getElementById(id));
  }
  return elementCache.get(id) as T | null;
}

/**
 * Get an element by ID, throwing if not found
 * Use when element must exist
 */
export function getElementOrThrow<T extends HTMLElement = HTMLElement>(
  id: string,
): T {
  const el = getElement<T>(id);
  if (!el) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return el;
}

/**
 * Clear a specific element from cache
 * Use when element may have been removed/recreated
 */
export function invalidateElement(id: string): void {
  elementCache.delete(id);
}

/**
 * Clear entire cache
 * Use on major DOM changes or view transitions
 */
export function clearElementCache(): void {
  elementCache.clear();
}

/**
 * Pre-cache multiple elements by ID
 * Use during initialization to warm the cache
 */
export function preCacheElements(ids: string[]): void {
  for (const id of ids) {
    if (!elementCache.has(id)) {
      elementCache.set(id, document.getElementById(id));
    }
  }
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): { size: number; hits: string[] } {
  return {
    size: elementCache.size,
    hits: Array.from(elementCache.keys()),
  };
}
