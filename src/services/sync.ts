/**
 * Sync Service
 * Re-exports from modular sync service structure
 */

// Re-export everything from the sync module
export {
  syncService,
  syncEntry,
  syncFault,
  deleteFaultFromCloud,
  // Auth re-exports for backwards compatibility
  AUTH_TOKEN_KEY,
  hasAuthToken,
  setAuthToken,
  clearAuthToken,
  exchangePinForToken
} from './sync/index';
