# Bug Hunt Report

Found 31 bugs across 5 review areas: Store & State, Services, UI Components, API & Security, Data Logic & Utils.

## Severity Legend

- **CRITICAL** — Data loss, security bypass, or broken core functionality
- **HIGH** — Functional bugs, security hardening, reliability issues
- **MEDIUM** — Edge cases, minor leaks, hardening opportunities

---

## CRITICAL

### BUG-01: Dirty-slice data loss on localStorage save error

- **File:** `src/store/index.ts:295`
- **Confidence:** 95%
- **Area:** Store

`saveToStorage()` swaps `dirtySlices` to a fresh `Set` *before* any write attempt. If a `QuotaExceededError` or other exception is thrown mid-save (e.g., after `entries` is written but before `syncQueue`), the state changes that had not yet been serialized are silently discarded. The dirty set is already gone, so `scheduleSave()` will never retry them. In-memory state and localStorage become permanently inconsistent.

**Fix:** Only clear `dirtySlices` after a fully successful flush, or re-add unwritten keys on error.

---

### BUG-02: No-PIN mode bypasses auth for all data reads

- **File:** `api/lib/jwt.ts:155-160`, all endpoints
- **Confidence:** 97%
- **Area:** API Security

When no PIN has been configured in Redis, `validateAuth` returns `{ valid: true, method: 'none', payload: undefined }`. Every endpoint that calls `validateAuth` allows unauthenticated access to read all race data (GET on `/api/v1/sync`, `/api/v1/faults`, `/api/v1/admin/races`). Role checks correctly block destructive writes, but all reads are wide open before any PIN is set (fresh deployment or after `reset-pin` clears both PINs).

**Fix:** Add explicit `method` guard before role-sensitive and data-read operations:
```typescript
if (auth.method === 'none') {
  return sendError(res, 'Authentication required', 403);
}
```

---

### BUG-03: Sync state corruption when cleanup runs during in-flight fetch

- **File:** `src/services/sync/entrySync.ts:539-543`
- **Confidence:** 95%
- **Area:** Services

`cleanupEntrySync()` unconditionally nulls `activeFetchPromise` and `callbacks` while a fetch is in flight. If the user changes race ID mid-sync, `callbacks?.onCleanup()` fires from inside `fetchCloudEntriesImpl` while that function is still executing. `cleanup()` sets sync status to `'disconnected'`, but the in-flight fetch response may still arrive and call `store.setSyncStatus('connected')`, corrupting sync state.

**Fix:** Guard all store/callback calls after `onCleanup()` with a check that the module is still initialized, or set an `isDestroyed` flag.

---

### BUG-04: Modal focus trap lost on rapid close-then-open

- **File:** `src/features/modals.ts:126-155`
- **Confidence:** 95%
- **Area:** UI

`closeModal` removes the focus trap after a 150ms animation delay via `setTimeout`. If `openModal` is called on the same element before that timeout fires, the re-opened modal does not get a new `trapFocus` call (because `focusStateMap.has(modal)` is still true). When the delayed `releaseFocus` fires, it removes the keyboard handlers from the now-open modal. Result: open modal has no Escape handler and no Tab trap.

**Fix:** In `closeModal`, call `releaseFocus` synchronously before the animation delay, or store the timeout ID and cancel it in `openModal` if the modal is being reopened.

---

### BUG-05: Camera stream tracks leaked on waitForVideoReady failure

- **File:** `src/services/camera.ts:249-279` (reinitialize), `src/services/camera.ts:160-167` (initialize)
- **Confidence:** 92%
- **Area:** Services

In both `reinitializeCamera()` and `initialize()`, when `getUserMedia` succeeds and assigns `this.stream` but `waitForVideoReady()` subsequently throws, the catch block does not stop the acquired stream tracks. After the catch, `this.cameraState` is `'stopped'` but `this.stream` holds live tracks. The camera LED stays on and the hardware stream is held indefinitely until `stop()` is explicitly called.

**Fix:** In both catch blocks:
```typescript
if (this.stream) {
  this.stream.getTracks().forEach((track) => track.stop());
  this.stream = null;
}
if (this.videoElement) this.videoElement.srcObject = null;
```

