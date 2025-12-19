import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, readFile, access, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  loadConfig,
  loadConfigIfExists,
  updateConfig,
  applyDefaults,
  createDefaultConfig,
  migrateLegacySnapshots,
  detectLegacySnapshots,
  getBaseDir,
  getConfigPath,
} from "../config.js";

const TEMP_PREFIX = "lawn-config-";

async function withTempConfigDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
  const previous = process.env.LAWN_LAPSE_CONFIG_DIR;
  process.env.LAWN_LAPSE_CONFIG_DIR = dir;

  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) {
      delete process.env.LAWN_LAPSE_CONFIG_DIR;
    } else {
      process.env.LAWN_LAPSE_CONFIG_DIR = previous;
    }
  }
}

test("loadConfig creates default file with baseline schema", async () => {
  await withTempConfigDir(async (dir) => {
    const config = await loadConfig();
    assert.equal(config.version, 2);
    assert.ok(config.schedule.fixedTimes.length > 0);
    assert.equal(config.cameras.length, 0);
    assert.ok(config.location);
    assert.equal(config.schedule.mode, "fixed-time");

    const configPath = path.join(dir, "lawn.config.json");
    const raw = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(raw.version, 2);
    assert.ok(Array.isArray(raw.schedule.fixedTimes));
  });
});

test("loadConfig migrates legacy .env.local to structured config", async () => {
  await withTempConfigDir(async (dir) => {
    const legacyEnv = `UNIFI_HOST=192.168.1.2\nUNIFI_USERNAME=legacy\nUNIFI_PASSWORD=secret\nCAMERA_ID=abc123\nCAMERA_NAME=Front Yard\nSNAPSHOT_TIME=06:30\nOUTPUT_DIR=${dir}/legacy-snaps\nVIDEO_FPS=12\nVIDEO_QUALITY=2\n`;

    await writeFile(path.join(dir, ".env.local"), legacyEnv, "utf8");

    const config = await loadConfig();
    assert.equal(config.unifi.host, "192.168.1.2");
    assert.equal(config.unifi.username, "legacy");
    assert.equal(config.unifi.password, "secret");
    assert.equal(config.schedule.fixedTimes[0], "06:30");
    assert.equal(config.cameras.length, 1);
    assert.equal(config.cameras[0].id, "abc123");
    assert.equal(config.cameras[0].name, "Front Yard");
    assert.equal(config.cameras[0].snapshotDir, `${dir}/legacy-snaps`);
    assert.equal(config.cameras[0].video.fps, 12);
    assert.equal(config.cameras[0].video.quality, 2);

    await access(path.join(dir, ".env.local.bak"));
  });
});

// ============================================
// loadConfigIfExists tests
// ============================================

test("loadConfigIfExists returns null when no config exists", async () => {
  await withTempConfigDir(async () => {
    const config = await loadConfigIfExists();
    assert.equal(config, null);
  });
});

test("loadConfigIfExists loads existing config", async () => {
  await withTempConfigDir(async (dir) => {
    const testConfig = {
      version: 2,
      unifi: { host: "test.local" },
      schedule: { mode: "fixed-time", fixedTimes: ["14:00"] },
    };
    await writeFile(
      path.join(dir, "lawn.config.json"),
      JSON.stringify(testConfig),
    );

    const config = await loadConfigIfExists();
    assert.equal(config.unifi.host, "test.local");
    assert.equal(config.schedule.fixedTimes[0], "14:00");
  });
});

// ============================================
// updateConfig tests
// ============================================

test("updateConfig modifies and saves config", async () => {
  await withTempConfigDir(async (dir) => {
    // First create initial config
    await loadConfig();

    // Update it
    const updated = await updateConfig((config) => {
      config.unifi.host = "updated.local";
      return config;
    });

    assert.equal(updated.unifi.host, "updated.local");

    // Verify persisted
    const raw = JSON.parse(
      await readFile(path.join(dir, "lawn.config.json"), "utf8"),
    );
    assert.equal(raw.unifi.host, "updated.local");
  });
});

test("updateConfig works without mutator", async () => {
  await withTempConfigDir(async () => {
    await loadConfig();
    const updated = await updateConfig();
    assert.ok(updated.version);
  });
});

// ============================================
// applyDefaults tests
// ============================================

test("applyDefaults handles empty config", () => {
  const config = applyDefaults({});
  assert.equal(config.version, 2);
  assert.ok(config.schedule.fixedTimes.length > 0);
  assert.equal(config.cameras.length, 0);
});

test("applyDefaults preserves custom values", () => {
  const config = applyDefaults({
    unifi: { host: "custom.local", username: "custom" },
    schedule: { fixedTimes: ["08:00", "16:00"] },
  });

  assert.equal(config.unifi.host, "custom.local");
  assert.equal(config.unifi.username, "custom");
  assert.deepEqual(config.schedule.fixedTimes, ["08:00", "16:00"]);
});

test("applyDefaults applies video defaults to cameras", () => {
  const config = applyDefaults({
    cameras: [{ id: "cam1", name: "Test Cam" }],
    videoDefaults: { fps: 30, quality: 2 },
  });

  assert.equal(config.cameras[0].video.fps, 30);
  assert.equal(config.cameras[0].video.quality, 2);
});

test("applyDefaults camera-specific video overrides defaults", () => {
  const config = applyDefaults({
    cameras: [{ id: "cam1", name: "Test", video: { fps: 60 } }],
    videoDefaults: { fps: 24, quality: 1 },
  });

  assert.equal(config.cameras[0].video.fps, 60);
  assert.equal(config.cameras[0].video.quality, 1);
});

