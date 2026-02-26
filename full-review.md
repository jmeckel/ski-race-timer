# Comprehensive Code Quality Review — v5.24.16

## Round 1 (v5.24.15): 9 agents, 40 findings, 39 fixed

All 39 findings from the initial review were fixed and deployed in v5.24.16. One finding (P3-6: E2E sync CI gating) was intentionally skipped (requires Redis infrastructure).

## Round 2 (v5.24.16): 4 verification agents, 15 new candidates, 11 verified

Re-analysis after fixes. Each finding verified against actual source code. Duplicates and invalids removed.

---

## Round 1 Findings — ALL FIXED in v5.24.16

<details>
<summary>P0 — Critical (5 findings, all fixed)</summary>

| ID | Issue | Fix |
|----|-------|-----|
| P0-1 | Confirmation overlay tap-through → double-record | Added `pointer-events: auto` on `.show` |
| P0-2 | Deleted-race POST silently drops queued entries | Added `data.deleted` check in response handler |
| P0-3 | CSV export missing UTF-8 BOM → Excel corrupts umlauts | Prepended `\uFEFF` to Blob content |
| P0-4 | Fault confirmation white-on-green ~1.4:1 contrast | Changed text to dark (#003320) |
| P0-5 | Sync queue not cleared on race switch | Added `store.clearSyncQueue()` in all 3 paths |

</details>

<details>
<summary>P1 — Important (10 findings, all fixed)</summary>

| ID | Issue | Fix |
|----|-------|-----|
| P1-1 | `pushLocalFaults()` no concurrency guard | Added `isPushingFaults` flag with try/finally |
| P1-2 | `sendFaultToCloud` stale raceId after async | Added raceId re-check after fetch |
| P1-3 | Tombstone TTL = worst-case poll interval | Extended from 300s to 600s |
| P1-4 | GET `/faults` unsanitized query params | Added `sanitizeString()` calls |
| P1-5 | DELETE entry missing deviceId requirement | Added `deviceId` validation |
| P1-6 | Radial timer missing duplicate/zero-bib warnings | Added visual warning overlay |
| P1-7 | Untracked setTimeout in showRadialConfirmation | Tracked `confirmationTimeoutId`, cleanup in destroy |
| P1-8 | `--text-secondary` contrast ~3.8:1 | Changed to #a0b0bf (~4.6:1), tertiary to #788999 (~3.4:1) |
| P1-9 | `beforeunload` misses deferred store save | Added `store.forceSave()` before `storage.flush()` |
| P1-10 | XSS: gateStart/gateEnd unescaped in innerHTML | Added `escapeHtml(String(...))` |

</details>

<details>
<summary>P2 — Medium (13 findings, all fixed)</summary>

| ID | Issue | Fix |
|----|-------|-----|
| P2-1 | Results toolbar buttons 36px | Set min-width/height to `--btn-height-md` (44px) |
| P2-2 | Chief Judge buttons 36px | Set to `--btn-height-md` |
| P2-3 | Modal close / fault-row buttons undersized | Increased padding |
| P2-4 | Offline banner dismiss ~20px | Increased padding to `8px 12px` |
| P2-5 | Gate judge landscape inputs 28px | Increased min-height |
| P2-6 | Filter options not translated | Added `data-i18n` attributes |
| P2-7 | Broken CSS `var(--primary) 10` | Fixed to `color-mix()` |
| P2-8 | Settings missing safe-area padding | Added `env(safe-area-inset-bottom)` |
| P2-9 | Gate judge footer missing safe-area | Added safe-area padding |
| P2-10 | Double effect watching `$settings` | Split into `$settingsGps`/`$settingsSync` |
| P2-11 | Timer warning timeout stacking | Track `warningHideTimeoutId` |
| P2-12 | Camera reinit removes listener on first failure | Preserve listener while retries remain |
| P2-13 | Clock untracked setTimeout per digit | CSS `digit-pop` class, skip subsecond digits |

</details>

<details>
<summary>P3 — Low (12 findings, 11 fixed, 1 skipped)</summary>

| ID | Issue | Fix |
|----|-------|-----|
| P3-1 | Dead `calculateChecksum`/`verifyChecksum` | Removed dead code + tests |
| P3-2 | `settings-language-changed` not in event registry | Registered in `AppCustomEventMap` |
| P3-3 | `gateNumber` no max value | Added `v.maxValue(100)` |
| P3-4 | Test mock missing `wasRecentlyExited` | Added to mock |
| P3-5 | CSV header test asserts own constant | Updated to match production header |
| P3-6 | E2E sync tests zero CI coverage | **SKIPPED** — requires Redis infra |
| P3-7 | `cqi` dial tick no fallback | Added `transform-origin` fallback |
| P3-8 | `cqi` container units fallback | Added px fallback |
| P3-9 | `:focus-visible` gaps | Added to missing buttons |
| P3-10 | Deprecated `-webkit-overflow-scrolling` | Removed |
| P3-11 | Onboarding debounce not cancelled | Cancel on dismiss |
| P3-12 | Gate coverage title mixed escaping | Escape full concatenated string |

</details>

---

## Round 2 Findings — NEW (verified against source)

### P1 — Important

#### NEW-1: Unhandled promise from `cameraService.initialize()` in `applyCameraService`
**File:** `src/utils/viewServices.ts:26`
`cameraService.initialize()` returns `Promise<boolean>` but the call site has no `await`, `void`, or `.catch()`. On mobile Safari, camera permission failures throw (not resolve false), becoming unhandled promise rejections. Called every time user navigates to timer view with photo capture enabled. Violates CLAUDE.md: "All promises need `.catch()`, even fire-and-forget."

**Fix:** `void cameraService.initialize().catch((error) => { logger.error('[Camera] init failed:', error); });`

#### NEW-2: `fault-sync-error` event dispatched but has zero listeners — failures silently dropped
**File:** `src/services/sync/faultSync.ts:138-145`
The comment at line 138 says "Dispatch event so UI can show fault sync status." Grep confirms no `addEventListener` for `'fault-sync-error'` exists anywhere in `src/`. When fault sync fetch fails, the event fires into void and the user gets no indication their fault data may be stale. By contrast, entry sync uses `callbacks?.showToast()` for network failures.

**Fix:** Add handler in `appEventListeners.ts` that shows a toast, plus translation key `faultSyncError` in both `en`/`de`.

### P2 — Medium

#### NEW-3: `isPushingFaults` not reset in `cleanupFaultSync()`
**File:** `src/services/sync/faultSync.ts:267-270`
If `cleanupFaultSync()` is called while `pushLocalFaults()` is mid-execution (race deletion during slow network request), the flag stays `true`. After re-initialization, all subsequent `pushLocalFaults()` calls return immediately — permanently blocking fault pushes until page reload. The `finally` block in the async function does reset it eventually, but the window between cleanup and `finally` execution creates the race.

**Fix:** Add `isPushingFaults = false;` to `cleanupFaultSync()`.

#### NEW-4: `cross-device-duplicate` event dispatched but has no handler — intended UI never built
**File:** `src/services/sync/entrySync.ts:450-455`
Comment reads "Dispatch event for UI to show more prominent warning." No listener for `'cross-device-duplicate'` exists anywhere in `src/`. A toast already fires at line 442, so this is not silent. But the event infrastructure is dead code.

**Fix:** Either remove the dead event dispatch + type definition, or implement the intended handler.

#### NEW-5: Tab buttons missing `aria-controls`, view panels missing `role="tabpanel"`
**File:** `index.html:730-757`
Tab buttons have `role="tab"` and `aria-selected` but no `aria-controls="timer-panel"` etc. The view sections don't have `role="tabpanel"` or `aria-labelledby`. Screen readers can't associate tabs with their panels.

**Fix:** Add `aria-controls` to each tab button, `role="tabpanel"` + `aria-labelledby` + `id` to each view section.

#### NEW-6: Filter select `aria-label` values hardcoded in English
**File:** `index.html:242,247`
`aria-label="Filter by point"` and `aria-label="Filter by status"` are not translated. Should use `data-i18n-aria-label` like the search input does.

**Fix:** Add `data-i18n-aria-label="filterByPoint"` / `data-i18n-aria-label="filterByStatus"` + translation keys.

#### NEW-7: `.lang-option` touch target ~30px
**File:** `src/styles/settings.css:371-381`
`padding: 8px 16px` with `font-size: 0.875rem` (14px) gives ~30px height. Below 48px WCAG 2.5.5 minimum. Used for language toggle (EN/DE) in settings.

**Fix:** Add `min-height: var(--btn-height-md);` or increase padding to `14px 16px`.

#### NEW-8: `.penalty-mode-btn` touch target ~30px
**File:** `src/styles/chief-judge.css:472-482`
Same padding pattern: `8px 16px` with small font. Chief judge penalty mode toggle.

**Fix:** Add `min-height: var(--btn-height-md);`.

#### NEW-9: `.race-delete-btn` touch target ~28px
**File:** `src/styles/settings.css:457-470`
`padding: 8px 12px` with `font-size: 0.75rem`. Race management delete buttons.

**Fix:** Add `min-height: var(--btn-height-md);`.

### P3 — Low

#### NEW-10: `throttle` utility exported but never called in `src/`
**File:** `src/utils/format.ts:173-185`, `src/utils/index.ts:51`
Grep confirms zero usage in application code. Only tested in `format.test.ts`. Dead exported code.

**Fix:** Remove if genuinely unused, or keep with comment explaining future intent.

#### NEW-11: `initializeAdminPin()` is an empty async function still chained in init
**File:** `src/features/race/pinManagement.ts:61-67, 474-481`
Body does nothing except early-return when token exists. Despite doing nothing, it's `async` and `initPinManagement()` chains `.then()` + `.catch()` on it, adding unnecessary microtask overhead on every settings view init.

**Fix:** Inline the `hasAuthToken()` check and call `updatePinStatusDisplay()` directly.

---

## Findings Removed as Invalid

### Round 1 (removed during initial review)
- ~~PIN modal Promise leak~~: `closeAllModals()` already calls `cleanupPinVerification()` which resolves the Promise.
- ~~Stale cloudHighestBib~~: No `await` between `store.getState()` and auto-increment. State is used synchronously.
- ~~`<html lang>` never updated~~: `updateTranslations()` in `settingsView.ts:131` does `document.documentElement.lang = lang`.

### Round 2 (removed during re-analysis)
- ~~`/admin/races` GET no rate limit~~: By design — users need to see races to join (per project memory).
- ~~`pendingPinVerifyResolve` overwrite risk~~: Already dismissed in round 1; cleanup path confirmed correct.
- ~~`<html lang="de">` never updated~~: Re-flagged by agent, but already confirmed fixed in round 1.
- ~~CSS `@layer` missing in secondary files~~: Deferred per project memory — large refactor risk, cascade works currently.
- ~~`.offline-banner-dismiss` missing focus-visible~~: Actually has `&:focus-visible { opacity: 1; }` since the P2-4 fix.
- ~~`statusBadge` CSS injection~~: All callers use hardcoded status strings, not user input.
- ~~`lastSyncTimestamp` from server clock / not updated by pushLocalEntries~~: Theoretical P3 with minimal real-world impact.

---

## Summary

| Round | P0 | P1 | P2 | P3 | Total |
|-------|----|----|----|----|-------|
| Round 1 (fixed) | 5 | 10 | 13 | 12 | 40 |
| Round 2 (new) | 0 | 2 | 7 | 2 | 11 |
| **Total** | **5** | **12** | **20** | **14** | **51** |

Round 1: 39 fixed, 1 skipped (P3-6: requires Redis CI infra).
Round 2: 11 new findings awaiting implementation.
