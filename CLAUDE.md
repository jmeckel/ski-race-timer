# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Ski Race Timer is a GPS-synchronized race timing PWA for ski races. TypeScript SPA designed for mobile use in outdoor race conditions.

## Commands

- **Dev server**: `npm start` or `npm run dev`
- **Build**: `npm run build` (TypeScript + Vite)
- **Unit tests**: `npm test` (Vitest)
- **E2E tests**: `npm run test:e2e` (Playwright)
- **Type check**: `npm run typecheck`
- **Lint**: `npm run lint` (Biome)
- **All tests**: `npm run test:all`

## Architecture

### Source Structure

```
.
├── api/                    # Vercel serverless functions (v1)
│   ├── v1/                 # Versioned API endpoints (auth, sync, faults, admin)
│   └── lib/                # Shared JWT and response utilities
├── src/
│   ├── app.ts              # Main application logic
│   ├── main.ts             # Entry point and initialization
│   ├── onboarding.ts       # First-run onboarding wizard
│   ├── version.ts          # Version codenames and changelogs
│   ├── store/              # State management (Preact Signals)
│   ├── services/           # GPS, sync, camera, feedback, battery services
│   ├── components/         # UI components (Clock, RadialDial, VirtualList, Toast, SwipeActions)
│   ├── features/           # Feature modules (views, modals, export, faults, race mgmt)
│   ├── utils/              # Validation, error handling, format, templates, ListenerManager
│   ├── i18n/               # Translations (EN/DE)
│   ├── styles/             # CSS (main, radial-dial, modals, results, settings, animations)
│   └── types/              # TypeScript types + CustomEvent registry
├── tests/                  # Unit (Vitest), API, and E2E (Playwright) tests
└── index.html              # Entry point
```

### Views

Three tab-based views:
1. **Timer** — Radial dial (iPod-style) for bib input, clock display, timing point (S/Z), run (L1/L2)
2. **Results** — Virtual-scrolled list with run indicator, CSV export, entry editing/deletion, photo thumbnails
3. **Settings** — GPS sync, cloud sync, auto-increment, feedback, language (EN/DE), photo, race management

Plus role-specific views:
- **Gate Judge** — Gate-first quick fault entry with 5-column gate grid
- **Chief Judge** — Fault summaries, deletion approvals

### Radial Dial Timer

Files: `src/components/RadialDial.ts`, `src/features/radialTimerView.ts`, `src/styles/radial-dial.css`.

- Numbers at `radius = containerSize * 0.38`, dial center at 52%
- Tap detection uses angle-based calculation (not `elementFromPoint`) for reliability after rotation
- Center exclusion zone (`dist < rect.width * 0.27`) prevents drag when tapping S/Z or L1/L2
- Synthetic mouse events after touch ignored for 500ms
- Landscape mode uses CSS Grid with `display: contents` for two-column layout

### Gate Judge

Files: `src/features/faults/faultInlineEntry.ts`, `src/features/gateJudgeView.ts`.

Flow: tap gate -> select fault type -> bib auto-fills -> save (2-tap minimum). Primary action buttons at bottom for thumb-reachability (gloves, one-handed operation).

## State Management

The store (`src/store/index.ts`) uses **Preact Signals** (`@preact/signals-core`) for all reactivity.

```typescript
import { $entries, $settings, effect, store } from '../store';

// React to changes via effect()
const dispose = effect(() => {
  void $entries.value;
  updateDisplay();
});

// One-shot reads (event handlers, init)
const state = store.getState();

// Cleanup
dispose();
```

**Computed selectors:** `$entries`, `$settings`, `$syncStatus`, `$currentLang`, `$gpsStatus`, `$deviceRole`, `$faultEntries`, `$entryCount`, `$cloudDeviceCount`, `$currentView`, `$bibInput`, `$selectedPoint`, `$selectedRun`, `$undoStack`, `$isJudgeReady`, `$gateAssignment`, `$isChiefJudgeView`, `$penaltySeconds`, `$usePenaltyMode`, `$selectedEntries`, `$isSyncing`, `$hasUnsyncedChanges`, `$entriesByRun`

**Derived:** `$hasUnsyncedChanges`, `$entriesByRun`

Effect setup is centralized in `appStateHandlers.ts:initStateEffects()` for global UI updates, plus local effects in `VirtualList`, `chiefJudgeView`, and `appInitServices`.

## Data & Sync

### Storage

- **LocalStorage keys**: `skiTimerEntries`, `skiTimerSettings`, `skiTimerAuthToken`, `skiTimerRaceId`, `skiTimerDeviceId`, `skiTimerRecentRaces`
- **Entry format**: `{ id, bib, point: 'S'|'F', run: 1|2, timestamp, status, deviceId, deviceName, photo? }`
- **Status values**: `ok`, `dns`, `dnf`, `dsq`, `flt` (fault penalty for U8/U10)
- **Persistence**: Dirty-slice strategy — only serialize changed state slices to localStorage

### Multi-Device Sync

