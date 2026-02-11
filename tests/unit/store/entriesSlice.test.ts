/**
 * Unit Tests for Entries Slice
 * Tests: CRUD operations, undo/redo, sync queue, cloud merge
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEntry,
  addToSyncQueue,
  clearAll,
  deleteEntry,
  deleteMultiple,
  mergeCloudEntries,
  pushUndo,
  redo,
  removeDeletedCloudEntries,
  removeFromSyncQueue,
  undo,
  updateEntry,
  updateSyncQueueItem,
} from '../../../src/store/slices/entriesSlice';
import type { Action, Entry } from '../../../src/types';
import { createEntry, resetFactoryCounters } from '../../helpers/factories';

beforeEach(() => {
  resetFactoryCounters();
});

describe('Entries Slice', () => {
  // =========================================================================
  // 1. addEntry
  // =========================================================================
  describe('addEntry', () => {
    it('should add an entry to an empty array', () => {
      const entry = createEntry({ id: 'e1', bib: '001' });
      const result = addEntry([], entry, [], []);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual(entry);
    });

    it('should append entry to existing entries', () => {
      const existing = [createEntry({ id: 'e1' })];
      const newEntry = createEntry({ id: 'e2' });
      const result = addEntry(existing, newEntry, [], []);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e2');
    });

    it('should push ADD_ENTRY action onto undo stack', () => {
      const entry = createEntry({ id: 'e1' });
      const result = addEntry([], entry, [], []);

      expect(result.undoStack).toHaveLength(1);
      expect(result.undoStack[0].type).toBe('ADD_ENTRY');
      expect(result.undoStack[0].data).toEqual(entry);
      expect(result.undoStack[0].timestamp).toBeGreaterThan(0);
    });

    it('should clear the redo stack', () => {
      const entry = createEntry();
      const existingRedo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: Date.now() },
      ];
      const result = addEntry([], entry, [], existingRedo);

      expect(result.redoStack).toHaveLength(0);
    });

    it('should not mutate the original entries array', () => {
      const original: Entry[] = [];
      const entry = createEntry();
      addEntry(original, entry, [], []);

      expect(original).toHaveLength(0);
    });

    it('should preserve existing undo stack items', () => {
      const existingUndo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: 1000 },
      ];
      const entry = createEntry();
      const result = addEntry([], entry, existingUndo, []);

      expect(result.undoStack).toHaveLength(2);
      expect(result.undoStack[0].timestamp).toBe(1000);
      expect(result.undoStack[1].type).toBe('ADD_ENTRY');
    });
  });

  // =========================================================================
  // 2. deleteEntry
  // =========================================================================
  describe('deleteEntry', () => {
    it('should delete an existing entry by ID', () => {
      const entries = [
        createEntry({ id: 'e1' }),
        createEntry({ id: 'e2' }),
        createEntry({ id: 'e3' }),
      ];
      const result = deleteEntry(entries, 'e2', [], []);

      expect(result).not.toBeNull();
      expect(result!.entries).toHaveLength(2);
      expect(result!.entries.find((e) => e.id === 'e2')).toBeUndefined();
    });

    it('should return null when entry does not exist', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = deleteEntry(entries, 'nonexistent', [], []);

      expect(result).toBeNull();
    });

    it('should push DELETE_ENTRY action onto undo stack', () => {
      const entry = createEntry({ id: 'e1', bib: '042' });
      const result = deleteEntry([entry], 'e1', [], []);

      expect(result).not.toBeNull();
      expect(result!.undoStack).toHaveLength(1);
      expect(result!.undoStack[0].type).toBe('DELETE_ENTRY');
      expect(result!.undoStack[0].data).toEqual(entry);
    });

    it('should clear the redo stack', () => {
      const entry = createEntry({ id: 'e1' });
      const existingRedo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: Date.now() },
      ];
      const result = deleteEntry([entry], 'e1', [], existingRedo);

      expect(result).not.toBeNull();
      expect(result!.redoStack).toHaveLength(0);
    });

    it('should not mutate the original entries array', () => {
      const entries = [createEntry({ id: 'e1' })];
      deleteEntry(entries, 'e1', [], []);

      expect(entries).toHaveLength(1);
    });
  });

  // =========================================================================
  // 3. deleteMultiple
  // =========================================================================
  describe('deleteMultiple', () => {
    it('should delete multiple entries by IDs', () => {
      const entries = [
        createEntry({ id: 'e1' }),
        createEntry({ id: 'e2' }),
        createEntry({ id: 'e3' }),
        createEntry({ id: 'e4' }),
      ];
      const result = deleteMultiple(entries, ['e1', 'e3'], [], []);

      expect(result).not.toBeNull();
      expect(result!.entries).toHaveLength(2);
      expect(result!.entries[0].id).toBe('e2');
      expect(result!.entries[1].id).toBe('e4');
    });

    it('should return null when no IDs match', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = deleteMultiple(entries, ['nonexistent'], [], []);

      expect(result).toBeNull();
    });

    it('should return null for empty IDs array', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = deleteMultiple(entries, [], [], []);

      expect(result).toBeNull();
    });

    it('should handle partial match (some IDs exist, some do not)', () => {
      const entries = [createEntry({ id: 'e1' }), createEntry({ id: 'e2' })];
      const result = deleteMultiple(entries, ['e1', 'nonexistent'], [], []);

      expect(result).not.toBeNull();
      expect(result!.entries).toHaveLength(1);
      expect(result!.entries[0].id).toBe('e2');
    });

    it('should push DELETE_MULTIPLE action with only found entries', () => {
      const e1 = createEntry({ id: 'e1' });
      const e2 = createEntry({ id: 'e2' });
      const result = deleteMultiple([e1, e2], ['e1', 'missing'], [], []);

      expect(result).not.toBeNull();
      expect(result!.undoStack).toHaveLength(1);
      expect(result!.undoStack[0].type).toBe('DELETE_MULTIPLE');
      const deletedData = result!.undoStack[0].data as Entry[];
      expect(deletedData).toHaveLength(1);
      expect(deletedData[0].id).toBe('e1');
    });

    it('should clear the redo stack', () => {
      const entries = [createEntry({ id: 'e1' })];
      const existingRedo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: Date.now() },
      ];
      const result = deleteMultiple(entries, ['e1'], [], existingRedo);

      expect(result).not.toBeNull();
      expect(result!.redoStack).toHaveLength(0);
    });

    it('should not mutate the original entries array', () => {
      const entries = [createEntry({ id: 'e1' }), createEntry({ id: 'e2' })];
      deleteMultiple(entries, ['e1'], [], []);

      expect(entries).toHaveLength(2);
    });
  });

  // =========================================================================
  // 4. clearAll
  // =========================================================================
  describe('clearAll', () => {
    it('should clear all entries', () => {
      const entries = [
        createEntry({ id: 'e1' }),
        createEntry({ id: 'e2' }),
        createEntry({ id: 'e3' }),
      ];
      const result = clearAll(entries, [], []);

      expect(result).not.toBeNull();
      expect(result!.entries).toHaveLength(0);
    });

    it('should return null if entries are already empty', () => {
      const result = clearAll([], [], []);

      expect(result).toBeNull();
    });

    it('should push CLEAR_ALL action with all entries as data', () => {
      const entries = [createEntry({ id: 'e1' }), createEntry({ id: 'e2' })];
      const result = clearAll(entries, [], []);

      expect(result).not.toBeNull();
      expect(result!.undoStack).toHaveLength(1);
      expect(result!.undoStack[0].type).toBe('CLEAR_ALL');
      const clearedData = result!.undoStack[0].data as Entry[];
      expect(clearedData).toHaveLength(2);
    });

    it('should clear the redo stack', () => {
      const entries = [createEntry({ id: 'e1' })];
      const existingRedo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: Date.now() },
      ];
      const result = clearAll(entries, [], existingRedo);

      expect(result).not.toBeNull();
      expect(result!.redoStack).toHaveLength(0);
    });

    it('should not mutate the original entries array', () => {
      const entries = [createEntry({ id: 'e1' })];
      clearAll(entries, [], []);

      expect(entries).toHaveLength(1);
    });
  });

  // =========================================================================
  // 5. updateEntry
  // =========================================================================
  describe('updateEntry', () => {
    it('should update an existing entry with partial fields', () => {
      const entries = [createEntry({ id: 'e1', bib: '001', status: 'ok' })];
      const result = updateEntry(
        entries,
        'e1',
        { bib: '099', status: 'dnf' },
        [],
        [],
      );

      expect(result).not.toBeNull();
      expect(result!.entries[0].bib).toBe('099');
      expect(result!.entries[0].status).toBe('dnf');
    });

    it('should return null when entry does not exist', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = updateEntry(
        entries,
        'nonexistent',
        { bib: '099' },
        [],
        [],
      );

      expect(result).toBeNull();
    });

    it('should push UPDATE_ENTRY action with old and new data', () => {
      const original = createEntry({ id: 'e1', bib: '001' });
      const result = updateEntry([original], 'e1', { bib: '099' }, [], []);

      expect(result).not.toBeNull();
      expect(result!.undoStack).toHaveLength(1);
      const action = result!.undoStack[0];
      expect(action.type).toBe('UPDATE_ENTRY');
      expect((action.data as Entry).bib).toBe('001');
      expect((action.newData as Entry).bib).toBe('099');
    });

    it('should preserve unchanged fields', () => {
      const entries = [
        createEntry({
          id: 'e1',
          bib: '001',
          point: 'S',
          run: 1,
          status: 'ok',
          deviceId: 'dev_test',
        }),
      ];
      const result = updateEntry(entries, 'e1', { bib: '099' }, [], []);

      expect(result).not.toBeNull();
      expect(result!.entries[0].point).toBe('S');
      expect(result!.entries[0].run).toBe(1);
      expect(result!.entries[0].status).toBe('ok');
      expect(result!.entries[0].deviceId).toBe('dev_test');
    });

    it('should clear the redo stack', () => {
      const entries = [createEntry({ id: 'e1' })];
      const existingRedo: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: Date.now() },
      ];
      const result = updateEntry(
        entries,
        'e1',
        { bib: '099' },
        [],
        existingRedo,
      );

      expect(result).not.toBeNull();
      expect(result!.redoStack).toHaveLength(0);
    });

    it('should not mutate the original entries array', () => {
      const entries = [createEntry({ id: 'e1', bib: '001' })];
      updateEntry(entries, 'e1', { bib: '099' }, [], []);

      expect(entries[0].bib).toBe('001');
    });

    it('should update the correct entry when multiple exist', () => {
      const entries = [
        createEntry({ id: 'e1', bib: '001' }),
        createEntry({ id: 'e2', bib: '002' }),
        createEntry({ id: 'e3', bib: '003' }),
      ];
      const result = updateEntry(entries, 'e2', { bib: '099' }, [], []);

      expect(result).not.toBeNull();
      expect(result!.entries[0].bib).toBe('001');
      expect(result!.entries[1].bib).toBe('099');
      expect(result!.entries[2].bib).toBe('003');
    });
  });

  // =========================================================================
  // 6. pushUndo
  // =========================================================================
  describe('pushUndo', () => {
    it('should push an action onto an empty stack', () => {
      const action: Action = {
        type: 'ADD_ENTRY',
        data: createEntry(),
        timestamp: Date.now(),
      };
      const result = pushUndo([], action);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(action);
    });

    it('should push an action onto an existing stack', () => {
      const existing: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: 1000 },
      ];
      const action: Action = {
        type: 'DELETE_ENTRY',
        data: createEntry(),
        timestamp: 2000,
      };
      const result = pushUndo(existing, action);

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(2000);
    });

    it('should cap at MAX_UNDO_STACK (50) entries', () => {
      const stack: Action[] = [];
      for (let i = 0; i < 50; i++) {
        stack.push({
          type: 'ADD_ENTRY',
          data: createEntry({ id: `e${i}` }),
          timestamp: i,
        });
      }

      const newAction: Action = {
        type: 'ADD_ENTRY',
        data: createEntry({ id: 'overflow' }),
        timestamp: 999,
      };
      const result = pushUndo(stack, newAction);

      expect(result).toHaveLength(50);
      // The first item (timestamp 0) should have been shifted off
      expect(result[0].timestamp).toBe(1);
      expect(result[result.length - 1].timestamp).toBe(999);
    });

    it('should not exceed 50 even with multiple pushes', () => {
      let stack: Action[] = [];
      for (let i = 0; i < 60; i++) {
        stack = pushUndo(stack, {
          type: 'ADD_ENTRY',
          data: createEntry({ id: `e${i}` }),
          timestamp: i,
        });
      }

      expect(stack).toHaveLength(50);
      // Should have items 10-59
      expect(stack[0].timestamp).toBe(10);
      expect(stack[49].timestamp).toBe(59);
    });

    it('should not mutate the original stack', () => {
      const original: Action[] = [
        { type: 'ADD_ENTRY', data: createEntry(), timestamp: 1000 },
      ];
      pushUndo(original, {
        type: 'DELETE_ENTRY',
        data: createEntry(),
        timestamp: 2000,
      });

      expect(original).toHaveLength(1);
    });
  });

  // =========================================================================
  // 7. undo
  // =========================================================================
  describe('undo', () => {
    it('should return null result when undo stack is empty', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = undo(entries, [], []);

      expect(result.result).toBeNull();
      expect(result.entries).toEqual(entries);
      expect(result.undoStack).toHaveLength(0);
      expect(result.redoStack).toHaveLength(0);
    });

    it('should undo ADD_ENTRY by removing the added entry', () => {
      const entry = createEntry({ id: 'e1', bib: '042' });
      const undoStack: Action[] = [
        { type: 'ADD_ENTRY', data: entry, timestamp: Date.now() },
      ];

      const result = undo([entry], undoStack, []);

      expect(result.entries).toHaveLength(0);
      expect(result.undoStack).toHaveLength(0);
      expect(result.redoStack).toHaveLength(1);
      expect(result.result).not.toBeNull();
      expect(result.result!.type).toBe('ADD_ENTRY');
      expect((result.result!.data as Entry).id).toBe('e1');
    });

    it('should undo DELETE_ENTRY by restoring the deleted entry', () => {
      const deletedEntry = createEntry({
        id: 'e1',
        bib: '042',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const undoStack: Action[] = [
        { type: 'DELETE_ENTRY', data: deletedEntry, timestamp: Date.now() },
      ];

      const result = undo([], undoStack, []);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
      expect(result.undoStack).toHaveLength(0);
      expect(result.redoStack).toHaveLength(1);
      expect(result.result!.type).toBe('DELETE_ENTRY');
    });

    it('should undo DELETE_ENTRY and sort entries by timestamp', () => {
      const earlier = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T08:00:00.000Z',
      });
      const later = createEntry({
        id: 'e2',
        timestamp: '2024-01-15T12:00:00.000Z',
      });
      const restored = createEntry({
        id: 'e3',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const undoStack: Action[] = [
        { type: 'DELETE_ENTRY', data: restored, timestamp: Date.now() },
      ];

      const result = undo([earlier, later], undoStack, []);

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e3');
      expect(result.entries[2].id).toBe('e2');
    });

    it('should undo DELETE_MULTIPLE by restoring all deleted entries', () => {
      const deleted1 = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T09:00:00.000Z',
      });
      const deleted2 = createEntry({
        id: 'e2',
        timestamp: '2024-01-15T11:00:00.000Z',
      });

      const undoStack: Action[] = [
        {
          type: 'DELETE_MULTIPLE',
          data: [deleted1, deleted2],
          timestamp: Date.now(),
        },
      ];

      const remaining = createEntry({
        id: 'e3',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const result = undo([remaining], undoStack, []);

      expect(result.entries).toHaveLength(3);
      // Should be sorted by timestamp
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e3');
      expect(result.entries[2].id).toBe('e2');
      expect(result.result!.type).toBe('DELETE_MULTIPLE');
    });

    it('should undo CLEAR_ALL by restoring all entries', () => {
      const cleared = [
        createEntry({ id: 'e1', timestamp: '2024-01-15T08:00:00.000Z' }),
        createEntry({ id: 'e2', timestamp: '2024-01-15T10:00:00.000Z' }),
      ];

      const undoStack: Action[] = [
        { type: 'CLEAR_ALL', data: cleared, timestamp: Date.now() },
      ];

      const result = undo([], undoStack, []);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e2');
      expect(result.result!.type).toBe('CLEAR_ALL');
    });

    it('should undo UPDATE_ENTRY by restoring the old entry data', () => {
      const oldEntry = createEntry({ id: 'e1', bib: '001' });
      const updatedEntry = createEntry({ id: 'e1', bib: '099' });

      const undoStack: Action[] = [
        {
          type: 'UPDATE_ENTRY',
          data: oldEntry,
          newData: updatedEntry,
          timestamp: Date.now(),
        },
      ];

      const result = undo([updatedEntry], undoStack, []);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].bib).toBe('001');
      expect(result.result!.type).toBe('UPDATE_ENTRY');
    });

    it('should move the undone action to the redo stack', () => {
      const entry = createEntry({ id: 'e1' });
      const action: Action = {
        type: 'ADD_ENTRY',
        data: entry,
        timestamp: 12345,
      };

      const result = undo([entry], [action], []);

      expect(result.redoStack).toHaveLength(1);
      expect(result.redoStack[0]).toEqual(action);
    });

    it('should preserve existing redo stack items', () => {
      const entry = createEntry({ id: 'e1' });
      const action: Action = {
        type: 'ADD_ENTRY',
        data: entry,
        timestamp: 12345,
      };
      const existingRedo: Action[] = [
        { type: 'DELETE_ENTRY', data: createEntry(), timestamp: 11111 },
      ];

      const result = undo([entry], [action], existingRedo);

      expect(result.redoStack).toHaveLength(2);
      expect(result.redoStack[0].timestamp).toBe(11111);
      expect(result.redoStack[1].timestamp).toBe(12345);
    });

    it('should undo the most recent action (last on stack)', () => {
      const entry1 = createEntry({ id: 'e1' });
      const entry2 = createEntry({ id: 'e2' });

      const undoStack: Action[] = [
        { type: 'ADD_ENTRY', data: entry1, timestamp: 1000 },
        { type: 'ADD_ENTRY', data: entry2, timestamp: 2000 },
      ];

      const result = undo([entry1, entry2], undoStack, []);

      // Should undo the second add (e2)
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
      expect(result.undoStack).toHaveLength(1);
      expect(result.undoStack[0].timestamp).toBe(1000);
    });
  });

  // =========================================================================
  // 8. redo
  // =========================================================================
  describe('redo', () => {
    it('should return null result when redo stack is empty', () => {
      const entries = [createEntry({ id: 'e1' })];
      const result = redo(entries, [], []);

      expect(result.result).toBeNull();
      expect(result.entries).toEqual(entries);
      expect(result.undoStack).toHaveLength(0);
      expect(result.redoStack).toHaveLength(0);
    });

    it('should redo ADD_ENTRY by re-adding the entry', () => {
      const entry = createEntry({
        id: 'e1',
        bib: '042',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const redoStack: Action[] = [
        { type: 'ADD_ENTRY', data: entry, timestamp: Date.now() },
      ];

      const result = redo([], [], redoStack);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
      expect(result.redoStack).toHaveLength(0);
      expect(result.undoStack).toHaveLength(1);
      expect(result.result).toEqual(entry);
    });

    it('should redo ADD_ENTRY and sort by timestamp', () => {
      const earlier = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T08:00:00.000Z',
      });
      const later = createEntry({
        id: 'e2',
        timestamp: '2024-01-15T12:00:00.000Z',
      });
      const redone = createEntry({
        id: 'e3',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const redoStack: Action[] = [
        { type: 'ADD_ENTRY', data: redone, timestamp: Date.now() },
      ];

      const result = redo([earlier, later], [], redoStack);

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e3');
      expect(result.entries[2].id).toBe('e2');
    });

    it('should redo DELETE_ENTRY by re-deleting the entry', () => {
      const entry = createEntry({ id: 'e1', bib: '042' });
      const redoStack: Action[] = [
        { type: 'DELETE_ENTRY', data: entry, timestamp: Date.now() },
      ];

      const result = redo([entry], [], redoStack);

      expect(result.entries).toHaveLength(0);
      expect(result.undoStack).toHaveLength(1);
      expect(result.result).toEqual(entry);
    });

    it('should redo DELETE_MULTIPLE by re-deleting all entries', () => {
      const e1 = createEntry({ id: 'e1' });
      const e2 = createEntry({ id: 'e2' });
      const e3 = createEntry({ id: 'e3' });

      const redoStack: Action[] = [
        { type: 'DELETE_MULTIPLE', data: [e1, e3], timestamp: Date.now() },
      ];

      const result = redo([e1, e2, e3], [], redoStack);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e2');
    });

    it('should redo CLEAR_ALL by re-clearing all entries', () => {
      const entries = [createEntry({ id: 'e1' }), createEntry({ id: 'e2' })];

      const redoStack: Action[] = [
        { type: 'CLEAR_ALL', data: entries, timestamp: Date.now() },
      ];

      const result = redo(entries, [], redoStack);

      expect(result.entries).toHaveLength(0);
    });

    it('should redo UPDATE_ENTRY by re-applying the new data', () => {
      const oldEntry = createEntry({ id: 'e1', bib: '001' });
      const newEntry = createEntry({ id: 'e1', bib: '099' });

      const redoStack: Action[] = [
        {
          type: 'UPDATE_ENTRY',
          data: oldEntry,
          newData: newEntry,
          timestamp: Date.now(),
        },
      ];

      const result = redo([oldEntry], [], redoStack);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].bib).toBe('099');
      expect(result.result).toEqual(newEntry);
    });

    it('should move the redone action back to the undo stack', () => {
      const entry = createEntry({ id: 'e1' });
      const action: Action = {
        type: 'ADD_ENTRY',
        data: entry,
        timestamp: 12345,
      };

      const result = redo([], [], [action]);

      expect(result.undoStack).toHaveLength(1);
      expect(result.undoStack[0]).toEqual(action);
    });

    it('should redo the most recent action (last on stack)', () => {
      const entry1 = createEntry({ id: 'e1' });
      const entry2 = createEntry({ id: 'e2' });

      const redoStack: Action[] = [
        { type: 'DELETE_ENTRY', data: entry1, timestamp: 1000 },
        { type: 'DELETE_ENTRY', data: entry2, timestamp: 2000 },
      ];

      const result = redo([entry1, entry2], [], redoStack);

      // Should redo the last action (delete e2)
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
      expect(result.redoStack).toHaveLength(1);
      expect(result.redoStack[0].timestamp).toBe(1000);
    });
  });

  // =========================================================================
  // 9. undo/redo chaining
  // =========================================================================
  describe('undo/redo chaining', () => {
    it('should restore original state after undo then redo (ADD_ENTRY)', () => {
      const entry = createEntry({
        id: 'e1',
        bib: '042',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      // Add the entry
      const afterAdd = addEntry([], entry, [], []);
      expect(afterAdd.entries).toHaveLength(1);

      // Undo the add
      const afterUndo = undo(
        afterAdd.entries,
        afterAdd.undoStack,
        afterAdd.redoStack,
      );
      expect(afterUndo.entries).toHaveLength(0);

      // Redo the add
      const afterRedo = redo(
        afterUndo.entries,
        afterUndo.undoStack,
        afterUndo.redoStack,
      );
      expect(afterRedo.entries).toHaveLength(1);
      expect(afterRedo.entries[0].id).toBe('e1');
      expect(afterRedo.entries[0].bib).toBe('042');
    });

    it('should restore original state after undo then redo (DELETE_ENTRY)', () => {
      const entry = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      // Delete the entry
      const afterDelete = deleteEntry([entry], 'e1', [], []);
      expect(afterDelete).not.toBeNull();
      expect(afterDelete!.entries).toHaveLength(0);

      // Undo the delete
      const afterUndo = undo(
        afterDelete!.entries,
        afterDelete!.undoStack,
        afterDelete!.redoStack,
      );
      expect(afterUndo.entries).toHaveLength(1);
      expect(afterUndo.entries[0].id).toBe('e1');

      // Redo the delete
      const afterRedo = redo(
        afterUndo.entries,
        afterUndo.undoStack,
        afterUndo.redoStack,
      );
      expect(afterRedo.entries).toHaveLength(0);
    });

    it('should restore original state after undo then redo (UPDATE_ENTRY)', () => {
      const original = createEntry({
        id: 'e1',
        bib: '001',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      // Update the entry
      const afterUpdate = updateEntry([original], 'e1', { bib: '099' }, [], []);
      expect(afterUpdate).not.toBeNull();
      expect(afterUpdate!.entries[0].bib).toBe('099');

      // Undo the update
      const afterUndo = undo(
        afterUpdate!.entries,
        afterUpdate!.undoStack,
        afterUpdate!.redoStack,
      );
      expect(afterUndo.entries[0].bib).toBe('001');

      // Redo the update
      const afterRedo = redo(
        afterUndo.entries,
        afterUndo.undoStack,
        afterUndo.redoStack,
      );
      expect(afterRedo.entries[0].bib).toBe('099');
    });

    it('should handle multiple undo/redo cycles', () => {
      const entry = createEntry({
        id: 'e1',
        bib: '001',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      // Add entry
      let state = addEntry([], entry, [], []);

      // Undo, redo, undo, redo
      state = undo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(0);

      state = redo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(1);

      state = undo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(0);

      state = redo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('e1');
    });

    it('should clear redo stack when a new action is performed after undo', () => {
      const entry1 = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const entry2 = createEntry({
        id: 'e2',
        timestamp: '2024-01-15T11:00:00.000Z',
      });

      // Add entry1
      let state = addEntry([], entry1, [], []);

      // Undo the add
      state = undo(state.entries, state.undoStack, state.redoStack);
      expect(state.redoStack).toHaveLength(1);

      // Add entry2 (should clear redo stack)
      state = addEntry(state.entries, entry2, state.undoStack, state.redoStack);
      expect(state.redoStack).toHaveLength(0);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('e2');
    });

    it('should chain multiple operations with undo', () => {
      const e1 = createEntry({
        id: 'e1',
        timestamp: '2024-01-15T08:00:00.000Z',
      });
      const e2 = createEntry({
        id: 'e2',
        timestamp: '2024-01-15T09:00:00.000Z',
      });

      // Add e1
      let state = addEntry([], e1, [], []);
      // Add e2
      state = addEntry(state.entries, e2, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(2);

      // Undo e2 add
      state = undo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('e1');

      // Undo e1 add
      state = undo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(0);

      // Redo e1 add
      state = redo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('e1');

      // Redo e2 add
      state = redo(state.entries, state.undoStack, state.redoStack);
      expect(state.entries).toHaveLength(2);
    });
  });

  // =========================================================================
  // 10. Sync queue
  // =========================================================================
  describe('addToSyncQueue', () => {
    it('should add an entry to an empty sync queue', () => {
      const entry = createEntry({ id: 'e1' });
      const result = addToSyncQueue([], entry);

      expect(result).toHaveLength(1);
      expect(result[0].entry).toEqual(entry);
      expect(result[0].retryCount).toBe(0);
      expect(result[0].lastAttempt).toBe(0);
    });

    it('should append to existing sync queue', () => {
      const existing = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = addToSyncQueue(existing, createEntry({ id: 'e2' }));

      expect(result).toHaveLength(2);
      expect(result[0].entry.id).toBe('e1');
      expect(result[1].entry.id).toBe('e2');
    });

    it('should not mutate the original queue', () => {
      const original = addToSyncQueue([], createEntry({ id: 'e1' }));
      addToSyncQueue(original, createEntry({ id: 'e2' }));

      expect(original).toHaveLength(1);
    });
  });

  describe('removeFromSyncQueue', () => {
    it('should remove an entry from the sync queue by entry id', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const queue2 = addToSyncQueue(queue, createEntry({ id: 'e2' }));

      const result = removeFromSyncQueue(queue2, 'e1');

      expect(result).toHaveLength(1);
      expect(result[0].entry.id).toBe('e2');
    });

    it('should return same-length array when entry not found', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = removeFromSyncQueue(queue, 'nonexistent');

      expect(result).toHaveLength(1);
    });

    it('should handle empty queue', () => {
      const result = removeFromSyncQueue([], 'e1');
      expect(result).toHaveLength(0);
    });

    it('should not mutate the original queue', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      removeFromSyncQueue(queue, 'e1');

      expect(queue).toHaveLength(1);
    });
  });

  describe('updateSyncQueueItem', () => {
    it('should update retryCount for a queue item', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = updateSyncQueueItem(queue, 'e1', { retryCount: 3 });

      expect(result).toHaveLength(1);
      expect(result[0].retryCount).toBe(3);
    });

    it('should update lastAttempt for a queue item', () => {
      const now = Date.now();
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = updateSyncQueueItem(queue, 'e1', { lastAttempt: now });

      expect(result[0].lastAttempt).toBe(now);
    });

    it('should update error field for a queue item', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = updateSyncQueueItem(queue, 'e1', {
        error: 'Network timeout',
      });

      expect(result[0].error).toBe('Network timeout');
    });

    it('should only update the matching item', () => {
      let queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      queue = addToSyncQueue(queue, createEntry({ id: 'e2' }));

      const result = updateSyncQueueItem(queue, 'e1', { retryCount: 5 });

      expect(result[0].retryCount).toBe(5);
      expect(result[1].retryCount).toBe(0);
    });

    it('should not mutate the original queue', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      updateSyncQueueItem(queue, 'e1', { retryCount: 5 });

      expect(queue[0].retryCount).toBe(0);
    });

    it('should leave items unchanged when entry not found', () => {
      const queue = addToSyncQueue([], createEntry({ id: 'e1' }));
      const result = updateSyncQueueItem(queue, 'nonexistent', {
        retryCount: 5,
      });

      expect(result).toHaveLength(1);
      expect(result[0].retryCount).toBe(0);
    });
  });

  // =========================================================================
  // 11. mergeCloudEntries
  // =========================================================================
  describe('mergeCloudEntries', () => {
    it('should add new cloud entries to empty local entries', () => {
      const cloudEntry = createEntry({
        id: 'cloud-1',
        deviceId: 'dev_remote',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const result = mergeCloudEntries([], [cloudEntry], [], 'dev_local');

      expect(result.addedCount).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('cloud-1');
    });

    it('should skip entries from the local device', () => {
      const localEntry = createEntry({
        id: 'local-1',
        deviceId: 'dev_local',
      });

      const result = mergeCloudEntries([], [localEntry], [], 'dev_local');

      expect(result.addedCount).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should skip duplicate entries (same id-deviceId combination)', () => {
      const existing = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const duplicate = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const result = mergeCloudEntries(
        [existing],
        [duplicate],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
      expect(result.entries).toHaveLength(1);
    });

    it('should skip entries that were deleted (id:deviceId key)', () => {
      const cloudEntry = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
      });

      const result = mergeCloudEntries(
        [],
        [cloudEntry],
        ['e1:dev_remote'],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
    });

    it('should skip entries that were deleted (plain id)', () => {
      const cloudEntry = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
      });

      const result = mergeCloudEntries([], [cloudEntry], ['e1'], 'dev_local');

      expect(result.addedCount).toBe(0);
    });

    it('should add new entries and sort by timestamp', () => {
      const local = createEntry({
        id: 'e1',
        deviceId: 'dev_local',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const cloudLate = createEntry({
        id: 'e3',
        deviceId: 'dev_remote1',
        timestamp: '2024-01-15T12:00:00.000Z',
      });
      const cloudEarly = createEntry({
        id: 'e2',
        deviceId: 'dev_remote2',
        timestamp: '2024-01-15T08:00:00.000Z',
      });

      const result = mergeCloudEntries(
        [local],
        [cloudLate, cloudEarly],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(2);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].id).toBe('e2'); // earliest
      expect(result.entries[1].id).toBe('e1'); // middle
      expect(result.entries[2].id).toBe('e3'); // latest
    });

    it('should default missing run field to 1 (backwards compat)', () => {
      const cloudEntry = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
      });
      // Simulate legacy entry without run field
      const legacyEntry = { ...cloudEntry } as Record<string, unknown>;
      delete legacyEntry.run;

      const result = mergeCloudEntries(
        [],
        [legacyEntry as unknown as Entry],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(1);
      expect(result.entries[0].run).toBe(1);
    });

    it('should skip invalid entries', () => {
      const invalidEntries = [
        null,
        undefined,
        42,
        'not an entry',
        { invalid: true },
      ];

      const result = mergeCloudEntries(
        [],
        invalidEntries as unknown as Entry[],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(0);
    });

    it('should return original entries reference when nothing added', () => {
      const entries = [createEntry({ id: 'e1', deviceId: 'dev_local' })];
      const result = mergeCloudEntries(entries, [], [], 'dev_local');

      expect(result.addedCount).toBe(0);
      expect(result.entries).toBe(entries); // Same reference
    });

    it('should handle cloud entries with same id but different deviceId as separate', () => {
      const local = createEntry({
        id: 'e1',
        deviceId: 'dev_remote_a',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const cloud = createEntry({
        id: 'e1',
        deviceId: 'dev_remote_b',
        timestamp: '2024-01-15T11:00:00.000Z',
      });

      const result = mergeCloudEntries([local], [cloud], [], 'dev_local');

      expect(result.addedCount).toBe(1);
      expect(result.entries).toHaveLength(2);
    });

    it('should not add duplicate cloud entries within the same batch', () => {
      const cloudEntry1 = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      const cloudEntry2 = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
        timestamp: '2024-01-15T10:00:00.000Z',
      });

      const result = mergeCloudEntries(
        [],
        [cloudEntry1, cloudEntry2],
        [],
        'dev_local',
      );

      expect(result.addedCount).toBe(1);
      expect(result.entries).toHaveLength(1);
    });

    it('should preserve the run field when present', () => {
      const cloudEntry = createEntry({
        id: 'e1',
        deviceId: 'dev_remote',
        run: 2,
      });

      const result = mergeCloudEntries([], [cloudEntry], [], 'dev_local');

      expect(result.entries[0].run).toBe(2);
    });
  });

  // =========================================================================
  // 12. removeDeletedCloudEntries
  // =========================================================================
  describe('removeDeletedCloudEntries', () => {
    it('should remove entries matching deleted id:deviceId keys', () => {
      const entries = [
        createEntry({ id: 'e1', deviceId: 'dev_remote' }),
        createEntry({ id: 'e2', deviceId: 'dev_remote' }),
      ];

      const result = removeDeletedCloudEntries(entries, ['e1:dev_remote']);

      expect(result.removedCount).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e2');
    });

    it('should remove entries matching deleted plain ids', () => {
      const entries = [createEntry({ id: 'e1', deviceId: 'dev_remote' })];

      const result = removeDeletedCloudEntries(entries, ['e1']);

      expect(result.removedCount).toBe(1);
      expect(result.entries).toHaveLength(0);
    });

    it('should return zero removedCount when no matches', () => {
      const entries = [createEntry({ id: 'e1' })];

      const result = removeDeletedCloudEntries(entries, ['nonexistent']);

      expect(result.removedCount).toBe(0);
      expect(result.entries).toHaveLength(1);
    });

    it('should handle empty deletedIds', () => {
      const entries = [createEntry({ id: 'e1' })];

      const result = removeDeletedCloudEntries(entries, []);

      expect(result.removedCount).toBe(0);
      expect(result.entries).toHaveLength(1);
    });

    it('should handle empty entries', () => {
      const result = removeDeletedCloudEntries([], ['e1']);

      expect(result.removedCount).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should remove multiple entries at once', () => {
      const entries = [
        createEntry({ id: 'e1', deviceId: 'dev_r1' }),
        createEntry({ id: 'e2', deviceId: 'dev_r2' }),
        createEntry({ id: 'e3', deviceId: 'dev_r3' }),
      ];

      const result = removeDeletedCloudEntries(entries, ['e1:dev_r1', 'e3']);

      expect(result.removedCount).toBe(2);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e2');
    });

    it('should match both id:deviceId key and plain id formats', () => {
      const entries = [
        createEntry({ id: 'e1', deviceId: 'dev_a' }),
        createEntry({ id: 'e2', deviceId: 'dev_b' }),
        createEntry({ id: 'e3', deviceId: 'dev_c' }),
      ];

      // e1 matched by key, e3 matched by plain id
      const result = removeDeletedCloudEntries(entries, ['e1:dev_a', 'e3']);

      expect(result.removedCount).toBe(2);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e2');
    });

    it('should return correct count for each matched entry', () => {
      const entries = [
        createEntry({ id: 'e1', deviceId: 'dev_a' }),
        createEntry({ id: 'e1', deviceId: 'dev_b' }),
      ];

      // Plain id 'e1' should match both entries
      const result = removeDeletedCloudEntries(entries, ['e1']);

      expect(result.removedCount).toBe(2);
      expect(result.entries).toHaveLength(0);
    });
  });
});
