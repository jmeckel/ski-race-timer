/**
 * Network Monitor Module
 * Detects metered connections (cellular), connection quality, and network changes
 * for data-aware and quality-aware polling
 */

import type { ConnectionQuality, NetworkInformation } from './types';

/**
 * Network state and monitoring
 */
class NetworkMonitor {
  private isMetered = false;
  private currentQuality: ConnectionQuality = 'good';
  private networkChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private changeListeners: Set<(isMetered: boolean) => void> = new Set();
  private qualityListeners: Set<(quality: ConnectionQuality) => void> =
    new Set();

  /**
   * Get the browser's Network Information API connection object
   */
  private getConnection(): NetworkInformation | undefined {
    return (navigator as Navigator & { connection?: NetworkInformation })
      .connection;
  }

  /**
   * Initialize network monitoring
   * Detects metered connections (cellular) and connection quality to reduce data usage
   */
  initialize(): void {
    // Set initial quality based on online status
    this.currentQuality = navigator.onLine ? 'good' : 'offline';

    const connection = this.getConnection();
    if (!connection) {
      return;
    }

    // Check initial network state
    this.updateNetworkState(connection);

    // Subscribe to network changes
    if (!this.networkChangeHandler) {
      this.networkChangeHandler = () => {
        const wasMetered = this.isMetered;
        const previousQuality = this.currentQuality;
        this.updateNetworkState(connection);

        // Notify metered listeners if metered state changed
        if (wasMetered !== this.isMetered) {
          this.notifyListeners();
        }

        // Notify quality listeners if quality changed
        if (previousQuality !== this.currentQuality) {
          this.notifyQualityListeners();
        }
      };
      connection.addEventListener('change', this.networkChangeHandler);
    }
  }

  /**
   * Update network metered state and connection quality from connection info
   */
  private updateNetworkState(connection: NetworkInformation): void {
    // Consider connection metered if:
    // 1. User has enabled data saver mode
    // 2. Connection type is cellular
    // 3. Effective type is slow (2G or slower)
    this.isMetered =
      connection.saveData === true ||
      connection.type === 'cellular' ||
      connection.effectiveType === 'slow-2g' ||
      connection.effectiveType === '2g';

    // Update connection quality
    this.currentQuality = this.detectConnectionQuality(connection);
  }

  /**
   * Detect connection quality from Network Information API and online status.
   * Returns 'offline' when navigator.onLine is false, 'slow' for degraded
   * connections (2g, slow-2g, data saver), and 'good' otherwise.
   * Falls back to 'good' when the Network Information API is unavailable.
   */
  private detectConnectionQuality(
    connection?: NetworkInformation,
  ): ConnectionQuality {
    if (!navigator.onLine) return 'offline';

    if (connection) {
      if (
        connection.effectiveType === '2g' ||
        connection.effectiveType === 'slow-2g'
      ) {
        return 'slow';
      }
      if (connection.saveData) {
        return 'slow';
      }
    }

    return 'good';
  }

  /**
   * Check if current connection is metered
   */
  isMeteredConnection(): boolean {
    return this.isMetered;
  }

  /**
   * Get the current connection quality ('good', 'slow', or 'offline').
   * Uses the Network Information API when available, falls back to
   * navigator.onLine for basic online/offline detection.
   */
  getConnectionQuality(): ConnectionQuality {
    return this.currentQuality;
  }

  /**
   * Subscribe to metered state changes
   */
  onMeteredChange(callback: (isMetered: boolean) => void): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  /**
   * Subscribe to connection quality changes
   */
  onQualityChange(
    callback: (quality: ConnectionQuality) => void,
  ): () => void {
    this.qualityListeners.add(callback);
    return () => {
      this.qualityListeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of metered state change
   */
  private notifyListeners(): void {
    for (const listener of this.changeListeners) {
      listener(this.isMetered);
    }
  }

  /**
   * Notify all listeners of connection quality change
   */
  private notifyQualityListeners(): void {
    for (const listener of this.qualityListeners) {
      listener(this.currentQuality);
    }
  }

  /**
   * Register online/offline handlers
   * Also updates connection quality when online/offline status changes
   */
  registerOnlineHandlers(onOnline: () => void, onOffline: () => void): void {
    this.onlineHandler = () => {
      const previousQuality = this.currentQuality;
      // Re-evaluate quality using current connection info
      const connection = this.getConnection();
      this.currentQuality = this.detectConnectionQuality(connection);
      if (previousQuality !== this.currentQuality) {
        this.notifyQualityListeners();
      }
      onOnline();
    };
    this.offlineHandler = () => {
      const previousQuality = this.currentQuality;
      this.currentQuality = 'offline';
      if (previousQuality !== this.currentQuality) {
        this.notifyQualityListeners();
      }
      onOffline();
    };
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  /**
   * Cleanup event listeners
   */
  cleanup(): void {
    const connection = this.getConnection();

    if (this.networkChangeHandler && connection) {
      connection.removeEventListener('change', this.networkChangeHandler);
      this.networkChangeHandler = null;
    }

    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }

    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }

    this.changeListeners.clear();
    this.qualityListeners.clear();
  }
}

// Singleton instance
export const networkMonitor = new NetworkMonitor();
