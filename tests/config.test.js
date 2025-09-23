import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config.js";

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