Redis (ioredis) with polling (5s normal, 30s on error). BroadcastChannel for same-browser tab sync. Batch POST: `entries[]` array (up to 10) with per-entry atomic processing.

### Authentication & RBAC

JWT-based: PIN exchange -> token -> `Authorization: Bearer` header. 24h expiry.

| Role | Permissions |
|------|-------------|
| `timer` | Read/write entries and faults |
| `gateJudge` | Read/write entries and faults |
| `chiefJudge` | All above + delete faults (server-side enforced) |

### API Endpoints

All use `/api/v1/` prefix. Legacy `/api/*` paths rewritten for backwards compatibility.

- **`/api/v1/auth/token`** (POST) — Exchange PIN for JWT with optional role
- **`/api/v1/sync`** (GET/POST/DELETE) — Cloud sync for race entries
- **`/api/v1/faults`** (GET/POST/DELETE) — Fault entries (DELETE requires `chiefJudge`)
- **`/api/v1/admin/races`** (GET/DELETE) — Race management
- **`/api/v1/admin/pin`** (GET/POST) — PIN hash management
- **`/api/v1/admin/reset-pin`** (POST) — Server-side PIN reset

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL |
| `JWT_SECRET` | Production | JWT signing secret |
| `CORS_ORIGIN` | No | Allowed CORS origin |

### CSV Export (Race Horology Format)

Semicolon delimiter. Columns: Startnummer, Lauf, Messpunkt, Zeit, Status, Gerat, [Torstrafzeit, Torfehler,] Datum. ALL fields must be wrapped in `escapeCSVField()` including generated fields like dates.

## Key Patterns

### ListenerManager

All modules use `ListenerManager` from `src/utils/listenerManager.ts` for event listener tracking and cleanup.

```typescript
const listeners = new ListenerManager();
listeners.add(element, 'click', handler);
// Cleanup in destroy():
listeners.removeAll();
```

For `once` listeners, raw `addEventListener` with `{ once: true }` is acceptable.

### CustomEvent Communication

Modules communicate via typed CustomEvents (registry in `src/types/events.ts`):
```typescript
element.dispatchEvent(new CustomEvent('fault-edit-request', { bubbles: true, detail: { fault } }));
```

### HTML Templates & XSS Prevention

Template functions in `src/utils/templates.ts`. **Always** use `escapeHtml()` for innerHTML content, `escapeAttr()` for HTML attributes. Includes ALL dynamic data: bib numbers, device names, gate numbers, race IDs. Prefer `textContent` over `innerHTML` when not rendering markup. Note: `escapeHtml()` does NOT escape quotes — use `escapeAttr()` for attributes.

### Toast with Undo

Call `clearToasts()` before showing undo toasts to prevent LIFO stack mismatch:
```typescript
clearToasts();
showToast(t('entryDeleted', lang), 'success', 5000, { action: undoAction });
```

### Race Condition Guards

- **Queue double-processing**: `isProcessingQueue` flag with `try/finally` in `QueueProcessor.processQueue()`
- **Signal batching**: Preact Signals handles dependency tracking; re-entrant `setState` within effects is safe
- **Cloud merge dedup**: `existingIds` Set in `mergeCloudEntries` prevents duplicates
- **Camera state machine**: `cameraState` guards concurrent `initialize()` calls
- **GPS idempotent start**: `if (this.watchId !== null)` prevents duplicate watchers

## CSS

### Design Tokens

All tokens in `:root` in `src/styles/main.css`:

