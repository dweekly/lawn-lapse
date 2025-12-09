#!/usr/bin/env node

/**
 * Generate timelapse videos from existing snapshots
 * Skips UniFi Protect connection - only processes existing snapshot files
 */

import { loadConfig } from "./config.js";
import { spawn } from "child_process";
import { readdir, mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVerbose =
  process.argv.includes("-v") || process.argv.includes("--verbose");

/**
 * Analyze snapshot distribution to determine generation strategy
 */
async function analyzeSnapshotDistribution(snapshotDir) {
  const files = await readdir(snapshotDir);
  const snapshots = files.filter((f) => f.endsWith(".jpg"));

  // Group snapshots by date
  const byDate = new Map();
  for (const filename of snapshots) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})_(\d{4})\.jpg$/);
    if (match) {
      const [, date, time] = match;
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date).push({ filename, date, time });
    }
  }

  // Separate into daily videos (>2 frames) and time-based groups (≤2 frames)
  const dailyVideos = [];
  const timeBasedSnapshots = [];

  for (const [date, dateSnapshots] of byDate) {
    if (dateSnapshots.length > 2) {
      // Sort by time for chronological daily video
      dateSnapshots.sort((a, b) => a.time.localeCompare(b.time));
      dailyVideos.push({ date, snapshots: dateSnapshots });
    } else {
      // Add to time-based pool
      timeBasedSnapshots.push(...dateSnapshots);
    }
  }

  // Group time-based snapshots by time slot
  const timeBasedGroups = new Map();
  for (const snapshot of timeBasedSnapshots) {
    if (!timeBasedGroups.has(snapshot.time)) {
      timeBasedGroups.set(snapshot.time, []);
    }
    timeBasedGroups.get(snapshot.time).push(snapshot);
  }

  // Convert to sorted array
  const timeGroups = Array.from(timeBasedGroups.entries())
    .map(([time, snapshots]) => ({
      time,
      hour: parseInt(time.slice(0, 2), 10),
      minute: parseInt(time.slice(2, 4), 10),
      snapshots: snapshots.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return { dailyVideos, timeGroups };
}

/**
 * Generate daily video for multi-capture days (>2 snapshots)
 */
async function generateDailyVideo(
  dailyVideo,
  snapshotDir,
  timelapseDir,
  camera,
  config,
) {
  const { date, snapshots } = dailyVideo;

  await mkdir(timelapseDir, { recursive: true });

  const outputPath = path.join(timelapseDir, `${date}.mp4`);

  // Check if video cache is still valid
  try {
    const videoStats = await stat(outputPath);
    const videoMtime = videoStats.mtime.getTime();

    // Find the latest snapshot modification time
    let latestSnapshotMtime = 0;
    for (const snapshot of snapshots) {
      const snapshotPath = path.join(snapshotDir, snapshot.filename);
      const snapshotStats = await stat(snapshotPath);
      if (snapshotStats.mtime.getTime() > latestSnapshotMtime) {
        latestSnapshotMtime = snapshotStats.mtime.getTime();
      }
    }

    // If video is newer than all snapshots, use cached version
    if (videoMtime > latestSnapshotMtime) {
      console.log(`\n✓ Using cached daily video for ${date}`);
      console.log(`  ${snapshots.length} snapshots (cache is up-to-date)`);
      return;
    }
  } catch {
    // Video doesn't exist or can't be stat'd, proceed with generation
  }

  console.log(`\nGenerating daily video for ${date}...`);
  console.log(`Found ${snapshots.length} snapshots`);

  // Create file list for ffmpeg concat demuxer
  const fileListPath = path.join(snapshotDir, `filelist-${date}.txt`);
  const lines = snapshots.map(
    (s) => `file '${path.join(snapshotDir, s.filename)}'`,
  );
  await writeFile(fileListPath, lines.join("\n") + "\n");

  // Get FPS from camera config or defaults
  const fps = camera.video?.fps || config.videoDefaults?.fps || 24;

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-r",
      fps.toString(),
      "-i",
      fileListPath,
      "-vf",
      `fps=${fps}`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
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
        reject(new Error(`ffmpeg daily video exited with code ${code}`));
      } else {
        const stats = await stat(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

        console.log(`✓ Daily video created: ${date}.mp4 (${sizeMB}MB)`);
        console.log(`  ${snapshots.length} snapshots @ ${fps} fps`);

        await unlink(fileListPath).catch(() => {});
        resolve();
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * Concatenate all daily videos into full timelapse
 */
async function concatenateDailyVideos(timelapseDir, dailyVideos) {
  if (dailyVideos.length === 0) {
    console.log("\nNo daily videos to concatenate");
    return;
  }

  console.log(`\nConcatenating ${dailyVideos.length} daily videos...`);

  // Create concat list file
  const concatListPath = path.join(timelapseDir, "concat-list.txt");
  const lines = dailyVideos.map((dv) => `file '${dv.date}.mp4'`);
  await writeFile(concatListPath, lines.join("\n") + "\n");

  // Generate output filename with date range
  const firstDate = dailyVideos[0].date;
  const lastDate = dailyVideos[dailyVideos.length - 1].date;
  const outputPath = path.join(
    timelapseDir,
    `full-timelapse_${firstDate}_to_${lastDate}.mp4`,
  );

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy", // No re-encoding, just copy streams
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
        reject(new Error(`ffmpeg concat exited with code ${code}`));
      } else {
        const stats = await stat(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

        console.log(`✓ Full timelapse created: ${outputPath} (${sizeMB}MB)`);
        console.log(
          `  ${dailyVideos.length} days from ${firstDate} to ${lastDate}`,
        );

        await unlink(concatListPath).catch(() => {});
        resolve();
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * Main execution
 */
async function main() {
  const startTime = new Date();
  console.log(
    `[${startTime.toISOString()}] Generating videos from existing snapshots...\n`,
  );

  const config = await loadConfig();
  const cameras = config.cameras || [];

  if (cameras.length === 0) {
    console.error("❌ No cameras configured. Run 'lawn-lapse setup' first.");
    process.exit(1);
  }

  console.log(`📹 Processing ${cameras.length} camera(s)...\n`);

  const results = [];

  for (const camera of cameras) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📹 Camera: ${camera.name} (${camera.id})`);
    console.log(`${"=".repeat(60)}`);

    try {
      const snapshotDir =
        camera.snapshotDir || path.join(__dirname, "snapshots");
      const timelapseDir =
        camera.timelapseDir ||
        path.join(path.dirname(snapshotDir), "timelapses");

      const { dailyVideos, timeGroups } =
        await analyzeSnapshotDistribution(snapshotDir);

      console.log(
        `\nAnalysis: ${dailyVideos.length} multi-capture days, ${timeGroups.length} time-based groups`,
      );

      // Generate daily videos for multi-capture days (>2 frames/day)
      if (dailyVideos.length > 0) {
        console.log(`\nGenerating ${dailyVideos.length} daily video(s)...`);
        for (const dailyVideo of dailyVideos) {
          await generateDailyVideo(
            dailyVideo,
            snapshotDir,
            timelapseDir,
            camera,
            config,
          );
        }

        // Concatenate all daily videos into full timelapse
        await concatenateDailyVideos(timelapseDir, dailyVideos);
      }

      if (dailyVideos.length === 0 && timeGroups.length === 0) {
        console.log("\nNo snapshots found for timelapse generation");
      }

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

      console.log(`\nContinuing with remaining cameras...`);
    }
  }

  // Print summary
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Video Generation Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log();

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`✅ Successful: ${successful}/${cameras.length}`);
  console.log(`❌ Failed: ${failed}/${cameras.length}`);

  if (failed > 0) {
    console.log(`\nFailed cameras:`);
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.camera}: ${r.error}`);
      });
  }

  console.log(`\n⏱️  Duration: ${duration} seconds`);
  console.log(`[${endTime.toISOString()}] Video generation complete!\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
