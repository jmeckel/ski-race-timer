# Ski Race Timer

A GPS-synchronized Progressive Web App (PWA) for precise ski race timing. Designed for mobile use in outdoor race conditions with multi-device synchronization support.

## Features

- **Millisecond Precision Timing** - High-accuracy timestamps for race entries
- **Multi-Device Sync** - Real-time synchronization across multiple timing devices
- **Offline-First** - Full functionality without internet connection
- **PWA Support** - Install as native app on iOS and Android
- **GPS Time Sync** - Optional GPS-based time synchronization
- **Multiple Timing Points** - Start (S), Intermediate (I1-I3), Finish (F)
- **Data Export** - CSV and JSON export with averaged times
- **Backup/Restore** - Full data backup and restore capability
- **Bilingual** - English and German language support

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Vercel account (for deployment)
- Redis database (for cloud sync)

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/ski-race-timer.git
cd ski-race-timer

# Install dependencies
npm install

# Start local server
npm start
```

The app will be available at `http://localhost:3000`

### Environment Variables

Create a `.env.local` file (never commit this to git):

```env
REDIS_URL=redis://user:password@host:port
```

### Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## Architecture

### Project Structure

```
ski-race-timer/
├── public/
│   ├── index.html      # Main application (single-file PWA)
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service worker (cache-first strategy)
│   └── icons/          # App icons (72-512px)
├── api/
│   └── sync.js         # Vercel serverless function for cloud sync
├── package.json
└── README.md
```

### Single-File Architecture

The application uses a monolithic single-file design (`index.html`) to:
- Minimize HTTP requests for faster loading
- Simplify service worker caching
- Enable full offline functionality
- Reduce complexity for field deployment

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Device A  │────▶│  Redis DB   │◀────│   Device B  │
│  (Timer 1)  │     │  (Cloud)    │     │  (Timer 2)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       └──────────── BroadcastChannel ─────────┘
                    (Same-browser tabs)
```

### Sync Mechanisms

1. **BroadcastChannel API** - Same-browser tab synchronization
2. **Cloud Polling** - Cross-device sync via Redis (configurable interval)
3. **LocalStorage** - Persistent local storage with automatic sync

## API Reference

### GET /api/sync

Fetch entries for a race.

**Parameters:**
- `raceId` (required) - Unique race identifier

**Response:**
```json
{
  "entries": [
    {
      "id": 1704067200000,
      "bib": "42",
      "point": "S",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "status": "ok",
      "deviceId": "abc123",
      "deviceName": "Timer 1"
    }
  ],
  "lastUpdated": 1704067200000
}
```

### POST /api/sync

Add a new entry.

**Parameters:**
- `raceId` (required) - Query parameter

**Body:**
```json
{
  "entry": {
    "id": 1704067200000,
    "bib": "42",
    "point": "S",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "status": "ok"
  },
  "deviceId": "abc123",
  "deviceName": "Timer 1"
}
```

## Configuration

### Timing Points

| Code | Description |
|------|-------------|
| S | Start |
| I1 | Intermediate 1 |
| I2 | Intermediate 2 |
| I3 | Intermediate 3 |
| F | Finish |

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-increment Bib | Automatically increment bib number after each entry | On |
| Haptic Feedback | Vibration on button press | On |
| Sound Feedback | Audio confirmation beep | Off |
| GPS Sync | Enable GPS-based time sync | Off |
| Cloud Sync | Enable multi-device synchronization | Off |

### Service Worker

Cache version is managed in `sw.js`. Increment `CACHE_NAME` version to force cache refresh:

```javascript
const CACHE_NAME = 'ski-race-timer-v13';
```

## Data Storage

### LocalStorage Keys

| Key | Description |
|-----|-------------|
| `skiTimerEntries` | Race timing entries (JSON array) |
| `skiTimerSettings` | User preferences |
| `skiTimerLang` | Language preference (en/de) |
| `skiTimerDeviceId` | Unique device identifier |
| `skiTimerDeviceName` | Device display name |
| `skiTimerRaceId` | Current race identifier |

### Entry Format

```javascript
{
  id: Number,           // Timestamp-based unique ID
  bib: String,          // Racer bib number
  point: String,        // Timing point (S/I1/I2/I3/F)
  timestamp: String,    // ISO 8601 timestamp
  status: String,       // Entry status (ok/dns/dnf/dsq)
  deviceId: String,     // Source device ID
  deviceName: String    // Source device name
}
```

## Security Considerations

### Current Implementation

- **CORS**: Configured for specific origins (production)
- **Input Validation**: All API inputs validated
- **XSS Prevention**: User inputs sanitized before DOM insertion
- **No Authentication**: Race data is accessible by race ID only

### Recommendations for Production

1. **Add Authentication** - Implement JWT or session-based auth for race access
2. **Encrypt LocalStorage** - Sensitive timing data should be encrypted
3. **Rate Limiting** - Implement request throttling (via Vercel middleware)
4. **Audit Logging** - Track data modifications for dispute resolution

## Performance

### Optimizations

- **Clock Update**: 100ms interval (10 FPS) for smooth display
- **Adaptive Polling**: 5s normal, 30s on error/offline
- **Cache-First SW**: Instant loading from service worker cache
- **Minimal Dependencies**: Only `ioredis` for Redis connection

### Benchmarks

| Metric | Target | Current |
|--------|--------|---------|
| First Paint | <1s | ~500ms |
| Time to Interactive | <2s | ~1s |
| Offline Capability | Full | Full |
| Sync Latency | <5s | 2-5s |

## Known Limitations

1. **ID Collision** - Rare possibility of ID collision on simultaneous entries (mitigated by deviceId)
2. **Conflict Resolution** - Last-write-wins strategy (no CRDT implementation)
3. **Data Retention** - Cloud entries expire after 24 hours
4. **Browser Support** - Requires modern browser with ES6+ support
5. **GPS Accuracy** - Depends on device GPS hardware quality

## Troubleshooting

### Clock Not Updating

1. Hard refresh: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
2. Clear site data in browser settings
3. Unregister service worker in DevTools > Application > Service Workers

### Sync Not Working

1. Verify Race ID is set in Settings
2. Check network connectivity
3. Verify Redis connection in Vercel dashboard
4. Check browser console for error messages

### Cache Issues

Increment service worker cache version in `sw.js`:
```javascript
const CACHE_NAME = 'ski-race-timer-v14'; // Increment version
```

## Future Improvements

### Planned Features

- [ ] Real GPS time synchronization (NTP/GPS receiver)
- [ ] Race management dashboard
- [ ] Historical race data analysis
- [ ] Team/club management
- [ ] Live results streaming

### Technical Debt

- [ ] Split monolithic HTML into components
- [ ] Add unit and integration tests
- [ ] Implement CRDT for conflict-free sync
- [ ] Add proper offline sync queue
- [ ] Implement WebSocket for real-time sync

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use consistent indentation (2 spaces)
- Comment complex logic
- Follow existing patterns in codebase
- Test on mobile devices before submitting

## License

This project is private. All rights reserved.

## Acknowledgments

- Built with vanilla JavaScript for maximum compatibility
- Icons designed for visibility in bright outdoor conditions
- Inspired by professional ski race timing systems

---

**Version:** 1.0.0
**Last Updated:** January 2025
**Maintainer:** Ski Race Timer Team
