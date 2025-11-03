#!/usr/bin/env node

/**
 * @file capture-and-timelapse.js
 * @description Captures snapshots from UniFi Protect cameras and generates time-lapse videos
 * Handles historical backfill, daily captures, and video generation with smart resolution detection
 * @author David E. Weekly
 * @license MIT
 */

import { ProtectApi } from "unifi-protect";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import { loadConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedConfig;
async function getConfig() {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }
  return cachedConfig;
}

// Check for verbose flag for detailed output
const isVerbose =
  process.argv.includes("-v") || process.argv.includes("--verbose");

/**
 * UniFi Protect client wrapper
 * Handles authentication and video/snapshot retrieval
 * @class
 */
class UniFiProtectClient {
  /**
   * Creates a new UniFi Protect client instance
   * @constructor
   */
  constructor(config) {
    this.protect = new ProtectApi();
    this.host = config.unifi.host;
    this.username = config.unifi.username || "admin";
    this.password = config.unifi.password;
    this.isConnected = false;
  }

  /**
   * Connects to UniFi Protect controller
   * Caches connection to avoid repeated authentication
   * @async
   * @returns {Promise<boolean>} True if connection successful
   * @throws {Error} If login fails
   */
  async connect() {
    // Skip if already connected
    if (this.isConnected) return true;

    const success = await this.protect.login(
      this.host,
      this.username,
      this.password,
    );

    if (!success) {
      throw new Error("Failed to login to UniFi Protect");
    }

    this.isConnected = true;
    if (isVerbose) console.log("✓ Connected to UniFi Protect");
    return true;
  }

