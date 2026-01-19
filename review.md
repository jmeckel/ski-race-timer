# Ski Race Timer PWA - Comprehensive Review

**Date:** January 2026
**Reviewed by:** Claude Code Analysis

---

## Executive Summary

This review covers the Ski Race Timer PWA codebase and UI/UX. The application is a GPS-synchronized race timing Progressive Web App designed for mobile use in outdoor race conditions. While the app has solid fundamentals in architecture, mobile-first design, and offline capabilities, there are critical issues in security, timing precision, and cold-weather usability that need to be addressed.

### Overall Scores

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 7/10 | Good structure, but 1800-line app.ts needs splitting |
| Security | 4/10 | No API auth, client-side PIN easily bypassed |
| Code Quality | 6/10 | TypeScript well-used, inconsistent error handling |
| UI/UX | 7/10 | Solid mobile-first, needs cold-weather optimization |
| Accessibility | 6/10 | Good foundation, missing focus management |
| Performance | 7/10 | Efficient virtualization, polling could be smarter |

---

## Critical Issues (Must Fix)

### 1. Security: No Authentication on Admin API

**Location:** `/api/admin/races.js:175-245`

**Problem:** The `/api/admin/races` endpoint has NO authentication. Anyone can:
- List all active races
- Delete any race
- Delete ALL races with `?deleteAll=true`

```javascript
// Current code - NO AUTH CHECK
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const races = await listRaces(client);
    return res.status(200).json({ races });
  }

  if (req.method === 'DELETE') {
    const result = await deleteRace(client, raceId);
    return res.status(200).json(result);
  }
}
```

**Recommendation:** Add server-side authentication:
```javascript
import { verifyAdminToken } from '../lib/auth';

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const admin = await verifyAdminToken(token);

  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Proceed with operation...
}
```

---

### 2. Timing Precision Bug - Timestamp After Photo

**Location:** `/src/app.ts:174-245`

**Problem:** The `recordTimestamp()` function captures the timestamp AFTER photo capture completes. If photo capture takes 500ms, the timestamp is 500ms late - unacceptable for race timing.

```typescript
// Current problematic code
async function recordTimestamp(): Promise<void> {
  try {
    let photo: string | null = null;
    if (state.settings.photoCapture) {
      photo = await captureTimingPhoto(); // Async delay BEFORE timestamp
    }

    const entry: Entry = {
      timestamp: new Date().toISOString(), // Timestamp AFTER photo capture!
    };
```

**Recommendation:** Capture timestamp IMMEDIATELY, attach photo asynchronously:
```typescript
async function recordTimestamp(): Promise<void> {
  // Capture timestamp IMMEDIATELY
  const preciseTimestamp = new Date().toISOString();

  const entry: Entry = {
    timestamp: preciseTimestamp, // Captured first
    // ...
  };

  // Capture photo asynchronously (don't block timestamp)
  if (state.settings.photoCapture) {
    captureTimingPhoto().then(photo => {
      if (photo) store.updateEntry(entry.id, { photo });
    }).catch(err => console.error('Photo capture failed:', err));
  }
}
```

---

### 3. Silent Data Loss Risk

**Location:** `/src/store/index.ts:195-208`

**Problem:** The `saveToStorage()` method silently fails if localStorage quota is exceeded. No user notification, no fallback strategy. This is critical for a timing app where data loss is unacceptable.

```typescript
// Current code - silent failure
private saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(this.state.entries));
  } catch (e) {
    console.error('Failed to save to storage:', e);
    // No user notification!
  }
}
```

**Recommendation:** Add quota checking, user notification, and IndexedDB fallback:
```typescript
private async saveToStorage() {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      if (quota && usage && (usage / quota) > 0.9) {
        this.showStorageWarning();
      }
    }
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(this.state.entries));
  } catch (e) {
    window.dispatchEvent(new CustomEvent('storage-error', {
      detail: { error: e, critical: true }
    }));
    await this.saveToIndexedDB(); // Fallback
  }
}
```

---

### 4. Client-Side PIN is Security Theater

**Location:** `/src/app.ts:1567-1577`

**Problem:**
- Trivial hash algorithm (not cryptographic)
- Stored in localStorage (readable via DevTools)
- No server-side validation
- Code comment admits it's "not cryptographically secure"

**Recommendation:** Move authentication to server with proper hashing (bcrypt) and JWT tokens.

---

## High Priority Improvements

### Code Architecture Issues

#### God Function in app.ts

**Location:** `/src/app.ts` (1,818 lines, 50+ functions)

**Problem:** Single file mixes concerns: initialization, business logic, UI rendering, utilities, admin features.

**Recommendation:** Split into domain modules:
```
src/
  app/
    init.ts          // initApp, initialization
    timing.ts        // recordTimestamp, timing logic
    ui.ts            // UI updates, modals
    admin.ts         // race management
    utils.ts         // helpers
  index.ts           // orchestrate modules
```

