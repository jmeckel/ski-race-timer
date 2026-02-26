/**
 * Custom Event Type Definitions
 *
 * Documents all CustomEvents used for cross-module communication in the app.
 * Events are dispatched on `window` unless noted otherwise.
 *
 * This file provides type-safety and serves as a central registry of all
 * custom events. Runtime behavior is not affected by this file.
 */

import type { ConfirmModalAction } from '../features/resultsView';
import type { ErrorContext } from '../utils/errors';
import type { Entry, FaultEntry, Language } from './index';

// ===== Window-level Custom Events =====
// Dispatched via window.dispatchEvent(new CustomEvent(...))

/**
 * All custom events dispatched on the window object.
 *
 * Usage pattern:
 *   // Dispatch
 *   window.dispatchEvent(new CustomEvent<AppCustomEventMap['event-name']>('event-name', { detail: ... }));
 *
 *   // Listen
 *   window.addEventListener('event-name', ((e: CustomEvent<AppCustomEventMap['event-name']>) => { ... }) as EventListener);
 */
export interface AppCustomEventMap {
  // ===== Storage Events (from store/index.ts) =====

  /** LocalStorage quota warning - storage usage approaching limit */
  'storage-warning': {
    usage: number;
    quota: number;
    percent: number;
    critical?: boolean;
  };

  /** LocalStorage save failure - data may not be persisted */
  'storage-error': {
    message: string;
    isQuotaError: boolean;
    entryCount: number;
    retriesExhausted?: boolean;
  };

  // ===== Auth Events (from services/auth.ts) =====

  /** JWT token expired - user needs to re-authenticate */
  'auth-expired': {
    message: string;
  };

  // ===== Sync Events (from services/sync/) =====

  /** Fault sync fetch failed */
  'fault-sync-error': {
    error: string;
  };

  /** Race deleted by admin via race management */
  'race-deleted': {
    raceId: string;
    deletedAt: number;
    message: string;
  };

  /** Show a toast notification (used by sync service to avoid circular imports) */
  'show-toast': {
    message: string;
    type: 'success' | 'warning' | 'error';
    duration?: number;
  };

  // ===== Error Events (from utils/errors.ts) =====

  /** Critical application error requiring attention */
  'critical-error': ErrorContext;

  // ===== Results View Events (from features/resultsView.ts) =====

  /** Open edit modal for a timing entry */
  'open-edit-modal': {
    entry: Entry;
  };

  /** Prompt user to confirm deletion of a timing entry */
  'prompt-delete': {
    entry: Entry;
  };

  /** Open confirmation modal for bulk actions */
  'open-confirm-modal': {
    action: ConfirmModalAction;
  };

  // ===== Settings View Events (from features/settingsView.ts) =====

  /** Language changed in settings — triggers translation refresh */
  'settings-language-changed': undefined;

  /** Request photo sync warning modal display */
  'request-photo-sync-warning': undefined;

  /** Request race change dialog with export/delete/keep options */
  'request-race-change-dialog': {
    type: 'synced' | 'unsynced';
    lang: Language;
  };

  // ===== Gate Judge Events (from features/gateJudgeView.ts) =====

  /** Request settings view to update role toggle UI */
  'update-role-toggle': undefined;

  // ===== Chief Judge Events (from features/chiefJudgeView.ts) =====

  /** Request PIN verification for chief judge access (Promise-based) */
  'request-pin-verification': {
    lang: Language;
  };

  /** Open fault edit modal from chief judge panel */
  'open-fault-edit-modal': {
    fault: FaultEntry;
  };

  /** Open mark-for-deletion modal from chief judge panel */
  'open-mark-deletion-modal': {
    fault: FaultEntry;
  };

  /** Trigger inline faults list refresh in gate judge mode */
  'update-inline-faults-list': undefined;

  /** Trigger inline bib selector refresh in gate judge mode */
  'update-inline-bib-selector': undefined;

  /** Trigger inline gate selector refresh in gate judge mode */
  'update-inline-gate-selector': undefined;

  // ===== Fault Edit Events (from features/faults/faultOperations.ts) =====

  /** Mic button clicked in fault edit modal - triggers voice recording */
  'fault-edit-mic-click': {
    faultId: string;
  };
}

// ===== Element-level Custom Events =====
// Dispatched via element.dispatchEvent() with { bubbles: true }

/**
 * Custom events dispatched on DOM elements (bubble up through the DOM tree).
 * Used primarily by VirtualList for fault item interactions.
 */
export interface ElementCustomEventMap {
  /** Request to edit a fault entry (from VirtualList fault item) */
  'fault-edit-request': {
    fault: FaultEntry;
  };

  /** Request to delete a fault entry (from VirtualList fault item) */
  'fault-delete-request': {
    fault: FaultEntry;
  };
}

// ===== Typed Event Helper =====

/**
 * Helper type for creating typed CustomEvent listeners.
 *
 * @example
 * ```typescript
 * const handler: TypedCustomEventListener<'race-deleted'> = (e) => {
 *   console.log(e.detail.raceId); // fully typed
 * };
 * window.addEventListener('race-deleted', handler as EventListener);
 * ```
 */
export type TypedCustomEventListener<K extends keyof AppCustomEventMap> =
  AppCustomEventMap[K] extends void
    ? (event: CustomEvent<undefined>) => void
    : (event: CustomEvent<AppCustomEventMap[K]>) => void;
