/**
 * Sync Service
 * Re-exports from modular sync service structure
 */

// Re-export everything from the sync module
export {
  // Auth re-exports for backwards compatibility
  AUTH_TOKEN_KEY,
  clearAuthToken,
  deleteFaultFromCloud,
  exchangePinForToken,
  hasAuthToken,
  setAuthToken,
  syncEntry,
  syncFault,
  syncService,
} from './sync/index';
