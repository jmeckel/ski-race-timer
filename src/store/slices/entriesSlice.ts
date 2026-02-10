/**
 * Entries Slice
 * Handles Entry CRUD operations, undo/redo, and cloud sync queue
 */

import type { Action, Entry, SyncQueueItem } from '../../types';
import { isValidEntry } from '../../utils/validation';

// Maximum undo stack size
const MAX_UNDO_STACK = 50;

/**
 * Add entry to entries array
 */
export function addEntry(
  entries: Entry[],
  entry: Entry,
  undoStack: Action[],
  _redoStack: Action[],
): { entries: Entry[]; undoStack: Action[]; redoStack: Action[] } {
  const newEntries = [...entries, entry];
  const newUndoStack = pushUndo(undoStack, {
    type: 'ADD_ENTRY',
    data: entry,
    timestamp: Date.now(),
  });
  return { entries: newEntries, undoStack: newUndoStack, redoStack: [] };
}

/**
 * Delete entry by ID
 */
export function deleteEntry(
  entries: Entry[],
  id: string,
  undoStack: Action[],
  _redoStack: Action[],
): { entries: Entry[]; undoStack: Action[]; redoStack: Action[] } | null {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;

  const newUndoStack = pushUndo(undoStack, {
    type: 'DELETE_ENTRY',
    data: entry,
    timestamp: Date.now(),
  });

  return {
    entries: entries.filter((e) => e.id !== id),
    undoStack: newUndoStack,
    redoStack: [],
  };
}

/**
 * Delete multiple entries by IDs
 */
export function deleteMultiple(
  entries: Entry[],
  ids: string[],
  undoStack: Action[],
  _redoStack: Action[],
): { entries: Entry[]; undoStack: Action[]; redoStack: Action[] } | null {
  const deletedEntries = entries.filter((e) => ids.includes(e.id));
  if (deletedEntries.length === 0) return null;

  const newUndoStack = pushUndo(undoStack, {
    type: 'DELETE_MULTIPLE',
    data: deletedEntries,
    timestamp: Date.now(),
  });

  return {
    entries: entries.filter((e) => !ids.includes(e.id)),
    undoStack: newUndoStack,
    redoStack: [],
  };
}

/**
 * Clear all entries
 */
export function clearAll(
  entries: Entry[],
  undoStack: Action[],
  _redoStack: Action[],
): { entries: Entry[]; undoStack: Action[]; redoStack: Action[] } | null {
  if (entries.length === 0) return null;

  const newUndoStack = pushUndo(undoStack, {
    type: 'CLEAR_ALL',
    data: [...entries],
    timestamp: Date.now(),
  });

  return { entries: [], undoStack: newUndoStack, redoStack: [] };
}

/**
 * Update an entry by ID
 */
export function updateEntry(
  entries: Entry[],
  id: string,
  updates: Partial<Entry>,
  undoStack: Action[],
  _redoStack: Action[],
): { entries: Entry[]; undoStack: Action[]; redoStack: Action[] } | null {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return null;

  const oldEntry = entries[index];
  const newEntry = { ...oldEntry, ...updates };

  const newUndoStack = pushUndo(undoStack, {
    type: 'UPDATE_ENTRY',
    data: oldEntry,
    newData: newEntry,
    timestamp: Date.now(),
  });

  const newEntries = [...entries];
  newEntries[index] = newEntry;
  return { entries: newEntries, undoStack: newUndoStack, redoStack: [] };
}

/**
 * Push action to undo stack
 */
export function pushUndo(undoStack: Action[], action: Action): Action[] {
  const newStack = [...undoStack, action];
  if (newStack.length > MAX_UNDO_STACK) {
    newStack.shift();
  }
  return newStack;
}

/**
 * Perform undo operation
 */
export function undo(
  entries: Entry[],
  undoStack: Action[],
  redoStack: Action[],
): {
  entries: Entry[];
  undoStack: Action[];
  redoStack: Action[];
  result: { type: Action['type']; data: Entry | Entry[] } | null;
} {
  if (undoStack.length === 0) {
    return { entries, undoStack, redoStack, result: null };
  }

  const newUndoStack = [...undoStack];
  const action = newUndoStack.pop()!;
  const newRedoStack = [...redoStack, action];

  let newEntries = [...entries];
  let result: Entry | Entry[] | null = null;

  switch (action.type) {
    case 'ADD_ENTRY': {
      const entry = action.data as Entry;
      newEntries = newEntries.filter((e) => e.id !== entry.id);
      result = entry;
      break;
    }
    case 'DELETE_ENTRY': {
      const entry = action.data as Entry;
      newEntries.push(entry);
      newEntries.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      result = entry;
      break;
    }
    case 'DELETE_MULTIPLE':
    case 'CLEAR_ALL': {
      const deletedEntries = action.data as Entry[];
      newEntries = [...newEntries, ...deletedEntries];
      newEntries.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      result = deletedEntries;
      break;
    }
    case 'UPDATE_ENTRY': {
      const oldEntry = action.data as Entry;
      const index = newEntries.findIndex((e) => e.id === oldEntry.id);
      if (index !== -1) {
        newEntries[index] = oldEntry;
      }
      result = oldEntry;
      break;
    }
  }

  return {
    entries: newEntries,
    undoStack: newUndoStack,
    redoStack: newRedoStack,
    result: result ? { type: action.type, data: result } : null,
  };
}

