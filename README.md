# UniFi Protect Lawn Lapse

Automated time-lapse generator for UniFi Protect cameras. Captures daily snapshots at your chosen time and creates beautiful time-lapse videos showing changes over days, months, or years.

## Features

- 📸 **Automated Daily Capture** - Captures snapshots at your specified time every day
- 🔄 **Historical Backfill** - Fetches up to 39 days of historical footage from UniFi Protect
- 🎬 **Automatic Time-lapse Generation** - Creates MP4 videos from collected snapshots
- 💾 **Permanent Archive** - Stores snapshots locally forever (beyond NVR retention limits)
- 🔐 **Cookie-based Authentication** - Works with UniFi Protect's web interface
- ⏰ **Cron Integration** - Runs automatically on macOS via cron jobs
- 📊 **Status Monitoring** - Check system health and snapshot collection progress

## Prerequisites

- **macOS** with Terminal access (primary target, may work on Linux)
- **Node.js 14+** installed
- **ffmpeg** installed (`brew install ffmpeg` on macOS)
- **UniFi Protect** system with camera access
- Browser access to UniFi Protect for cookie extraction

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/dweekly/lawn-lapse.git
cd lawn-lapse

# Install dependencies
npm install
```

### 2. Interactive Setup

Run the setup wizard to configure everything automatically:

```bash
node setup.js
```

The setup wizard will:
- Ask for your UniFi Protect host/IP address
- Guide you through cookie extraction from your browser
- Test the connection and list available cameras
- Let you select which camera to use
- Configure your preferred capture time (default: noon)
- Optionally install a cron job for automatic daily captures

### 3. Getting Authentication Cookies

During setup, you'll need to extract cookies from your browser:

1. Open UniFi Protect in your web browser
2. Log in to your account
3. Open Developer Tools:
   - Chrome/Edge: Press `F12` or `Cmd+Option+I`
   - Safari: Enable Developer menu in Preferences, then `Cmd+Option+I`
4. Navigate to **Application** tab → **Storage** → **Cookies**
5. Find and copy these two cookie values:
   - `TOKEN` - A long JWT token starting with "eyJ..."
   - `UBIC_AUTH` - An encoded authentication string
6. Paste these values when prompted during setup

### 4. Verify Installation

After setup, test that everything works:

```bash
# Check system status
node status.js

# Run a manual capture and generate timelapse
node capture-and-timelapse.js
```

## Usage

### Daily Operations

Once configured, the system runs automatically via cron. The default schedule captures snapshots 15 minutes after your specified time to ensure footage is available.

### Manual Commands

```bash
# Capture snapshots and generate timelapse
node capture-and-timelapse.js

# Check system status
node status.js

# Update expired cookies (every ~30 days)
node update-cookies.js

# The capture script automatically handles both:
# - Backfilling up to 39 days of historical snapshots
# - Generating the timelapse video
```

### Monitoring

View the automated capture logs:

```bash
# Watch logs in real-time
tail -f logs/capture.log

# Check for recent captures
grep "$(date +%Y-%m-%d)" logs/capture.log

# Look for errors
grep "Error\|Failed" logs/capture.log
```

## Cookie Management

UniFi Protect cookies expire after approximately 30 days. When they expire:

1. Get new cookies from your browser (same process as initial setup)
2. Update them using:
   ```bash
   node update-cookies.js
   ```
3. Follow the prompts to enter new TOKEN and UBIC_AUTH values
4. The script will validate the new cookies automatically

## Time-lapse Generation

Time-lapses are automatically generated every time the capture script runs. The script will:
1. Check for missing snapshots from the last 39 days
2. Fetch any missing snapshots at your configured time
3. Generate a new timelapse video with all available snapshots

For custom frame rates, edit the ffmpeg parameters in `capture-and-timelapse.js`.

### Default Settings
- **Frame Rate**: 30 fps (about 1.3 seconds of video per 40 days)
- **Resolution**: Original camera resolution (e.g., 3840x2160 for 4K)
- **Codec**: H.264 for maximum compatibility
- **Output**: `timelapse_noon_YYYY-MM-DD_to_YYYY-MM-DD.mp4`

## Storage Considerations

The system never deletes snapshots, building a permanent archive:

- **Per snapshot**: ~2-10MB depending on camera resolution
- **Daily growth**: ~2-10MB
- **Yearly estimate**: ~2-4GB
- **5-year estimate**: ~10-20GB
- **10-year estimate**: ~20-40GB

Plan your storage accordingly for long-term projects.

## Project Structure

```
lawn-lapse/
├── capture-and-timelapse.js  # Main script (captures & creates video)
├── setup.js                  # Interactive setup wizard
├── update-cookies.js         # Cookie refresh utility
├── status.js                 # System status checker
├── setup-daily-cron.sh       # Cron installation script
├── snapshots/                # Captured images (gitignored)
├── logs/                     # Capture logs (gitignored)
└── .env.local                # Configuration (created by setup)
```

## Troubleshooting

### Cookies Expired
```bash
node update-cookies.js
```

### Cron Job Not Running
```bash
# Check if installed
crontab -l | grep capture-and-timelapse

# Reinstall
./setup-daily-cron.sh
```

### Missing Snapshots
```bash
# Check for specific date
ls snapshots/*2025-08-15*

# Manually fetch missing days and regenerate video
node capture-and-timelapse.js
```

### Connection Issues
```bash
# Test by running the capture script
node capture-and-timelapse.js

# Check status
node status.js
```

## Advanced Configuration

### Multiple Cameras

To capture from multiple cameras, create separate configurations:

1. Run setup for first camera: `node setup.js`
2. Copy configuration: `cp .env.local .env.camera2`
3. Edit `.env.camera2` with different camera ID
4. Create separate cron entries for each camera

### Custom Capture Times

Edit `.env.local` and modify:
```
CAPTURE_HOUR=12
CAPTURE_MINUTE=0
```

Then update your cron job to run 15 minutes after the capture time.

### Different Frame Rates

For slower/faster time-lapses, adjust the framerate when generating:
```bash
# 10 fps - slower playback
ffmpeg -framerate 10 -pattern_type glob -i 'snapshots/*.jpg' -c:v libx264 output.mp4

# 60 fps - faster playback  
ffmpeg -framerate 60 -pattern_type glob -i 'snapshots/*.jpg' -c:v libx264 output.mp4
```

## Security Notes

- **Never commit credentials** - All authentication data is stored in `.env.local` (gitignored)
- **Cookies are temporary** - They expire after ~30 days, limiting exposure
- **Local network only** - Designed for LAN access to UniFi Protect
- **Read-only access** - Only fetches video, doesn't modify camera settings

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test your changes thoroughly
4. Ensure no credentials are included
5. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

Built for the UniFi Protect community. Special thanks to Ubiquiti for creating an excellent camera system.

---

*Capture memories, one frame at a time.* 📸