# Ski Race Timer - Comprehensive Review Report

**Date:** 2026-02-11
**Version reviewed:** 5.21.1
**Codebase:** ~28K lines source, ~47K lines tests (123 test files)

## Executive Summary

The Ski Race Timer is a **mature, production-quality PWA** with strong architecture, excellent battery optimization, and solid security practices. The codebase demonstrates professional engineering across memory management, type safety (zero `any` types), and fail-closed security patterns.

That said, the review uncovered **actionable improvements** across all dimensions. Below are findings organized by severity and category.

---

## 1. SECURITY (Overall: Strong)

No critical vulnerabilities found. The app uses PBKDF2 with 100K+ iterations, timing-safe comparisons, proper JWT lifecycle, Valibot schema validation, and consistent XSS escaping.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| S1 | Medium | **No request body size limits** on POST endpoints. `versionHistory` arrays and nested objects accept unbounded sizes, enabling memory exhaustion DoS. | `api/v1/sync.ts`, `api/v1/faults.ts` |
| S2 | Medium | **CSP allows `unsafe-inline` for styles**, weakening protection against CSS-based exfiltration attacks. | `vercel.json:29` |
| S3 | Low | **Redis error messages may leak connection details** to logging/monitoring systems. | `api/lib/redis.ts:66-69` |
| S4 | Low | **BroadcastChannel message validation** uses type assertions without runtime validation for `DeviceInfo` payloads. | `src/services/sync/broadcast.ts:36-58` |
| S5 | Low | **Photo rate limit is per-device only**, not per-device-per-race-globally, allowing rotation across races to bypass limits. | `api/v1/sync.ts:325-330` |
| S6 | Info | **CORS limited to single origin** - may block Vercel preview deployments. Consider comma-separated `CORS_ORIGINS` env var. | `api/lib/response.ts:13` |

---

## 2. CODE QUALITY & ARCHITECTURE (Overall: Excellent)

Zero `any` types, zero `@ts-ignore`, clean slice-based state management, consistent ListenerManager pattern across 16+ files, and proper component lifecycle with double-destruction guards.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| A1 | Medium | **Notification queue overflow drops oldest notifications**, potentially losing state updates during rapid changes. Consider circular buffer. | `src/store/index.ts:260-293` |
| A2 | Medium | **GPS duty cycling race condition** - window between checking and setting `isDutyCycling` flag allows duplicate intervals. | `src/services/gps.ts:56-94` |
| A3 | Medium | **Camera state machine has no max retry counter** - timeout mechanism in `reinitializeCamera()` can loop indefinitely. | `src/services/camera.ts:179-224` |
| A4 | Medium | **Events lost during lazy-load initialization** - role-specific events dispatched before lazy-loaded gate judge module initializes have no queue/replay. | `src/app.ts:116-141` |
| A5 | Low | **`fetchCloudEntriesImpl()` is 172 lines** with multiple responsibilities (fetch, validate, photos, merge, deletions, UI). Should be split. | `src/services/sync/entrySync.ts:117-289` |
| A6 | Low | **VirtualList `createEntryItem()` is 151 lines** with interleaved template + event binding. Extract template generation. | `src/components/VirtualList.ts:748-899` |
| A7 | Low | **Duplicate photo validation logic** - checking `entry.photo === 'indexeddb'` and `photo.length > 20` appears in multiple places. | Multiple files |
| A8 | Low | **Inconsistent async error patterns** - some functions return `Promise<boolean>`, others throw, others return `{ success, error }` objects. | Various services |
| A9 | Low | **Barrel exports** in `src/utils/index.ts` use `export *` which can cause tree-shaking issues. Consider named re-exports. | `src/utils/index.ts` |
| A10 | Low | **`parseJson()` without validate callback** parses to generic type unsafely - Valibot is already available. | `src/store/index.ts:113-127` |
| A11 | Info | **Signals migration incomplete** - `subscribe()` deprecated but still widely used (82 addEventListener vs 43 removeEventListener). | `src/store/index.ts` |

---

## 3. PERFORMANCE & BATTERY (Overall: World-class)

