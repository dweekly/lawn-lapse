import fs from "fs/promises";
import path from "path";
import os from "os";

function getBaseDir() {
  const envDir = process.env.LAWN_LAPSE_CONFIG_DIR;
  if (envDir) return path.resolve(envDir);

  // Use ~/lawn-lapse as the default base directory
  return path.join(os.homedir(), "lawn-lapse");
}

function getConfigPath() {
  return path.join(getBaseDir(), "lawn.config.json");
}

function getLegacyEnvPath() {
  return path.join(getBaseDir(), ".env.local");
}

function getLegacyBackupPath() {
  return path.join(getBaseDir(), ".env.local.bak");
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function createDefaultConfig() {
  return {
    version: 2,
    schedule: {
      timezone: detectTimezone(),
      mode: "fixed-time",
      fixedTimes: ["12:00"],
      interval: {
        shotsPerHour: 1,
      },
      window: {
        startHour: "00:00",
        endHour: "23:59",
      },
      sunriseOffset: 0,
      sunsetOffset: 0,
      captureSunrise: true,
      captureSunset: true,
    },
    location: {
      lat: null,
      lon: null,
      name: null,
    },
    unifi: {
      host: "192.168.1.1",
      username: "admin",
      password: "",
    },
    cameras: [],
    videoDefaults: {
      fps: 24,
      quality: 1,
      interpolate: true,
    },
    notifications: {
      frequency: "never",
    },
    history: {
      maxDays: null,
      stopAfterConsecutiveNoData: 7,
    },
  };
}

function applyCameraDefaults(camera) {
  const baseDir = getBaseDir();
  const snapshotDir = camera.snapshotDir || path.join(baseDir, "snapshots");
  const candidateTimelapseDir = camera.timelapseDir;
  const timelapseDir =
    candidateTimelapseDir && candidateTimelapseDir !== snapshotDir
      ? candidateTimelapseDir
      : path.join(path.dirname(snapshotDir), "videos");

  return {
    id: camera.id || "",
    name: camera.name || "",
    snapshotDir,
    timelapseDir,
    video: {
      fps: camera.video?.fps,
      quality: camera.video?.quality,
      interpolate: camera.video?.interpolate,
    },
  };
}

function applyDefaults(rawConfig = {}) {
  const defaults = createDefaultConfig();
  const schedule = {
    ...defaults.schedule,
    ...(rawConfig.schedule || {}),
    interval: {
      ...defaults.schedule.interval,
      ...(rawConfig.schedule?.interval || {}),
    },
    window: {
      ...defaults.schedule.window,
      ...(rawConfig.schedule?.window || {}),
    },
    fixedTimes:
      rawConfig.schedule?.fixedTimes?.length > 0
        ? rawConfig.schedule.fixedTimes
        : defaults.schedule.fixedTimes,
  };

  const location = {
    ...defaults.location,
    ...(rawConfig.location || {}),
  };

  const unifi = {
    ...defaults.unifi,
    ...(rawConfig.unifi || {}),
  };

  const videoDefaults = {
    ...defaults.videoDefaults,
    ...(rawConfig.videoDefaults || {}),
  };

  const notifications = {
    ...defaults.notifications,
    ...(rawConfig.notifications || {}),
  };

  const history = {
    ...defaults.history,
    ...(rawConfig.history || {}),
  };

  const cameras = Array.isArray(rawConfig.cameras)
    ? rawConfig.cameras.map((camera) => {
        const withDefaults = applyCameraDefaults(camera);
        return {
          ...withDefaults,
          video: {
            fps: withDefaults.video.fps ?? videoDefaults.fps,
            quality: withDefaults.video.quality ?? videoDefaults.quality,
            interpolate:
              withDefaults.video.interpolate ?? videoDefaults.interpolate,
          },
        };
      })
    : [];

  return {
    version: rawConfig.version || defaults.version,
    schedule,
    location,
    unifi,
    cameras,
    videoDefaults,
    notifications,
    history,
  };
}

async function backupLegacyEnv(legacyPath) {
  try {
    const backupPath = getLegacyBackupPath();
    await fs.rename(legacyPath, backupPath);
    console.log(
      `⚙️  Migrated legacy configuration: moved .env.local to ${path.basename(backupPath)}`,
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("⚠️  Unable to move legacy .env.local:", error.message);
    }
  }
}

function parseLegacyEnv(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [key, ...valueParts] = line.split("=");
    if (!key || valueParts.length === 0) continue;
    result[key.trim()] = valueParts.join("=").trim();
  }
  return result;
}

async function migrateLegacyEnv() {
  try {
    const legacyPath = getLegacyEnvPath();
    const envContent = await fs.readFile(legacyPath, "utf8");
    const legacyEnv = parseLegacyEnv(envContent);
    const defaults = createDefaultConfig();

    const schedule = {
      ...defaults.schedule,
      fixedTimes: [legacyEnv.SNAPSHOT_TIME || defaults.schedule.fixedTimes[0]],
    };

    const cameras = [];
    if (legacyEnv.CAMERA_ID || legacyEnv.OUTPUT_DIR || legacyEnv.CAMERA_NAME) {
      const legacySnapshotDir = legacyEnv.OUTPUT_DIR;
      const legacyTimelapseDir = legacySnapshotDir
        ? path.join(path.dirname(legacySnapshotDir), "timelapses")
        : undefined;
      cameras.push(
        applyCameraDefaults({
          id: legacyEnv.CAMERA_ID || "",
          name: legacyEnv.CAMERA_NAME || "",
          snapshotDir: legacySnapshotDir,
          timelapseDir: legacyTimelapseDir,
          video: {
            fps: legacyEnv.VIDEO_FPS ? Number(legacyEnv.VIDEO_FPS) : undefined,
            quality: legacyEnv.VIDEO_QUALITY
              ? Number(legacyEnv.VIDEO_QUALITY)
              : undefined,
          },
        }),
      );
    }

    const config = applyDefaults({
      schedule,
      unifi: {
        host: legacyEnv.UNIFI_HOST || defaults.unifi.host,
        username: legacyEnv.UNIFI_USERNAME || defaults.unifi.username,
        password: legacyEnv.UNIFI_PASSWORD || defaults.unifi.password,
      },
      cameras,
      history: defaults.history,
    });

    await saveConfig(config);
    await backupLegacyEnv(legacyPath);
    return config;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function loadConfigIfExists() {
  const configPath = getConfigPath();
  try {
    const fileContent = await fs.readFile(configPath, "utf8");
    return applyDefaults(JSON.parse(fileContent));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    // Try legacy migration
    const migrated = await migrateLegacyEnv();
    if (migrated) {
      return migrated;
    }

    // No config exists
    return null;
  }
}

async function loadConfig() {
  const config = await loadConfigIfExists();
  if (config) {
    return config;
  }

  // Create and save default config
  const defaults = applyDefaults(createDefaultConfig());
  await saveConfig(defaults);
  return defaults;
}

async function saveConfig(config) {
  const baseDir = getBaseDir();
  const configPath = getConfigPath();

  // Ensure base directory exists
  await fs.mkdir(baseDir, { recursive: true });

  const serialized = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, `${serialized}\n`);
}

async function updateConfig(mutator) {
  const config = await loadConfig();
  const clone = structuredClone(config);
  const updated = mutator ? mutator(clone) || clone : clone;
  await saveConfig(updated);
  return updated;
}

export {
  loadConfig,
  loadConfigIfExists,
  saveConfig,
  updateConfig,
  getConfigPath,
  getLegacyEnvPath,
  getBaseDir,
  createDefaultConfig,
  applyDefaults,
};
