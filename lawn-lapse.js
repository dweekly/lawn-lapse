#!/usr/bin/env node

/**
 * @file lawn.js
 * @description Main CLI entry point for Lawn Lapse - automated time-lapse generator for UniFi Protect cameras
 * @author Lawn Lapse Contributors
 * @license MIT
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import { input, password, select, confirm } from "@inquirer/prompts";
import { ProtectApi } from "unifi-protect";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress promotional messages from dotenv by intercepting console.log
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";
const originalLog = console.log;
console.log = (...args) => {
  // Filter out any dotenv promotional messages
  if (args[0]?.includes?.("[dotenv")) return;
  originalLog(...args);
};
dotenv.config({ path: path.join(__dirname, ".env.local"), silent: true });
console.log = originalLog; // Restore original console.log

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

/**
 * Checks if configuration file exists
 * @async
 * @returns {Promise<boolean>} True if .env.local exists, false otherwise
 */
async function hasConfig() {
  try {
    await fs.access(path.join(__dirname, ".env.local"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if cron job is installed for automated captures
 * @returns {boolean} True if cron job exists, false otherwise
 */
function isCronInstalled() {
  try {
    const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf8" });
    // Check for both lawn-lapse and lawn.js entries
    return crontab.includes("lawn-lapse") || crontab.includes("lawn.js");
  } catch {
    // No crontab or error reading it
    return false;
  }
}

/**
 * Loads existing configuration from .env.local file
 * @async
 * @returns {Promise<Object>} Configuration object with key-value pairs
 * @example
 * const config = await loadExistingConfig();
 * console.log(config.UNIFI_HOST); // "192.168.1.1"
 */
async function loadExistingConfig() {
  const envPath = path.join(__dirname, ".env.local");
  const config = {};

  try {
    const envContent = await fs.readFile(envPath, "utf8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      // Skip comments and empty lines
      if (line && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          // Handle values that might contain = signs
          config[key.trim()] = valueParts.join("=").trim();
        }
      }
    }
  } catch {
    // File doesn't exist or can't be read - return empty config
  }

  return config;
}

/**
 * Saves configuration updates to .env.local file
 * Merges updates with existing configuration to preserve unchanged values
 * @async
 * @param {Object} updates - Configuration updates to save
 * @param {string} [updates.UNIFI_HOST] - UniFi Protect host/IP
 * @param {string} [updates.UNIFI_USERNAME] - UniFi username
 * @param {string} [updates.UNIFI_PASSWORD] - UniFi password
 * @param {string} [updates.CAMERA_ID] - Selected camera ID
 * @param {string} [updates.CAMERA_NAME] - Selected camera name
 * @param {string} [updates.SNAPSHOT_TIME] - Daily capture time (HH:MM)
 * @param {string} [updates.OUTPUT_DIR] - Output directory path
 * @param {string} [updates.VIDEO_FPS] - Video frame rate
 * @param {string} [updates.VIDEO_QUALITY] - Video quality (CRF value)
 * @returns {Promise<void>}
 */
async function saveConfig(updates) {
  const envPath = path.join(__dirname, ".env.local");
  const existingConfig = await loadExistingConfig();

  // Merge updates with existing config, preserving unchanged values
  const config = { ...existingConfig, ...updates };

  // Build env file content with organized sections
  const envContent = `# UniFi Protect Configuration
UNIFI_HOST=${config.UNIFI_HOST || ""}
UNIFI_USERNAME=${config.UNIFI_USERNAME || ""}
UNIFI_PASSWORD=${config.UNIFI_PASSWORD || ""}
CAMERA_ID=${config.CAMERA_ID || ""}
CAMERA_NAME=${config.CAMERA_NAME || ""}

# Snapshot Settings
SNAPSHOT_TIME=${config.SNAPSHOT_TIME || ""}
OUTPUT_DIR=${config.OUTPUT_DIR || ""}

# Video Settings
VIDEO_FPS=${config.VIDEO_FPS || ""}
VIDEO_QUALITY=${config.VIDEO_QUALITY || ""}
`;

  await fs.writeFile(envPath, envContent);
}

/**
 * Runs the interactive setup flow
 * Guides user through configuration with smart defaults and validation
 * @async
 * @param {boolean} [skipCron=false] - Whether to skip cron setup step
 * @returns {Promise<void>}
 * @throws {Error} If setup fails or is cancelled by user
 */
async function runSetup(skipCron = false) {
  console.log("🚀 Welcome to Lawn Lapse Setup!\n");

  // Load any existing configuration to use as defaults
  const existingConfig = await loadExistingConfig();

  if (Object.keys(existingConfig).length > 0) {
    console.log("📝 Found existing configuration, using as defaults.\n");
  }

  try {
    // Step 1: UniFi Protect credentials
    let host = existingConfig.UNIFI_HOST;
    let username = existingConfig.UNIFI_USERNAME;
    let pass = existingConfig.UNIFI_PASSWORD;
    let authenticated = false;
    let protect = null;

    // Only show Step 1 header if we need to collect credentials
    if (!host || !username || !pass) {
      console.log("📹 Step 1: UniFi Protect Configuration");
      console.log("----------------------------------------\n");
    }

    // Authentication loop - retry on failure
    while (!authenticated) {
      // Collect missing credentials
      if (!host || !username || !pass) {
        if (!host) {
          host = await input({
            message: "UniFi Protect Host:",
            default: existingConfig.UNIFI_HOST || "192.168.1.1",
            validate: (value) => (value ? true : "Host is required"),
          });
        }

        if (!username) {
          username = await input({
            message: "Username:",
            default: existingConfig.UNIFI_USERNAME || "admin",
          });
        }

        // Save host and username immediately for better UX
        await saveConfig({
          UNIFI_HOST: host,
          UNIFI_USERNAME: username,
        });

        if (!pass) {
          pass = await password({
            message: "Password:",
            validate: (value) => (value ? true : "Password is required"),
          });
        }
      }

      // Test connection with provided credentials
      console.log("\n🔍 Testing connection to UniFi Protect...");
      protect = new ProtectApi();

      try {
        const loginResult = await protect.login(host, username, pass);
        if (!loginResult) {
          throw new Error("Authentication failed");
        }
        console.log("✅ Successfully connected to UniFi Protect!");
        authenticated = true;

        // Save successful credentials
        await saveConfig({
          UNIFI_HOST: host,
          UNIFI_USERNAME: username,
          UNIFI_PASSWORD: pass,
        });
      } catch (authError) {
        // Handle authentication errors with helpful messages
        if (
          authError.message?.includes("Insufficient privileges") ||
          authError.message?.includes("API error") ||
          authError.message === "Authentication failed"
        ) {
          console.log(
            "\n❌ Authentication failed. This usually means the password is incorrect.",
          );
          const retry = await confirm({
            message: "Would you like to try again?",
            default: true,
          });

          if (!retry) {
            console.log("\n👋 Setup cancelled");
            process.exit(0);
          }
          // Reset password for retry
          pass = null;
          console.log(""); // Add spacing before retry
        } else {
          throw authError;
        }
      }
    }

    try {
      let cameraId = existingConfig.CAMERA_ID;
      let cameraName = existingConfig.CAMERA_NAME;

      // Only fetch cameras if we don't have one selected
      if (!cameraId) {
        // Get camera list from UniFi Protect
        await protect.getBootstrap();

        console.log("🔍 Fetching camera list...");

        // Access cameras from protect.bootstrap as per API documentation
        const cameras = protect.bootstrap?.cameras ?? [];

        if (cameras.length === 0) {
          console.log("⚠️  No cameras found on this system.");
          process.exit(1);
        }

        console.log(`\n📷 Found ${cameras.length} camera(s):\n`);

        // Build camera choices with detailed information
        const cameraChoices = cameras.map((camera, index) => {
          const name = camera.name || camera.displayName || "Unknown";
          const model =
            camera.marketName || camera.type?.replace("UVC ", "") || "Unknown";
          const resolution = camera.currentResolution || "";
          const offline = camera.isConnected === false ? " (OFFLINE)" : "";
          const details = [model, resolution].filter(Boolean).join(" ");

          return {
            name: `${name}${offline} - ${details}`,
            value: index,
          };
        });

        // Interactive camera selection
        const cameraIndex = await select({
          message: "Select camera:",
          choices: cameraChoices,
        });

        const selectedCamera = cameras[cameraIndex];
        cameraId = selectedCamera.id;
        cameraName = selectedCamera.name || selectedCamera.displayName;

        console.log(`✅ Selected: ${cameraName}`);

        // Save camera selection
        await saveConfig({
          CAMERA_ID: cameraId,
          CAMERA_NAME: cameraName,
        });
      } else {
        console.log(`✅ Using existing camera: ${cameraName}`);
      }

      await protect.logout();

      // Step 2: Snapshot Configuration
      console.log("\n📸 Step 2: Snapshot Configuration");
      console.log("----------------------------------------\n");

      const snapshotTime = await input({
        message: "Capture time (24-hour format):",
        default: existingConfig.SNAPSHOT_TIME || "12:00",
        validate: (value) => {
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          return timeRegex.test(value)
            ? true
            : "Please enter a valid time in HH:MM format";
        },
      });

      const defaultOutputDir =
        existingConfig.OUTPUT_DIR || path.join(__dirname, "snapshots");
      const outputDir = await input({
        message: "Output directory:",
        default: defaultOutputDir,
      });

      // Create output directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`✅ Output directory created/verified: ${outputDir}`);

      // Save snapshot settings
      await saveConfig({
        SNAPSHOT_TIME: snapshotTime,
        OUTPUT_DIR: outputDir,
      });

      // Step 3: Video Settings (using optimized defaults)
      const fps = "10"; // 10 fps provides smooth time-lapse playback
      const videoQuality = "1"; // CRF 1 = best quality

      // Save video settings
      await saveConfig({
        VIDEO_FPS: fps,
        VIDEO_QUALITY: videoQuality,
      });

      console.log("\n✅ Configuration saved to .env.local");

      // Step 4: Cron Setup (unless skipped)
      if (!skipCron) {
        console.log("\n⏰ Step 4: Daily Capture Schedule");
        console.log("----------------------------------------\n");

        const setupCron = await confirm({
          message: "Would you like to set up automatic daily captures?",
          default: true,
        });

        if (setupCron) {
          // Parse time for cron format
          const [hour, minute] = snapshotTime.split(":");
          const cronTime = `${minute} ${hour} * * *`; // Cron format: minute hour * * *
          const nodePath = process.execPath;
          const scriptPath = path.join(__dirname, "lawn.js");
          const logPath = path.join(outputDir, "lawn-lapse.log");

          // Build cron command with proper paths and logging
          const cronCommand = `${cronTime} cd ${__dirname} && ${nodePath} ${scriptPath} >> ${logPath} 2>&1`;

          try {
            // Get existing crontab (if any)
            let existingCron = "";
            try {
              existingCron = execSync("crontab -l 2>/dev/null", {
                encoding: "utf8",
              });
            } catch {
              // No existing crontab - start fresh
            }

            // Remove any existing lawn-lapse entries to avoid duplicates
            const filteredCron = existingCron
              .split("\n")
              .filter(
                (line) =>
                  !line.includes("lawn-lapse") && !line.includes("lawn.js"),
              )
              .join("\n");

            // Add new cron entry
            const newCron = filteredCron.trim() + "\n" + cronCommand + "\n";

            // Install new crontab
            const tempFile = path.join(__dirname, ".crontab.tmp");
            await fs.writeFile(tempFile, newCron);
            execSync(`crontab ${tempFile}`);
            await fs.unlink(tempFile);

            console.log(
              `✅ Cron job installed to run daily at ${snapshotTime}`,
            );
            console.log(`   Logs will be saved to: ${logPath}`);
          } catch (error) {
            console.error("❌ Failed to install cron job:", error.message);
            console.log("\nYou can manually add this to your crontab:");
            console.log(cronCommand);
          }
        }
      }

      console.log("\n🎉 Setup complete!");
    } catch (error) {
      console.error("❌ Connection failed:", error.message);
      process.exit(1);
    }
  } catch (error) {
    if (error.message === "User force closed the prompt") {
      console.log("\n👋 Setup cancelled");
      process.exit(0);
    }
    console.error("❌ Setup error:", error.message);
    process.exit(1);
  }
}

/**
 * Runs the capture and timelapse generation process
 * Spawns the capture-and-timelapse.js script as a child process
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If capture process fails
 */
async function runCapture() {
  return new Promise((resolve, reject) => {
    const captureScript = path.join(__dirname, "capture-and-timelapse.js");
    const child = spawn(process.execPath, [captureScript], {
      stdio: "inherit", // Inherit stdio for real-time output
      env: process.env, // Pass environment variables
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Capture process exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Runs the status check process
 * Displays system information and statistics
 * @async
 * @returns {Promise<void>}
 */
async function runStatus() {
  console.log("🎥 Lawn Lapse Status Report");
  console.log("=".repeat(60));

  const config = await loadExistingConfig();
  const snapshotDir = config.OUTPUT_DIR || "./snapshots";
  const snapshotTime = config.SNAPSHOT_TIME || "12:00";
  const [captureHour, captureMinute] = snapshotTime
    .split(":")
    .map((n) => parseInt(n));
  const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;

  // Check snapshots
  try {
    const files = await fs.readdir(snapshotDir);
    const jpgFiles = files
      .filter((f) => f.endsWith(`.jpg`) && f.includes(`_${timeStr}.jpg`))
      .sort();

    if (jpgFiles.length > 0) {
      const firstDate = jpgFiles[0].split("_")[0];
      const lastDate = jpgFiles[jpgFiles.length - 1].split("_")[0];

      console.log("\n📸 Snapshots:");
      console.log(
        `  Total: ${jpgFiles.length} ${snapshotTime} snapshots`,
      );
      console.log(`  Range: ${firstDate} to ${lastDate}`);
      console.log(`  Days: ${jpgFiles.length} days of footage`);

      // Check for gaps
      const dates = jpgFiles.map((f) => f.split("_")[0]);
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const curr = new Date(dates[i]);
        const prev = new Date(dates[i - 1]);
        const diffDays = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          gaps.push(
            `${dates[i - 1]} to ${dates[i]} (${diffDays - 1} days missing)`,
          );
        }
      }

      if (gaps.length > 0) {
        console.log(`  ⚠️  Gaps found: ${gaps.length}`);
        gaps.slice(0, 3).forEach((gap) => console.log(`     - ${gap}`));
        if (gaps.length > 3)
          console.log(`     ... and ${gaps.length - 3} more`);
      } else {
        console.log("  ✓ No gaps in sequence");
      }
    } else {
      console.log("\n📸 Snapshots: No snapshots found");
    }
  } catch {
    console.log("\n📸 Snapshots: Directory not found");
  }

  // Check time-lapses
  console.log("\n🎬 Time-lapses:");
  try {
    const files = await fs.readdir(process.cwd());
    const timelapses = files.filter(
      (f) => f.startsWith("timelapse") && f.endsWith(".mp4"),
    );

    if (timelapses.length > 0) {
      // Sort by modification time
      const timelapseStats = await Promise.all(
        timelapses.map(async (file) => {
          const stats = await fs.stat(path.join(process.cwd(), file));
          return { file, mtime: stats.mtime, size: stats.size };
        }),
      );

      timelapseStats.sort((a, b) => b.mtime - a.mtime);

      console.log(`  Found: ${timelapses.length} videos`);
      console.log("  Latest:");
      timelapseStats.slice(0, 3).forEach((t) => {
        const sizeMB = (t.size / 1024 / 1024).toFixed(1);
        console.log(`    - ${t.file} (${sizeMB}MB)`);
      });

      // Parse date range from filename
      const latest = timelapseStats[0].file;
      const match = latest.match(/_(\d{2}h\d{2})_(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/);
      if (match) {
        const [, time, startDate, endDate] = match;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        console.log(`    ${days} days from ${startDate} to ${endDate}`);
      }
    } else {
      console.log("  No time-lapse videos found");
    }
  } catch {
    console.log("  Error checking time-lapses");
  }

  // Check cron job
  console.log("\n⏰ Cron Job:");
  try {
    const { execSync } = await import("child_process");
    const crontab = execSync('crontab -l 2>/dev/null || echo ""', {
      encoding: "utf-8",
    });
    const hasCron = crontab.includes("lawn-lapse") || crontab.includes("capture-and-timelapse");

    if (hasCron) {
      // Extract the schedule
      const cronLine = crontab
        .split("\n")
        .find((line) => line.includes("lawn-lapse") || line.includes("capture-and-timelapse"));

      if (cronLine && !cronLine.startsWith("#")) {
        const parts = cronLine.split(" ");
        const minute = parts[0];
        const hour = parts[1];
        console.log(`  ✓ Active: Daily at ${hour}:${minute.padStart(2, "0")}`);
      } else {
        console.log("  ✓ Cron job configured (disabled or commented)");
      }
    } else {
      console.log("  ✗ Not configured");
      console.log("  Run: lawn-lapse cron to set up automatic daily capture");
    }
  } catch {
    console.log("  Unable to check cron status");
  }

  // Check authentication
  console.log("\n🔐 Authentication:");
  if (config.UNIFI_USERNAME && config.UNIFI_PASSWORD) {
    console.log("  ✓ Credentials configured");
    console.log("  Using username/password authentication");
  } else {
    console.log("  ✗ Missing credentials");
    console.log("  Run: lawn-lapse to configure");
  }

  // Quick summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary:");

  try {
    const files = await fs.readdir(snapshotDir);
    const snapshotCount = files.filter(
      (f) => f.endsWith(".jpg") && f.includes(`_${timeStr}.jpg`),
    ).length;

    if (snapshotCount > 0) {
      console.log(
        `  ✓ System operational with ${snapshotCount} days of footage`,
      );
      console.log("  💡 Tip: Run lawn-lapse to update snapshots and create video");
    } else {
      console.log("  ⚠️  No snapshots captured yet");
      console.log("  💡 Tip: Run lawn-lapse to start capturing");
    }
  } catch {
    console.log("  ⚠️  No snapshots captured yet");
    console.log("  💡 Tip: Run lawn-lapse to start capturing");
  }
}

/**
 * Main execution function
 * Handles command routing and smart setup detection
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  try {
    // Handle subcommands
    if (command === "status") {
      await runStatus();
      return;
    }

    if (command === "cron") {
      console.log("🔄 Re-running cron setup...\n");
      await runSetup(false); // Don't skip cron setup
      return;
    }

    if (command === "help" || command === "--help" || command === "-h") {
      console.log(`
Lawn Lapse - Capture daily snapshots and create time-lapse videos

Usage:
  lawn              Run capture (setup if first time)
  lawn status       Show current configuration and statistics
  lawn cron         Set up or update cron job
  lawn help         Show this help message

On first run, lawn will guide you through setup.
Subsequent runs will capture a snapshot and update the time-lapse video.
`);
      return;
    }

    // Check if configuration exists
    const configExists = await hasConfig();

    if (!configExists) {
      // First run - do interactive setup then capture
      await runSetup();
      console.log("\n📸 Running initial capture...\n");
      await runCapture();
    } else {
      // Check if configuration is complete
      const config = await loadExistingConfig();
      const requiredFields = [
        "UNIFI_HOST",
        "UNIFI_USERNAME",
        "UNIFI_PASSWORD",
        "CAMERA_ID",
        "SNAPSHOT_TIME",
        "OUTPUT_DIR",
      ];

      // Find any missing required fields
      const missingFields = requiredFields.filter((field) => !config[field]);

      if (missingFields.length > 0) {
        // Incomplete configuration - resume setup
        console.log(
          "⚠️  Configuration is incomplete. Running setup to complete it...\n",
        );
        await runSetup();
        console.log("\n📸 Running initial capture...\n");
        await runCapture();
        return;
      }

      // Configuration complete - check cron and run capture
      if (!isCronInstalled()) {
        console.log(
          '⚠️  Warning: Cron job is not installed. Run "lawn cron" to set up automatic daily captures.\n',
        );
      }

      await runCapture();
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run main function
main();

// Export functions for programmatic use
export { runSetup, runCapture, runStatus, loadExistingConfig, saveConfig };