Battery-aware frame throttling (60fps down to 7.5fps), GPS duty cycling on critical battery, 7-factor adaptive polling, dirty-slice localStorage persistence, power-saver CSS class. This is genuinely outstanding for a mobile outdoor app.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| P1 | High | **Wake Lock ignores battery level** - keeps screen on even at critical battery (<5%). 10-minute idle timeout but no battery check. | `src/services/wakeLock.ts:14,162` |
| P2 | Medium | **No sync request batching** - each entry triggers a separate network request, causing repeated cellular radio wake-ups. Batch 5-10 entries or use a 30s window. | Sync service |
| P3 | Medium | **VirtualList clears entire visible item cache** on filter/expand operations, forcing recreation of ALL visible DOM elements. Needs item-level diffing. | `src/components/VirtualList.ts:365-396` |
| P4 | Low | **Camera starts without battery check** - video stream consumes 100-300mW regardless of battery level. | `src/services/camera.ts:99-112` |
| P5 | Low | **GPS `maximumAge` of 10s is aggressive** for normal battery mode - 30s would reduce GPS chip wake-ups while still being fresh for timing. | `src/services/gps.ts:8-12` |
| P6 | Low | **RadialDial updates `transform` on ALL 10 number spans** every frame during rotation. Could use parent `transform-origin` instead. | `src/components/RadialDial.ts:244-249` |
| P7 | Info | **Service initialization is eager** - GPS/Wake Lock initialize even when timer view isn't active. Lazy init would save ~50-100ms startup. | `src/main.ts` |

---

## 4. UI/UX & VISUAL CONSISTENCY (Overall: Good)

Dark theme, consistent design tokens, glass morphism effects with power-saver fallbacks, proper safe-area-inset handling for iOS notch.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U1 | Medium | **`--text-tertiary: #909090` fails WCAG AA** contrast (3.8:1 on `#0a0a0a`). Should be `#a0a0a0` (~4.6:1). | `src/styles/main.css:30` |
| U2 | Medium | **Placeholder text `#909090` fails AA** contrast (3.5:1). Should be `#a8a8a8` (~4.6:1). | `src/styles/results.css:53-60` |
| U3 | Medium | **Inconsistent button heights** - some use hardcoded `56px`/`44px` instead of `var(--btn-height-lg)`/`var(--btn-height-md)` design tokens. | `src/styles/gate-judge.css:177,443` |
| U4 | Low | **`prefers-reduced-motion` sets all durations to 0.01ms** which can cause jarring visual jumps. Better to selectively disable animations and use `opacity: 1; transform: none`. | `src/styles/animations.css:255-294` |
| U5 | Info | **PWA manifest** could add `categories: ["sports", "utilities"]` and `shortcuts` for quick actions. | `vite.config.ts` |

---

## 5. ACCESSIBILITY (Overall: Good)

Comprehensive `:focus-visible` styles, proper ARIA attributes in components, `role="timer"` on clock, keyboard shortcuts, `aria-live` regions.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| X1 | High | **Missing `lang` attribute** on `<html>` element. Required for WCAG 3.1.1 - screen readers can't determine document language. | `index.html` |
| X2 | Medium | **Collapsible settings sections** may not update `aria-expanded` attribute via JavaScript (CSS-only expansion). | `src/styles/settings.css:46-123` |
| X3 | Medium | **Virtual list items** may not have `tabindex="0"` for keyboard focusability. | `src/components/VirtualList.ts` |
| X4 | Low | **Offline banner dismiss button** lacks `aria-label`. | `src/styles/main.css:1497-1512` |
| X5 | Low | **Modal close buttons** may rely on visual "x" without `aria-label`. | `src/styles/modals.css:686-698` |
| X6 | Low | **Voice note textarea** lacks `maxlength` HTML attribute despite showing character count UI. | `src/styles/modals.css:771-787` |

---

## 6. INTERNATIONALIZATION (Overall: Excellent)

450+ translation keys in EN/DE, all UI strings use `t()` function, date/time formatting uses `Intl` APIs, keyboard shortcuts localized. No hardcoded strings found.

### Issues Found

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| I1 | Medium | **`<html lang>` not updated dynamically** when user switches language. Should call `document.documentElement.lang = newLang`. | Missing implementation |

---

## 7. TEST COVERAGE (Overall: B+, 85/100)

123 test files, 47K lines. Excellent API security tests (source code assertion pattern), comprehensive E2E flows (453 cases), strong edge case coverage (QuotaExceeded, corrupted data).

### Critical Gaps