---

### BUG-06: CSV escapeCSVField doesn't quote fields containing \r or \t

- **File:** `src/features/export.ts:70-78`
- **Confidence:** 95%
- **Area:** Export

The wrapping condition checks for `\n` (LF) but not `\r` (CR) or `\t` (tab). A field containing `\r` alone gets a `'` prefix from the formula-injection guard but is never wrapped in quotes, leaving a bare carriage return in an unquoted field that breaks CSV line parsing.

**Fix:** Add `'\r'` and `'\t'` to the wrapping condition:
```typescript
if (
  escaped.includes(';') ||
  escaped.includes('"') ||
  escaped.includes('\n') ||
  escaped.includes('\r') ||
  escaped.includes('\t') ||
  escaped.includes('|')
) {
  escaped = `"${escaped}"`;
}
```

---

### BUG-07: formatTimeForRaceHorology midnight carry-over loses date

- **File:** `src/features/export.ts:18-43`
- **Confidence:** 92%
- **Area:** Export

The carry-over logic for centisecond rounding handles seconds/minutes/hours rollover, but the hour rollover at lines 37-39 sets `h = 0` without bumping the date. A `23:59:59.999` timestamp becomes `00:00:00` but the `Datum` column (from `formatDateForExport`) still shows the original date. For an overnight race entry, the time shows next-day midnight but the date is wrong.

**Fix:** Return a flag from `formatTimeForRaceHorology` indicating date rollover occurred, or use UTC methods consistently and handle the carry-over in the date formatter.

---

## HIGH

### BUG-08: Hardcoded HMAC key in reset-pin comparison

- **File:** `api/v1/admin/reset-pin.ts:122-126`
- **Confidence:** 92%
- **Area:** API Security

The HMAC key `'reset-pin-compare'` is a hardcoded constant. The stated purpose is timing-safe comparison via fixed-length digests, but anyone who reads the source knows the key. The HMAC provides no additional secrecy over a plain hash.

**Fix:** For a plaintext secret comparison, pad both to the same maximum length before comparing:
```typescript
const MAX_LEN = 256;
const a = Buffer.alloc(MAX_LEN);
const b = Buffer.alloc(MAX_LEN);
Buffer.from(serverPin).copy(a);
Buffer.from(providedPin).copy(b);
pinValid = crypto.timingSafeEqual(a, b);
```

---

### BUG-09: VirtualList SwipeActions leak on single-to-multi group upgrade

- **File:** `src/components/VirtualList.ts:389-428`
- **Confidence:** 90%
- **Area:** UI

In `toggleGroup`, if a single-item group is upgraded to multi-item by a live sync event, the old `single-{id}` DOM node and its SwipeActions instance linger in `visibleItems` and `swipeActions`. The SwipeActions instance holds pointer-capture listeners on the wrapper div, keeping that DOM subtree alive.

**Fix:** In `toggleGroup`, always add `single-${groupId}` to `groupItemIds` regardless of `group.isMultiItem`:
```typescript
groupItemIds.add(`single-${groupId}`);
```

---

### BUG-10: delegatedContainers WeakSet not cleared on cleanup — Chief Judge buttons stop working

- **File:** `src/features/chiefJudgeView.ts:553-561, 607-609`
- **Confidence:** 88%
- **Area:** UI

`delegatedContainers` is a module-level `WeakSet` tracking which containers have delegation handlers. `cleanupChiefJudgeView()` calls `listeners.removeAll()` which removes all handlers, but `delegatedContainers` is NOT cleared. On re-init, `setupSummaryListDelegation` and `setupPendingDeletionsDelegation` skip re-registering because `delegatedContainers.has(container)` returns `true` — even though the actual handlers were removed. Result: clicking finalize/edit/delete fault buttons does nothing after view re-init.

**Fix:** Move `setupSummaryListDelegation` out of `updateFaultSummaryPanel` (called every update) and into `initChiefJudgeToggle()` (one-time setup). Or clear `delegatedContainers` in cleanup.

---

