/**
 * @file scheduling.js
 * @description Advanced scheduling utilities for lawn-lapse
 * Supports multiple capture modes: fixed times, intervals, sunrise/sunset
 * @author David E. Weekly
 * @license MIT
 */

import SunCalc from "suncalc";

/**
 * Generates capture slots for a given day based on schedule configuration
 * @param {Date} date - The date to generate slots for
 * @param {Object} schedule - Schedule configuration
 * @param {Object} location - Location for sunrise/sunset (lat, lon)
 * @returns {Array<Date>} Array of Date objects representing capture times
 */
export function generateDailySlots(date, schedule, location = null) {
  const timezone = schedule.timezone || "UTC";

  switch (schedule.mode) {
    case "fixed-time":
      return generateFixedTimeSlots(date, schedule.fixedTimes, timezone);

    case "interval":
      return generateIntervalSlots(
        date,
        schedule.interval,
        schedule.window,
        timezone,
      );

    case "sunrise-sunset":
      if (!location || !location.lat || !location.lon) {
        throw new Error(
          "Location (lat/lon) required for sunrise/sunset scheduling",
        );
      }
      return generateSunriseSlots(date, schedule, location, timezone);

    default:
      // Default to fixed-time mode with single noon capture
      return generateFixedTimeSlots(date, ["12:00"], timezone);
  }
}

/**
 * Generates slots for fixed time scheduling
 * @param {Date} date - The date to generate slots for
 * @param {Array<string>} times - Array of time strings (HH:MM format)
 * @param {string} timezone - Timezone identifier
 * @returns {Array<Date>} Array of Date objects
 */
function generateFixedTimeSlots(date, times, _timezone) {
  const slots = [];

  for (const time of times) {
    const [hour, minute] = time.split(":").map(Number);
    const slot = new Date(date);
    slot.setHours(hour, minute, 0, 0);
    slots.push(slot);
  }

  return slots.sort((a, b) => a - b);
}

/**
 * Generates slots based on interval within a time window
 * @param {Date} date - The date to generate slots for
 * @param {Object} interval - Interval configuration (shotsPerHour)
 * @param {Object} window - Time window (startHour, endHour)
 * @param {string} timezone - Timezone identifier
 * @returns {Array<Date>} Array of Date objects
 */
function generateIntervalSlots(date, interval, window, _timezone) {
  const slots = [];
  const shotsPerHour = interval.shotsPerHour || 1;
  const intervalMinutes = 60 / shotsPerHour;

  // Parse window times
  const [startHour, startMinute] = (window.startHour || "00:00")
    .split(":")
    .map(Number);
  const [endHour, endMinute] = (window.endHour || "23:59")
    .split(":")
    .map(Number);

  // Create start and end times for the day
  const startTime = new Date(date);
  startTime.setHours(startHour, startMinute, 0, 0);

  const endTime = new Date(date);
  endTime.setHours(endHour, endMinute, 0, 0);

  // Generate slots at intervals
  const currentTime = new Date(startTime);
  while (currentTime <= endTime) {
    slots.push(new Date(currentTime));
    currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
  }

  return slots;
}

/**
 * Generates slots based on sunrise/sunset times
 * @param {Date} date - The date to generate slots for
 * @param {Object} schedule - Schedule configuration
 * @param {Object} location - Location object with lat/lon
 * @param {string} timezone - Timezone identifier
 * @returns {Array<Date>} Array of Date objects
 */
