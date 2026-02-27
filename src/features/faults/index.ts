/**
 * Fault Entry Module - Barrel Export
 * Re-exports all public APIs from the three sub-modules
 */

// Inline gate-first entry UI
export {
  initInlineFaultEntry,
  openFaultDeleteConfirmation,
  refreshInlineFaultUI,
  saveInlineFault,
  selectInlineBib,
  selectInlineGate,
  updateActiveBibsList,
  updateInlineBibSelector,
  updateInlineFaultsList,
  updateInlineGateSelector,
  updateInlineSaveButtonState,
} from './faultInlineEntry';

// Core CRUD operations, editing, version history, deletion
export {
  createAndSyncFault,
  handleConfirmMarkDeletion,
  handleRestoreFaultVersion,
  handleSaveFaultEdit,
  initFaultEditModal,
  openFaultEditModal,
  openMarkDeletionModal,
  showFaultConfirmation,
} from './faultOperations';