### BUG-11: syncFault ignores send failure — faults lost during poor connectivity

- **File:** `src/services/sync/index.ts:451-463`
- **Confidence:** 88%
- **Area:** Services

`syncEntry` correctly falls back to `store.addToSyncQueue(entry)` on failure. `syncFault` does not — `sendFaultToCloud` returns `false` on failure but the return value is never checked. Faults are broadcast locally but never queued for retry. They are only retried on the next `initialize()` call (page reload), not proactively during the session.

**Fix:** Check the return value and queue for retry, matching the `syncEntry` pattern.

---

### BUG-12: isValidRun allows any integer >= 1 instead of 1 | 2

- **File:** `src/utils/validation.ts:38-40`
- **Confidence:** 88%
- **Area:** Validation

The `Run` type is `1 | 2` but `isValidRun` only checks `run >= 1` with no upper bound. A manipulated sync payload with `run: 99` passes validation, gets stored, and exported with an invalid run number.

**Fix:**
```typescript
function isValidRun(run: unknown): run is Run {
  return run === 1 || run === 2;
}
```

---

### BUG-13: voice.ts await getRedis() on sync function — dead code guard

- **File:** `api/v1/voice.ts:97-98, 388-389`
- **Confidence:** 88%
- **Area:** API

`getRedis()` is synchronous (returns `Redis`, not `Promise<Redis>`). The `!client` guard after `await` can never be true — `getRedis()` either returns an instance or throws. If it throws, the exception is unhandled, causing a 500 instead of the intended 503.

**Fix:** Remove `await` and wrap in try/catch:
```typescript
let client: Redis;
try {
  client = getRedis();
} catch {
  return { allowed: false, remaining: 0, error: 'Service temporarily unavailable' };
}
```

---

### BUG-14: CSV formula-injection prefix not wrapped in quotes

- **File:** `src/features/export.ts:49-80`
- **Confidence:** 88%
- **Area:** Export