| # | Severity | Finding | Lines Untested |
|---|----------|---------|----------------|
| T1 | High | **RadialDial component suite completely untested** - core UI component with complex touch/angle/animation logic. | ~600 lines across 3 files |
| T2 | High | **`services/auth.ts` untested** - JWT token management, session expiry, PIN exchange. Only exists as mocks. | 175 lines |
| T3 | High | **`services/sync/entrySync.ts` untested** - entry cloud fetch, send, delete operations. | ~300 lines |
| T4 | Medium | **No client-side race condition tests** - simultaneous entries, sync during edit, photo capture during deletion. | N/A |
| T5 | Medium | **Store slices not directly tested** - `entriesSlice`, `settingsSlice`, `syncSlice`, `uiSlice` only tested indirectly via store facade. | ~285 lines |
| T6 | Medium | **42 skipped tests** (`.skip()`) - many conditional on backend availability or WebKit issues. May hide real bugs. | Various |
| T7 | Low | **No browser API revocation tests** - camera permission revoked mid-session, Wake Lock denied, IndexedDB failures. | N/A |
| T8 | Low | **No data migration path tests** - old settings format to new, entry status enum changes. | N/A |
| T9 | Low | **Mock drift risk** - same services mocked differently in different test files; mocks may not reflect real API changes. | Various |

---

## 8. SCALABILITY

| # | Severity | Finding |
|---|----------|---------|
| SC1 | Medium | **Sync polling doesn't batch uploads** - with many entries, each triggers a separate POST |
| SC2 | Low | **VirtualList full cache clear** on filter - scales linearly with visible items |
| SC3 | Info | **Redis single-instance** architecture - adequate for current scale, would need clustering for high concurrency |

---

## Action Plan

### Phase 1: Quick Wins - COMPLETED

**Commit:** c7a2135

**Findings during implementation:**
- X1, I1 were already implemented (`<html lang="de">` in index.html, `document.documentElement.lang` update in settingsView.ts:131)
- X4 was already implemented (offline-banner-dismiss has `aria-label="Dismiss"`)
- X5 was already implemented (modal close buttons have `aria-label="Close"` with `data-i18n-aria-label`)
- X6 was already implemented (`maxlength="500"` on voice-note-textarea)

