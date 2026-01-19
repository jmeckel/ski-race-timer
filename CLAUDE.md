# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ski Race Timer is a GPS-synchronized race timing Progressive Web App (PWA) for ski races. It's a TypeScript single-page application designed for mobile use in outdoor race conditions.

## Commands

- **Start dev server**: `npm start` or `npm run dev`
- **Build**: `npm run build` (TypeScript compilation + Vite build)
- **Run tests**: `npm test` (unit tests) or `npm run test:e2e` (Playwright E2E tests)
- **Type check**: `npm run typecheck`

## Architecture

### Source Structure

```
.
├── api/                    # Vercel serverless functions
│   ├── auth/
│   │   └── token.js       # JWT token exchange endpoint
│   ├── admin/
│   │   ├── races.js       # Race management API
│   │   └── pin.js         # PIN management API
│   ├── lib/
│   │   └── jwt.js         # Shared JWT utilities
│   └── sync.js            # Cloud sync API
├── src/
│   ├── app.ts             # Main application logic
│   ├── store/             # State management (Zustand-like)
│   ├── services/          # GPS, sync, camera, feedback services
│   ├── components/        # UI components (Clock, VirtualList, Toast)
│   ├── utils/             # Validation, error handling utilities
│   ├── i18n/              # Translations (EN/DE)
│   └── types/             # TypeScript type definitions
├── public/
│   ├── icons/             # App icons (72-512px PNG)
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service worker (cache-first)
├── tests/
│   ├── api/               # API unit tests (Vitest)
│   ├── unit/              # Component/service unit tests
│   └── e2e/               # Playwright E2E tests
└── index.html             # Entry point
```

### Key Components

The app has three tab-based views:
1. **Timer** - Real-time clock display (HH:MM:SS.mmm), bib number input, timing point selection (Start/Finish), number pad
2. **Results** - List of recorded times, CSV export (Race Horology format), entry editing/deletion, photo thumbnails
3. **Settings** - GPS sync, cloud sync, auto-increment bib, haptic/sound feedback, language toggle (EN/DE), photo capture, race management

### Data Storage

- **LocalStorage keys**:
  - `skiTimerEntries` - Race timing entries
  - `skiTimerSettings` - User settings
  - `skiTimerAuthToken` - JWT authentication token
  - `skiTimerRaceId` - Current race ID
  - `skiTimerDeviceId` - Unique device identifier

- **Entry format**: `{ id, bib, point: 'S'|'F', timestamp, status, deviceId, deviceName, photo? }`

### Multi-Device Sync

Cross-device sync uses Redis (via ioredis) with polling:
- **API endpoint**: `/api/sync` handles GET (fetch), POST (add), DELETE (remove)
- **Polling interval**: 5 seconds (30 seconds on error)
- **BroadcastChannel**: Used for same-browser tab sync
- **Race ID**: Case-insensitive unique identifier to group synced devices

### Authentication

JWT-based authentication protects sync and admin APIs:

1. **Token Exchange**: User enters 4-digit PIN → `/api/auth/token` returns JWT
2. **Token Storage**: JWT stored in localStorage (`skiTimerAuthToken`)
3. **Token Usage**: API calls include `Authorization: Bearer <token>` header
4. **Token Expiry**: 24-hour expiry, auto-prompts re-authentication
5. **Backwards Compatible**: Legacy PIN hash still accepted for migration

### CSV Export Format (Race Horology)

Exports use semicolon delimiter and standard timing designators:
- **Columns**: Startnummer, Messpunkt, Zeit, Status, Gerät
- **Timing Points**: ST (Start), FT (Finish)
- **Time Format**: HH:MM:SS.ss (hundredths of seconds)
- **CSV Injection Protection**: Formula characters escaped with single quote prefix

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL (Vercel KV or external Redis) |
| `JWT_SECRET` | **Production** | Secret for signing JWT tokens. **Required in production** - will fail to start without it. |
| `CORS_ORIGIN` | No | Allowed CORS origin (defaults to production domain) |

## API Endpoints

### `/api/auth/token` (POST)
Exchange PIN for JWT token.
- **Body**: `{ pin: "1234" }`
- **Response**: `{ success: true, token: "jwt...", isNewPin?: true }`

### `/api/sync` (GET/POST/DELETE)
Cloud sync for race entries. Requires JWT token when PIN is set.
- **GET**: Fetch entries for race
- **POST**: Add/update entry
- **DELETE**: Remove entry

### `/api/admin/races` (GET/DELETE)
Race management. Requires JWT token.
- **GET**: List all races with metadata
- **DELETE**: Delete race and set tombstone for connected clients

## Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright)
npm run test:e2e

# E2E with browser visible
npm run test:e2e:headed

# All tests
npm run test:all
```

## Vercel Deployment

1. Connect repository to Vercel
2. Add Vercel KV (Storage → Create Database → KV)
3. Set `JWT_SECRET` environment variable in Vercel dashboard
4. Deploy - environment variables auto-configured

## Key Implementation Details

- **Translations**: In `src/i18n/translations.ts`, toggled via language setting. Default: German
- **GPS sync**: Uses Geolocation API for real GPS timestamps
- **Haptic feedback**: Uses Navigator.vibrate() API
- **Sound feedback**: Uses Web Audio API for beep sounds
- **Photo capture**: Optional photo on timestamp, synced if <500KB
- **Mobile optimization**: Safe area insets for notches, touch-optimized, portrait lock
- **Service Worker**: Cache version `ski-race-timer-v31`, updates require version increment