When a field starts with `=`, `+`, `-`, `@`, `\t`, or `\r`, the code prepends `'` making it e.g. `'-5`. This is NOT wrapped in quotes because the wrapping condition doesn't trigger. CSV-compliant parsers read the literal value `'-5` which is wrong data. Race Horology receives `'+5` or `'-5` instead of the actual value.

**Fix:** Always wrap non-numeric fields in double quotes by default (RFC 4180 approach), rather than using the Excel-specific single-quote prefix.

---

### BUG-15: Missing touchcancel handler in SwipeActions

- **File:** `src/components/SwipeActions.ts:211-236`
- **Confidence:** 87%
- **Area:** UI

In the touch event fallback path, `SwipeActions` registers `touchstart`, `touchmove`, `touchend` but no `touchcancel`. On iOS, `touchcancel` fires when the system intercepts a gesture (notification, scroll). The wrapper remains stuck at its translated X position and any `pendingActionTimeoutId` fires after 200ms, triggering an unintended delete or edit.

**Fix:** Add `touchcancel` handler:
```typescript
private onTouchCancel = (): void => {
  if (this.pendingActionTimeoutId !== null) {
    clearTimeout(this.pendingActionTimeoutId);
    this.pendingActionTimeoutId = null;
  }
  this.reset();
};
```

---

### BUG-16: playBeep schedules oscillator before async resume() completes

- **File:** `src/services/feedback.ts:103-130`
- **Confidence:** 85%
- **Area:** Services

When `AudioContext` is suspended, `ctx.resume()` is fire-and-forget (`.catch(() => {})`), but the oscillator is immediately created and scheduled using `ctx.currentTime`. On mobile, `resume()` is async and `ctx.currentTime` may be stale. The oscillator `start()`/`stop()` are scheduled for a time that has already passed, causing no sound or clipped audio.

**Fix:** Defer oscillator scheduling until after `resume()` resolves:
```typescript
if (ctx.state === 'suspended') {
  ctx.resume().then(() => scheduleOscillator(ctx, frequency, duration)).catch(() => {});
  return;
}
scheduleOscillator(ctx, frequency, duration);
```

---

### BUG-17: LLM error message and provider name leaked to client

- **File:** `api/v1/voice.ts:440-454`
- **Confidence:** 85%
- **Area:** API Security

Raw `error.message` from failed LLM API calls (which can include upstream error details, HTTP status lines, rate-limit messages) is returned directly to the client. The `provider` field also exposes internal configuration.

**Fix:** Return a generic error and keep details server-side only.

---

### BUG-18: Non-atomic incr/expire in rate limiters — key can get no TTL

- **File:** `api/v1/admin/reset-pin.ts:38-45`, `api/v1/voice.ts:107-110`
- **Confidence:** 85%
- **Area:** API

`incr` and `expire` are two separate Redis commands. If the process crashes between them (or two concurrent requests both see `current === 1`), the key persists indefinitely with no TTL, permanently locking out legitimate requests. The auth and sync rate limiters correctly use `client.multi()` (pipeline), but `reset-pin` and `voice` do not.

**Fix:** Use `client.multi()` pipeline for atomicity.

---

### BUG-19: Merge dedup key format inconsistency (dash vs colon)

- **File:** `src/store/slices/entriesSlice.ts:330-346`
- **Confidence:** 85%
- **Area:** Store

`mergeCloudEntries` uses `${e.id}-${e.deviceId}` (dash) for the existence check and `${entry.id}:${entry.deviceId}` (colon) for the delete check. Two different serialization formats for the same conceptual key. No functional bug today but highly fragile — will break on the first refactor that touches either format.

**Fix:** Pick one format and use it consistently.

---

### BUG-20: Fault delete modal run label uses fragile .replace + missing escapeHtml

- **File:** `src/features/faults/faultInlineEntry.ts:676`
- **Confidence:** 85%
- **Area:** Faults / XSS

```typescript
${t('run1', state.currentLang).replace('1', String(fault.run))}
```

The `.replace('1', run)` approach is brittle and the result is inserted into `innerHTML` without `escapeHtml()`.

**Fix:**
```typescript
${escapeHtml(t(fault.run === 1 ? 'run1' : 'run2', state.currentLang))}
```

---

## MEDIUM

### BUG-21: Signal effect for role changes never disposed

- **File:** `src/app.ts:132-141`
- **Confidence:** 88%
- **Area:** Store

The `effect()` created to handle runtime role changes in `initApp()` is never stored or returned for cleanup. Per lifecycle guidelines, all effects must be cleaned up. Causes problems in test environments that call `initApp()` more than once or in hot-reload scenarios.

**Fix:** Store the disposer and include it in cleanup, or move into `initStateEffects()`.

---

### BUG-22: Gate selector buttons use raw addEventListener outside ListenerManager

- **File:** `src/features/faults/faultInlineEntry.ts:267-361`
- **Confidence:** 85%
- **Area:** UI

`updateInlineGateSelector()` clears the container with `innerHTML = ''`, creates new buttons, and attaches `click`/`keydown` listeners via raw `addEventListener` outside the module's `ListenerManager`. On rapid re-init, two sets of gate buttons can exist simultaneously with stale closures.

**Fix:** Use event delegation on the container (already done for fault type buttons), or register via `ListenerManager`.

---

### BUG-23: Photo save timeout doesn't cancel IDB transaction

- **File:** `src/services/photoStorage.ts:126-136`
- **Confidence:** 83%
- **Area:** Services

`Promise.race` between the save and a 5s timeout. When the timeout wins, the caller gets `false`, but the IDB transaction continues in the background. It may complete and write stale data after the caller has moved on.

**Fix:** Use `AbortController` or `transaction.abort()` to cancel on timeout.

---

### BUG-24: pointercancel doesn't cancel pendingActionTimeoutId

- **File:** `src/components/SwipeActions.ts:391-398`
- **Confidence:** 83%
- **Area:** UI

`onPointerCancel` calls `this.reset()` but does NOT cancel `this.pendingActionTimeoutId`. If a swipe triggered the timeout and `pointercancel` fires before it elapses (e.g., iOS scroll intervention), the pending action fires 200ms later — triggering an unintended delete or edit.

**Fix:**
```typescript
if (this.pendingActionTimeoutId !== null) {
  clearTimeout(this.pendingActionTimeoutId);
  this.pendingActionTimeoutId = null;
}
this.reset();
```

---

### BUG-25: sanitizeString strips apostrophes from device names — silent data loss

- **File:** `src/utils/validation.ts:336-342`
- **Confidence:** 83%
- **Area:** Validation

`sanitizeString` strips `<>"'&` from stored values. A device named `O'Brien's Timer` silently becomes `OBriens Timer` on every load from localStorage. The data corruption is silent and irreversible. Per CLAUDE.md, HTML escaping should happen at render time via `escapeHtml()`/`escapeAttr()`, not at storage time.

