# API Documentation

## Overview

Lawn Lapse provides programmatic access to its core functionality through exported functions. This allows integration into other Node.js applications and custom automation workflows.

## Installation

```javascript
// ESM import
import { runSetup, runCapture, runStatus } from "./lawn-lapse.js";
import { loadConfig, updateConfig, saveConfig } from "./config.js";

// CommonJS require (if configured)
const { runSetup, runCapture, runStatus } = require("./lawn-lapse.js");
```

## Core Functions

### `runSetup(skipCron?: boolean): Promise<void>`

Runs the interactive setup flow to configure Lawn Lapse.

#### Parameters

- `skipCron` (boolean, optional): If `true`, skips the cron job setup step. Default: `false`

#### Returns

- `Promise<void>`: Resolves when setup is complete

#### Throws

- `Error`: If setup fails or is cancelled by user

#### Example

```javascript
import { runSetup } from "./lawn-lapse.js";

try {
  await runSetup();
  console.log("Setup completed successfully");
} catch (error) {
  console.error("Setup failed:", error.message);
}
```

### `runCapture(): Promise<void>`

Executes the capture and time-lapse generation process.

#### Returns

- `Promise<void>`: Resolves when capture and video generation are complete

#### Throws

- `Error`: If capture process fails with exit code

#### Example

```javascript
import { runCapture } from "./lawn-lapse.js";

try {
  await runCapture();
  console.log("Capture completed");
} catch (error) {
  console.error("Capture failed:", error.message);
}
```

### `runStatus(): Promise<void>`

Displays system status and statistics.

#### Returns

- `Promise<void>`: Resolves when status display is complete

#### Throws

- `Error`: If status process fails

#### Example

```javascript
import { runStatus } from "./lawn-lapse.js";

await runStatus();
```

## Configuration Helpers

Configuration is managed through `config.js`, which provides utilities for reading and writing `lawn.config.json`.

### `loadConfig(): Promise<LawnConfig>`

Loads the structured configuration file, creating it with defaults or migrating from a legacy `.env.local` if necessary.

#### Example

```javascript
import { loadConfig } from "./config.js";

const config = await loadConfig();
console.log("Primary camera:", config.cameras[0]?.name);
console.log("Capture times:", config.schedule.fixedTimes);
```

#### `LawnConfig` Shape

```typescript
interface CameraConfig {
  id: string;
  name: string;
  snapshotDir: string;
  timelapseDir: string;
  video: {
    fps: number;
    quality: number;
    interpolate: boolean;
  };
}

interface LawnConfig {
  version: number;
  unifi: {
    host: string;
    username: string;
    password: string;
  };
  schedule: {
    timezone: string;
    fixedTimes: string[];
    interval: { shotsPerHour: number };
    window: { startHour: string; endHour: string };
  };
  cameras: CameraConfig[];
  videoDefaults: { fps: number; quality: number; interpolate: boolean };
  notifications: { frequency: string };
  history: { maxDays: number | null; stopAfterConsecutiveNoData: number };
}
```

### `saveConfig(config: LawnConfig): Promise<void>`

Persists a complete configuration object back to `lawn.config.json`.

```javascript
import { loadConfig, saveConfig } from "./config.js";

const config = await loadConfig();
config.schedule.fixedTimes = ["06:30"];
await saveConfig(config);
```

### `updateConfig(mutator: (draft: LawnConfig) => void): Promise<LawnConfig>`

Convenience helper that loads, clones, mutates, and saves configuration while returning the updated object.

```javascript
import { updateConfig } from "./config.js";

await updateConfig((draft) => {
  draft.videoDefaults.fps = 30;
  draft.videoDefaults.interpolate = false;
  if (draft.cameras[0]) {
    draft.cameras[0].video.fps = 30;
    draft.cameras[0].video.interpolate = false;
  }
});
```

## Classes

### `UniFiProtectClient`

Internal class for UniFi Protect API interaction.

#### Constructor

```javascript
const client = new UniFiProtectClient();
```

#### Methods

##### `connect(): Promise<boolean>`

Establishes connection to UniFi Protect controller.

##### `exportVideo(cameraId: string, startMs: number, durationMs?: number): Promise<Buffer>`

Exports video from camera for specified time range.

##### `extractFrameFromVideo(videoBuffer: Buffer, outputPath: string): Promise<void>`

Extracts single frame from video buffer.

## Helper Functions

### `fetchMissingSnapshots(): Promise<Object>`

Fetches any missing snapshots within the retention period.

#### Returns

```typescript
interface CaptureResult {
  capturedCount: number; // Number of new snapshots
  outputDir: string; // Output directory path
  captureHour: number; // Hour of capture time
  captureMinute: number; // Minute of capture time
}
```

### `generateTimelapse(outputDir: string, captureHour: number, captureMinute: number): Promise<void>`

Generates time-lapse video from collected snapshots.

#### Parameters

- `outputDir` (string): Directory containing snapshots
- `captureHour` (number): Hour of capture time (0-23)
- `captureMinute` (number): Minute of capture time (0-59)

### `getImageDimensions(imagePath: string): Promise<Object>`

Gets dimensions of an image file using ffprobe.

#### Returns

```typescript
interface Dimensions {
  width: number; // Width in pixels
  height: number; // Height in pixels
}
```

