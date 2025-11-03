# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lawn Lapse** is an automated time-lapse generator for UniFi Protect cameras. It captures daily snapshots at configured times and creates time-lapse videos showing changes over days, months, or years. The project uses Node.js ES modules and integrates with UniFi Protect's API to fetch historical footage and create permanent snapshot archives beyond NVR retention limits.

## Key Commands

### Development & Testing

```bash
# Run the main CLI (interactive setup on first run)
node lawn-lapse.js

# Run capture and timelapse generation directly
node capture-and-timelapse.js

# Run with verbose output (shows ffmpeg details)
node lawn-lapse.js -v
node capture-and-timelapse.js -v

# Run tests
npm test

# Format code with Prettier
npm run format

# Lint code with ESLint
npm run lint

# Run capture script (via npm)
npm run capture

# Backfill specific days of historical data
npm run backfill -- 7   # Backfill last 7 days
npm run backfill -- 45  # Backfill last 45 days
```

### CLI Commands

```bash
# Main commands (when installed as package)
lawn                  # Run capture (auto-setup if first time)
lawn status           # Show configuration and statistics
lawn cron             # Set up or update automated daily captures
lawn help             # Display help information
```

## Architecture

### Core Modules

**lawn-lapse.js** - Main CLI entry point

- Command routing (status, cron, help, capture)
- Interactive setup flow with @inquirer/prompts
- Configuration management integration
- Spawns capture-and-timelapse.js as child process for actual work

**capture-and-timelapse.js** - Core capture and video generation engine

- UniFiProtectClient class: Handles authentication, video export, frame extraction
- Fetches missing snapshots by walking backward through UniFi recordings
- Smart backfill: Stops after N consecutive days of no data (configurable)
- Generates time-lapse videos using ffmpeg with auto-detected resolution
- Progress tracking with `[n/total]` display

**config.js** - Configuration management system

- Supports version 2 JSON schema (lawn.config.json)
- Automatic migration from legacy .env.local format
- Default value application with deep merge
- Camera-specific video settings with fallback to videoDefaults
- Configuration directory can be customized via LAWN_LAPSE_CONFIG_DIR env var

**scheduling.js** - Advanced scheduling system

- Three scheduling modes:
  - `fixed-time`: Specific times each day (e.g., 12:00, 18:00)
  - `interval`: Regular intervals within time window (e.g., every 15 mins, 6am-6pm)
  - `sunrise-sunset`: Based on sun position with optional interval captures
- `generateDailySlots()`: Creates capture times for a given day
- `isCaptureDue()`: Checks if capture should happen now (5-minute window)
- `getSlotsForDateRange()`: Generates all slots for date range
- Uses SunCalc library for sunrise/sunset calculations

**geolocation.js** - Location detection for sunrise/sunset mode

- Auto-detects location via IP geolocation API (ip-api.com)
- Provides manual coordinate input fallback
- Formats location display for user confirmation

### Configuration Schema

**lawn.config.json** (version 2):

```json
{
  "version": 2,
  "schedule": {
    "timezone": "America/Los_Angeles",
    "mode": "fixed-time", // or "interval" or "sunrise-sunset"
    "fixedTimes": ["12:00"],
    "interval": { "shotsPerHour": 1 },
    "window": { "startHour": "06:00", "endHour": "18:00" },
    "captureSunrise": true,
    "captureSunset": true,
    "sunriseOffset": 0,
    "sunsetOffset": 0
  },
  "location": { "lat": 37.7749, "lon": -122.4194, "name": "San Francisco" },
  "unifi": {
    "host": "192.168.1.1",
    "username": "admin",
    "password": "secret"
  },
  "cameras": [
    {
      "id": "abc123",
      "name": "Front Yard",
      "snapshotDir": "./snapshots/front-yard",
      "timelapseDir": "./timelapses/front-yard",
      "video": { "fps": 10, "quality": 1 }
    },
    {
      "id": "def456",
      "name": "Back Yard",
      "snapshotDir": "./snapshots/back-yard",
      "timelapseDir": "./timelapses/back-yard",
      "video": { "fps": 10, "quality": 1 }
    }
  ],
  "videoDefaults": { "fps": 10, "quality": 1 },
  "history": {
    "maxDays": null, // null = unlimited (up to 365 days)
    "stopAfterConsecutiveNoData": 7
  }
}
```

### File Organization