**Changes made:**
1. ~~**X1**: Add `<html lang="de">` and dynamic update on language switch~~ (already existed)
2. **U1/U2**: Fixed contrast ratios (`--text-tertiary` #909090 -> #a0a0a0, placeholder #909090 -> #a8a8a8)
3. **U3**: Replaced hardcoded button heights with design tokens in gate-judge.css (56px -> var(--btn-height-lg), 44px -> var(--btn-height-md))
4. ~~**X4/X5**: Add `aria-label` to offline banner dismiss and modal close buttons~~ (already existed)
5. ~~**X6**: Add `maxlength` attribute to voice note textarea~~ (already existed)
6. **S3**: Sanitized Redis error messages - regex strips redis:// URLs before logging
7. ~~**I1**: Update `document.documentElement.lang` on language switch~~ (already existed)
8. **P1**: Added battery level check in Wake Lock - skips wake lock request on critical battery (<5%)

**Learnings:**
- Review agents flagged some items that were already properly implemented. Always verify before changing.
- Pre-commit hooks auto-formatted and committed alongside lint fixes.
- 4 of 8 items were already done, showing the codebase has good baseline quality.

### Phase 2: Architecture Improvements - COMPLETED

**Commit:** abe817c

**Findings during implementation:**
- A2 (GPS race condition) is not a real issue: JS is single-threaded, synchronous check+set (`if (flag) return; flag = true;`) is atomic
- A4 (event queue for lazy-loaded modules) is not a real issue: events come from user interaction on elements created by the loaded view, so handlers are always registered before user can interact
- X2 (aria-expanded) already implemented in `deviceSettings.ts:98-108` and `syncSettings.ts:293-308`
- U4 (reduced-motion) was already well-implemented with blanket 0.01ms + specific overrides; this is the MDN-recommended approach
- A8 (standardize async error patterns) is too broad for a single phase; better as incremental work

**Changes made:**
9. ~~**A2**: Fix GPS duty cycling race condition~~ (not a real issue in single-threaded JS)
10. **A3**: Added max retry counter (3 attempts) to camera `reinitializeCamera()` with reset on success and explicit init
11. ~~**A4**: Add event queue/replay for lazy-loaded modules~~ (not a real issue)
12. **S1**: Capped `versionHistory` array at 100 entries in faults API (`fault.versionHistory.slice(0, 100)`)
13. **S4**: Added runtime field validation for BroadcastChannel presence messages (checks id, name, lastSeen types)
14. **U4**: Added `scroll-behavior: auto !important` to prefers-reduced-motion
15. ~~**X2**: Ensure `aria-expanded` is updated in JS~~ (already implemented)
16. ~~**A8**: Standardize async error handling~~ (deferred - too broad for single phase)
17. **P4**: Added critical battery check before camera initialization (skips to save 100-300mW)

**Learnings:**
- In single-threaded JS, synchronous flag check+set is always atomic. "Race conditions" require async gaps.
- Several review findings were theoretical concerns that don't apply in practice. Always verify the actual execution model.
- 4 of 9 items were non-issues or already done. 5 real changes made.

### Phase 3: Performance & Resilience ✅ COMPLETED (commit a01a2d9)

18. **P2**: ~~Implement sync request batching~~ → **Deferred** (over-engineering at current scale; entries sync individually via queue processor which already handles retries)
19. **P3**: ~~Implement VirtualList item-level diffing~~ → **Deferred** (premature optimization; current full-clear approach is fast enough with virtual scrolling)
20. **A5**: ✅ Extracted `classifySyncError()` from 18-line catch block in `fetchCloudEntriesImpl()` → single-line `store.setSyncStatus(classifySyncError(error))`
21. **A7**: ✅ Created `src/utils/photoHelpers.ts` with `isPhotoMarker()` and `hasFullPhotoData()`, replacing 7 scattered magic-string checks across 4 files
22. **A1**: ✅ Added `MAX_QUEUE_SIZE = 5` cap to toast queue with priority preservation (action toasts kept over info toasts)

**Learnings:**
- Linter (Biome) import organization runs between file edits. If you add an import in one file and the usage in a separate edit, the linter can remove the "unused" import before the usage edit lands. Always apply import + usage in the same logical change.
- P2 (batching) and P3 (diffing) were assessed as premature optimization. The sync queue already processes entries one-at-a-time with retry, and VirtualList already virtualizes rendering. Adding complexity here would increase maintenance cost without measurable user benefit.
- 2 of 5 items deferred, 3 implemented. All tests pass (2726 unit, 756 E2E).

### Phase 4: Test Coverage ✅ COMPLETED (commit 555875a)

23. **T1**: ~~Create RadialDial test suite~~ → **Deferred** (complex DOM/canvas interaction testing requires browser-level APIs not available in jsdom; better suited for Playwright visual tests)
24. **T2**: ✅ Created `tests/unit/services/auth.test.ts` — 32 tests covering token management, PIN exchange, JWT parsing, session expiry, role checks
25. **T3**: ✅ Created `tests/unit/services/sync/entrySync.test.ts` — 87 tests covering fetch/send/delete operations, photo handling, error classification, request coalescing, delta sync
26. **T4**: ~~Add client-side race condition tests~~ → **Deferred** (JS is single-threaded; race conditions only occur across async boundaries which are already covered by coalescing tests in T3)
27. **T5**: ✅ Created `tests/unit/store/entriesSlice.test.ts` (93 tests) + `tests/unit/store/settingsSlice.test.ts` (17 tests) — CRUD, undo/redo chains, sync queue, cloud merge, settings toggle
28. **T7**: ~~Add browser API failure/revocation tests~~ → **Deferred** (Camera/WakeLock/GPS APIs need browser environment; covered partially by E2E tests)
29. **T9**: ✅ Created `tests/helpers/factories.ts` — shared builders (`createEntry`, `createFault`, `createSettings`, `createJWT`, `createExpiredJWT`, `resetFactoryCounters`) + `tests/unit/utils/photoHelpers.test.ts` (16 tests)

**Test count: 2726 → 2971 tests (+245), 108 test files**

**Learnings:**
- `DOMException` doesn't extend `Error` in jsdom — use `new Error()` with `name = 'AbortError'` for timeout mocks instead of `new DOMException()`
- Module-level state (like `lastSyncTimestamp`, `activeFetchPromise`) requires explicit cleanup in `afterEach` to prevent test pollution
- Mock drift is real: store mock needed 20+ methods to satisfy entrySync's usage. Shared factories reduce this by centralizing data creation
- T1 (RadialDial) deferred because touch/angle/animation logic is tightly coupled to DOM geometry — Playwright E2E tests are the right tool
- T4 (race conditions) deferred because single-threaded JS makes true concurrency impossible; the async coalescing pattern in entrySync is already well-tested
- 4 of 7 items implemented, 3 deferred with rationale. Coverage focused on highest-value gaps (auth, sync, store slices)

### Phase 5: Polish (2-3 days)

30. **A6**: Extract VirtualList template generation from event binding
31. **A9**: Convert barrel exports to named re-exports
32. **A10**: Make `parseJson()` require Valibot validation callback
33. **P5**: Increase GPS `maximumAge` to 30s for normal mode
34. **U5**: Add PWA manifest `categories` and `shortcuts`
35. **S2**: Investigate nonce-based CSP for inline styles
36. **T6**: Triage and resolve skipped tests