**Fix:** Only strip control characters (`\x00-\x1F\x7F`), not HTML-sensitive characters. Escape at render time instead.

---

### BUG-26: GET /admin/races has no role restriction

- **File:** `api/v1/admin/races.ts:220-224`
- **Confidence:** 82%
- **Area:** API Security

The DELETE path correctly enforces `chiefJudge` role. The GET path does not. Any `timer` or `gateJudge` token can call `GET /api/v1/admin/races` and enumerate all race IDs, entry counts, and timestamps. The endpoint is under `/api/v1/admin/` and the CLAUDE.md RBAC table does not grant this to `timer` or `gateJudge`.

**Fix:** Add role check to GET path matching DELETE.

---

### BUG-27: escapeHtml used for HTML attribute instead of escapeAttr

- **File:** `src/features/faults/faultInlineEntry.ts:90`
- **Confidence:** 82%
- **Area:** XSS

```typescript
card.setAttribute('data-bib', escapeHtml(bib));
```

`escapeHtml()` does NOT escape quotes. A bib value containing `"` would break the attribute. Should use `escapeAttr()`.

**Fix:** `card.setAttribute('data-bib', escapeAttr(bib));`

---

### BUG-28: Undo for UPDATE_ENTRY silently no-ops if entry was cloud-deleted

- **File:** `src/store/slices/entriesSlice.ts:190-198`
- **Confidence:** 82%
- **Area:** Store

When undoing an `UPDATE_ENTRY`, if the entry was deleted via cloud sync between the update and undo, `index` is -1. The entry is not restored, but the action is still popped from undoStack and pushed to redoStack. The user sees the undo toast but nothing happens.

**Fix:** Return a discriminated result indicating whether the operation changed state; callers can avoid showing a false success toast.

---

### BUG-29: Stale state snapshot used for merge after async gap in entry sync

- **File:** `src/services/sync/entrySync.ts:153-165`
- **Confidence:** 80%
- **Area:** Services

`fetchCloudEntriesImpl` captures `state` at the top. After `await fetchWithTimeout(...)`, it continues using the stale snapshot for `raceId` in `addRecentRace` and `mergeCloudEntries`. If the user changed race ID during the fetch, entries from the old race get merged into the new race's local state.

**Fix:** Re-check `store.getState().raceId === state.raceId` after the await before merging.

---

### BUG-30: formatFaultsForCSV joins with commas but field isn't quoted

- **File:** `src/features/export.ts:129-135`
- **Confidence:** 80%
- **Area:** Export

`formatFaultsForCSV` returns strings like `"T4(MG),T8(STR)"`. The quoting triggers in `escapeCSVField` don't include commas (only `;`, `"`, `\n`, `|`). Any downstream tool that is comma-aware could misinterpret the field.

**Fix:** Add commas to the quoting condition, or use a different join separator (e.g., `+` or space).

---

### BUG-31: Dual storage-warning dispatchers fire overlapping events

- **File:** `src/store/index.ts:301-399`
- **Confidence:** 80%
- **Area:** Store

`saveToStorage` fires both `checkStorageQuota()` (async, measures all storage via `navigator.storage.estimate()`) and `checkLocalStorageQuota()` (sync, localStorage-specific). Both dispatch `storage-warning` events with potentially contradictory data. Listeners see duplicate overlapping warnings.

**Fix:** Unify or deduplicate the two quota checks.
