# Ski Race Timer

A GPS-synchronized Progressive Web App (PWA) for precise ski race timing. Designed for mobile use in outdoor race conditions with multi-device synchronization, gate judge fault recording, and chief judge penalty management.

## Features

- **Radial Dial Timer** - iPod-style click wheel for fast bib entry with tap, spin, and momentum physics
- **Multi-Device Sync** - Real-time synchronization across start, finish, and gate judge devices
- **Gate Judge Mode** - Gate-first quick entry for recording gate faults with 2-tap minimum flow
- **Chief Judge Mode** - Fault review, penalty decisions, deletion approvals, and results finalization
- **GPS Time Sync** - Optional GPS-based time synchronization for cross-device accuracy
- **Two-Run Support** - L1/L2 selection for slalom and giant slalom races
- **Role-Based Access** - Timer, Gate Judge, and Chief Judge roles with JWT authentication
- **Offline-First** - Full functionality without internet, syncs when connected
- **Battery Power Saver** - Automatic animation reduction on low battery to extend outdoor timing sessions
- **Ambient Mode** - Screen dimming after inactivity with two-tap wake to prevent accidental recordings
- **Voice Mode** - Hands-free voice commands for timing operations
- **Photo Capture** - Optional documentation photos with each timestamp
- **Race Horology Export** - Industry-standard CSV format with fault penalty columns
- **Multilingual** - English, German, and French interfaces

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Local Development

```bash
# Clone the repository
git clone https://github.com/jmeckel/ski-race-timer.git
cd ski-race-timer

# Install dependencies
npm install

# Start dev server
npm start
```

The app will be available at `http://localhost:3000`

### Environment Variables

Create a `.env.local` file (never commit this to git):

```env
REDIS_URL=redis://user:password@host:port
JWT_SECRET=your-secret-key
```

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL (Vercel KV or external Redis) |
| `JWT_SECRET` | **Production** | Secret for signing JWT tokens. Required in production. |
| `CORS_ORIGIN` | No | Allowed CORS origin (defaults to production domain) |

## Architecture

### Tech Stack

- **Frontend**: TypeScript, Vite, CSS (no framework)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Redis (via ioredis) for cloud sync
- **Auth**: JWT tokens with PBKDF2 PIN hashing
- **Testing**: Vitest (unit/API), Playwright (E2E)
- **PWA**: VitePWA with content-based service worker versioning

### Project Structure

```
ski-race-timer/
├── api/                    # Vercel serverless functions
│   ├── v1/                 # Versioned API endpoints
│   │   ├── auth/token.js   # JWT token exchange
│   │   ├── admin/          # Race and PIN management
│   │   ├── sync.js         # Cloud sync
│   │   ├── faults.js       # Fault entries (role-protected)
│   │   └── voice.js        # Voice command proxy
│   └── lib/                # Shared API utilities
├── src/
│   ├── main.ts             # App entry point
│   ├── app.ts              # Main application logic
│   ├── onboarding.ts       # First-run wizard
│   ├── store/              # State management (Preact Signals)
│   ├── services/           # GPS, sync, camera, battery, feedback
│   ├── components/         # Clock, RadialDial, VirtualList, Toast
│   ├── features/           # View modules and feature logic
│   ├── utils/              # Validation, formatting, error handling
│   ├── i18n/               # EN/DE/FR translations
│   ├── styles/             # CSS stylesheets
│   └── types/              # TypeScript type definitions
├── tests/
│   ├── unit/               # Component and utility tests (Vitest)
│   ├── api/                # API endpoint tests (Vitest)
│   └── e2e/                # Playwright E2E tests
├── docs/                   # User manuals and quick start guides
├── index.html              # Entry point
└── public/                 # PWA manifest, icons, service worker
```

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Start Timer │────▶│  Redis DB   │◀────│ Finish Timer │
│   (S point)  │     │  (Cloud)    │     │  (F point)   │
└─────────────┘     └─────────────┘     └──────────────┘
                          │
                    ┌─────┴─────┐
                    │           │
              ┌─────▼────┐ ┌───▼──────────┐
              │Gate Judge │ │ Chief Judge   │
              │(Faults)   │ │(Review/Approve)│
              └──────────┘ └──────────────┘
