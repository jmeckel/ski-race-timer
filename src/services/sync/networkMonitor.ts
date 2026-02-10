/**
 * Network Monitor Module
 * Detects metered connections (cellular) and network changes for data-aware polling
 */

import type { NetworkInformation } from './types';

/**
 * Network state and monitoring
 */
class NetworkMonitor {
  private isMetered = false;
  private networkChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private changeListeners: Set<(isMetered: boolean) => void> = new Set();

  /**
   * Get the browser's Network Information API connection object
   */
  private getConnection(): NetworkInformation | undefined {
    return (navigator as Navigator & { connection?: NetworkInformation })
      .connection;
  }

  /**
   * Initialize network monitoring
   * Detects metered connections (cellular) to reduce data usage
   */
  initialize(): void {
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
        this.updateNetworkState(connection);

        // Notify listeners if metered state changed
        if (wasMetered !== this.isMetered) {
          this.notifyListeners();
        }
      };
      connection.addEventListener('change', this.networkChangeHandler);
    }
  }

  /**
   * Update network metered state from connection info
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
  }

  /**
   * Check if current connection is metered
   */
  isMeteredConnection(): boolean {
    return this.isMetered;
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
   * Notify all listeners of metered state change
   */
  private notifyListeners(): void {
    for (const listener of this.changeListeners) {
      listener(this.isMetered);
    }
  }

  /**
   * Register online/offline handlers
   */
  registerOnlineHandlers(onOnline: () => void, onOffline: () => void): void {
    this.onlineHandler = onOnline;
    this.offlineHandler = onOffline;
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
  }
}

// Singleton instance
export const networkMonitor = new NetworkMonitor();
