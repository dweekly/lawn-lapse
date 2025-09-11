#!/bin/bash

# Get the full path to the project directory
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
SCRIPT_PATH="$PROJECT_DIR/capture-and-timelapse.js"
LOG_PATH="$PROJECT_DIR/logs/capture.log"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

echo "Setting up daily cron job for snapshot capture..."
echo "Project directory: $PROJECT_DIR"

# Check if the script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Script not found at $SCRIPT_PATH"
    exit 1
fi

# Check if node is available and get its full path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found in PATH"
    echo "Please ensure Node.js is installed and available"
    exit 1
fi
echo "Node.js path: $NODE_PATH"

# Create the cron job command
# Run daily at 2:00 PM (to ensure noon footage is available)
CRON_CMD="cd $PROJECT_DIR && $NODE_PATH $SCRIPT_PATH >> $LOG_PATH 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "capture-and-timelapse.js"; then
    echo "Existing cron job found. Removing old entry..."
    # Remove existing entry
    crontab -l 2>/dev/null | grep -v "capture-and-timelapse.js" | crontab -
fi

# Add the new cron job
# Run at 2:00 PM every day
echo "Adding cron job to run at 2:00 PM daily..."
(crontab -l 2>/dev/null; echo "0 14 * * * $CRON_CMD") | crontab -

echo "✓ Cron job successfully added!"
echo ""
echo "The script will run daily at 2:00 PM and will:"
echo "  1. Check for any missing snapshots from the last 39 days"
echo "  2. Fetch any missing snapshots from UniFi Protect"
echo "  3. Regenerate the time-lapse video if new snapshots were captured"
echo "  4. Log output to: $LOG_PATH"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -l | grep -v 'capture-and-timelapse.js' | crontab -"
echo ""
echo "To manually run the update: node $SCRIPT_PATH"