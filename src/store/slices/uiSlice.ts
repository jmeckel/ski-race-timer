/**
 * UI Slice
 * Handles view state, selections, and recording state
 */

import type { TimingPoint, Run, Language } from '../../types';

// UI State type
export interface UiState {
  currentView: 'timer' | 'results' | 'settings' | 'gateJudge';
  currentLang: Language;
  bibInput: string;
  selectedPoint: TimingPoint;
  selectedRun: Run;
  selectMode: boolean;
  selectedEntries: Set<string>;
  isRecording: boolean;
}

/**
 * Set current view
 */
export function setView(
  currentView: UiState['currentView']
): Partial<UiState> {
  return { currentView };
}

/**
 * Set current language
 */
export function setLanguage(lang: Language): Partial<UiState> {
  return { currentLang: lang };
}

/**
 * Set bib input (sanitized to max 3 digits)
 */
export function setBibInput(bib: string): Partial<UiState> {
  const sanitized = bib.replace(/\D/g, '').slice(0, 3);
  return { bibInput: sanitized };
}

/**
 * Set selected timing point
 */
export function setSelectedPoint(point: TimingPoint): Partial<UiState> {
  return { selectedPoint: point };
}

/**
 * Set selected run
 */
export function setSelectedRun(run: Run): Partial<UiState> {
  return { selectedRun: run };
}

/**
 * Set selection mode
 */
export function setSelectMode(
  enabled: boolean,
  currentSelectedEntries: Set<string>
): Partial<UiState> {
  return {
    selectMode: enabled,
    selectedEntries: enabled ? currentSelectedEntries : new Set()
  };
}

/**
 * Toggle entry selection
 */
export function toggleEntrySelection(
  id: string,
  currentSelectedEntries: Set<string>
): Partial<UiState> {
  const selectedEntries = new Set(currentSelectedEntries);
  if (selectedEntries.has(id)) {
    selectedEntries.delete(id);
  } else {
    selectedEntries.add(id);
  }
  return {
    selectedEntries,
    selectMode: selectedEntries.size > 0
  };
}

/**
 * Select all entries
 */
export function selectAllEntries(entryIds: string[]): Partial<UiState> {
  return {
    selectedEntries: new Set(entryIds),
    selectMode: true
  };
}

/**
 * Clear all selections
 */
export function clearSelection(): Partial<UiState> {
  return {
    selectedEntries: new Set(),
    selectMode: false
  };
}

/**
 * Set recording state
 */
export function setRecording(isRecording: boolean): Partial<UiState> {
  return { isRecording };
}