#### Uncontrolled State Mutations

**Location:** `/src/types/index.ts:80,101`

**Problem:** Store exposes mutable `Set` and `Map` instances directly in state. Components can mutate state bypassing the store.

```typescript
export interface AppState {
  selectedEntries: Set<string>;  // Mutable reference
  connectedDevices: Map<string, DeviceInfo>; // Mutable reference
}
```

**Recommendation:** Return readonly copies:
```typescript
getState(): Readonly<AppState> {
  return {
    ...this.state,
    selectedEntries: new Set(this.state.selectedEntries),
    connectedDevices: new Map(this.state.connectedDevices)
  };
}
```

#### No Timeout on Fetch Requests

**Location:** `/src/services/sync.ts:159,242`

**Problem:** Network requests could hang indefinitely.

**Recommendation:** Add timeout wrapper (10 seconds default):
```typescript
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### Duplicate Device Tracking Logic

**Location:** `/api/sync.js:140-185` and `/api/admin/races.js:52-76`

**Problem:** Identical `getActiveDeviceCount()` function duplicated.

**Recommendation:** Extract to shared utility `/api/lib/redis-utils.js`.

#### Redo Functionality Broken

**Location:** `/src/store/index.ts:395-406`

**Problem:** Code comment admits redo doesn't work correctly for UPDATE_ENTRY.

**Recommendation:** Store both before and after state in actions:
```typescript
export interface Action {
  type: ActionType;
  before: Entry | Entry[];
  after: Entry | Entry[];
  timestamp: number;
}
```

---

### UI/UX Issues for Outdoor Ski Timing

#### Small Touch Targets for Gloved Use

**Location:** `/src/styles/main.css:269-307`

**Problem:** Number pad buttons become very small at responsive breakpoints. At `max-height: 600px`, font size drops to 1rem. Cold weather conditions require:
- Thick winter gloves
- Cold, less dexterous fingers
- Potentially wet or condensation-covered screens

**Recommendation:**
```css
.num-btn {
  min-height: 56px;
  min-width: 56px;
}

@media (max-height: 600px) {
  .num-btn {
    min-height: 48px; /* Maintain minimum even in constrained space */
  }
}
```

#### Timestamp Button Shrinks Too Much

**Location:** `/src/styles/main.css:1127-1131`

**Problem:** At 600px height, timestamp button padding reduces to `27px 16px`. This is the most critical button.

**Recommendation:**
```css
@media (max-height: 600px) {
  .timestamp-btn {
    padding: 36px 20px; /* Increase from 27px */
    font-size: 1.75rem; /* Increase from 1.5rem */
  }
}
```

#### Low Contrast Status Indicators

**Location:** `/src/styles/main.css:90-124`

**Problem:** Sync and GPS indicators use `var(--text-tertiary)` (#666666) which has low contrast. In bright sunlight, these may be invisible.

**Recommendation:**
```css
.sync-indicator, .gps-indicator {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.sync-status-text, .gps-status-text {
  color: var(--text-secondary); /* Use secondary instead of tertiary */
  font-weight: 500;
}
```

#### Confirmation Overlay Blocks Further Input

**Location:** `/src/app.ts:250-272`

**Problem:** 1.5 second confirmation overlay prevents immediate next entry. In rapid succession scenarios (multiple racers finishing close together), this creates timing delays.

**Recommendation:**
- Reduce overlay duration to 800ms
- Allow tapping overlay to dismiss immediately
- Make overlay non-blocking (position differently so number pad is accessible)

---

## Accessibility Issues (WCAG 2.1)

### Missing Live Region Announcements

**Location:** `/index.html:94`

**Problem:** Bib display doesn't have `aria-live` region, so screen readers won't announce changes as user types.

**Recommendation:** Add `aria-live="polite"` to `.bib-display`.

### Timing Point Selection Not Announced

**Location:** `/src/app.ts:133-149`

**Problem:** When timing point changes, there's no screen reader announcement.

**Recommendation:** Add `role="status" aria-live="polite"` region.

### Focus Management in Modals

**Problem:** When modals open, focus doesn't automatically move to modal content. When closed, focus doesn't return to trigger.

**Recommendation:** Implement proper focus trap:
```typescript
function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  const previouslyFocused = document.activeElement as HTMLElement;

  modal?.classList.add('show');

  const firstFocusable = modal?.querySelector('button, input, select, textarea');
  (firstFocusable as HTMLElement)?.focus();

  modal?.setAttribute('data-return-focus', previouslyFocused.id);
}
```

### Incorrect ARIA States

**Location:** `/index.html:65-72`

**Problem:** Both timing point buttons have `aria-checked="false"` initially, but one should be `true`.

---

## Performance Issues

### Polling Interval Too Aggressive

**Location:** `/src/services/sync.ts:9`

**Problem:** 5-second polling for data that changes infrequently wastes battery/bandwidth.

**Recommendation:** Use exponential backoff:
```typescript
const POLL_INTERVAL_ACTIVE = 2000;    // When entries recently added
const POLL_INTERVAL_NORMAL = 10000;   // Normal polling
const POLL_INTERVAL_IDLE = 30000;     // When no recent activity

