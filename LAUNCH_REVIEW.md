# Launch Review - Comprehensive Bug & Issue Report

Generated: 2026-02-02
Updated: 2026-02-02 (ALL 8 CRITICAL issues FIXED ✅)

## Executive Summary

Comprehensive code review across 5 categories identified **47 issues**:
- **CRITICAL**: ~~8 issues~~ → **ALL FIXED** ✅
- **HIGH**: 14 issues (should fix before launch)
- **MEDIUM**: 16 issues (fix soon after launch)
- **LOW**: 9 issues (best practices/enhancements)

---

## CRITICAL ISSUES (Fix Before Launch)

### Security

| # | Issue | File | Line | Status |
|---|-------|------|------|--------|
| S1 | ~~**Rate limiting fails open** - When Redis unavailable, requests bypass rate limits~~ | `api/v1/sync.js` | 59-62 | ✅ FIXED |
| S2 | ~~**Rate limiting fails open** - Voice API allows unlimited calls on Redis failure~~ | `api/v1/voice.js` | 38-45 | ✅ FIXED |
| S3 | ~~**Legacy PIN hash auth vulnerability** - Hash exposure allows auth bypass~~ | `api/lib/jwt.js` | 154-167 | ✅ FIXED |

### Memory Leaks

| # | Issue | File | Line | Status |
|---|-------|------|------|--------|
| M1 | ~~**Unremoved document keydown listener** - Accumulates on each init~~ | `src/features/timerView.ts` | 225 | ✅ FIXED |
| M2 | ~~**Unremoved document keydown listener** - Radial timer leaks listeners~~ | `src/features/radialTimerView.ts` | 264 | ✅ FIXED |
| M3 | ~~**PullToRefresh never destroyed** - Instance leaks on view changes~~ | `src/features/resultsView.ts` | 127 | ✅ FIXED |

### Localization

| # | Issue | File | Line | Status |
|---|-------|------|------|--------|
| L1 | ~~**Missing translation key** - `noGateAssignment` not in translations~~ | `src/features/gateJudge.ts` | 299 | ✅ FIXED |

### Error Handling

| # | Issue | File | Line | Status |
|---|-------|------|------|--------|
| E1 | ~~**Token exchange without timeout** - Auth can hang indefinitely~~ | `src/services/auth.ts` | 59 | ✅ FIXED |

---

## HIGH PRIORITY (Should Fix Before Launch)

### Security

| # | Issue | File | Line |
|---|-------|------|------|
| S4 | Photos stored unencrypted in Redis | `api/v1/sync.js` | 499-516 |
| S5 | Voice API has no daily cost limits | `api/v1/voice.js` | 28-32 |
| S6 | Server PIN transmitted in header (not body) | `api/v1/admin/reset-pin.js` | 62-89 |

### Memory Leaks

| # | Issue | File | Line |
|---|-------|------|------|
| M4 | cleanupSearchTimeout missing PullToRefresh destroy | `src/features/resultsView.ts` | 273-279 |
| M5 | VirtualList button listeners accumulate | `src/components/VirtualList.ts` | 595-625 |
| M6 | FaultEntry modal listeners accumulate | `src/features/faultEntry.ts` | 38-86 |
| M7 | Inline fault handlers not cleaned | `src/features/faultEntry.ts` | 769, 855, 961 |

### Error Handling

| # | Issue | File | Line |
|---|-------|------|------|
| E2 | Missing try-catch in sync init chain | `src/services/sync/index.ts` | 77-80 |
| E3 | Unhandled JSON parse in BroadcastChannel | `src/services/sync/broadcast.ts` | 28-29 |
| E4 | Missing error handler on initializeAdminPin | `src/features/raceManagement.ts` | 151 |
| E5 | Photo save failures invisible to user | `src/services/photoStorage.ts` | 121-128 |

### Accessibility

| # | Issue | File | Line |
|---|-------|------|------|
| A1 | Form labels missing `for` attribute (13 instances) | `index.html` | Multiple |
| A2 | Photo viewer image needs dynamic alt text | `index.html` | 855 |

---

## MEDIUM PRIORITY (Fix Soon After Launch)

### Localization

