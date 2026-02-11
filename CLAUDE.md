# [CLAUDE.md](http://CLAUDE.md)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ski Race Timer is a GPS-synchronized race timing Progressive Web App (PWA) for ski races. It's a TypeScript single-page application designed for mobile use in outdoor race conditions.

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
│   ├── store/              # State management (Zustand-like)
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

### Key Components

The app has three tab-based views:

1. **Timer** - Radial dial (iPod-style) for bib input, clock display, timing point (S/Z), run (L1/L2)
2. **Results** - Virtual-scrolled list with run indicator, CSV export, entry editing/deletion, photo thumbnails
3. **Settings** - GPS sync, cloud sync, auto-increment, feedback, language (EN/DE), photo, race management

Plus role-specific views:

- **Gate Judge** - Gate-first quick fault entry with 5-column gate grid
- **Chief Judge** - Fault summaries, deletion approvals

### Radial Dial Timer

Located in `src/components/RadialDial.ts`, `src/features/radialTimerView.ts`, `src/styles/radial-dial.css`.

**Key technical details:**

- Numbers at `radius = containerSize * 0.38`, dial center at 52%
- Tap detection uses angle-based calculation (not `elementFromPoint`) for reliability after rotation
- Center exclusion zone (`dist < rect.width * 0.27`) prevents drag when tapping S/Z or L1/L2
- Synthetic mouse events after touch ignored for 500ms
- Landscape mode uses CSS Grid with `display: contents` for two-column layout

### Gate Judge - Gate-First Quick Entry

Located in `src/features/faults/faultInlineEntry.ts`, `src/features/gateJudgeView.ts`.

**Design principle**: Gates are the primary UI element. Flow: tap gate -&gt; select fault type -&gt; bib auto-fills -&gt; save (2-tap minimum). Primary action buttons positioned at bottom for thumb-reachability (gloves, one-handed operation).

### Data Storage

- **LocalStorage keys**: `skiTimerEntries`, `skiTimerSettings`, `skiTimerAuthToken`, `skiTimerRaceId`, `skiTimerDeviceId`, `skiTimerRecentRaces`
- **Entry format**: `{ id, bib, point: 'S'|'F', run: 1|2, timestamp, status, deviceId, deviceName, photo? }`
- **Status values**: `ok`, `dns`, `dnf`, `dsq`, `flt` (fault penalty for U8/U10)

### Multi-Device Sync

Redis (ioredis) with polling (5s normal, 30s on error). BroadcastChannel for same-browser tab sync.

### Authentication & RBAC

JWT-based: PIN exchange -&gt; token -&gt; `Authorization: Bearer` header. 24h expiry.

| Role | Permissions |
| --- | --- |
| `timer` | Read/write entries and faults |
| `gateJudge` | Read/write entries and faults |
| `chiefJudge` | All above + delete faults (server-side enforced) |

### CSV Export (Race Horology Format)

Semicolon delimiter. Columns: Startnummer, Lauf, Messpunkt, Zeit, Status, Gerät, \[Torstrafzeit, Torfehler,\] Datum. ALL fields must be wrapped in `escapeCSVField()` including generated fields like dates.

## API Endpoints

All use `/api/v1/` prefix. Legacy `/api/*` paths rewritten for backwards compatibility.

- `/api/v1/auth/token` (POST) - Exchange PIN for JWT with optional role
- `/api/v1/sync` (GET/POST/DELETE) - Cloud sync for race entries
- `/api/v1/faults` (GET/POST/DELETE) - Fault entries (DELETE requires `chiefJudge`)
- `/api/v1/admin/races` (GET/DELETE) - Race management
- `/api/v1/admin/pin` (GET/POST) - PIN hash management
- `/api/v1/admin/reset-pin` (POST) - Server-side PIN reset

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_URL` | Yes | Redis connection URL |
| `JWT_SECRET` | Production | JWT signing secret |
| `CORS_ORIGIN` | No | Allowed CORS origin |

## Key Patterns

### ListenerManager (Standard Pattern)

All modules use `ListenerManager` from `src/utils/listenerManager.ts` for event listener tracking and cleanup. This replaces raw `addEventListener`/`removeEventListener` pairs.

```typescript
import { ListenerManager } from '../utils/listenerManager';

const listeners = new ListenerManager();
listeners.add(element, 'click', handler);
listeners.add(window, 'resize', handler);

