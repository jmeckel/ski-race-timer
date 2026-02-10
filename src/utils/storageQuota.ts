/**
 * Storage Quota Management
 * Estimates localStorage usage and warns when nearing capacity
 */

import { logger } from './logger';

// Estimated localStorage limit (5MB is the common browser default)
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;
// Warn at 80% usage
const WARNING_THRESHOLD_PERCENT = 80;

export interface StorageQuotaResult {
  usageBytes: number;
  estimatedQuota: number;
  usagePercent: number;
  warning: boolean;
}

/**
 * Estimate total localStorage usage in bytes.
 * Each character in localStorage takes 2 bytes (UTF-16).
 */
export function estimateLocalStorageUsage(): number {
  let totalBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        // Keys and values are stored as UTF-16 (2 bytes per char)
        totalBytes += (key.length + (value?.length ?? 0)) * 2;
      }
    }
  } catch {
    // Ignore errors (e.g., security restrictions)
  }
  return totalBytes;
}

/**
 * Check localStorage quota and return usage info.
 * Returns a warning flag if usage exceeds 80% of estimated 5MB limit.
 */
export function checkLocalStorageQuota(): StorageQuotaResult {
  const usageBytes = estimateLocalStorageUsage();
  const usagePercent = Math.round((usageBytes / ESTIMATED_QUOTA_BYTES) * 100);
  const warning = usagePercent >= WARNING_THRESHOLD_PERCENT;

  return {
    usageBytes,
    estimatedQuota: ESTIMATED_QUOTA_BYTES,
    usagePercent,
    warning,
  };
}

/**
 * Log storage usage to console on startup.
 */
export function logStorageUsage(): void {
  const { usageBytes, usagePercent } = checkLocalStorageQuota();
  const usageKB = (usageBytes / 1024).toFixed(1);
  logger.debug(`[Storage] localStorage usage: ${usageKB} KB (${usagePercent}% of ~5MB)`);
}
