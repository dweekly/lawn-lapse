#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import https from 'https';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function testConnection(host, token, ubicAuth) {
  try {
    const baseUrl = `https://${host.replace(/^https?:\/\//, '')}`;
    const cookies = `TOKEN=${token}; UBIC_AUTH=${ubicAuth}`;
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    // Extract CSRF token from JWT
    let csrfToken = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      csrfToken = payload.csrfToken;
    } catch (e) {}
    
    const response = await fetch(`${baseUrl}/proxy/protect/api/cameras`, {
      headers: {
        'Cookie': cookies,
        'X-CSRF-Token': csrfToken || ''
      },
      agent,
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status}`);
    }
    
    const cameras = await response.json();
    return cameras;
  } catch (error) {
    throw new Error(`Connection test failed: ${error.message}`);
  }
}

async function main() {
  console.log('🎥 UniFi Protect Lawn Lapse Setup');
  console.log('=' .repeat(50));
  console.log();
  
  // Step 1: UniFi Protect Host
  console.log('Step 1: UniFi Protect Connection');
  console.log('-'.repeat(30));
  const host = await prompt('Enter your UniFi Protect host/IP (e.g., 192.168.1.1): ');
  
  // Step 2: Authentication Cookies
  console.log('\nStep 2: Authentication Cookies');
  console.log('-'.repeat(30));
  console.log('\nTo get your cookies:');
  console.log('1. Open UniFi Protect in your browser');
  console.log('2. Log in to your account');
  console.log('3. Open Developer Tools (F12 or Cmd+Option+I)');
  console.log('4. Go to Application/Storage → Cookies');
  console.log('5. Find and copy the values for TOKEN and UBIC_AUTH\n');
  
  const token = await prompt('Enter your TOKEN cookie value: ');
  const ubicAuth = await prompt('Enter your UBIC_AUTH cookie value: ');
  
  // Test connection and get cameras
  console.log('\nTesting connection...');
  let cameras;
  try {
    cameras = await testConnection(host, token, ubicAuth);
    console.log(`✓ Connected successfully! Found ${cameras.length} camera(s)\n`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('\nPlease check your credentials and try again.');
    process.exit(1);
  }
  
  // Step 3: Select Camera
  console.log('Step 3: Camera Selection');
  console.log('-'.repeat(30));
  console.log('\nAvailable cameras:');
  cameras.forEach((cam, i) => {
    console.log(`  ${i + 1}. ${cam.name} (${cam.type})`);
  });
  
  let cameraIndex;
  do {
    const selection = await prompt(`\nSelect camera (1-${cameras.length}): `);
    cameraIndex = parseInt(selection) - 1;
  } while (isNaN(cameraIndex) || cameraIndex < 0 || cameraIndex >= cameras.length);
  
  const selectedCamera = cameras[cameraIndex];
  console.log(`✓ Selected: ${selectedCamera.name}`);
  
  // Step 4: Capture Time
  console.log('\nStep 4: Daily Capture Time');
  console.log('-'.repeat(30));
  const timeInput = await prompt('Enter capture time in 24hr format (default 12:00): ');
  const captureTime = timeInput || '12:00';
  const [hour, minute] = captureTime.split(':').map(n => parseInt(n) || 0);
  
  // Calculate cron time (15 minutes after capture time)
  let cronHour = hour;
  let cronMinute = minute + 15;
  if (cronMinute >= 60) {
    cronMinute -= 60;
    cronHour = (cronHour + 1) % 24;
  }
  
  // Step 5: Output Directory
  console.log('\nStep 5: Output Directory');
  console.log('-'.repeat(30));
  const outputDir = await prompt('Snapshot directory (default ./snapshots): ') || './snapshots';
  
  // Create configuration
  const config = `# UniFi Protect Configuration
UNIFI_HOST=${host}
UNIFI_TOKEN=${token}
UBIC_AUTH=${ubicAuth}
CAMERA_ID=${selectedCamera.id}
CAMERA_NAME=${selectedCamera.name}
OUTPUT_DIR=${outputDir}
CAPTURE_HOUR=${hour}
CAPTURE_MINUTE=${minute}
`;
  
  // Save configuration
  console.log('\nSaving configuration...');
  await fs.writeFile(path.join(__dirname, '.env.local'), config);
  console.log('✓ Configuration saved to .env.local');
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`✓ Created output directory: ${outputDir}`);
  
  // Step 6: Cron Setup
  console.log('\nStep 6: Automated Daily Capture');
  console.log('-'.repeat(30));
  const setupCron = await prompt('Install cron job for daily capture? (y/n): ');
  
  if (setupCron.toLowerCase() === 'y') {
    const scriptPath = path.join(__dirname, 'capture-and-timelapse.js');
    const logPath = path.join(__dirname, 'logs', 'capture.log');
    const cronCmd = `cd ${__dirname} && $(which node) ${scriptPath} >> ${logPath} 2>&1`;
    const cronEntry = `${cronMinute} ${cronHour} * * * ${cronCmd}`;
    
    try {
      // Create logs directory
      await fs.mkdir(path.join(__dirname, 'logs'), { recursive: true });
      
      // Remove existing entry if present
      try {
        const existingCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
        const filteredCron = existingCron
          .split('\n')
          .filter(line => !line.includes('capture-and-timelapse.js'))
          .join('\n');
        execSync(`echo "${filteredCron}" | crontab -`, { encoding: 'utf8' });
      } catch (e) {}
      
      // Add new cron job
      execSync(`(crontab -l 2>/dev/null; echo "${cronEntry}") | crontab -`, { encoding: 'utf8' });
      console.log(`✓ Cron job installed to run daily at ${cronHour}:${String(cronMinute).padStart(2, '0')}`);
    } catch (error) {
      console.error('✗ Failed to install cron job automatically');
      console.log('\nTo install manually, run:');
      console.log(`crontab -e`);
      console.log(`\nThen add this line:`);
      console.log(cronEntry);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✓ Setup Complete!');
  console.log('='.repeat(50));
  console.log('\nYour configuration:');
  console.log(`  Host: ${host}`);
  console.log(`  Camera: ${selectedCamera.name}`);
  console.log(`  Capture time: ${hour}:${String(minute).padStart(2, '0')} daily`);
  console.log(`  Output: ${outputDir}`);
  
  console.log('\nUseful commands:');
  console.log('  node capture-and-timelapse.js  # Run manual capture');
  console.log('  node status.js                  # Check system status');
  console.log('  node update-cookies.js          # Update expired cookies');
  
  console.log('\n⚠️  Important: Cookies expire after ~30 days');
  console.log('Run "node update-cookies.js" when they expire.');
  
  rl.close();
}

main().catch(error => {
  console.error('Setup failed:', error);
  rl.close();
  process.exit(1);
});