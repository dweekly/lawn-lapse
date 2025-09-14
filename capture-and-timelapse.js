#!/usr/bin/env node

/**
 * UniFi Protect Lawn Lapse - Using unifi-protect library
 * This version uses username/password instead of cookies
 */

import { ProtectApi } from "unifi-protect";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress dotenv messages
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";
const originalLog = console.log;
console.log = (...args) => {
  if (args[0]?.includes?.("[dotenv")) return;
  originalLog(...args);
};
dotenv.config({ path: path.join(__dirname, ".env.local"), silent: true });
console.log = originalLog;

// Check for verbose flag
const isVerbose =
  process.argv.includes("-v") || process.argv.includes("--verbose");

class UniFiProtectClient {
  constructor() {
    this.protect = new ProtectApi();
    this.host = process.env.UNIFI_HOST;
    this.username = process.env.UNIFI_USERNAME || "admin";
    this.password = process.env.UNIFI_PASSWORD;
    this.isConnected = false;
  }

  async connect() {
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

  async exportVideo(cameraId, startMs, durationMs = 1000) {
    await this.connect();

    const endMs = startMs + durationMs;
    // IMPORTANT: Use full URL with host for the library to work
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
              "00:00:00",
              "-frames:v",
              "1",
              "-q:v",
              "2",
              "-y",
              outputPath,
            ],
            {
              stdio: isVerbose ? "inherit" : "pipe",
            },
          );

          ffmpeg.on("exit", (code) => {
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
            fs.unlink(tempVideoPath).catch(() => {});
            reject(err);
          });
        })
        .catch(reject);
    });
  }
}

