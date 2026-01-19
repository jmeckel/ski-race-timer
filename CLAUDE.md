# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ski Race Timer is a GPS-synchronized race timing Progressive Web App (PWA) for ski races. It's a static single-page application designed for mobile use in outdoor race conditions.

## Commands

- **Start dev server**: `npm start` (runs `npx serve public`)
- **Build**: No build step required - this is a static site

## Architecture

### Single-File Application

All application code lives in `/public/index.html` with inline CSS and JavaScript. This design choice minimizes HTTP requests and simplifies offline caching.

### Key Components

The app has three tab-based views:
1. **Timer** - Real-time clock display (HH:MM:SS.mmm), bib number input, timing point selection (Start/Finish), number pad
2. **Results** - List of recorded times, CSV export, entry editing/deletion, statistics
3. **Settings** - GPS sync status, auto-increment bib toggle, haptic feedback, language toggle (EN/DE)

### Data Storage

- Uses browser LocalStorage with keys `skiTimerEntries` (race data) and `skiTimerLang` (language preference)
- Entry format: `{ id, bib, point: 'S'|'F', timestamp }`

### PWA Structure

```
.
├── api/
│   └── sync.js         # Vercel serverless function for cloud sync
├── public/
│   ├── index.html      # Main application (HTML + CSS + JS)
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service worker (cache-first strategy)
│   └── icons/          # App icons (72-512px PNG/SVG)
└── package.json        # Dependencies (@vercel/kv)
```

### Service Worker

`sw.js` implements cache-first with network fallback. Cache version: `ski-race-timer-v5`. Updates require incrementing the cache version.

### Multi-Device Sync

Cross-device sync uses Vercel KV (Redis) with polling:
- **API endpoint**: `/api/sync.js` handles GET (fetch entries) and POST (add entry)
- **Polling interval**: 2 seconds when sync is enabled
- **BroadcastChannel**: Used for same-browser tab sync
- **Race ID**: Unique identifier to group synced devices

## Key Implementation Details

- **Translations**: Hardcoded in JavaScript object within index.html, toggled via `toggleLanguage()`. Default language: German
- **GPS sync**: Uses Geolocation API for real GPS timestamps
- **Haptic feedback**: Uses Navigator.vibrate() API
- **Sound feedback**: Uses Web Audio API for beep sounds
- **Mobile optimization**: Safe area insets for notches, touch-optimized, no user scaling

## Vercel Setup

To enable cloud sync, add Vercel KV to your project:
1. In Vercel dashboard, go to Storage → Create Database → KV
2. Connect it to your project
3. The `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables are auto-configured

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL (auto-configured with Vercel KV) |
| `ADMIN_PIN` | Recommended | 4-digit PIN for admin API authentication (e.g., `1234`). If not set, admin API is unprotected. |
| `CORS_ORIGIN` | No | Allowed CORS origin (defaults to `*`) |

## Admin API

The admin API (`/api/admin/races`) requires authentication when `ADMIN_PIN` is configured:
- **GET** - List all races (requires PIN)
- **DELETE** - Delete a race (requires PIN)

Authentication flow:
1. User enters PIN in app settings
2. PIN is stored in sessionStorage (cleared on tab close)
3. API calls include `Authorization: Bearer <pin>` header
4. Server validates PIN using SHA-256 hash comparison
