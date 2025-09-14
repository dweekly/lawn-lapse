# 🌱 Lawn Lapse

[![npm version](https://badge.fury.io/js/lawn-lapse.svg)](https://www.npmjs.com/package/lawn-lapse)
[![CI](https://github.com/dweekly/lawn-lapse/actions/workflows/ci.yml/badge.svg)](https://github.com/dweekly/lawn-lapse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/lawn-lapse)](https://nodejs.org)

Automated time-lapse generator for UniFi Protect cameras. Captures daily snapshots at your chosen time and creates beautiful time-lapse videos showing changes over days, months, or years.

## 🎬 Demo

Watch your lawn, garden, construction project, or any outdoor space transform over time with automatically generated time-lapse videos.

## ✨ Features

- 📸 **Smart Setup** - Auto-detects configuration and guides through setup on first run
- 🔄 **Historical Backfill** - Fetches up to 39 days of historical footage from UniFi Protect
- 🎬 **Automatic Time-lapse** - Creates MP4 videos from collected snapshots with smart resolution detection
- 💾 **Permanent Archive** - Stores snapshots locally forever (beyond NVR retention limits)
- 🔐 **Simple Authentication** - Uses username/password for easy setup
- ⏰ **Cron Integration** - Runs automatically via cron jobs
- 📊 **Progress Tracking** - Shows detailed progress during snapshot fetching
- 🎯 **Smart Defaults** - Optimized settings out of the box (10fps, best quality)

## 📋 Prerequisites

- **Node.js 18+** (required for modern JavaScript features)
- **ffmpeg** installed (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux)
- **UniFi Protect** system with at least one camera
- Admin access to UniFi Protect

## 🚀 Quick Start

### Option 1: Run with npx (Recommended)

No installation needed! Just run:

```bash
npx lawn-lapse
```

This will:
1. Guide you through setup on first run
2. Fetch historical snapshots
3. Generate your first time-lapse video

### Option 2: Global Installation

```bash
# Install globally
npm install -g lawn-lapse

# Run the command
lawn
```

### Option 3: Clone Repository

```bash
# Clone the repository
git clone https://github.com/dweekly/lawn-lapse.git
cd lawn-lapse

# Install dependencies
npm install

# Run the CLI
npm exec lawn
```

## 🎯 Usage

### Main Command

```bash
lawn [command]
```

When run without arguments:
- **First run**: Automatically starts interactive setup
- **Subsequent runs**: Captures snapshots and updates time-lapse

### Commands

| Command | Description |
|---------|-------------|
| `lawn` | Run capture (auto-setup if first time) |
| `lawn status` | Show configuration and statistics |
| `lawn cron` | Set up or update automated daily captures |
| `lawn help` | Display help information |

### Verbose Mode

Add `-v` or `--verbose` flag for detailed output:

```bash
lawn -v  # Shows ffmpeg output and detailed logging
```

## 🔧 Configuration

### Interactive Setup

On first run, `lawn` will guide you through:

1. **UniFi Protect Connection**
   - Host/IP address (defaults to 192.168.1.1)
   - Username (defaults to admin)
   - Password

2. **Camera Selection**
   - Shows all available cameras with model info
   - Indicates offline cameras
   - Displays resolution capabilities

3. **Snapshot Settings**
   - Capture time (24-hour format, defaults to 12:00)
   - Output directory (defaults to ./snapshots)

4. **Automation Setup**
   - Optional cron job installation
   - Automatic daily captures at specified time

### Configuration File

Settings are stored in `.env.local`:

```env
# UniFi Protect Configuration
UNIFI_HOST=192.168.1.1
UNIFI_USERNAME=admin
UNIFI_PASSWORD=your-password
CAMERA_ID=abc123
CAMERA_NAME=Front Yard

# Snapshot Settings
SNAPSHOT_TIME=12:00
OUTPUT_DIR=/path/to/snapshots

# Video Settings (auto-configured)
VIDEO_FPS=10
VIDEO_QUALITY=1
```

> ⚠️ **Security Note**: Keep `.env.local` secure and never commit it to version control

## 📸 How It Works

### Snapshot Collection

1. **Daily Capture**: At your specified time, captures a frame from the camera
2. **Historical Backfill**: On first run, fetches up to 39 days of historical snapshots
3. **Smart Fetching**: Only downloads missing snapshots, skips existing ones
4. **Progress Display**: Shows `[n/total]` progress for each snapshot

### Time-lapse Generation

1. **Auto-detection**: Finds the highest resolution from your snapshots
2. **Smart Scaling**: Maintains aspect ratio while maximizing quality
3. **Optimized Encoding**: Uses H.264 with slow preset for best compression
4. **Configurable FPS**: Default 10fps for smooth playback

### File Organization

```
lawn-lapse/
├── snapshots/           # Daily snapshot images
│   ├── 2024-01-01_1200.jpg
│   ├── 2024-01-02_1200.jpg
│   └── ...
├── timelapse_12h00_2024-01-01_to_2024-03-15.mp4
└── lawn-lapse.log      # Cron job logs
```

## 🔍 Monitoring

### Check Status

```bash
lawn status
```

Shows:
- Total snapshots collected
- Date range of footage
- Gap detection in sequence
- Time-lapse videos generated
- Cron job status
- Last capture time

### Example Output

```
🎥 Lawn Lapse Status Report
============================================================

📸 Snapshots:
  Total: 45 noon snapshots
  Range: 2024-01-01 to 2024-02-14
  Days: 45 days of footage
  ✓ No gaps in sequence

🎬 Time-lapses:
  Found: 3 videos
  Latest:
    - timelapse_12h00_2024-01-01_to_2024-02-14.mp4 (8.3MB)

⏰ Cron Job:
  ✓ Active: Daily at 12:00
  Last run: 2024-02-14 12:00:00 (2 hours ago)

🔐 Authentication:
  ✓ Credentials configured
  Using username/password authentication
```

## 🛠 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| "No cameras found" | Ensure UniFi Protect is accessible and user has admin privileges |
| "Authentication failed" | Check username/password, ensure 2FA is disabled for API access |
| Timeout errors | Reduce video duration or check network connectivity |
| Missing snapshots | Verify camera was online and recording at capture time |
| Cron not running | Check cron service is enabled: `sudo launchctl load -w /System/Library/LaunchDaemons/com.vix.cron.plist` |

### Debug Mode

Run with verbose flag for detailed debugging:

```bash
lawn -v
```

### Manual Capture

Force an immediate capture regardless of schedule:

```bash
npm exec lawn
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/dweekly/lawn-lapse.git
cd lawn-lapse

# Install dependencies
npm install

# Run in development
node lawn-lapse.js -v

# Format code
npm run format

# Lint code
npm run lint
```

## 📝 API Documentation

### Main Functions

The project exports several key functions for programmatic use:

```javascript
import { runSetup, runCapture } from './lawn-lapse.js';

// Run interactive setup
await runSetup();

// Capture snapshots and generate time-lapse
await runCapture();
```

See [API.md](API.md) for detailed documentation.

## 🔒 Security

- Credentials are stored locally in `.env.local`
- Never commit `.env.local` to version control
- Uses UniFi Protect's official API library
- No external services or telemetry
- All data stays on your local machine

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built with [unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect) library
- Inspired by traditional time-lapse photography techniques
- Thanks to the UniFi Protect community

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/dweekly/lawn-lapse/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dweekly/lawn-lapse/discussions)

---

Made with ❤️ for the UniFi Protect community