/**
 * Perform redo operation
 */
export function redo(
  entries: Entry[],
  undoStack: Action[],
  redoStack: Action[],
): {
  entries: Entry[];
  undoStack: Action[];
  redoStack: Action[];
  result: Entry | Entry[] | null;
} {
  if (redoStack.length === 0) {
    return { entries, undoStack, redoStack, result: null };
  }

  const newRedoStack = [...redoStack];
  const action = newRedoStack.pop()!;
  const newUndoStack = [...undoStack, action];

  let newEntries = [...entries];
  let result: Entry | Entry[] | null = null;

  switch (action.type) {
    case 'ADD_ENTRY': {
      const entry = action.data as Entry;
      newEntries.push(entry);
      newEntries.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      result = entry;
      break;
    }
    case 'DELETE_ENTRY': {
      const entry = action.data as Entry;
      newEntries = newEntries.filter((e) => e.id !== entry.id);
      result = entry;
      break;
    }
    case 'DELETE_MULTIPLE':
    case 'CLEAR_ALL': {
      const deletedEntries = action.data as Entry[];
      const idsToDelete = new Set(deletedEntries.map((e) => e.id));
      newEntries = newEntries.filter((e) => !idsToDelete.has(e.id));
      result = deletedEntries;
      break;
    }
    case 'UPDATE_ENTRY': {
      const oldEntry = action.data as Entry;
      const newEntry = action.newData as Entry;
      const index = newEntries.findIndex((e) => e.id === oldEntry.id);
      if (index !== -1 && newEntry) {
        newEntries[index] = newEntry;
      }
      result = newEntry || oldEntry;
      break;
    }
  }

  return {
    entries: newEntries,
    undoStack: newUndoStack,
    redoStack: newRedoStack,
    result,
  };
}

// ===== Sync Queue Operations =====

/**
 * Add entry to sync queue
 */
export function addToSyncQueue(
  syncQueue: SyncQueueItem[],
  entry: Entry,
): SyncQueueItem[] {
  const item: SyncQueueItem = {
    entry,
    retryCount: 0,
    lastAttempt: 0,
  };
  return [...syncQueue, item];
}

/**
 * Remove entry from sync queue
 */
export function removeFromSyncQueue(
  syncQueue: SyncQueueItem[],
  entryId: string,
): SyncQueueItem[] {
  return syncQueue.filter((item) => item.entry.id !== entryId);
}

/**
 * Update sync queue item
 */
export function updateSyncQueueItem(
  syncQueue: SyncQueueItem[],
  entryId: string,
  updates: Partial<SyncQueueItem>,
): SyncQueueItem[] {
  return syncQueue.map((item) =>
    item.entry.id === entryId ? { ...item, ...updates } : item,
  );
}

// ===== Cloud Merge Operations =====

/**
 * Merge entries from cloud
 */
export function mergeCloudEntries(
  entries: Entry[],
  cloudEntries: Entry[],
  deletedIds: string[],
  localDeviceId: string,
): { entries: Entry[]; addedCount: number } {
  let addedCount = 0;
  const existingIds = new Set(entries.map((e) => `${e.id}-${e.deviceId}`));
  const deletedSet = new Set(deletedIds);
  const newEntries: Entry[] = [];

  for (const entry of cloudEntries) {
    // Skip invalid entries
    if (!isValidEntry(entry)) continue;

    // Skip entries from this device
    if (entry.deviceId === localDeviceId) continue;

    // Skip entries that were deleted
    const deleteKey = `${entry.id}:${entry.deviceId}`;
    if (deletedSet.has(deleteKey) || deletedSet.has(entry.id)) continue;

    // Skip duplicates
    const key = `${entry.id}-${entry.deviceId}`;
    if (existingIds.has(key)) continue;

    // Ensure run field exists (backwards compat)
    newEntries.push({ ...entry, run: entry.run ?? 1 });
    existingIds.add(key);
    addedCount++;
  }

  if (newEntries.length > 0) {
    const allEntries = [...entries, ...newEntries];
    allEntries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return { entries: allEntries, addedCount };
  }

  return { entries, addedCount };
}

/**
 * Remove deleted cloud entries
 */
export function removeDeletedCloudEntries(
  entries: Entry[],
  deletedIds: string[],
): { entries: Entry[]; removedCount: number } {
  const deletedSet = new Set(deletedIds);
  let removedCount = 0;

  const filteredEntries = entries.filter((entry) => {
    const deleteKey = `${entry.id}:${entry.deviceId}`;
    const isDeleted = deletedSet.has(deleteKey) || deletedSet.has(entry.id);

    if (isDeleted) {
      removedCount++;
      return false;
    }
    return true;
  });

  return { entries: filteredEntries, removedCount };
}