function generateSunriseSlots(date, schedule, location, _timezone) {
  const slots = [];
  const times = SunCalc.getTimes(date, location.lat, location.lon);

  // Get sunrise and sunset times
  const sunrise = times.sunrise;
  const sunset = times.sunset;

  if (!sunrise || !sunset) {
    console.warn("Could not calculate sunrise/sunset for date:", date);
    return [];
  }

  // Configure offset from sunrise/sunset (in minutes)
  const sunriseOffset = schedule.sunriseOffset || 0;
  const sunsetOffset = schedule.sunsetOffset || 0;

  // Add sunrise capture
  if (schedule.captureSunrise !== false) {
    const sunriseSlot = new Date(sunrise);
    sunriseSlot.setMinutes(sunriseSlot.getMinutes() + sunriseOffset);
    slots.push(sunriseSlot);
  }

  // Add sunset capture
  if (schedule.captureSunset !== false) {
    const sunsetSlot = new Date(sunset);
    sunsetSlot.setMinutes(sunsetSlot.getMinutes() + sunsetOffset);
    slots.push(sunsetSlot);
  }

  // Add interval captures between sunrise and sunset if configured
  if (schedule.interval && schedule.interval.shotsPerHour > 0) {
    const intervalMinutes = 60 / schedule.interval.shotsPerHour;
    const currentTime = new Date(sunrise);
    currentTime.setMinutes(
      currentTime.getMinutes() + sunriseOffset + intervalMinutes,
    );

    const endTime = new Date(sunset);
    endTime.setMinutes(endTime.getMinutes() + sunsetOffset);

    while (currentTime < endTime) {
      slots.push(new Date(currentTime));
      currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
    }
  }

  return slots.sort((a, b) => a - b);
}

/**
 * Determines if a capture is due based on schedule and last capture time
 * @param {Object} schedule - Schedule configuration
 * @param {Date} lastCapture - Last capture timestamp
 * @param {Object} location - Location for sunrise/sunset calculations
 * @returns {boolean} True if capture is due
 */
export function isCaptureDue(schedule, lastCapture = null, location = null) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Generate slots for today
  const todaySlots = generateDailySlots(today, schedule, location);

  // Find next due slot
  for (const slot of todaySlots) {
    // Skip past slots
    if (slot <= now) continue;

    // If we have a last capture, check if this slot is after it
    if (!lastCapture || slot > lastCapture) {
      // Check if we're within capture window (5 minutes)
      const timeDiff = Math.abs(slot - now) / 1000 / 60; // minutes
      return timeDiff <= 5;
    }
  }

  return false;
}

/**
 * Gets the next scheduled capture time
 * @param {Object} schedule - Schedule configuration
 * @param {Object} location - Location for sunrise/sunset calculations
 * @returns {Date|null} Next capture time or null if none today
 */
export function getNextCaptureTime(schedule, location = null) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Check today's slots
  const todaySlots = generateDailySlots(today, schedule, location);
  for (const slot of todaySlots) {
    if (slot > now) {
      return slot;
    }
  }

  // Check tomorrow's slots
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowSlots = generateDailySlots(tomorrow, schedule, location);

  return tomorrowSlots.length > 0 ? tomorrowSlots[0] : null;
}

/**
 * Validates schedule configuration
 * @param {Object} schedule - Schedule configuration to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateSchedule(schedule) {
  const errors = [];

  if (!schedule.mode) {
    errors.push("Schedule mode is required");
  }

  if (
    schedule.mode === "fixed-time" &&
    (!schedule.fixedTimes || schedule.fixedTimes.length === 0)
  ) {
    errors.push("Fixed time mode requires at least one time");
  }

  if (schedule.mode === "interval") {
    if (!schedule.interval || !schedule.interval.shotsPerHour) {
      errors.push("Interval mode requires shotsPerHour configuration");
    }
    if (
      schedule.interval &&
      (schedule.interval.shotsPerHour < 1 ||
        schedule.interval.shotsPerHour > 60)
    ) {
      errors.push("shotsPerHour must be between 1 and 60");
    }
  }

  if (schedule.mode === "sunrise-sunset") {
    // Location validation will be done at runtime
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Formats a slot time for display
 * @param {Date} slot - Slot time to format
 * @param {string} timezone - Timezone for display
 * @returns {string} Formatted time string
 */
export function formatSlotTime(slot, timezone = "UTC") {
  return slot.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Gets capture slots for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Object} schedule - Schedule configuration
 * @param {Object} location - Location for sunrise/sunset
 * @returns {Array<Date>} All slots in the date range
 */
export function getSlotsForDateRange(
  startDate,
  endDate,
  schedule,
  location = null,
) {
  const allSlots = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    const daySlots = generateDailySlots(current, schedule, location);
    allSlots.push(...daySlots);
    current.setDate(current.getDate() + 1);
  }

  return allSlots.filter((slot) => slot >= startDate && slot <= endDate);
}
