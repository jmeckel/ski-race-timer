# App.ts Module Extraction Plan

This plan outlines the remaining extractions needed to break down `app.ts` into focused feature modules.

## Current State

- **Completed**: `timerView.ts` extracted (~470 lines)
- **Completed**: `photoViewer.ts` extracted (~100 lines)
- **Completed**: `chiefJudgeView.ts` extracted (~630 lines)
- **Completed**: `faultEntry.ts` extracted (~950 lines)
- **Completed**: `gateJudgeView.ts` extracted (~350 lines)
- **Remaining**: ~2,585 lines in app.ts

## Extraction Order

Extract modules in dependency order to minimize circular imports:

### Phase 1: Utility Extractions (No Dependencies)

#### 1. `src/features/photoViewer.ts` (~80 lines)
**Functions:**
- `openPhotoViewer(entry)` - Load and display photo from IndexedDB
- `closePhotoViewer()` - Close photo modal
- `deletePhoto()` - Delete photo from IndexedDB and entry marker

**Dependencies:** store, photoStorage, showToast, t()
**Risk:** Low - self-contained photo handling

---

### Phase 2: View Modules (Depend on store/services)

#### 2. `src/features/resultsView.ts` (~350 lines)
**Functions:**
- `initResultsView()` - Initialize VirtualList, filters, search, pull-to-refresh
- `initResultsActions()` - Clear All, Undo, Export, Delete Selected buttons
- `applyFilters()` - Apply search + point/status filters
- `updateStats()` - Update total/racers/finished counters
- `updateEntryCountBadge()` - Update results tab badge

**State to move:**
- `virtualList` - VirtualList instance
- `pullToRefreshInstance` - PullToRefresh instance
- `searchTimeout` - Debounce timeout
- `searchInputListener` - Event listener reference

**Dependencies:** store, VirtualList, PullToRefresh, syncService, showToast, t(), exportResults
**Risk:** Medium - manages VirtualList lifecycle

---

#### 3. `src/features/settingsView.ts` (~450 lines)
**Functions:**
- `initSettingsView()` - All settings toggles and handlers
- `initRoleToggle()` - Device role selector (Timer/GateJudge)
- `updateRoleToggle()` - Update role card active state
- `updateGateJudgeTabVisibility()` - Show/hide Gate Judge tab
- `updateSettingsInputs()` - Sync all setting inputs with store
- `updateLangToggle()` - Update language option active state
- `updateTranslations()` - Update all [data-i18n] text elements
- `applySettings()` - Apply settings to UI
- `applyGlassEffectSettings()` - Apply glass/outdoor mode CSS
- `checkRaceExists()` - Check if race exists in cloud
- `showSettingsRecentRacesDropdown()` - Fetch and show recent races
- `fetchRacesFromApi()` - Fetch races from admin API
- `updateRaceExistsIndicator()` - Update race found/new indicator
- `selectSettingsRecentRace()` - Select race from dropdown

**State to move:**
- `raceCheckTimeout` - Debounce timeout
- `raceCheckRequestId` - Request ID for stale response handling
- `lastRaceExistsState` - Race exists indicator state
- `settingsRecentRacesDocumentHandler` - Event listener reference

**Dependencies:** store, syncService, gpsService, cameraService, hasAuthToken, showToast, t()
**Risk:** Medium - complex settings interdependencies

---

### Phase 3: Feature Modules (Domain-specific)

#### 4. `src/features/faultEntry.ts` (~650 lines)
**Functions:**
- `openFaultRecordingModal()` - Open modal with bib/gate/fault type selectors
- `initFaultRecordingModal()` - Fault type button selection handlers
- `recordFault()` - Record fault entry, sync to cloud
- `showFaultConfirmation()` - Overlay confirmation
- `getFaultTypeLabel()` - Localized fault type label
- `initFaultEditModal()` - Edit bib, gate, type; version history
- `openFaultEditModal()` - Open edit modal with fault data
- `handleSaveFaultEdit()` - Save fault changes with versioning
- `handleRestoreFaultVersion()` - Restore fault to previous version
- `openMarkDeletionModal()` - Mark fault for deletion confirmation
- `handleConfirmMarkDeletion()` - Mark fault for deletion
- `initInlineFaultEntry()` - Inline fault entry handlers
- `updateInlineFaultsList()` - List recorded faults
- `updateInlineBibSelector()` - Quick-select buttons for recent bibs
- `selectInlineBib()` - Select bib for inline fault
- `updateInlineGateSelector()` - Gate selector buttons
- `selectInlineGate()` - Select gate for inline fault
- `updateInlineSaveButtonState()` - Enable/disable save button
- `saveInlineFault()` - Save fault from inline interface
- `openFaultDeleteConfirmation()` - Confirmation modal for deletion
- `refreshInlineFaultUI()` - Refresh all inline components