// Cleanup (in destroy/cleanup function):
listeners.removeAll();
```

Used across 16+ files. For `once` listeners or promise-scoped handlers, raw `addEventListener` with `{ once: true }` is acceptable.

### CustomEvent Communication

Modules communicate via typed CustomEvents (registry in `src/types/events.ts`):

```typescript
element.dispatchEvent(new CustomEvent('fault-edit-request', { bubbles: true, detail: { fault } }));
```

### HTML Templates

Reusable template functions in `src/utils/templates.ts` with built-in XSS escaping. Always use `escapeHtml()` for content and `escapeAttr()` for attributes.

### Toast with Undo

When showing undo toasts for destructive actions, call `clearToasts()` first to prevent LIFO stack mismatch when multiple deletions happen quickly:

```typescript
clearToasts(); // Dismiss previous undo toast
showToast(t('entryDeleted', lang), 'success', 5000, { action: undoAction });
```

## CSS Architecture

### Design Tokens

All tokens defined in `:root` in `src/styles/main.css`:

- **Timing colors**: `--start-color` (orange #f97316), `--finish-color` (green #10b981) - always match rgba backgrounds to these
- **Surfaces**: `--background`, `--surface`, `--surface-elevated`
- **Borders**: `--border` (rgba(255, 255, 255, 0.1))
- **Spacing**: `--space-xs` (4px) through `--space-2xl` (32px)
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Button heights**: `--btn-height-sm` (36px), `--btn-height-md` (44px), `--btn-height-lg` (56px)
- **Radii**: `--radius` (12px), `--radius-sm` (8px)

### Layer Organization

```css
@layer base, components;
```

CSS variables live OUTSIDE layers (in `:root`). Base styles and component styles in their respective layers.

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

### XSS Prevention

- **Always** use `escapeHtml()` for innerHTML content, `escapeAttr()` for HTML attributes
- Includes ALL dynamic data: bib numbers, device names, gate numbers, race IDs
- Prefer `textContent` over `innerHTML` when not rendering markup
- `escapeHtml()` does NOT escape quotes — use `escapeAttr()` for attributes

### API Security

- Fail closed on errors: deny access when backing services fail
- Fail closed on missing deps: if Redis unavailable, return 503 (never skip auth)
- PBKDF2 for PIN hashing (100k+ iterations, random salt), timing-safe comparison
- Secrets in request body, not headers (headers are logged by proxies)
- Security headers in `vercel.json`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

## Memory Management

### Event Listeners

Use `ListenerManager` for all listener registration (see Key Patterns above).

### Component Cleanup

Components must clean up in `destroy()`:

- `listeners.removeAll()` for all event listeners
- `this.unsubscribe?.()` for store subscriptions
- `clearTimeout(id)` for all tracked timeouts
- Remove dynamic `<style>` elements from `document.head`

### Safety Guards

- **Double-destruction guard**: `if (this.isDestroyed) return;` at start of `destroy()`
- **MutationObserver**: Watch for DOM removal when components might be removed without `destroy()`
- **Cleanup on error paths**: If registering listeners before async ops, clean up in catch block

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

## Animation Patterns

- Separate RAF IDs per animation type (e.g., `spinAnimationId` vs `snapBackAnimationId`)
- Check `if (animationId === null)` before scheduling to prevent duplicate loops
- Use `requestAnimationFrame` over `setInterval` for display updates (pauses when hidden)
- Battery-aware frame skipping via battery service subscription
- Pause RAF on `visibilitychange` when `document.hidden`
- Clear pending debounce when calling the debounced function directly

## Performance & Power

- Cache DOM queries used per-frame in arrays/Maps during init
- Dirty-slice persistence: only serialize changed state slices to localStorage
- Suspend idle AudioContext after 30s; resume before playing
- CSS `.power-saver` class disables infinite animations on low battery

## Version Management

**Always bump version in** `package.json` **after completing features or fixes.**

- **PATCH**: Bug fixes, small tweaks
- **MINOR**: New features, enhancements (add new codename in `src/version.ts`)
- **MAJOR**: Breaking changes

### Version Codenames

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

## Testing

- Test real crypto, not mocks (test actual PBKDF2, not SHA-256 stubs)
- Test migration paths (old + new data formats)
- Test fail-closed patterns (verify access denied when deps down)
- Source code assertion tests when integration tests are impractical

## Feature Completion Checklist

1. `npm test` + `npm run test:e2e`
2. `npm run typecheck`
3. Test in browser if UI-related
4. Update docs as needed

## Deployment

Complete all code changes and reviews BEFORE deployment. Do not interleave.

1. Finish code changes
2. Run Feature Completion Checklist
3. Commit
4. `vercel --prod`

## Code Review

When asked to review, first propose a structured plan:

1. Define scope and criteria
2. Define out-of-scope
3. Get user confirmation before starting

## Keyboard Shortcuts

### Timer (Radial Dial)

`0-9` bib digit | `S`/`F` timing point | `Alt+1`/`Alt+2` run | `Space`/`Enter` record | `Escape`/`Delete` clear | `Backspace` delete digit

### Gate Judge

`M`/`G` MG | `T` STR | `B`/`R` BR | `1-9`/`0` gate | Arrows navigate | `Space`/`Enter` confirm

### Results

`Arrow Up/Down` navigate | `Enter`/`Space`/`E` edit | `Delete`/`D` delete

### Global

`Tab`/`Shift+Tab` between components | `Escape` close modal | Arrows within component