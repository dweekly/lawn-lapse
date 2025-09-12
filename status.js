#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkStatus() {
  console.log('🎥 Lawn Lapse Status Report');
  console.log('='.repeat(60));

  // Check snapshots
  const snapshotDir = path.join(__dirname, 'snapshots');
  try {
    const files = await fs.readdir(snapshotDir);
    const jpgFiles = files.filter((f) => f.endsWith('_1200.jpg')).sort();

    if (jpgFiles.length > 0) {
      const firstDate = jpgFiles[0].split('_')[0];
      const lastDate = jpgFiles[jpgFiles.length - 1].split('_')[0];

      console.log('\n📸 Snapshots:');
      console.log(`  Total: ${jpgFiles.length} noon snapshots`);
      console.log(`  Range: ${firstDate} to ${lastDate}`);
      console.log(`  Days: ${Math.floor(jpgFiles.length)} days of footage`);

      // Check for gaps
      const dates = jpgFiles.map((f) => f.split('_')[0]);
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const curr = new Date(dates[i]);
        const prev = new Date(dates[i - 1]);
        const diffDays = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          gaps.push(`${dates[i - 1]} to ${dates[i]} (${diffDays - 1} days missing)`);
        }
      }

      if (gaps.length > 0) {
        console.log(`  ⚠️  Gaps found: ${gaps.length}`);
        gaps.slice(0, 3).forEach((gap) => console.log(`     - ${gap}`));
        if (gaps.length > 3) console.log(`     ... and ${gaps.length - 3} more`);
      } else {
        console.log('  ✓ No gaps in sequence');
      }
    } else {
      console.log('\n📸 Snapshots: No snapshots found');
    }
  } catch {
    console.log('\n📸 Snapshots: Error reading directory');
  }

  // Check time-lapses
  console.log('\n🎬 Time-lapses:');
  try {
    const files = await fs.readdir(__dirname);
    const timelapses = files.filter((f) => f.startsWith('timelapse') && f.endsWith('.mp4'));

    if (timelapses.length > 0) {
      // Sort by modification time
      const timelapseStats = await Promise.all(
        timelapses.map(async (file) => {
          const stats = await fs.stat(path.join(__dirname, file));
          return { file, mtime: stats.mtime, size: stats.size };
        }),
      );

      timelapseStats.sort((a, b) => b.mtime - a.mtime);

      console.log(`  Found: ${timelapses.length} videos`);
      console.log('  Latest:');
      timelapseStats.slice(0, 3).forEach((t) => {
        const sizeMB = (t.size / 1024 / 1024).toFixed(1);
        const date = t.mtime.toLocaleDateString();
        console.log(`    - ${t.file} (${sizeMB}MB, ${date})`);
      });
    } else {
      console.log('  No time-lapse videos found');
    }
  } catch {
    console.log('  Error checking time-lapses');
  }

  // Check cron job
  console.log('\n⏰ Cron Job:');
  try {
    const crontab = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
    if (crontab.includes('capture-and-timelapse.js')) {
      crontab.split('\n').find((line) => line.includes('capture-and-timelapse.js'));
      console.log('  ✓ Active: Cron job is configured');

      // Check last run from log
      const logPath = path.join(__dirname, 'logs', 'daily-update.log');
      try {
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lines = logContent.trim().split('\n');
        const lastRun = lines.reverse().find((line) => line.includes('Daily update complete'));
        if (lastRun) {
          const match = lastRun.match(/\[([\d\-T:.Z]+)\]/);
          if (match) {
            const lastRunDate = new Date(match[1]);
            const hoursAgo = Math.floor((Date.now() - lastRunDate) / (1000 * 60 * 60));
            console.log(`  Last run: ${lastRunDate.toLocaleString()} (${hoursAgo} hours ago)`);
          }
        }
      } catch {
        console.log('  Last run: No log found yet');
      }
    } else {
      console.log('  ✗ Not configured');
      console.log('  Run: ./setup-daily-cron.sh to set up automatic daily capture');
    }
  } catch {
    console.log('  Unable to check cron status');
  }

  // Check authentication
  console.log('\n🔐 Authentication:');
  const envPath = path.join(__dirname, '.env.local');
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const hasUsername = envContent.includes('UNIFI_USERNAME=');
    const hasPassword = envContent.includes('UNIFI_PASSWORD=');
    
    if (hasUsername && hasPassword) {
      console.log('  ✓ Credentials configured');
      console.log('  Using username/password authentication');
    } else {
      console.log('  ✗ Missing credentials');
      console.log('  Run: node setup.js to configure');
    }
  } catch {
    console.log('  ✗ No .env.local file found');
    console.log('  Run: node setup.js to configure');
  }

  // Quick summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');

  const snapshotCount = await fs
    .readdir(snapshotDir)
    .then((files) => files.filter((f) => f.endsWith('_1200.jpg')).length)
    .catch(() => 0);

  if (snapshotCount > 0) {
    console.log(`  ✓ System operational with ${snapshotCount} days of footage`);
    console.log('  💡 Tip: Run "npm run capture" to update snapshots and create video');
  } else {
    console.log('  ⚠️  No snapshots captured yet');
    console.log('  💡 Tip: Run "npm run capture" to start capturing');
  }
}

checkStatus().catch(console.error);