**State to move:**
- `editingFaultId` - Currently editing fault ID
- `inlineSelectedBib` - Inline fault bib selection
- `inlineSelectedGate` - Inline fault gate selection
- `inlineSelectedFaultType` - Inline fault type selection

**Dependencies:** store, syncService (syncFault, deleteFaultFromCloud), showToast, t(), feedbackTap
**Risk:** Medium-High - complex fault versioning logic

---

#### 5. `src/features/gateJudgeView.ts` (~350 lines)
**Functions:**
- `initGateJudgeView()` - Initialize gate assignment, ready toggle, inline fault
- `openGateAssignmentModal()` - Open modal with gate range/color
- `initGateAssignmentModal()` - Gate color selector handlers
- `updateGateRangeDisplay()` - Update header display of gates
- `updateOtherJudgesCoverage()` - Display other judges' assignments
- `updateReadyButtonState()` - Toggle ready button visual
- `updateJudgesReadyIndicator()` - Show ready count badge
- `updateJudgeReadyStatus()` - Update ready indicator color
- `updateActiveBibsList()` - List active bibs with fault buttons
- `updateGateJudgeRunSelection()` - Update run selector in gate judge view

**Dependencies:** store, syncService, showToast, t(), feedbackTap, faultEntry (for inline fault)
**Risk:** Medium - depends on faultEntry module

---

#### 6. `src/features/chiefJudgeView.ts` (~500 lines)
**Functions:**
- `initChiefJudgeToggle()` - Toggle button with PIN verification
- `updateChiefJudgeToggleVisibility()` - Show toggle when sync enabled
- `updateChiefJudgeView()` - Toggle active state, populate panels
- `initChiefExportHandlers()` - CSV, summary, WhatsApp export buttons
- `initPenaltyConfig()` - Penalty mode toggle, seconds adjustment
- `updatePenaltyConfigUI()` - Update penalty mode/seconds display
- `updateFaultSummaryPanel()` - Group faults by bib, calculate penalties
- `updateJudgesOverview()` - Display all gate judges with coverage
- `updatePendingDeletionsPanel()` - List faults marked for deletion
- `handleFinalizeClick()` - Mark racer as finalized
- `handleApproveFaultDeletion()` - Approve deletion, sync to cloud
- `handleRejectFaultDeletion()` - Restore fault, sync to cloud

**Dependencies:** store, syncService, showToast, t(), exportResults, exportChiefSummary, exportFaultSummaryWhatsApp, verifyPinForChiefJudge (from raceManagement)
**Risk:** High - depends on raceManagement for PIN verification

---

#### 7. `src/features/raceManagement.ts` (~700 lines)
**Functions:**
- `initRaceManagement()` - Initialize admin PIN, race management modals
- `initializeAdminPin()` - Sync default PIN from cloud
- `isValidPin()` - Validate PIN format
- `filterNumericInput()` - Filter input to digits only
- `updatePinStatusDisplay()` - Update PIN status text
- `handleChangePinClick()` - Open change PIN modal
- `hideAllPinErrors()` - Hide PIN error messages
- `handleSavePin()` - Validate and save new PIN
- `hashPin()` - SHA-256 hash function
- `handleManageRacesClick()` - Show PIN verification for race management
- `handleAdminPinVerify()` - Verify PIN, open race management
- `verifyPinForRaceJoin()` - Show PIN modal for race join
- `verifyPinForChiefJudge()` - Show PIN modal for Chief Judge mode
- `handleRaceJoinPinVerify()` - Verify PIN for race join/chief judge
- `cancelRaceJoinPinVerify()` - Cancel PIN verification
- `openRaceManagementModal()` - Open modal, load race list
- `loadRaceList()` - Fetch races from API
- `createRaceItem()` - Create race element with delete button
- `promptDeleteRace()` - Show deletion confirmation
- `handleConfirmDeleteRace()` - DELETE race via API
- `showRaceChangeDialog()` - Prompt for export/delete when changing race
- `showPhotoSyncWarningModal()` - Show photo sync stats modal
- `setupPhotoSyncModal()` - Modal button handlers
- `formatBytes()` - Format bytes to human-readable
- `handleRaceDeleted()` - Handle race-deleted event
- `handleAuthExpired()` - Handle auth-expired event

