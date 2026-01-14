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
1. **Timer** - Real-time clock display (HH:MM:SS.mmm), bib number input, timing point selection (Start/Intermediate 1-3/Finish), number pad
2. **Results** - List of recorded times, CSV export, entry editing/deletion, statistics
3. **Settings** - GPS sync status, auto-increment bib toggle, haptic feedback, language toggle (EN/DE)

### Data Storage

- Uses browser LocalStorage with keys `skiTimerEntries` (race data) and `skiTimerLang` (language preference)
- Entry format: `{ id, bib, point: 'S'|'I1'|'I2'|'I3'|'F', timestamp }`

### PWA Structure

```
public/
├── index.html      # Main application (HTML + CSS + JS)
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (cache-first strategy)
└── icons/          # App icons (72-512px PNG/SVG)
```

### Service Worker

`sw.js` implements cache-first with network fallback. Cache version: `ski-race-timer-v1`. Updates require incrementing the cache version.

## Key Implementation Details

- **Translations**: Hardcoded in JavaScript object within index.html, toggled via `toggleLanguage()`
- **GPS sync**: Currently simulated (visual indicator only)
- **Haptic feedback**: Uses Navigator.vibrate() API
- **Mobile optimization**: Safe area insets for notches, touch-optimized, no user scaling