  /**
   * Exports video from UniFi Protect for a specific time range
   * Uses the video export API to get a small video clip
   * @async
   * @param {string} cameraId - Camera ID to export from
   * @param {number} startMs - Start timestamp in milliseconds
   * @param {number} [durationMs=1000] - Duration in milliseconds (default 1 second)
   * @returns {Promise<Buffer>} Video data as buffer
   * @throws {Error} If no video data received
   */
  async exportVideo(cameraId, startMs, durationMs = 1000) {
    await this.connect();

    const endMs = startMs + durationMs;
    // Build full URL - required for the library to work correctly
    const url = `https://${this.host}/proxy/protect/api/video/export?camera=${cameraId}&start=${startMs}&end=${endMs}`;

    const response = await this.protect.retrieve(url, {
      method: "GET",
      headers: {
        Accept: "video/mp4",
      },
    });

    if (!response || !response.body) {
      throw new Error("No video data received");
    }

    // Read the stream into a buffer
    const chunks = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Extracts a single frame from video buffer
   * Uses ffmpeg to extract the first frame as a JPEG
   * @async
   * @param {Buffer} videoBuffer - Video data buffer
   * @param {string} outputPath - Path to save the extracted frame
   * @returns {Promise<void>}
   * @throws {Error} If ffmpeg fails
   */
  async extractFrameFromVideo(videoBuffer, outputPath) {
    return new Promise((resolve, reject) => {
      const tempVideoPath = `${outputPath}.temp.mp4`;

      fs.writeFile(tempVideoPath, videoBuffer)
        .then(() => {
          const ffmpeg = spawn(
            "ffmpeg",
            [
              "-i",
              tempVideoPath,
              "-ss",
              "00:00:00", // Extract frame at start
              "-frames:v",
              "1", // Extract only 1 frame
              "-q:v",
              "2", // High quality JPEG
              "-y", // Overwrite output
              outputPath,
            ],
            {
              stdio: isVerbose ? "inherit" : "pipe", // Show output only in verbose mode
            },
          );

          ffmpeg.on("exit", (code) => {
            // Clean up temp file
            fs.unlink(tempVideoPath)
              .then(() => {
                if (code !== 0) {
                  reject(new Error(`ffmpeg exited with code ${code}`));
                } else {
                  resolve();
                }
              })
              .catch(reject);
          });

          ffmpeg.on("error", (err) => {
            // Attempt to clean up on error
            fs.unlink(tempVideoPath).catch(() => {});
            reject(err);
          });
        })
        .catch(reject);
    });
  }
}

/**
 * Fetches missing snapshots from UniFi Protect.
 * Checks for gaps in snapshot collection and backfills from video recordings.
 * @async
 * @param {Object} config - Loaded application configuration.
 * @param {Object} camera - The camera configuration to process.
 * @returns {Promise<Object>} Capture statistics.
 */
async function fetchMissingSnapshots(config, camera) {
  const now = new Date();

  console.log(`[${now.toISOString()}] Starting snapshot capture...`);

  if (!config.unifi.password) {
    console.error("Error: Missing UniFi Protect password in configuration.");
    console.error(
      "Please run 'lawn-lapse setup' to add credentials to lawn.config.json",
    );
    process.exit(1);
  }

  if (!camera || !camera.id) {
    console.error("Error: No camera configured. Run setup to select a camera.");
    process.exit(1);
  }

  const snapshotTime = config.schedule.fixedTimes?.[0] || "12:00";
  const [captureHour, captureMinute] = snapshotTime
    .split(":")
    .map((n) => parseInt(n, 10));

  const client = new UniFiProtectClient(config);
  const cameraName = camera.name || "Unknown Camera";
  const outputDir = camera.snapshotDir || path.join(__dirname, "snapshots");

  console.log(`Camera: ${cameraName} (${camera.id})`);
  const timezone =
    config.schedule.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  console.log(`Snapshot cadence: ${snapshotTime} ${timezone}`);

  await fs.mkdir(outputDir, { recursive: true });

  const historyConfig = config.history || {};
  const maxDays = Number.isFinite(historyConfig.maxDays)
    ? historyConfig.maxDays
    : null;
  const HARD_LIMIT_DAYS = 365;
  const maxNoData = historyConfig.stopAfterConsecutiveNoData ?? 7;

  let capturedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let consecutiveNoData = 0;
  let consecutiveNotFound = 0;
  let consecutiveFailures = 0;
  let attemptCount = 0;

  const files = await fs.readdir(outputDir).catch(() => []);
  const timeSuffix = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;
  const existingSnapshots = new Set(
    files.filter((f) => f.endsWith(`_${timeSuffix}.jpg`)),
  );

  console.log(
    maxDays
      ? `Checking for missing ${captureHour}:${String(captureMinute).padStart(2, "0")} snapshots (up to ${maxDays} days back)...`
      : `Checking historical snapshots until no recordings remain (max 365 days)...`,
  );

  const newSnapshots = [];

  for (let dayOffset = 0; ; dayOffset++) {
    if (maxDays !== null && dayOffset >= maxDays) {
      break;
    }

    if (dayOffset >= HARD_LIMIT_DAYS) {
      console.log(
        `\nReached 365-day backfill limit. Stopping historical retrieval.`,
      );
      break;
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - dayOffset);
    targetDate.setHours(captureHour, captureMinute, 0, 0);

    if (targetDate.getTime() > now.getTime()) {
      continue;
    }

    const dateStr = targetDate.toISOString().split("T")[0];
    const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;
    const filename = `${dateStr}_${timeStr}.jpg`;
    const outputPath = path.join(outputDir, filename);

    if (existingSnapshots.has(filename)) {
      skippedCount++;
      continue;
    }

    attemptCount++;
    const prefix = `  [${attemptCount}] ${dateStr}: `;

    try {
      if (!client.isConnected) {
        console.log(
          `${prefix}Connecting to ${config.unifi.host || "UniFi Protect"}...`,
        );
      }

      const videoBuffer = await client.exportVideo(
        camera.id,
        targetDate.getTime(),
        1000,
      );
      await client.extractFrameFromVideo(videoBuffer, outputPath);
      console.log(`${prefix}✓`);
      capturedCount++;
      newSnapshots.push(outputPath);
      consecutiveNoData = 0;
      consecutiveNotFound = 0;
      consecutiveFailures = 0;
    } catch (error) {
      const message = error?.message || String(error);
      console.log(`${prefix}✗ (${message})`);
      failedCount++;

      const normalizedMessage = message.toLowerCase();
      const fatalConnectionError =
        /failed to login|eperm|econnrefused|unauthorized|forbidden|invalid credentials|network unreachable/.test(
          normalizedMessage,
        );
      const looksLikeNoData =
        /404|no data|no recording|no video data|not found|taking too long|throttling api calls|timed out/.test(
          normalizedMessage,
        );
      const looksLikeNotFound = /404|not found/.test(normalizedMessage);

      if (fatalConnectionError) {
        throw new Error(
          `Unable to continue snapshot backfill: ${message}. Aborting.`,
        );
      }

      consecutiveFailures += 1;
      if (looksLikeNoData) {
        consecutiveNoData += 1;
      } else {
        consecutiveNoData = 0;
      }

      if (looksLikeNotFound) {
        consecutiveNotFound += 1;
        if (consecutiveNotFound >= 3) {
          console.log(
            "\nEncountered three consecutive 404/not found responses. Stopping backfill.",
          );
          break;
        }
      } else {
        consecutiveNotFound = 0;
      }

      const hitConfiguredNoDataLimit =
        typeof maxNoData === "number" && consecutiveNoData >= maxNoData;
      const hitThreeNoDataFailures = consecutiveFailures >= 3;

      if (hitConfiguredNoDataLimit || hitThreeNoDataFailures) {
        const reason = hitConfiguredNoDataLimit
          ? `Stopping backfill after ${consecutiveNoData} consecutive days without recordings.`
          : "Stopping backfill after three consecutive data fetch failures.";
        console.log(`\n${reason}`);
        break;
      }
    }
  }

  if (capturedCount === 0 && skippedCount > 0 && failedCount === 0) {
    console.log("✓ All snapshots up to date!");
  }

  console.log(`\nSummary:`);
  console.log(`  Captured: ${capturedCount}`);
  console.log(`  Already had: ${skippedCount}`);
  console.log(`  Failed: ${failedCount}`);

  return { capturedCount, outputDir, captureHour, captureMinute };
}

/**
 * Generates time-lapse video from collected snapshots
 * Automatically detects optimal resolution and creates MP4 video
 * @async
 * @param {Object} camera - Camera configuration containing snapshot directory.
 * @param {Object} config - Full configuration for defaults.
 * @param {number} captureHour - Hour of capture time
 * @param {number} captureMinute - Minute of capture time
 * @returns {Promise<void>}
 */
async function generateTimelapse(camera, config, captureHour, captureMinute) {
  const snapshotDir = camera.snapshotDir || path.join(__dirname, "snapshots");
  const timelapseDir =
    camera.timelapseDir || path.join(path.dirname(snapshotDir), "timelapses");

  await fs.mkdir(timelapseDir, { recursive: true });

  const files = await fs.readdir(snapshotDir);
  const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;

  // Filter for snapshots at the specified time
  const snapshots = files
    .filter((f) => f.endsWith(".jpg") && f.includes(`_${timeStr}.jpg`))
    .sort();

  if (snapshots.length === 0) {
    console.log("\nNo snapshots found for time-lapse generation");
    return;
  }

  console.log(`\nRegenerating time-lapse...`);
  console.log(`Found ${snapshots.length} snapshots`);

  // Extract date range for filename
  const firstDate = snapshots[0].split("_")[0];
  const lastDate = snapshots[snapshots.length - 1].split("_")[0];

  // Determine the resolution from the largest image
  // This ensures we use the highest quality available
  let maxWidth = 0;
  let maxHeight = 0;

  for (const snapshot of snapshots) {
    const imagePath = path.join(snapshotDir, snapshot);
    try {
      const dimensions = await getImageDimensions(imagePath);
      if (dimensions.width > maxWidth) {
        maxWidth = dimensions.width;
        maxHeight = dimensions.height;
      }
    } catch (error) {
      if (isVerbose)
        console.error(
          `Error getting dimensions for ${snapshot}:`,
          error.message,
        );
    }
  }

  // Default to HD if we couldn't detect dimensions
  if (maxWidth === 0) {
    maxWidth = 1920;
    maxHeight = 1080;
  }

  // Build output filename with time and date range
  const hourStr =
    String(captureHour).padStart(2, "0") +
    "h" +
    String(captureMinute).padStart(2, "0");
  const outputPath = path.join(
    timelapseDir,
    `timelapse_${hourStr}_${firstDate}_to_${lastDate}.mp4`,
  );

  const fps = camera.video?.fps ?? config.videoDefaults?.fps ?? 10;
  const crf = camera.video?.quality ?? config.videoDefaults?.quality ?? 1;

  // Create file list for ffconcat demuxer with explicit frame durations
  const fileListPath = path.join(snapshotDir, "filelist.txt");
  const safeFps = fps > 0 ? fps : 1;
  const frameDuration = 1 / safeFps;
  const lines = ["ffconcat version 1.0"];

  snapshots.forEach((file, index) => {
    lines.push(`file '${file}'`);
    if (index !== snapshots.length - 1) {
      lines.push(`duration ${frameDuration.toFixed(6)}`);
    }
  });

  await fs.writeFile(fileListPath, `${lines.join("\n")}\n`);

  return new Promise((resolve, reject) => {
    // Build ffmpeg arguments for video generation
    const ffmpegArgs = [
      "-f",
      "concat", // Use concat demuxer for file list
      "-safe",
      "0", // Allow absolute paths
      "-i",
      fileListPath,
      "-c:v",
      "libx264", // H.264 codec
      "-preset",
      "slow", // Slow preset for better compression
      "-crf",
      String(crf), // Quality setting
      "-vf",
      // Scale and pad to maintain aspect ratio
      `scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2`,
      "-r",
      String(safeFps), // Output frame rate
      "-pix_fmt",
      "yuv420p", // Pixel format for compatibility
      "-y", // Overwrite output
      outputPath,
    ];

    // Add quiet flags unless verbose
    if (!isVerbose) {
      ffmpegArgs.unshift("-loglevel", "error", "-stats");
    }

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: isVerbose ? "inherit" : ["pipe", "pipe", "inherit"],
    });

    ffmpeg.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
      } else {
        // Get file size for summary
        const stats = await fs.stat(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

        console.log(`✓ Time-lapse created: ${outputPath} (${sizeMB}MB)`);
        console.log(
          `  ${snapshots.length} days from ${firstDate} to ${lastDate}`,
        );
        console.log(`  Resolution: ${maxWidth}x${maxHeight} @ ${safeFps}fps`);

        // Clean up temporary file list
        await fs.unlink(fileListPath);
        resolve();
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * Gets image dimensions using ffprobe
 * Used to determine optimal video resolution
 * @async
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Object>} Object with width and height properties
 * @returns {number} returns.width - Image width in pixels
 * @returns {number} returns.height - Image height in pixels
 * @throws {Error} If ffprobe fails
 */
async function getImageDimensions(imagePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(
      "ffprobe",
      [
        "-v",
        "error", // Suppress all output except errors
        "-select_streams",
        "v:0", // Select first video stream
        "-show_entries",
        "stream=width,height", // Get width and height
        "-of",
        "csv=s=x:p=0", // Output as WIDTHxHEIGHT
        imagePath,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
      } else {
        const [width, height] = output.trim().split("x").map(Number);
        resolve({ width, height });
      }
    });

    ffprobe.on("error", reject);
  });
}

