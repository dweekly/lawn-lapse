#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import fetch from 'node-fetch';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function testCookies(host, token, ubicAuth) {
  try {
    const baseUrl = `https://${host.replace(/^https?:\/\//, '')}`;
    const cookies = `TOKEN=${token}; UBIC_AUTH=${ubicAuth}`;
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Extract CSRF token
    let csrfToken = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      csrfToken = payload.csrfToken;

      // Check expiration
      const expiry = new Date(payload.exp * 1000);
      const daysLeft = Math.floor((expiry - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`  Cookie expires: ${expiry.toLocaleDateString()} (${daysLeft} days remaining)`);
    } catch {}

    const response = await fetch(`${baseUrl}/proxy/protect/api/cameras`, {
      headers: {
        Cookie: cookies,
        'X-CSRF-Token': csrfToken || '',
      },
      agent,
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    throw new Error(`Cookie validation failed: ${error.message}`);
  }
}

async function main() {
  console.log('🔄 Update UniFi Protect Cookies');
  console.log('='.repeat(50));

  // Load existing configuration
  const envPath = path.join(__dirname, '.env.local');
  const config = {};

  try {
    const envContent = await fs.readFile(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        config[key.trim()] = valueParts.join('=').trim();
      }
    });
    console.log('✓ Found existing configuration');
  } catch {
    console.error('✗ No configuration found. Please run: node setup.js');
    process.exit(1);
  }

  // Get new cookies
  console.log('\nTo get your new cookies:');
  console.log('1. Open UniFi Protect in your browser');
  console.log('2. Log in to your account');
  console.log('3. Open Developer Tools (F12 or Cmd+Option+I)');
  console.log('4. Go to Application/Storage → Cookies');
  console.log('5. Find the cookie for your UniFi host');
  console.log('6. Look for TOKEN and UBIC_AUTH cookies\n');

  const token = await prompt('Enter new TOKEN cookie value: ');
  const ubicAuth = await prompt('Enter new UBIC_AUTH cookie value: ');

  // Test the new cookies
  console.log('\nTesting new cookies...');
  try {
    await testCookies(config.UNIFI_HOST, token, ubicAuth);
    console.log('✓ New cookies are valid!');
  } catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('\nPlease check your cookies and try again.');
    rl.close();
    process.exit(1);
  }

  // Update configuration
  config.UNIFI_TOKEN = token;
  config.UBIC_AUTH = ubicAuth;

  // Write updated configuration
  const configLines = [];
  configLines.push('# UniFi Protect Configuration');
  for (const [key, value] of Object.entries(config)) {
    if (value) configLines.push(`${key}=${value}`);
  }

  await fs.writeFile(envPath, configLines.join('\n') + '\n');
  console.log('\n✓ Configuration updated successfully!');

  // Test capture
  const testCapture = await prompt('\nTest capture now? (y/n): ');
  if (testCapture.toLowerCase() === 'y') {
    console.log('\nRunning test capture...');
    const { execSync } = await import('child_process');
    try {
      execSync(`node ${path.join(__dirname, 'capture-and-timelapse.js')}`, {
        stdio: 'inherit',
        cwd: __dirname,
      });
    } catch (error) {
      console.error('Test capture failed:', error.message);
    }
  }

  rl.close();
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