```
lawn-lapse/
├── lawn-lapse.js              # CLI entry point
├── capture-and-timelapse.js   # Core capture engine
├── config.js                  # Config management
├── scheduling.js              # Schedule generation
├── geolocation.js             # Location detection
├── lawn.config.json           # User configuration (git-ignored)
├── snapshots/                 # Per-camera snapshot directories
│   ├── front-yard/            # Slugified camera name subdirs
│   │   └── YYYY-MM-DD_HHMM.jpg
│   └── back-yard/
│       └── YYYY-MM-DD_HHMM.jpg
├── timelapses/                # Per-camera timelapse directories
│   ├── front-yard/
│   │   └── timelapse_HHhMM_DATE_to_DATE.mp4
│   └── back-yard/
│       └── timelapse_HHhMM_DATE_to_DATE.mp4
├── logs/                      # Cron job logs (lawn-lapse.log)
├── scripts/                   # Setup scripts (cron, hooks)
└── tests/                     # Test files
```

## Key Implementation Details

### Multi-Camera Support

**Setup Flow (lawn-lapse.js:runSetup)**:

- Prompts for first camera selection
- Offers "Add another camera?" after each selection
- Auto-generates camera slugs from names (e.g., "Front Yard" → "front-yard")
- Creates per-camera directories: `snapshots/<slug>/` and `timelapses/<slug>/`
- Preserves existing camera configs when re-running setup

**Capture Pipeline (capture-and-timelapse.js:main)**:

- Iterates all cameras sequentially (not parallel to avoid resource contention)
- Per-camera try-catch: if one fails, continues with remaining cameras
- Tracks results array with success/failure per camera
- Prints summary at end showing successful vs failed cameras
- Exit code 1 if ANY camera failed (allows CI/monitoring to detect issues)

**Status Command (lawn-lapse.js:runStatus)**:

- Shows per-camera section with snapshot/timelapse stats
- Aggregates total counts across all cameras in summary
- Displays per-camera directories for easy navigation

### Snapshot Capture Process

1. **Historical Backfill**: On first run or when gaps detected, walks backward day by day
2. **Smart Stopping**: Stops after 7 consecutive days with no recordings (configurable)
3. **Duplicate Prevention**: Checks existing files before fetching
4. **Video Export**: Fetches 1-second video clip from UniFi, extracts first frame with ffmpeg
5. **Filename Format**: `YYYY-MM-DD_HHMM.jpg` (e.g., `2024-01-15_1200.jpg`)
6. **Per-Camera Isolation**: Each camera's snapshots stored in separate directory

### Time-lapse Generation

1. **Resolution Detection**: Scans first snapshot to determine video dimensions
2. **Smart Scaling**: Maintains aspect ratio while maximizing quality
3. **ffmpeg Settings**: H.264 codec, slow preset, configurable FPS (default 10)
4. **Filename Format**: `timelapse_HHhMM_YYYY-MM-DD_to_YYYY-MM-DD.mp4`

### Cron Job Setup

- Fixed-time mode: Runs at specific time(s) daily
- Interval/sunrise-sunset: Runs every 15 minutes, checks if capture due
- PATH includes common binary locations for ffmpeg: `/opt/homebrew/bin:/usr/local/bin`
- Logs to `<snapshotDir>/lawn-lapse.log`
- Removes old lawn-lapse/daily-noon-update.js entries automatically

### Authentication

- Uses username/password (stored in lawn.config.json)
- Connection caching to avoid repeated authentication
- UniFi Protect API via unifi-protect library (v4.27.2+)

## Development Notes

- **ES Modules**: All files use `import`/`export`, not `require()`
- **Node Version**: Requires Node.js 18+ (specified in package.json engines)
- **External Dependencies**: ffmpeg must be installed on system (not npm package)
- **Testing**: Basic smoke tests with `node --test` and syntax checks with `node --check`
- **Error Handling**: Stops after 10 consecutive failures to prevent infinite loops
- **Verbose Mode**: Add `-v` or `--verbose` flag to see detailed ffmpeg output and debug logs

## Common Workflows

### Adding New Schedule Mode

1. Add mode validation in `scheduling.js:validateSchedule()`
2. Implement slot generation in `generateDailySlots()` switch statement
3. Update setup flow in `lawn-lapse.js:runSetup()` to collect required config
4. Update config schema defaults in `config.js:createDefaultConfig()`

### Modifying Video Settings

- Video encoding happens in `capture-and-timelapse.js:generateTimelapse()`
- Resolution detection in `detectResolution()` reads first snapshot
- ffmpeg args array can be modified for different codecs/quality

### Configuration Changes

- Always use `updateConfig()` from config.js (handles defaults + save)
- Config structure defined in `createDefaultConfig()`
- Legacy .env.local auto-migrates on first load

## Security Considerations

- **lawn.config.json contains credentials** - Never commit to git (in .gitignore)
- Credentials stored in plain text - users should secure file permissions
- No external telemetry or cloud services - all data stays local
- Uses official UniFi Protect API library with secure HTTPS connections