// ============================================
// createDefaultConfig tests
// ============================================

test("createDefaultConfig returns valid structure", () => {
  const config = createDefaultConfig();

  assert.equal(config.version, 2);
  assert.ok(config.schedule);
  assert.ok(config.unifi);
  assert.ok(config.videoDefaults);
  assert.equal(config.schedule.mode, "fixed-time");
  assert.deepEqual(config.schedule.fixedTimes, ["12:00"]);
});

// ============================================
// migrateLegacySnapshots tests
// ============================================

test("migrateLegacySnapshots returns error for missing camera", async () => {
  await withTempConfigDir(async (dir) => {
    const config = { cameras: [] };
    const result = await migrateLegacySnapshots(dir, "nonexistent", config);

    assert.equal(result.migrated, 0);
    assert.ok(result.errors.some((e) => e.includes("not found")));
  });
});

test("migrateLegacySnapshots returns error for missing snapshotDir", async () => {
  await withTempConfigDir(async (dir) => {
    const config = {
      cameras: [{ id: "cam1", name: "Test", snapshotDir: null }],
    };
    const result = await migrateLegacySnapshots(dir, "cam1", config);

    assert.equal(result.migrated, 0);
    assert.ok(result.errors.some((e) => e.includes("No snapshot directory")));
  });
});

test("migrateLegacySnapshots handles nonexistent legacy dir", async () => {
  await withTempConfigDir(async (dir) => {
    const targetDir = path.join(dir, "target");
    const config = {
      cameras: [{ id: "cam1", name: "Test", snapshotDir: targetDir }],
    };

    const result = await migrateLegacySnapshots(
      path.join(dir, "nonexistent"),
      "cam1",
      config,
    );

    assert.equal(result.migrated, 0);
    assert.equal(result.errors.length, 0);
  });
});

test("migrateLegacySnapshots copies files to target", async () => {
  await withTempConfigDir(async (dir) => {
    const legacyDir = path.join(dir, "legacy");
    const targetDir = path.join(dir, "target");

    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "2024-01-01_1200.jpg"), "test");
    await writeFile(path.join(legacyDir, "2024-01-02_1200.jpg"), "test2");

    const config = {
      cameras: [{ id: "cam1", name: "Test", snapshotDir: targetDir }],
    };

    const result = await migrateLegacySnapshots(legacyDir, "cam1", config);

    assert.equal(result.migrated, 2);
    assert.equal(result.skipped, 0);

    // Verify files exist in target
    await access(path.join(targetDir, "2024-01-01_1200.jpg"));
    await access(path.join(targetDir, "2024-01-02_1200.jpg"));
  });
});

test("migrateLegacySnapshots skips existing files", async () => {
  await withTempConfigDir(async (dir) => {
    const legacyDir = path.join(dir, "legacy");
    const targetDir = path.join(dir, "target");

    await mkdir(legacyDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });

    await writeFile(path.join(legacyDir, "2024-01-01_1200.jpg"), "old");
    await writeFile(path.join(targetDir, "2024-01-01_1200.jpg"), "existing");

    const config = {
      cameras: [{ id: "cam1", name: "Test", snapshotDir: targetDir }],
    };

    const result = await migrateLegacySnapshots(legacyDir, "cam1", config);

    assert.equal(result.migrated, 0);
    assert.equal(result.skipped, 1);

    // Verify target file unchanged
    const content = await readFile(
      path.join(targetDir, "2024-01-01_1200.jpg"),
      "utf8",
    );
    assert.equal(content, "existing");
  });
});

test("migrateLegacySnapshots ignores non-jpg files", async () => {
  await withTempConfigDir(async (dir) => {
    const legacyDir = path.join(dir, "legacy");
    const targetDir = path.join(dir, "target");

    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "readme.txt"), "text");
    await writeFile(path.join(legacyDir, "video.mp4"), "video");

    const config = {
      cameras: [{ id: "cam1", name: "Test", snapshotDir: targetDir }],
    };

    const result = await migrateLegacySnapshots(legacyDir, "cam1", config);

    assert.equal(result.migrated, 0);
    assert.equal(result.skipped, 0);
  });
});

// ============================================
// detectLegacySnapshots tests
// ============================================

test("detectLegacySnapshots counts jpg files", async () => {
  await withTempConfigDir(async (dir) => {
    const legacyDir = path.join(dir, "legacy");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "snap1.jpg"), "");
    await writeFile(path.join(legacyDir, "snap2.jpg"), "");
    await writeFile(path.join(legacyDir, "other.txt"), "");

    const count = await detectLegacySnapshots(legacyDir);
    assert.equal(count, 2);
  });
});

test("detectLegacySnapshots returns 0 for nonexistent dir", async () => {
  const count = await detectLegacySnapshots("/nonexistent/path");
  assert.equal(count, 0);
});

test("detectLegacySnapshots returns 0 for empty dir", async () => {
  await withTempConfigDir(async (dir) => {
    const emptyDir = path.join(dir, "empty");
    await mkdir(emptyDir, { recursive: true });

    const count = await detectLegacySnapshots(emptyDir);
    assert.equal(count, 0);
  });
});

// ============================================
// getBaseDir and getConfigPath tests
// ============================================

test("getBaseDir uses LAWN_LAPSE_CONFIG_DIR when set", async () => {
  await withTempConfigDir(async (dir) => {
    const baseDir = getBaseDir();
    assert.equal(baseDir, dir);
  });
});

test("getConfigPath returns correct path", async () => {
  await withTempConfigDir(async (dir) => {
    const configPath = getConfigPath();
    assert.equal(configPath, path.join(dir, "lawn.config.json"));
  });
});
