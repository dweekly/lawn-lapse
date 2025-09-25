#!/bin/bash

# Setup cron job for lawn-lapse automated captures

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
NODE_PATH="$(which node)"
CAPTURE_SCRIPT="$PROJECT_DIR/capture-and-timelapse.js"
LOG_FILE="$PROJECT_DIR/logs/daily-update.log"

# Default time is 2:00 PM (14:00)
DEFAULT_HOUR=14
DEFAULT_MINUTE=0

echo "Setting up cron job for lawn-lapse..."

# Check if capture script exists
if [ ! -f "$CAPTURE_SCRIPT" ]; then
    echo "❌ Error: capture-and-timelapse.js not found at $CAPTURE_SCRIPT"
    exit 1
fi

# Check if Node.js is available
if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: Node.js not found in PATH"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Read existing crontab (if any)
EXISTING_CRON=$(crontab -l 2>/dev/null || echo "")

# Remove any existing lawn-lapse related entries
FILTERED_CRON=$(echo "$EXISTING_CRON" | grep -v "capture-and-timelapse.js" | grep -v "lawn-lapse" | grep -v "lawn.js" | grep -v "daily-noon-update.js")

# Ask user for preferred time (optional)
read -p "Enter capture time (HH:MM format, default 14:00): " USER_TIME

if [ -z "$USER_TIME" ]; then
    HOUR=$DEFAULT_HOUR
    MINUTE=$DEFAULT_MINUTE
else
    # Parse user input
    IFS=':' read -r HOUR MINUTE <<< "$USER_TIME"

    # Validate input
    if ! [[ "$HOUR" =~ ^[0-9]+$ ]] || ! [[ "$MINUTE" =~ ^[0-9]+$ ]] || [ "$HOUR" -lt 0 ] || [ "$HOUR" -gt 23 ] || [ "$MINUTE" -lt 0 ] || [ "$MINUTE" -gt 59 ]; then
        echo "❌ Invalid time format. Using default 14:00"
        HOUR=$DEFAULT_HOUR
        MINUTE=$DEFAULT_MINUTE
    fi
fi

# Create cron entry with PATH for homebrew
CRON_ENTRY="$MINUTE $HOUR * * * PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin $NODE_PATH $CAPTURE_SCRIPT >> $LOG_FILE 2>&1"

# Combine with existing crontab
if [ -n "$FILTERED_CRON" ]; then
    NEW_CRONTAB="$FILTERED_CRON
$CRON_ENTRY"
else
    NEW_CRONTAB="$CRON_ENTRY"
fi

# Install new crontab
echo "$NEW_CRONTAB" | crontab -

if [ $? -eq 0 ]; then
    echo "✅ Cron job installed successfully!"
    echo "   Captures will run daily at $(printf '%02d:%02d' $HOUR $MINUTE)"
    echo "   Logs will be saved to: $LOG_FILE"
    echo ""
    echo "To verify, run: crontab -l"
else
    echo "❌ Failed to install cron job"
    echo ""
    echo "You can manually add this to your crontab:"
    echo "$CRON_ENTRY"
    exit 1
fi