private getPollingInterval(): number {
  const timeSinceLastEntry = Date.now() - this.lastEntryTime;
  if (timeSinceLastEntry < 60000) return POLL_INTERVAL_ACTIVE;
  if (timeSinceLastEntry < 300000) return POLL_INTERVAL_NORMAL;
  return POLL_INTERVAL_IDLE;
}
```

### VirtualList Recreates DOM Unnecessarily

**Location:** `/src/components/VirtualList.ts:79-99`

**Problem:** On any field change, entire DOM node is thrown away and recreated.

**Recommendation:** Update only changed parts in-place:
```typescript
private updateItemInPlace(item: HTMLElement, newEntry: Entry, oldEntry: Entry) {
  if (oldEntry.bib !== newEntry.bib) {
    const bibEl = item.querySelector('.result-bib');
    if (bibEl) bibEl.textContent = formatBib(newEntry.bib);
  }
  // Update only changed fields...
}
```

---

## Recommended Ski-Specific Features

### 1. Glove Mode

Add a setting that:
- Increases all touch targets by 25%
- Adds more visual contrast
- Increases haptic feedback intensity
- Enables larger fonts throughout

### 2. Voice Input for Bib Numbers

High priority for hands-free operation:
```typescript
if ('webkitSpeechRecognition' in window) {
  const recognition = new webkitSpeechRecognition();
  recognition.lang = store.getState().currentLang === 'de' ? 'de-DE' : 'en-US';
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const number = extractNumberFromSpeech(transcript);
    store.setBibInput(number);
  };
}
```

### 3. Quick Actions Bar

Floating action buttons for:
- Quick timestamp (without bib required)
- Repeat last entry
- Mark as DNS/DNF/DSQ quickly

### 4. Battery Saver Mode

Settings to:
- Reduce screen brightness
- Disable animations
- Reduce sync frequency
- Disable photo capture automatically

### 5. Pre-Race Checklist

Startup screen that checks:
- GPS signal acquired
- Cloud sync connected
- Battery level > 20%
- Storage available
- Camera permissions granted
- Race ID set

### 6. Multi-Timer Coordination View

Visual indicator showing other connected devices' last activity:
```
Sync Status: Connected
├─ Timer 1 (You): Active
├─ Timer 2: Last entry 5s ago
└─ Timer 3: Last entry 45s ago
```

### 7. Emergency Export

Prominent button that immediately downloads all data as JSON + CSV backup without confirmation dialog.

---

## Implementation Priority

### Phase 1 - Critical Security & Data Integrity
1. Fix timestamp precision (capture before photo)
2. Add storage error notifications
3. Add API authentication

### Phase 2 - Outdoor Usability
4. Increase touch targets for glove use
5. Keep timestamp button large at all breakpoints
6. Improve contrast for outdoor visibility
7. Make confirmation overlay non-blocking

### Phase 3 - Code Quality
8. Split app.ts into modules
9. Add fetch timeouts
10. Standardize error handling

### Phase 4 - Enhanced Features
11. Add voice input for bib numbers
12. Add "Glove Mode" setting
13. Add pre-race checklist
14. Implement adaptive polling

---

## Files Reviewed

### Core Application
- `/src/app.ts` - Main application logic (1,818 lines)
- `/src/store/index.ts` - State management
- `/src/types/index.ts` - TypeScript types

### Services
- `/src/services/sync.ts` - Cloud synchronization
- `/src/services/gps.ts` - GPS handling
- `/src/services/camera.ts` - Photo capture
- `/src/services/feedback.ts` - Haptic/audio feedback

### Components
- `/src/components/Clock.ts` - Time display
- `/src/components/VirtualList.ts` - Results list
- `/src/components/NumberPad.ts` - Bib input

### API
- `/api/sync.js` - Sync endpoint
- `/api/admin/races.js` - Admin endpoint

### UI
- `/index.html` - HTML structure
- `/src/styles/main.css` - Styling
- `/src/i18n/translations.ts` - Internationalization

### PWA
- `/public/manifest.json` - PWA manifest
- `/public/sw.js` - Service worker

---

## Conclusion

The Ski Race Timer PWA has a solid foundation with good architecture patterns, accessibility considerations, and offline-first design. However, critical issues around security (unauthenticated admin API), timing precision (timestamp after photo), and cold-weather usability (small touch targets) must be addressed before production use in actual race timing scenarios where precision and reliability are paramount.

The most impactful improvements would be:
1. **Security**: Add proper authentication to admin API
2. **Precision**: Fix timestamp capture order
3. **Usability**: Increase touch targets and add voice input for gloved operation
4. **Reliability**: Add storage error handling and user notifications