**State to move:**
- `pinVerifyResolver` - PIN verification promise resolver
- `pinVerifyForChiefJudge` - Chief Judge verification flag
- `DEFAULT_ADMIN_PIN` - Default PIN constant
- `pendingRaceDelete` - Pending delete race ID

**Dependencies:** store, syncService, hasAuthToken, exchangePinForToken, clearAuthToken, showToast, t(), exportResults
**Risk:** High - complex PIN/auth flows, many modal interactions

---

### Phase 4: Core Module (Orchestration)

#### 8. `src/features/stateSync.ts` (~300 lines)
**Functions:**
- `handleStateChange()` - React to state changes, update UI
- `updateUI()` - Batch update all UI elements
- `updateViewVisibility()` - Show/hide views based on currentView
- `toKebabCase()` - Convert camelCase to kebab-case

**Dependencies:** All other modules (calls their update functions)
**Risk:** High - orchestrates all state updates

---

### Final app.ts (~400 lines)

After all extractions, app.ts should contain only:
- `initApp()` - Main initialization, imports all modules
- `initModals()` - Modal overlay click handlers
- `openConfirmModal()` - Generic confirmation modal
- `closeAllModals()` - Close all modals and cleanup
- `handleBeforeUnload()` - Cleanup on page unload
- `handleStorageError()` - Storage error handler
- `handleStorageWarning()` - Storage warning handler
- Service event listeners setup
- Onboarding initialization

---

## Dependency Graph

```
                    app.ts (orchestrator)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   timerView       stateSync        raceManagement
        │                │                │
        │         ┌──────┴──────┐         │
        │         │             │         │
   resultsView  settingsView  chiefJudgeView
        │                       │
        │              ┌────────┴────────┐
        │              │                 │
   photoViewer    gateJudgeView     (PIN verification)
                       │
                  faultEntry
```

---

## Implementation Strategy

### Approach: Extract from the leaves up

1. Start with modules that have no dependents (photoViewer)
2. Move to modules that only depend on completed modules
3. Use dependency injection for cross-module calls to avoid circular imports
4. Each extraction should:
   - Create new module file with exports
   - Update app.ts imports
   - Remove extracted code from app.ts
   - Run typecheck and tests after each extraction

### Handling Circular Dependencies

Use an event-driven pattern where modules emit events instead of directly calling each other:

```typescript
// In faultEntry.ts
window.dispatchEvent(new CustomEvent('fault-recorded', { detail: fault }));

// In gateJudgeView.ts
window.addEventListener('fault-recorded', (e) => updateActiveBibsList());
```

Or use a callback injection pattern:

```typescript
// In gateJudgeView.ts
export function initGateJudgeView(deps: {
  openFaultRecordingModal: () => void;
  recordFault: (fault: FaultEntry) => void;
}) { ... }
```

---

## Estimated Effort

| Module | Lines | Risk | Effort |
|--------|-------|------|--------|
| photoViewer | 80 | Low | 30 min |
| resultsView | 350 | Medium | 1-2 hrs |
| settingsView | 450 | Medium | 1-2 hrs |
| faultEntry | 650 | Medium-High | 2-3 hrs |
| gateJudgeView | 350 | Medium | 1-2 hrs |
| chiefJudgeView | 500 | High | 2-3 hrs |
| raceManagement | 700 | High | 3-4 hrs |
| stateSync | 300 | High | 1-2 hrs |

**Total estimated: 12-20 hours**

---

## Success Criteria

- [ ] app.ts under 500 lines
- [ ] Each module under 700 lines
- [ ] All tests passing
- [ ] Build succeeds
- [ ] No circular imports (verified with madge or similar)
- [ ] Manual testing of all features