| # | Issue | File | Line |
|---|-------|------|------|
| L2 | Hardcoded "Current time" aria-label | `src/components/Clock.ts` | 66 |
| L3 | Hardcoded "GPS" text (should use t()) | `src/app.ts` | 809 |
| L4 | Hardcoded "PIN will be verified when online" | `src/onboarding.ts` | 716 |

### Accessibility

| # | Issue | File | Line |
|---|-------|------|------|
| A3 | Emoji icons missing aria-hidden | `index.html` | 287, 388, 931 |
| A4 | Race list region missing aria-label | `index.html` | 921 |
| A5 | Empty state divs need aria-live for updates | `index.html` | 240, 387-391 |

### Memory/Performance

| # | Issue | File | Line |
|---|-------|------|------|
| M8 | PullToRefresh style element never removed | `src/components/PullToRefresh.ts` | 80-87 |
| M9 | RadialDial listeners added on resize | `src/components/RadialDial.ts` | 100-105 |
| M10 | Untracked setTimeout in RadialDial | `src/components/RadialDial.ts` | 133, 418 |
| M11 | VirtualList expensive focus queries | `src/components/VirtualList.ts` | 1338-1375 |
| M12 | VirtualList full render on filter | `src/components/VirtualList.ts` | 152-273 |

### Error Handling

| # | Issue | File | Line |
|---|-------|------|------|
| E6 | Fault sync errors don't update status UI | `src/services/sync/faultSync.ts` | 117-120 |
| E7 | Silent failure in API error parsing | `src/services/sync/entrySync.ts` | 339-341 |
| E8 | Missing null check in race deletion | `api/v1/admin/races.js` | 93-100 |
| E9 | Polling array bounds not checked | `src/services/sync/polling.ts` | 172-174 |
| E10 | Store notification queue unbounded | `src/store/index.ts` | 70 |

---

## LOW PRIORITY (Best Practices)

### Accessibility

| # | Issue | File | Line |
|---|-------|------|------|
| A6 | Use escapeAttr() for data attributes consistently | `src/utils/recentRacesUi.ts` | 4 |

### Error Handling

| # | Issue | File | Line |
|---|-------|------|------|
| E11 | No loading state during PIN save | `src/features/raceManagement.ts` | 306-349 |
| E12 | CSV export missing error handler | `src/features/export.ts` | - |
| E13 | BroadcastChannel fails silently on unsupported | `src/services/sync/broadcast.ts` | 48-50 |
| E14 | Max retries exceeded not propagated to client | `api/v1/sync.js` | 203 |

### Security

| # | Issue | File | Line |
|---|-------|------|------|
| S7 | Console logs in API could expose info | Multiple API files | - |

### Performance

| # | Issue | File | Line |
|---|-------|------|------|
| M13 | Clock 60fps could be more aggressive on battery | `src/components/Clock.ts` | 200-240 |

---

## Quick Wins (< 5 min each)

1. **L1**: Add `noGateAssignment` translation key
2. **L2-L4**: Replace hardcoded strings with t() calls
3. **A3**: Add `aria-hidden="true"` to emoji icons
4. **A4**: Add `aria-label` to race-list region
5. **E1**: Add timeout to token exchange fetch

---

## Recommended Fix Order

### Phase 1: Critical Security & Stability (Before Launch)
1. Fix rate limiting to fail closed (S1, S2)
2. Fix memory leaks in document listeners (M1, M2, M3)
3. Add token exchange timeout (E1)
4. Add missing translation key (L1)

### Phase 2: High Priority (Day of Launch)
5. Fix remaining memory leaks (M4-M7)
6. Add form label associations (A1)
7. Handle sync initialization errors (E2-E5)

### Phase 3: Post-Launch Polish
8. Fix remaining localization (L2-L4)
9. Add remaining accessibility fixes (A2-A5)
10. Performance optimizations (M8-M12)

---

## Files Most Affected

| File | Issue Count |
|------|-------------|
| `src/features/faultEntry.ts` | 4 |
| `src/components/VirtualList.ts` | 4 |
| `api/v1/sync.js` | 3 |
| `src/features/resultsView.ts` | 3 |
| `index.html` | 6 |
| `src/services/sync/*` | 5 |