```

### Views

The app has three tab-based views plus role-specific modes:

1. **Timer** - Radial dial interface for bib input, real-time clock, timing point (S/F) and run (L1/L2) selection
2. **Results** - Recorded times with filtering, search, editing, CSV export, and chief judge panel
3. **Settings** - Device role, cloud sync, GPS, feedback toggles, language, race management

**Role-specific:**
- **Gate Judge** - Gate-first fault entry with 5-column gate grid, fault type selection, ready status
- **Chief Judge** - Fault summary by bib, deletion approval workflow, penalty mode (FLT/DSQ)

## Authentication

JWT-based authentication protects sync and admin APIs:

1. **PIN Setup** - User sets a 4-digit PIN (hashed with PBKDF2 + random salt)
2. **Token Exchange** - PIN verified at `/api/v1/auth/token`, returns JWT with role claim
3. **Role-Based Access** - JWT includes `timer`, `gateJudge`, or `chiefJudge` role
4. **Token Expiry** - 24-hour expiry with automatic re-authentication prompt

| Role | Permissions |
|------|-------------|
| `timer` | Read/write entries and faults |
| `gateJudge` | Read/write entries and faults |
| `chiefJudge` | All above + delete faults |

## API Endpoints

All endpoints use the `/api/v1/` prefix.

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/v1/auth/token` | POST | Exchange PIN for JWT token | No |
| `/api/v1/sync` | GET/POST/DELETE | Cloud sync for race entries | JWT |
| `/api/v1/faults` | GET/POST/DELETE | Fault entries (DELETE requires chiefJudge) | JWT |
| `/api/v1/admin/races` | GET/DELETE | Race management | JWT |
| `/api/v1/admin/pin` | GET/POST | PIN hash management | JWT |
| `/api/v1/admin/reset-pin` | POST | Reset PIN (server auth) | Server PIN |

## Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright)
npm run test:e2e

# E2E with browser visible
npm run test:e2e:headed

# Type checking
npm run typecheck

# All tests
npm run test:all
```

See [TESTING.md](TESTING.md) for the full testing guide.

## Deployment

### Vercel

1. Connect repository to Vercel
2. Add Vercel KV (Storage > Create Database > KV)
3. Set `JWT_SECRET` environment variable in Vercel dashboard
4. Deploy - environment variables auto-configured

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

## Security

- **PBKDF2 PIN hashing** with random salt (100,000 iterations)
- **JWT authentication** with 24-hour expiry and role claims
- **Timing-safe comparison** for PIN verification
- **XSS prevention** via `escapeHtml()` and `escapeAttr()` for all dynamic content
- **CSP compliance** - no inline scripts (works without `unsafe-inline`)
- **CSV injection protection** - formula characters escaped in exports
- **Fail-closed auth** - API endpoints deny access when backing services are unavailable
- **Security headers** - `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

## Performance

- **requestAnimationFrame clock** - Smooth display with battery-aware frame skipping
- **Battery power saver** - 4-tier adaptive power management (normal/medium/low/critical)
- **Dirty-slice persistence** - Only changed data slices are serialized to localStorage
- **AudioContext suspension** - Idle audio contexts suspended after 30 seconds
- **Virtual list** - Efficient rendering for large result sets
- **Adaptive sync polling** - 5s normal, 30s on error/offline
- **Cache-first service worker** - Instant loading from SW cache

## Documentation

- [User Manual (EN)](docs/USER_MANUAL.md)
- [User Manual (DE)](docs/USER_MANUAL_DE.md)
- [Quick Start (EN)](docs/QUICK_START.md)
- [Quick Start (DE)](docs/QUICK_START_DE.md)
- [Testing Guide](TESTING.md)

## License

This project is private. All rights reserved.

---

**Version:** 5.24.7
**Last Updated:** February 2026
