#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import { input, password, select, confirm } from "@inquirer/prompts";
import { ProtectApi } from "unifi-protect";
import dotenv from "dotenv";

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

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Check if config exists
async function hasConfig() {
  try {
    await fs.access(path.join(__dirname, ".env.local"));
    return true;
  } catch {
    return false;
  }
}

// Check if cron job is installed
function isCronInstalled() {
  try {
    const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf8" });
    return crontab.includes("lawn-lapse");
  } catch {
    return false;
  }
}

// Load existing config
async function loadExistingConfig() {
  const envPath = path.join(__dirname, ".env.local");
  const config = {};

  try {
    const envContent = await fs.readFile(envPath, "utf8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      if (line && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          config[key.trim()] = valueParts.join("=").trim();
        }
      }
    }
  } catch {
    // No existing config
  }

  return config;
}

// Save config incrementally
async function saveConfig(updates) {
  const envPath = path.join(__dirname, ".env.local");
  const existingConfig = await loadExistingConfig();

  // Merge updates with existing config
  const config = { ...existingConfig, ...updates };

  // Build env file content
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

// Run setup flow
async function runSetup(skipCron = false) {
  console.log("🚀 Welcome to Lawn Lapse Setup!\n");

  // Load existing configuration
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

    // Only show Step 1 if we need credentials
    if (!host || !username || !pass) {
      console.log("📹 Step 1: UniFi Protect Configuration");
      console.log("----------------------------------------\n");
    }

    while (!authenticated) {
      // If we don't have all credentials, ask for them
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

        // Save host and username immediately
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

      // Test connection
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
        // Check if it's an authentication error
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
          console.log(""); // Add spacing before retry
        } else {
          throw authError;
        }
      }
    }

    try {
      let cameraId = existingConfig.CAMERA_ID;
      let cameraName = existingConfig.CAMERA_NAME;

      // Only fetch cameras if we don't have a camera selected
      if (!cameraId) {
        // Get cameras - using the correct method from API docs
        await protect.getBootstrap();

        console.log("🔍 Fetching camera list...");

        // Access cameras from protect.bootstrap as shown in API docs
        const cameras = protect.bootstrap?.cameras ?? [];

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

      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`✅ Output directory created/verified: ${outputDir}`);

      // Save snapshot settings
      await saveConfig({
        SNAPSHOT_TIME: snapshotTime,
        OUTPUT_DIR: outputDir,
      });

      // Step 3: Video Settings (using defaults)
      const fps = "10"; // 10 fps for time-lapse
      const videoQuality = "1"; // Best quality

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
          const [hour, minute] = snapshotTime.split(":");
          const cronTime = `${minute} ${hour} * * *`;
          const nodePath = process.execPath;
          const scriptPath = path.join(__dirname, "lawn.js");
          const logPath = path.join(outputDir, "lawn-lapse.log");

          const cronCommand = `${cronTime} cd ${__dirname} && ${nodePath} ${scriptPath} >> ${logPath} 2>&1`;

          try {
            // Get existing crontab
            let existingCron = "";
            try {
              existingCron = execSync("crontab -l 2>/dev/null", {
                encoding: "utf8",
              });
            } catch {
              // No existing crontab
            }

            // Remove any existing lawn-lapse entries
            const filteredCron = existingCron
              .split("\n")
              .filter(
                (line) =>
                  !line.includes("lawn-lapse") && !line.includes("lawn.js"),
              )
              .join("\n");

            // Add new entry
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

// Run capture and timelapse
async function runCapture() {
  return new Promise((resolve, reject) => {
    const captureScript = path.join(__dirname, "capture-and-timelapse.js");
    const child = spawn(process.execPath, [captureScript], {
      stdio: "inherit",
      env: process.env,
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

// Run status
async function runStatus() {
  return new Promise((resolve, reject) => {
    const statusScript = path.join(__dirname, "status.js");
    const child = spawn(process.execPath, [statusScript], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Status process exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

// Main execution
async function main() {
  try {
    // Handle subcommands
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
Subsequent runs will capture a snapshot and update the time-lapse video.
`);
      return;
    }

    // Check if this is first run (no config) or incomplete config
    const configExists = await hasConfig();

    if (!configExists) {
      // First run - do setup
      await runSetup();
      console.log("\n📸 Running initial capture...\n");
      await runCapture();
    } else {
      // Check if config is complete
      const config = await loadExistingConfig();
      const requiredFields = [
        "UNIFI_HOST",
        "UNIFI_USERNAME",
        "UNIFI_PASSWORD",
        "CAMERA_ID",
        "SNAPSHOT_TIME",
        "OUTPUT_DIR",
      ];
      const missingFields = requiredFields.filter((field) => !config[field]);

      if (missingFields.length > 0) {
        console.log(
          "⚠️  Configuration is incomplete. Running setup to complete it...\n",
        );
        await runSetup();
        console.log("\n📸 Running initial capture...\n");
        await runCapture();
        return;
      }
      // Config exists - run capture
      // Check if cron is installed and warn if not
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
