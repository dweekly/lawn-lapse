/**
 * @file geolocation.js
 * @description IP-based geolocation for automatic location detection
 * @author David E. Weekly
 * @license MIT
 */

// Note: Using Node.js 18+ native fetch API (no import needed)
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache file for location data
const LOCATION_CACHE_FILE = path.join(__dirname, ".location-cache.json");
const CACHE_DURATION_DAYS = 30; // Re-check location every 30 days

/**
 * Gets cached location if it exists and is fresh
 * @returns {Promise<Object|null>} Cached location or null
 */
async function getCachedLocation() {
  try {
    const data = await fs.readFile(LOCATION_CACHE_FILE, "utf8");
    const cached = JSON.parse(data);

    // Check if cache is still fresh
    const cacheAge = Date.now() - cached.timestamp;
    const maxAge = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

    if (cacheAge < maxAge) {
      return cached.location;
    }
  } catch {
    // No cache or invalid cache
  }
  return null;
}

/**
 * Saves location to cache
 * @param {Object} location - Location data to cache
 */
async function cacheLocation(location) {
  try {
    const cacheData = {
      timestamp: Date.now(),
      location,
    };
    await fs.writeFile(LOCATION_CACHE_FILE, JSON.stringify(cacheData, null, 2));
  } catch {
    // Ignore cache write errors
    console.warn("Warning: Could not cache location data");
  }
}

/**
 * Detects user's location using IP geolocation
 * Uses multiple services as fallbacks
 * @returns {Promise<Object>} Location object with lat, lon, city, country
 */
export async function detectLocation() {
  // Check cache first
  const cached = await getCachedLocation();
  if (cached) {
    console.log("Using cached location data...");
    return cached;
  }

  console.log("Detecting your location...");

  // List of IP geolocation services to try (in order)
  const services = [
    {
      name: "ipapi.co",
      url: "https://ipapi.co/json/",
      parseResponse: (data) => ({
        lat: data.latitude,
        lon: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        timezone: data.timezone,
      }),
    },
    {
      name: "ip-api.com",
      url: "http://ip-api.com/json/",
      parseResponse: (data) => ({
        lat: data.lat,
        lon: data.lon,
        city: data.city,
        region: data.regionName,
        country: data.country,
        timezone: data.timezone,
      }),
    },
    {
      name: "ipinfo.io",
      url: "https://ipinfo.io/json",
      parseResponse: (data) => {
        const [lat, lon] = data.loc
          ? data.loc.split(",").map(Number)
          : [null, null];
        return {
          lat,
          lon,
          city: data.city,
          region: data.region,
          country: data.country,
          timezone: data.timezone,
        };
      },
    },
  ];

  // Try each service until one works
  for (const service of services) {
    try {
      const response = await fetch(service.url, {
        timeout: 5000,
        headers: {
          "User-Agent": "lawn-lapse/1.0",
        },
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const location = service.parseResponse(data);

      // Validate that we got valid coordinates
      if (
        typeof location.lat === "number" &&
        typeof location.lon === "number" &&
        !isNaN(location.lat) &&
        !isNaN(location.lon)
      ) {
        // Cache the successful result
        await cacheLocation(location);
        return location;
      }
    } catch {
      // Try next service
      continue;
    }
  }

  // If all services fail, return null coordinates
  console.warn("Could not detect location automatically");
  return {
    lat: null,
    lon: null,
    city: null,
    region: null,
    country: null,
    timezone: null,
  };
}

/**
 * Prompts user to confirm or edit detected location
 * @param {Object} detectedLocation - Automatically detected location
 * @returns {Promise<Object>} Confirmed/edited location
 */
export async function confirmLocation(detectedLocation) {
  if (!detectedLocation || !detectedLocation.lat || !detectedLocation.lon) {
    return {
      lat: null,
      lon: null,
      name: "Location not set",
    };
  }

  const locationName = [
    detectedLocation.city,
    detectedLocation.region,
    detectedLocation.country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    lat: detectedLocation.lat,
    lon: detectedLocation.lon,
    name: locationName || "Unknown location",
    timezone: detectedLocation.timezone,
  };
}

/**
 * Formats location for display
 * @param {Object} location - Location object
 * @returns {string} Formatted location string
 */
export function formatLocation(location) {
  if (!location || !location.lat || !location.lon) {
    return "No location set";
  }

  const parts = [];

  if (location.name) {
    parts.push(location.name);
  }

  parts.push(`(${location.lat.toFixed(4)}°, ${location.lon.toFixed(4)}°)`);

  return parts.join(" ");
}

/**
 * Validates location coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if coordinates are valid
 */
export function isValidLocation(lat, lon) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