## Environment Variables

The following environment variables are used when set:

| Variable         | Description           | Default          |
| ---------------- | --------------------- | ---------------- |
| `UNIFI_HOST`     | UniFi Protect host/IP | Required         |
| `UNIFI_USERNAME` | Username              | `admin`          |
| `UNIFI_PASSWORD` | Password              | Required         |
| `CAMERA_ID`      | Camera ID             | Required         |
| `CAMERA_NAME`    | Camera display name   | `Unknown Camera` |
| `SNAPSHOT_TIME`  | Capture time (HH:MM)  | `12:00`          |
| `OUTPUT_DIR`     | Output directory      | `./snapshots`    |
| `VIDEO_FPS`      | Video frame rate      | `24`             |
| `VIDEO_QUALITY`  | Video quality (CRF)   | `1`              |

## Usage Examples

### Automated Capture with Custom Schedule

```javascript
import { runCapture } from "./lawn-lapse.js";
import { loadConfig, saveConfig } from "./config.js";
import cron from "node-cron";

// Update capture time
await saveConfig({ SNAPSHOT_TIME: "06:00" });

// Schedule capture every day at 6 AM
cron.schedule("0 6 * * *", async () => {
  try {
    await runCapture();
    console.log("Morning capture completed");
  } catch (error) {
    console.error("Capture failed:", error);
  }
});
```

### Conditional Capture Based on Weather

```javascript
import { runCapture } from "./lawn-lapse.js";
import { loadConfig } from "./config.js";
import fetch from "node-fetch";

async function captureIfSunny() {
  const config = await loadConfig();

  // Check weather API
  const weather = await fetch("https://api.weather.com/...");
  const data = await weather.json();

  if (data.conditions === "sunny") {
    await runCapture();
    console.log("Captured on sunny day");
  }
}
```

### Batch Processing Multiple Cameras

```javascript
import { saveConfig, runCapture } from "./lawn-lapse.js";

const cameras = [
  { id: "cam1", name: "Front Yard" },
  { id: "cam2", name: "Back Yard" },
  { id: "cam3", name: "Driveway" },
];

for (const camera of cameras) {
  // Configure for each camera
  await saveConfig({
    CAMERA_ID: camera.id,
    CAMERA_NAME: camera.name,
    OUTPUT_DIR: `./snapshots/${camera.name.toLowerCase().replace(" ", "-")}`,
  });

  // Capture for this camera
  await runCapture();
  console.log(`Completed capture for ${camera.name}`);
}
```

### Custom Status Reporter

```javascript
import { loadConfig } from "./config.js";
import fs from "fs/promises";
import path from "path";

async function getDetailedStatus() {
  const config = await loadConfig();
  const outputDir = config.OUTPUT_DIR || "./snapshots";

  // Count snapshots
  const files = await fs.readdir(outputDir);
  const snapshots = files.filter((f) => f.endsWith(".jpg"));

  // Get date range
  snapshots.sort();
  const firstDate = snapshots[0]?.split("_")[0];
  const lastDate = snapshots[snapshots.length - 1]?.split("_")[0];

  return {
    camera: config.CAMERA_NAME,
    totalSnapshots: snapshots.length,
    dateRange: `${firstDate} to ${lastDate}`,
    captureTime: config.SNAPSHOT_TIME,
    outputDirectory: outputDir,
  };
}

const status = await getDetailedStatus();
console.log(JSON.stringify(status, null, 2));
```

## Error Handling

All async functions should be wrapped in try-catch blocks:

```javascript
import { runSetup, runCapture } from "./lawn-lapse.js";

async function safeCapture() {
  try {
    // Check if setup needed
    const config = await loadConfig();
    if (!config.CAMERA_ID) {
      console.log("Running setup...");
      await runSetup();
    }

    // Run capture
    await runCapture();
  } catch (error) {
    if (error.message.includes("Authentication failed")) {
      console.error("Invalid credentials. Please run setup again.");
    } else if (error.message.includes("No cameras found")) {
      console.error("No cameras available on the system.");
    } else {
      console.error("Unexpected error:", error.message);
    }
    process.exit(1);
  }
}
```

## TypeScript Support

While the project is written in JavaScript, you can add TypeScript definitions:

```typescript
// lawn-lapse.d.ts
declare module "lawn-lapse" {
  export function runSetup(skipCron?: boolean): Promise<void>;
  export function runCapture(): Promise<void>;
  export function runStatus(): Promise<void>;
  export function loadConfig(): Promise<LawnConfig>;
  export function saveConfig(updates: Partial<Config>): Promise<void>;

  interface Config {
    UNIFI_HOST?: string;
    UNIFI_USERNAME?: string;
    UNIFI_PASSWORD?: string;
    CAMERA_ID?: string;
    CAMERA_NAME?: string;
    SNAPSHOT_TIME?: string;
    OUTPUT_DIR?: string;
    VIDEO_FPS?: string;
    VIDEO_QUALITY?: string;
  }
}
```

## Best Practices

1. **Always check configuration** before running capture
2. **Handle errors gracefully** - UniFi Protect may timeout
3. **Respect rate limits** - Avoid too frequent captures
4. **Monitor disk space** - Snapshots accumulate over time
5. **Secure credentials** - Never commit `.env.local` to version control

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on extending the API.
