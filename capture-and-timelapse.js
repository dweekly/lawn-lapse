#!/usr/bin/env node

/**
 * UniFi Protect Lawn Lapse - Using unifi-protect library
 * This version uses username/password instead of cookies
 */

import { ProtectApi } from 'unifi-protect';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

class UniFiProtectClient {
  constructor() {
    this.protect = new ProtectApi();
    this.host = process.env.UNIFI_HOST;
    this.username = process.env.UNIFI_USERNAME || 'admin';
    this.password = process.env.UNIFI_PASSWORD;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return true;

    console.log(`Connecting to ${this.host}...`);
    const success = await this.protect.login(this.host, this.username, this.password);

    if (!success) {
      throw new Error('Failed to login to UniFi Protect');
    }

    this.isConnected = true;
    console.log('✓ Connected to UniFi Protect');
    return true;
  }

  async exportVideo(cameraId, startMs, durationMs = 5000) {
    await this.connect();

    const endMs = startMs + durationMs;
    // IMPORTANT: Use full URL with host for the library to work
    const url = `https://${this.host}/proxy/protect/api/video/export?camera=${cameraId}&start=${startMs}&end=${endMs}`;

    const response = await this.protect.retrieve(url, {
      method: 'GET',
      headers: {
        Accept: 'video/mp4',
      },
    });

    if (!response || !response.body) {
      throw new Error('No video data received');
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
            'ffmpeg',
            [
              '-i',
              tempVideoPath,
              '-ss',
              '00:00:00',
              '-frames:v',
              '1',
              '-q:v',
              '2',
              '-y',
              outputPath,
            ],
            { stdio: 'pipe' },
          );

          ffmpeg.on('close', async (code) => {
            await fs.unlink(tempVideoPath).catch(() => {});
            if (code === 0) {
              resolve(outputPath);
            } else {
              reject(new Error(`ffmpeg failed with code ${code}`));
            }
          });

          ffmpeg.on('error', async (err) => {
            await fs.unlink(tempVideoPath).catch(() => {});
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
    console.error('Error: Missing UNIFI_PASSWORD in .env.local');
    console.error('Please add your UniFi Protect password to .env.local');
    process.exit(1);
  }

  // Get capture time configuration
  const captureHour = parseInt(process.env.CAPTURE_HOUR || '12');
  const captureMinute = parseInt(process.env.CAPTURE_MINUTE || '0');

  const client = new UniFiProtectClient();
  const cameraId = process.env.CAMERA_ID;
  const outputDir = process.env.OUTPUT_DIR || './snapshots';

  await fs.mkdir(outputDir, { recursive: true });

  // Check for missing snapshots in the last 39 days (max retention)
  const maxDays = 39;
  let capturedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const missingDates = [];

  console.log(
    `Checking for missing ${captureHour}:${String(captureMinute).padStart(2, '0')} snapshots (last ${maxDays} days)...`,
  );

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - dayOffset);
    targetDate.setHours(captureHour, captureMinute, 0, 0);

    // Skip future dates
    if (targetDate > now) {
      continue;
    }

    const dateStr = targetDate.toISOString().split('T')[0];
    const timeStr = `${String(captureHour).padStart(2, '0')}${String(captureMinute).padStart(2, '0')}`;
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
    console.log('✓ All snapshots up to date!');
  } else {
    console.log(`Found ${missingDates.length} missing snapshots. Fetching...`);

    for (const missing of missingDates) {
      process.stdout.write(`  ${missing.dateStr}: `);

      try {
        const videoBuffer = await client.exportVideo(cameraId, missing.date.getTime(), 5000);
        await client.extractFrameFromVideo(videoBuffer, missing.outputPath);
        console.log('✓');
        capturedCount++;

        // Small delay between captures
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`✗ (${error.message})`);
        failedCount++;
      }
    }
  }

  console.log('\nSummary:');
  console.log(`  Captured: ${capturedCount}`);
  console.log(`  Already had: ${skippedCount}`);
  console.log(`  Failed: ${failedCount}`);

  return { capturedCount, skippedCount, failedCount };
}

async function regenerateTimelapse() {
  console.log('\nRegenerating time-lapse...');

  const outputDir = process.env.OUTPUT_DIR || './snapshots';

  // Get all jpg files and sort them
  const files = await fs.readdir(outputDir);
  const jpgFiles = files.filter((f) => f.match(/\d{4}-\d{2}-\d{2}_\d{4}\.jpg$/)).sort();

  if (jpgFiles.length === 0) {
    console.log('No snapshots found to create timelapse');
    return;
  }

  console.log(`Found ${jpgFiles.length} snapshots`);

  // Create file list for ffmpeg
  const listPath = path.join(outputDir, 'filelist.txt');
  const fileList = jpgFiles.map((f) => `file '${f}'`).join('\n');
  await fs.writeFile(listPath, fileList);

  // Generate output filename with date range
  const firstDate = jpgFiles[0].split('_')[0];
  const lastDate = jpgFiles[jpgFiles.length - 1].split('_')[0];
  const timeLabel =
    process.env.CAPTURE_HOUR === '12' && process.env.CAPTURE_MINUTE === '0'
      ? 'noon'
      : `${process.env.CAPTURE_HOUR || '12'}h${process.env.CAPTURE_MINUTE || '00'}`;
  const outputPath = `timelapse_${timeLabel}_${firstDate}_to_${lastDate}.mp4`;

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-framerate',
        '30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        outputPath,
      ],
      { stdio: 'inherit' },
    );

    ffmpeg.on('close', async (code) => {
      await fs.unlink(listPath).catch(() => {});

      if (code === 0) {
        const stats = await fs.stat(outputPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
        console.log(`✓ Time-lapse created: ${outputPath} (${sizeMB}MB)`);
        console.log(`  ${jpgFiles.length} days from ${firstDate} to ${lastDate}`);
        resolve(outputPath);
      } else {
        reject(new Error(`ffmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

async function main() {
  try {
    // Fetch any missing snapshots
    const result = await fetchMissingSnapshots();

    // Regenerate timelapse if we captured new snapshots
    if (result.capturedCount > 0) {
      await regenerateTimelapse();
    } else if (result.skippedCount > 0) {
      console.log('\nNo new snapshots, skipping timelapse regeneration.');
    }

    console.log(`\n[${new Date().toISOString()}] Daily update complete!`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the main function
main();
