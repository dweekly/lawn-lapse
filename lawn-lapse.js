#!/usr/bin/env node

/**
 * @file lawn.js
 * @description Main CLI entry point for Lawn Lapse - automated time-lapse generator for UniFi Protect cameras
 * @author David E. Weekly
 * @license MIT
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import { input, password, select, confirm } from "@inquirer/prompts";
import { ProtectApi } from "unifi-protect";

import { loadConfig, updateConfig, getConfigPath } from "./config.js";
import {
  detectLocation,
  confirmLocation,
  formatLocation,
} from "./geolocation.js";
import { validateSchedule } from "./scheduling.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    await fs.access(getConfigPath());
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
    // Check for capture-and-timelapse.js entries
    return crontab.includes("capture-and-timelapse.js");
  } catch {
    // No crontab or error reading it
    return false;
  }
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

  let config = await loadConfig();
  if (config) {
    console.log("📝 Found existing configuration, using as defaults.\n");
  }

  try {
    let host = config.unifi?.host;
    let username = config.unifi?.username;
    let pass = config.unifi?.password;
    let authenticated = false;
    let protect = null;

    if (!host || !username || !pass) {
      console.log("📹 Step 1: UniFi Protect Configuration");
      console.log("----------------------------------------\n");
    }

    while (!authenticated) {
      if (!host) {
        host = await input({
          message: "UniFi Protect Host:",
          default: config.unifi?.host || "192.168.1.1",
          validate: (value) => (value ? true : "Host is required"),
        });
      }

      if (!username) {
        username = await input({
          message: "Username:",
          default: config.unifi?.username || "admin",
        });
      }

      if (!pass) {
        pass = await password({
          message: "Password:",
          mask: "*",
        });
      }

      try {
        protect = new ProtectApi();
        await protect.login(host, username, pass);
        authenticated = true;
        config = await updateConfig((draft) => {
          draft.unifi.host = host;
          draft.unifi.username = username;
          draft.unifi.password = pass;
        });
      } catch (error) {
        console.log(
          `❌ Authentication failed: ${error.message}. Let's try again.\n`,
        );
        pass = null;
        config = await updateConfig((draft) => {
          draft.unifi.password = "";
        });
      }
    }

    console.log("\n📷 Step 2: Camera Selection");
    console.log("----------------------------------------\n");

    await protect.getBootstrap();
    const cameras = protect?.bootstrap?.cameras ?? [];
    if (cameras.length === 0) {
      console.log("⚠️  No cameras found on this system.");
      process.exit(1);
    }

    console.log(`\n📷 Found ${cameras.length} camera(s):\n`);

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

    const defaultCameraIndex = config.cameras?.[0]
      ? cameras.findIndex((camera) => camera.id === config.cameras[0].id)
      : undefined;

    const selectedIndex = await select({
      message: "Select camera:",
      choices: cameraChoices,
      default:
        typeof defaultCameraIndex === "number" && defaultCameraIndex >= 0
          ? defaultCameraIndex
          : undefined,
    });

    const selectedCamera = cameras[selectedIndex];
    console.log(
      `✅ Selected: ${selectedCamera.name || selectedCamera.displayName || "Camera"}`,
    );

    const defaultSnapshotDir =
      config.cameras?.[0]?.snapshotDir || path.join(__dirname, "snapshots");
    const defaultTimelapseDir = config.cameras?.[0]?.timelapseDir
      ? config.cameras[0].timelapseDir
      : path.join(path.dirname(defaultSnapshotDir), "timelapses");

    config = await updateConfig((draft) => {
      draft.cameras = [
        {
          id: selectedCamera.id,
          name: selectedCamera.name || selectedCamera.displayName,
          snapshotDir: defaultSnapshotDir,
          timelapseDir: defaultTimelapseDir,
          video: {
            fps: config.cameras?.[0]?.video?.fps ?? draft.videoDefaults.fps,
            quality:
              config.cameras?.[0]?.video?.quality ??
              draft.videoDefaults.quality,
          },
        },
      ];
    });

    await protect.logout();

    console.log("\n⏰ Step 3: Schedule Configuration");
    console.log("----------------------------------------\n");

    const scheduleMode = await select({
      message: "Select capture schedule mode:",
      choices: [
        {
          name: "Fixed daily time(s) - Capture at specific times each day",
          value: "fixed-time",
        },
        {
          name: "Interval - Capture at regular intervals throughout the day",
          value: "interval",
        },
        {
          name: "Sunrise/Sunset - Capture based on sun position",
          value: "sunrise-sunset",
        },
      ],
      default: config.schedule?.mode || "fixed-time",
    });

    const scheduleConfig = {
      mode: scheduleMode,
      timezone:
        config.schedule?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    // Configure based on selected mode
    if (scheduleMode === "fixed-time") {
      const snapshotTime = await input({
        message:
          "Capture time(s) (24-hour format, comma-separated for multiple):",
        default: (config.schedule?.fixedTimes || ["12:00"]).join(", "),
        validate: (value) => {
          const times = value.split(",").map((t) => t.trim());
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          for (const time of times) {
            if (!timeRegex.test(time)) {
              return `Invalid time format: ${time}. Use HH:MM format`;
            }
          }
          return true;
        },
      });
      scheduleConfig.fixedTimes = snapshotTime.split(",").map((t) => t.trim());
    } else if (scheduleMode === "interval") {
      const shotsPerHour = await input({
        message: "Captures per hour (1-60):",
        default: String(config.schedule?.interval?.shotsPerHour || 1),
        validate: (value) => {
          const num = parseInt(value, 10);
          return num >= 1 && num <= 60 ? true : "Must be between 1 and 60";
        },
      });

      const startHour = await input({
        message: "Start time (HH:MM):",
        default: config.schedule?.window?.startHour || "06:00",
        validate: (value) => {
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          return timeRegex.test(value)
            ? true
            : "Please enter a valid time in HH:MM format";
        },
      });

      const endHour = await input({
        message: "End time (HH:MM):",
        default: config.schedule?.window?.endHour || "18:00",
        validate: (value) => {
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          return timeRegex.test(value)
            ? true
            : "Please enter a valid time in HH:MM format";
        },
      });

      scheduleConfig.interval = { shotsPerHour: parseInt(shotsPerHour, 10) };
      scheduleConfig.window = { startHour, endHour };
    } else if (scheduleMode === "sunrise-sunset") {
      // Detect or input location
      console.log(
        "\n📍 Detecting your location for sunrise/sunset calculations...",
      );
      const detected = await detectLocation();

      let location;
      if (detected && detected.lat && detected.lon) {
        console.log(`✅ Detected location: ${formatLocation(detected)}`);

        const useDetected = await confirm({
          message: "Use this location?",
          default: true,
        });

        if (useDetected) {
          location = await confirmLocation(detected);
        }
      }

      if (!location || !location.lat || !location.lon) {
        console.log("\nPlease enter your location coordinates:");
        const lat = await input({
          message: "Latitude:",
          default: config.location?.lat ? String(config.location.lat) : "",
          validate: (value) => {
            const num = parseFloat(value);
            return !isNaN(num) && num >= -90 && num <= 90
              ? true
              : "Must be between -90 and 90";
          },
        });

        const lon = await input({
          message: "Longitude:",
          default: config.location?.lon ? String(config.location.lon) : "",
          validate: (value) => {
            const num = parseFloat(value);
            return !isNaN(num) && num >= -180 && num <= 180
              ? true
              : "Must be between -180 and 180";
          },
        });

        location = {
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          name: "Custom location",
        };
      }

      // Update config with location
      config = await updateConfig((draft) => {
        draft.location = location;
      });

      const captureSunrise = await confirm({
        message: "Capture at sunrise?",
        default: config.schedule?.captureSunrise !== false,
      });

      const captureSunset = await confirm({
        message: "Capture at sunset?",
        default: config.schedule?.captureSunset !== false,
      });

      const additionalCaptures = await confirm({
        message: "Add interval captures between sunrise and sunset?",
        default: false,
      });

      scheduleConfig.captureSunrise = captureSunrise;
      scheduleConfig.captureSunset = captureSunset;

      if (additionalCaptures) {
        const shotsPerHour = await input({
          message: "Captures per hour between sunrise and sunset:",
          default: "1",
          validate: (value) => {
            const num = parseInt(value, 10);
            return num >= 1 && num <= 60 ? true : "Must be between 1 and 60";
          },
        });
        scheduleConfig.interval = { shotsPerHour: parseInt(shotsPerHour, 10) };
      }
    }

    // Validate and save schedule configuration
    const validation = validateSchedule(scheduleConfig);
    if (!validation.isValid) {
      console.error(
        "❌ Schedule configuration error:",
        validation.errors.join(", "),
      );
      process.exit(1);
    }

    config = await updateConfig((draft) => {
      Object.assign(draft.schedule, scheduleConfig);
    });

    console.log(`✅ Schedule configured: ${scheduleMode} mode`);

    console.log("\n📸 Step 4: Output Configuration");
    console.log("----------------------------------------\n");

    const outputDir = await input({
      message: "Output directory:",
      default:
        config.cameras?.[0]?.snapshotDir || path.join(__dirname, "snapshots"),
    });

    const timelapseDir = path.join(path.dirname(outputDir), "timelapses");

    await fs.mkdir(timelapseDir, { recursive: true }).catch(() => {});

    await fs.mkdir(outputDir, { recursive: true });
    console.log(`✅ Output directory created/verified: ${outputDir}`);

    config = await updateConfig((draft) => {
      if (!draft.cameras || draft.cameras.length === 0) {
        draft.cameras = [
          {
            id: selectedCamera.id,
            name: selectedCamera.name || selectedCamera.displayName,
            snapshotDir: outputDir,
            timelapseDir,
            video: {
              fps: draft.videoDefaults.fps,
              quality: draft.videoDefaults.quality,
            },
          },
        ];
      } else {
        draft.cameras[0].snapshotDir = outputDir;
        draft.cameras[0].timelapseDir = timelapseDir;
      }
    });

    const fps = 10;
    const videoQuality = 1;

    config = await updateConfig((draft) => {
      draft.videoDefaults.fps = fps;
      draft.videoDefaults.quality = videoQuality;
      if (draft.cameras?.[0]) {
        draft.cameras[0].video = {
          fps,
          quality: videoQuality,
        };
      }
    });

    console.log("\n✅ Configuration saved to lawn.config.json");

    if (!skipCron) {
      console.log("\n⏰ Step 5: Cron Job Setup");
      console.log("----------------------------------------\n");

      const setupCron = await confirm({
        message: "Would you like to set up automatic captures?",
        default: true,
      });

      if (setupCron) {
        // Determine cron schedule based on mode
        let cronTime;
        if (config.schedule.mode === "fixed-time") {
          // For fixed times, run at those specific times
          // For simplicity, we'll use the first time if multiple are configured
          const firstTime = config.schedule.fixedTimes[0];
          const [hour, minute] = firstTime.split(":");
          cronTime = `${minute} ${hour} * * *`;
        } else {
          // For interval and sunrise/sunset modes, run every 15 minutes
          // The capture script will check if a capture is actually due
          cronTime = "*/15 * * * *";
        }

        const nodePath = process.execPath;
        const scriptPath = path.join(__dirname, "capture-and-timelapse.js");
        const logPath = path.join(outputDir, "lawn-lapse.log");

        // Include PATH for homebrew and common binary locations
        const pathEnv = "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
        const cronCommand = `${cronTime} ${pathEnv} ${nodePath} ${scriptPath} >> ${logPath} 2>&1`;

        try {
          let existingCron = "";
          try {
            existingCron = execSync("crontab -l 2>/dev/null", {
              encoding: "utf8",
            });
          } catch {
            existingCron = "";
          }

          const filteredCron = existingCron
            .split("\n")
            .filter(
              (line) =>
                !line.includes("capture-and-timelapse.js") &&
                !line.includes("lawn-lapse") &&
                !line.includes("lawn.js") &&
                !line.includes("daily-noon-update.js"),
            )
            .join("\n");

          const newCron = filteredCron.trim() + "\n" + cronCommand + "\n";

          const child = spawn("crontab", ["-"], {
            stdio: ["pipe", "inherit", "inherit"],
          });
          child.stdin.write(newCron);
          child.stdin.end();

          await new Promise((resolve, reject) => {
            child.on("exit", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`crontab exited with code ${code}`));
            });
            child.on("error", reject);
          });

          if (config.schedule.mode === "fixed-time") {
            console.log(
              `✅ Cron job installed to run at ${config.schedule.fixedTimes.join(", ")}`,
            );
          } else if (config.schedule.mode === "interval") {
            console.log(
              `✅ Cron job installed to check for captures every 15 minutes`,
            );
            console.log(
              `   Capturing ${config.schedule.interval.shotsPerHour} times per hour between ${config.schedule.window.startHour} and ${config.schedule.window.endHour}`,
            );
          } else if (config.schedule.mode === "sunrise-sunset") {
            console.log(
              `✅ Cron job installed to check for sunrise/sunset captures every 15 minutes`,
            );
          }
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

  const config = await loadConfig();
  const primaryCamera = config.cameras?.[0];
  const snapshotTime = config.schedule?.fixedTimes?.[0] || "12:00";
  const [captureHour, captureMinute] = snapshotTime
    .split(":")
    .map((n) => parseInt(n, 10));
  const timeStr = `${String(captureHour).padStart(2, "0")}${String(captureMinute).padStart(2, "0")}`;
  const snapshotDir =
    primaryCamera?.snapshotDir || path.join(__dirname, "snapshots");
  const timelapseDir =
    primaryCamera?.timelapseDir ||
    path.join(path.dirname(snapshotDir), "timelapses");

  try {
    const files = await fs.readdir(snapshotDir);
    const jpgFiles = files
      .filter((f) => f.endsWith(".jpg") && f.includes(`_${timeStr}.jpg`))
      .sort();

    if (jpgFiles.length > 0) {
      const firstDate = jpgFiles[0].split("_")[0];
      const lastDate = jpgFiles[jpgFiles.length - 1].split("_")[0];

      console.log("\n📸 Snapshots:");
      console.log(`  Total: ${jpgFiles.length} ${snapshotTime} snapshots`);
      console.log(`  Range: ${firstDate} to ${lastDate}`);
      console.log(`  Days: ${jpgFiles.length} days of footage`);

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
        if (gaps.length > 3) {
          console.log(`     ... and ${gaps.length - 3} more`);
        }
      } else {
        console.log("  ✓ No gaps in sequence");
      }
    } else {
      console.log("\n📸 Snapshots: No snapshots found");
    }
  } catch {
    console.log("\n📸 Snapshots: Directory not found");
  }

  console.log("\n🎬 Time-lapses:");
  try {
    const files = await fs.readdir(timelapseDir);
    const timelapses = files.filter(
      (f) => f.startsWith("timelapse") && f.endsWith(".mp4"),
    );

    if (timelapses.length > 0) {
      const timelapseStats = await Promise.all(
        timelapses.map(async (file) => {
          const stats = await fs.stat(path.join(timelapseDir, file));
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

      const latest = timelapseStats[0].file;
      const match = latest.match(
        /_(\d{2}h\d{2})_(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/,
      );
      if (match) {
        const [, , startDate, endDate] = match;
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

  console.log("\n⏰ Cron Job:");
  try {
    const { execSync } = await import("child_process");
    const crontab = execSync('crontab -l 2>/dev/null || echo ""', {
      encoding: "utf-8",
    });
    const cronLine = crontab
      .split("\n")
      .find((line) => line.includes("lawn-lapse") || line.includes("lawn.js"));

    if (cronLine) {
      if (!cronLine.startsWith("#")) {
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

  console.log("\n🔐 Authentication:");
  if (config.unifi?.username && config.unifi?.password) {
    console.log("  ✓ Credentials configured");
    console.log(`  Username: ${config.unifi.username}`);
  } else {
    console.log("  ✗ Missing credentials");
    console.log("  Run: lawn-lapse to configure");
  }

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
    } else {
      console.log("  ✗ No snapshots captured yet");
    }
  } catch {
    console.log("  ✗ Snapshot directory unavailable");
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
    if (command === "status") {
      await runStatus();
      return;
    }

    if (command === "cron") {
      console.log("🔄 Re-running cron setup...\n");
      await runSetup(false);
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
Subsequent runs will capture snapshots and update the time-lapse video.
`);
      return;
    }

    const configExists = await hasConfig();
    let config = await loadConfig();

    const missingFields = [];
    if (!config.unifi?.host) missingFields.push("UniFi host");
    if (!config.unifi?.username) missingFields.push("UniFi username");
    if (!config.unifi?.password) missingFields.push("UniFi password");
    if (!config.cameras?.[0]?.id) missingFields.push("Camera selection");
    if (!config.schedule?.fixedTimes?.length)
      missingFields.push("Capture time");

    if (!config.cameras?.[0]?.snapshotDir) {
      missingFields.push("Snapshot directory");
    }

    if (!configExists || missingFields.length > 0) {
      if (missingFields.length > 0 && configExists) {
        console.log("⚠️  Configuration incomplete:");
        missingFields.forEach((field) => console.log(`  - ${field}`));
        console.log("\nStarting guided setup...\n");
      }

      await runSetup();
      console.log("\n📸 Running initial capture...\n");
      await runCapture();
      return;
    }

    if (!isCronInstalled()) {
      console.log(
        '⚠️  Warning: Cron job is not installed. Run "lawn cron" to set up automatic captures.\n',
      );
    }

    config = await loadConfig();
    await runCapture();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Only run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export functions for programmatic use
export { runSetup, runCapture, runStatus };