- **Timing colors**: `--start-color` (orange #f97316), `--finish-color` (green #10b981)
- **Surfaces**: `--background`, `--surface`, `--surface-elevated`
- **Borders**: `--border` (rgba(255, 255, 255, 0.1))
- **Spacing**: `--space-xs` (4px) through `--space-2xl` (32px)
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Button heights**: `--btn-height-sm` (36px), `--btn-height-md` (44px), `--btn-height-lg` (56px)
- **Radii**: `--radius` (12px), `--radius-sm` (8px)

### Layers & Organization

```css
@layer base, components;
```

CSS variables live OUTSIDE layers (in `:root`). Base styles and component styles in their respective layers.

### Logical Properties

All CSS uses logical properties for RTL-readiness:
- `margin-inline-start/end`, `padding-inline-start/end` instead of left/right
- `margin-block-start/end`, `padding-block-start/end` instead of top/bottom
- `inset-inline-start/end` instead of left/right positioning
- `text-align: start/end` instead of left/right

**Keep physical** for: safe-area insets, `left: 50%` centering, circular dial geometry, toggle switch knobs, decorative borders.

### Reduced Motion

In `src/styles/animations.css`:
- Blanket rule shortens all animation/transition durations
- `animation: none !important` for infinite/decorative animations
- `transform: none !important` on `:active` button press effects
- JS detection in `RadialDialAnimation.ts` with instant digit processing fallback

### Touch Targets

Minimum 48x48px for all interactive elements (WCAG 2.5.5). Critical for outdoor glove operation.

## Translations (i18n)

In `src/i18n/translations.ts`. Default language: German.

- Use `data-i18n` attribute on HTML elements for automatic translation
- For dynamic content: `t('key', store.getState().currentLang)`
- Aria-labels need translation too: `aria-label="${t('deleteLabel', lang)}"`
- Add new keys to BOTH `en:` and `de:` sections
- Check for existing keys before adding (grep first)

## Security

- **XSS**: See "HTML Templates & XSS Prevention" above
- **Fail closed**: Deny access when backing services fail; if Redis unavailable, return 503
- **PIN hashing**: PBKDF2 (100k+ iterations, random salt), timing-safe comparison
- **Secrets**: In request body, not headers (headers are logged by proxies)
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` in `vercel.json`

## Component Lifecycle

Components must clean up in `destroy()`:
- `listeners.removeAll()` for event listeners
- `dispose()` for signal effects
- `clearTimeout(id)` for tracked timeouts
- Remove dynamic `<style>` elements from `document.head`

Safety guards:
- **Double-destruction**: `if (this.isDestroyed) return;` at start of `destroy()`
- **MutationObserver**: Watch for DOM removal when components might be removed without `destroy()`
- **Error path cleanup**: If registering listeners before async ops, clean up in catch block

## Accessibility

- Icon-only buttons need `aria-label`; SVGs inside need `aria-hidden="true"`
- Dropdowns: update `aria-expanded` on state change
- Radio groups: `role="radiogroup"` container, `role="radio"` + `aria-checked` on options
- Dynamic content: `aria-live="polite"` on status indicators
- Focus management: focus first interactive element after showing modal/overlay
- Use `:focus-visible` (not `:focus`) for keyboard-only focus rings
- Arrow keys navigate within components; Tab moves between components
- Modals: trap focus, dismiss with Escape, click-outside dismissal

## Error Handling

- Notify users on silent browser API failures (Wake Lock, GPS, Camera, Mic) via toast
- Wrap init chains in try-catch so one failure doesn't prevent others
- All promises need `.catch()`, even fire-and-forget
- Browser API init (Battery, Wake Lock) MUST have `.catch()` for graceful degradation
- Return result objects `{ success, error? }` instead of void/throw

## Performance & Animation

- Cache DOM queries used per-frame in arrays/Maps during init
- `requestAnimationFrame` over `setInterval` for display updates (pauses when hidden)
- Separate RAF IDs per animation type (e.g., `spinAnimationId` vs `snapBackAnimationId`)
- Check `if (animationId === null)` before scheduling to prevent duplicate loops
- Pause RAF on `visibilitychange` when `document.hidden`
- Clear pending debounce when calling the debounced function directly
- Battery-aware frame skipping: normal (every frame), low (every 2nd), critical (every 4th)
- CSS `.power-saver` class disables infinite animations on low battery
- Suspend idle AudioContext after 30s; resume before playing
- View-based code splitting via `rollupOptions.output.manualChunks` in `vite.config.ts`

## Testing

- Test real crypto, not mocks (test actual PBKDF2, not SHA-256 stubs)
- Test migration paths (old + new data formats)
- Test fail-closed patterns (verify access denied when deps down)
- Source code assertion tests when integration tests are impractical

## Version Management

**Always bump version in `package.json` after completing features or fixes.**

- **PATCH**: Bug fixes, small tweaks
- **MINOR**: New features, enhancements (add new codename in `src/version.ts`)
- **MAJOR**: Breaking changes

Each minor release gets a `"Dessert Animal"` codename in `src/version.ts`:
```typescript
'5.20': {
  name: 'Baklava Falcon',
  description: {
    en: '1-2 sentences, end-user wording.',
    de: 'German translation.'
  }
}
```

Patch bumps share the parent minor's codename. Files: `src/version.ts`, `index.html`, `src/app.ts`, `src/features/settingsView.ts`.

## Workflow

### Feature Completion Checklist

1. `npm test` + `npm run test:e2e`
2. `npm run typecheck`
3. Test in browser if UI-related
4. Update docs as needed

### Deployment

Complete all code changes and reviews BEFORE deployment. Do not interleave.

1. Finish code changes
2. Run Feature Completion Checklist
3. Commit
4. `vercel --prod`

### Code Review

When asked to review, first propose a structured plan:
1. Define scope and criteria
2. Define out-of-scope
3. Get user confirmation before starting

## Keyboard Shortcuts

**Timer (Radial Dial):** `0-9` bib digit | `S`/`F` timing point | `Alt+1`/`Alt+2` run | `Space`/`Enter` record | `Escape`/`Delete` clear | `Backspace` delete digit

**Gate Judge:** `M`/`G` MG | `T` STR | `B`/`R` BR | `1-9`/`0` gate | Arrows navigate | `Space`/`Enter` confirm

**Results:** `Arrow Up/Down` navigate | `Enter`/`Space`/`E` edit | `Delete`/`D` delete

**Global:** `Tab`/`Shift+Tab` between components | `Escape` close modal | Arrows within component
