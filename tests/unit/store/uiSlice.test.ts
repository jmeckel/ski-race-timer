/**
 * Unit Tests for UI Slice
 * Tests: view switching, language, bib input sanitization,
 *        timing point, run selection, select mode, entry selection,
 *        recording state
 */

import { describe, expect, it } from 'vitest';
import {
  clearSelection,
  selectAllEntries,
  setBibInput,
  setLanguage,
  setRecording,
  setSelectMode,
  setSelectedPoint,
  setSelectedRun,
  setView,
  toggleEntrySelection,
} from '../../../src/store/slices/uiSlice';

describe('UI Slice', () => {
  describe('setView', () => {
    it('should set timer view', () => {
      const result = setView('timer');
      expect(result.currentView).toBe('timer');
    });

    it('should set results view', () => {
      const result = setView('results');
      expect(result.currentView).toBe('results');
    });

    it('should set settings view', () => {
      const result = setView('settings');
      expect(result.currentView).toBe('settings');
    });

    it('should set gateJudge view', () => {
      const result = setView('gateJudge');
      expect(result.currentView).toBe('gateJudge');
    });

    it('should return only currentView property', () => {
      const result = setView('timer');
      expect(Object.keys(result)).toEqual(['currentView']);
    });
  });

  describe('setLanguage', () => {
    it('should set language to English', () => {
      const result = setLanguage('en');
      expect(result.currentLang).toBe('en');
    });

    it('should set language to German', () => {
      const result = setLanguage('de');
      expect(result.currentLang).toBe('de');
    });

    it('should set language to French', () => {
      const result = setLanguage('fr');
      expect(result.currentLang).toBe('fr');
    });

    it('should return only currentLang property', () => {
      const result = setLanguage('en');
      expect(Object.keys(result)).toEqual(['currentLang']);
    });
  });

  describe('setBibInput', () => {
    it('should set a normal bib number', () => {
      const result = setBibInput('42');
      expect(result.bibInput).toBe('42');
    });

    it('should truncate to max 3 digits', () => {
      const result = setBibInput('1234');
      expect(result.bibInput).toBe('123');
    });

    it('should strip non-numeric characters', () => {
      const result = setBibInput('4a2b');
      expect(result.bibInput).toBe('42');
    });

    it('should handle empty string', () => {
      const result = setBibInput('');
      expect(result.bibInput).toBe('');
    });

    it('should handle string with only non-numeric characters', () => {
      const result = setBibInput('abc');
      expect(result.bibInput).toBe('');
    });

    it('should handle single digit', () => {
      const result = setBibInput('7');
      expect(result.bibInput).toBe('7');
    });

    it('should handle exactly 3 digits', () => {
      const result = setBibInput('999');
      expect(result.bibInput).toBe('999');
    });

    it('should strip non-numeric first then truncate', () => {
      // "a1b2c3d4" -> strip -> "1234" -> truncate -> "123"
      const result = setBibInput('a1b2c3d4');
      expect(result.bibInput).toBe('123');
    });

    it('should handle leading zeros', () => {
      const result = setBibInput('007');
      expect(result.bibInput).toBe('007');
    });

    it('should return only bibInput property', () => {
      const result = setBibInput('42');
      expect(Object.keys(result)).toEqual(['bibInput']);
    });
  });

  describe('setSelectedPoint', () => {
    it('should set start timing point', () => {
      const result = setSelectedPoint('S');
      expect(result.selectedPoint).toBe('S');
    });

    it('should set finish timing point', () => {
      const result = setSelectedPoint('F');
      expect(result.selectedPoint).toBe('F');
    });

    it('should return only selectedPoint property', () => {
      const result = setSelectedPoint('S');
      expect(Object.keys(result)).toEqual(['selectedPoint']);
    });
  });

  describe('setSelectedRun', () => {
    it('should set run 1', () => {
      const result = setSelectedRun(1);
      expect(result.selectedRun).toBe(1);
    });

    it('should set run 2', () => {
      const result = setSelectedRun(2);
      expect(result.selectedRun).toBe(2);
    });

    it('should set higher run numbers', () => {
      const result = setSelectedRun(3);
      expect(result.selectedRun).toBe(3);
    });

    it('should return only selectedRun property', () => {
      const result = setSelectedRun(1);
      expect(Object.keys(result)).toEqual(['selectedRun']);
    });
  });

  describe('setSelectMode', () => {
    it('should enable select mode and preserve current selections', () => {
      const currentSelected = new Set(['entry-1', 'entry-2']);
      const result = setSelectMode(true, currentSelected);

      expect(result.selectMode).toBe(true);
      expect(result.selectedEntries).toBe(currentSelected);
    });

    it('should disable select mode and clear all selections', () => {
      const currentSelected = new Set(['entry-1', 'entry-2']);
      const result = setSelectMode(false, currentSelected);

      expect(result.selectMode).toBe(false);
      expect(result.selectedEntries!.size).toBe(0);
    });

    it('should enable select mode with empty selection set', () => {
      const currentSelected = new Set<string>();
      const result = setSelectMode(true, currentSelected);

      expect(result.selectMode).toBe(true);
      expect(result.selectedEntries!.size).toBe(0);
    });

    it('should return a new empty set when disabling (not the same reference)', () => {
      const currentSelected = new Set(['entry-1']);
      const result = setSelectMode(false, currentSelected);

      expect(result.selectedEntries).not.toBe(currentSelected);
      expect(result.selectedEntries!.size).toBe(0);
    });
  });

  describe('toggleEntrySelection', () => {
    it('should add an entry to empty selection', () => {
      const currentSelected = new Set<string>();
      const result = toggleEntrySelection('entry-1', currentSelected);

      expect(result.selectedEntries!.has('entry-1')).toBe(true);
      expect(result.selectedEntries!.size).toBe(1);
      expect(result.selectMode).toBe(true);
    });

    it('should add an entry to existing selection', () => {
      const currentSelected = new Set(['entry-1']);
      const result = toggleEntrySelection('entry-2', currentSelected);

      expect(result.selectedEntries!.has('entry-1')).toBe(true);
      expect(result.selectedEntries!.has('entry-2')).toBe(true);
      expect(result.selectedEntries!.size).toBe(2);
      expect(result.selectMode).toBe(true);
    });

    it('should remove an entry that is already selected', () => {
      const currentSelected = new Set(['entry-1', 'entry-2']);
      const result = toggleEntrySelection('entry-1', currentSelected);

      expect(result.selectedEntries!.has('entry-1')).toBe(false);
      expect(result.selectedEntries!.has('entry-2')).toBe(true);
      expect(result.selectedEntries!.size).toBe(1);
      expect(result.selectMode).toBe(true);
    });

    it('should disable selectMode when removing the last selected entry', () => {
      const currentSelected = new Set(['entry-1']);
      const result = toggleEntrySelection('entry-1', currentSelected);

      expect(result.selectedEntries!.size).toBe(0);
      expect(result.selectMode).toBe(false);
    });

    it('should not mutate the original set', () => {
      const currentSelected = new Set(['entry-1']);
      toggleEntrySelection('entry-2', currentSelected);

      expect(currentSelected.size).toBe(1);
      expect(currentSelected.has('entry-2')).toBe(false);
    });
  });

  describe('selectAllEntries', () => {
    it('should select all provided entry IDs', () => {
      const result = selectAllEntries(['entry-1', 'entry-2', 'entry-3']);

      expect(result.selectedEntries!.size).toBe(3);
      expect(result.selectedEntries!.has('entry-1')).toBe(true);
      expect(result.selectedEntries!.has('entry-2')).toBe(true);
      expect(result.selectedEntries!.has('entry-3')).toBe(true);
    });

    it('should enable selectMode', () => {
      const result = selectAllEntries(['entry-1']);
      expect(result.selectMode).toBe(true);
    });

    it('should handle empty array', () => {
      const result = selectAllEntries([]);
      expect(result.selectedEntries!.size).toBe(0);
      expect(result.selectMode).toBe(true);
    });

    it('should deduplicate IDs (Set behavior)', () => {
      const result = selectAllEntries(['entry-1', 'entry-1', 'entry-2']);
      expect(result.selectedEntries!.size).toBe(2);
    });
  });

  describe('clearSelection', () => {
    it('should return empty selection set', () => {
      const result = clearSelection();
      expect(result.selectedEntries!.size).toBe(0);
    });

    it('should disable selectMode', () => {
      const result = clearSelection();
      expect(result.selectMode).toBe(false);
    });

    it('should return a new Set instance each time', () => {
      const result1 = clearSelection();
      const result2 = clearSelection();
      expect(result1.selectedEntries).not.toBe(result2.selectedEntries);
    });

    it('should return both selectMode and selectedEntries', () => {
      const result = clearSelection();
      expect(result).toEqual({
        selectedEntries: new Set(),
        selectMode: false,
      });
    });
  });

  describe('setRecording', () => {
    it('should set recording to true', () => {
      const result = setRecording(true);
      expect(result.isRecording).toBe(true);
    });

    it('should set recording to false', () => {
      const result = setRecording(false);
      expect(result.isRecording).toBe(false);
    });

    it('should return only isRecording property', () => {
      const result = setRecording(true);
      expect(Object.keys(result)).toEqual(['isRecording']);
    });
  });
});