async function fetchMissingSnapshots() {
  const now = new Date();

  console.log(`[${now.toISOString()}] Starting snapshot capture...`);

  // Check for required credentials
  if (!process.env.UNIFI_PASSWORD) {
    console.error("Error: Missing UNIFI_PASSWORD in .env.local");
    console.error("Please add your UniFi Protect password to .env.local");
    process.exit(1);
  }

  // Get capture time configuration
  const snapshotTime = process.env.SNAPSHOT_TIME || "12:00";
  const [captureHour, captureMinute] = snapshotTime
    .split(":")
    .map((n) => parseInt(n));

  const client = new UniFiProtectClient();
  const cameraId = process.env.CAMERA_ID;
  const cameraName = process.env.CAMERA_NAME || "Unknown Camera";
  const outputDir = process.env.OUTPUT_DIR || "./snapshots";

  // Display camera info
  console.log(`Camera: ${cameraName} (${cameraId})`);
  console.log(`Snapshot time: ${snapshotTime}`);

  await fs.mkdir(outputDir, { recursive: true });

  // Check for missing snapshots in the last 39 days (max retention)
  const maxDays = 39;
  let capturedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const missingDates = [];

  console.log(
    `Checking for missing ${captureHour}:${String(captureMinute).padStart(2, "0")} snapshots (last ${maxDays} days)...`,
  );

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - dayOffset);
    targetDate.setHours(captureHour, captureMinute, 0, 0);

    // Skip future dates (including today if capture time hasn't occurred yet)
    if (targetDate.getTime() > now.getTime()) {
      continue;
    }

    const dateStr = targetDate.toISOString().split("T")[0];
    const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;
    const filename = `${dateStr}_${timeStr}.jpg`;
    const outputPath = path.join(outputDir, filename);

    // Check if file already exists
    try {
      await fs.access(outputPath);
      skippedCount++;
    } catch {
      // File doesn't exist - add to missing list
      missingDates.push({ date: targetDate, dateStr, filename, outputPath });
    }
  }

  if (missingDates.length === 0) {
    console.log("✓ All snapshots up to date!");
  } else {
    console.log(
      `Found ${missingDates.length} missing snapshots. Fetching...\n`,
    );

    // Show initial connection message
    let showedConnection = false;

    for (let i = 0; i < missingDates.length; i++) {
      const missing = missingDates[i];
      const progress = `[${i + 1}/${missingDates.length}]`;
      process.stdout.write(`  ${progress} ${missing.dateStr}: `);

      try {
        // Show connection message only once
        if (!showedConnection && !client.isConnected) {
          process.stdout.write(`Connecting to ${process.env.UNIFI_HOST}... `);
          showedConnection = true;
        }

        const videoBuffer = await client.exportVideo(
          cameraId,
          missing.date.getTime(),
          1000,
        );
        await client.extractFrameFromVideo(videoBuffer, missing.outputPath);
        console.log("✓");
        capturedCount++;
      } catch (error) {
        if (error.message.includes("API error:")) {
          console.log(error.message);
        } else {
          console.log(`✗ (${error.message})`);
        }
        failedCount++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Captured: ${capturedCount}`);
  console.log(`  Already had: ${skippedCount}`);
  console.log(`  Failed: ${failedCount}`);

  return { capturedCount, outputDir, captureHour, captureMinute };
}

async function generateTimelapse(outputDir, captureHour, captureMinute) {
  const files = await fs.readdir(outputDir);
  const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;
  const snapshots = files
    .filter((f) => f.endsWith(".jpg") && f.includes(`_${timeStr}.jpg`))
    .sort();

  if (snapshots.length === 0) {
    console.log("\nNo snapshots found for time-lapse generation");
    return;
  }

  console.log(`\nRegenerating time-lapse...`);
  console.log(`Found ${snapshots.length} snapshots`);

  // Create file list for ffmpeg concat
  const fileListPath = path.join(outputDir, "filelist.txt");
  const fileListContent = snapshots.map((f) => `file '${f}'`).join("\n");
  await fs.writeFile(fileListPath, fileListContent);

  // Get first and last dates
  const firstDate = snapshots[0].split("_")[0];
  const lastDate = snapshots[snapshots.length - 1].split("_")[0];

  // Determine the resolution from the largest image
  let maxWidth = 0;
  let maxHeight = 0;

  for (const snapshot of snapshots) {
    const imagePath = path.join(outputDir, snapshot);
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

  // Default to HD if we couldn't get dimensions
  if (maxWidth === 0) {
    maxWidth = 1920;
    maxHeight = 1080;
  }

  const hourStr =
    String(captureHour).padStart(2, "0") +
    "h" +
    String(captureMinute).padStart(2, "0");
  const outputPath = `timelapse_${hourStr}_${firstDate}_to_${lastDate}.mp4`;

  // Get FPS and quality from environment
  const fps = process.env.VIDEO_FPS || "10";
  const crf = process.env.VIDEO_QUALITY || "1";

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      fileListPath,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      crf,
      "-vf",
      `scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2`,
      "-r",
      fps,
      "-pix_fmt",
      "yuv420p",
      "-y",
      outputPath,
    ];

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
        // Get file size
        const stats = await fs.stat(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

        console.log(`✓ Time-lapse created: ${outputPath} (${sizeMB}MB)`);
        console.log(
          `  ${snapshots.length} days from ${firstDate} to ${lastDate}`,
        );
        console.log(`  Resolution: ${maxWidth}x${maxHeight} @ ${fps}fps`);

        // Clean up file list
        await fs.unlink(fileListPath);
        resolve();
      }
    });

    ffmpeg.on("error", reject);
  });
}

async function getImageDimensions(imagePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
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

async function main() {
  try {
    const { capturedCount, outputDir, captureHour, captureMinute } =
      await fetchMissingSnapshots();

    // Only generate time-lapse if we have snapshots
    if (capturedCount > 0 || outputDir) {
      await generateTimelapse(outputDir, captureHour, captureMinute);
    }

    console.log(`\n[${new Date().toISOString()}] Daily update complete!`);
  } catch (error) {
    console.error("Error:", error.message);
    if (isVerbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