/**
 * Main execution function
 * Orchestrates snapshot fetching and time-lapse generation for all cameras
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  const startTime = new Date();
  console.log(
    `\n[${startTime.toISOString()}] Starting capture for all cameras...`,
  );

  const config = await getConfig();
  const cameras = config.cameras || [];

  if (cameras.length === 0) {
    console.error(
      "No cameras configured. Run 'lawn-lapse' to select at least one camera.",
    );
    process.exit(1);
  }

  console.log(`\n📷 Processing ${cameras.length} camera(s)...\n`);

  const results = [];

  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i];
    const cameraNum = i + 1;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `📹 Camera ${cameraNum}/${cameras.length}: ${camera.name} (${camera.id})`,
    );
    console.log(`${"=".repeat(60)}`);

    try {
      const { captureHour, captureMinute } = await fetchMissingSnapshots(
        config,
        camera,
      );

      await generateTimelapse(camera, config, captureHour, captureMinute);

      results.push({
        camera: camera.name,
        success: true,
        error: null,
      });

      console.log(`✅ ${camera.name} completed successfully`);
    } catch (error) {
      results.push({
        camera: camera.name,
        success: false,
        error: error.message,
      });

      console.error(`❌ ${camera.name} failed: ${error.message}`);
      if (isVerbose) {
        console.error(error.stack);
      }

      // Continue with next camera instead of exiting
      console.log(`\nContinuing with remaining cameras...`);
    }
  }

  // Print summary
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Capture Summary`);
  console.log(`${"=".repeat(60)}`);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/${cameras.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${cameras.length}`);
    console.log("\nFailed cameras:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.camera}: ${r.error}`);
      });
  }

  console.log(`\n⏱️  Duration: ${duration} seconds`);
  console.log(`[${endTime.toISOString()}] All cameras processed!`);

  // Exit with error code if any camera failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Only run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
