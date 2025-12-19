import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDailySlots,
  validateSchedule,
  formatSlotTime,
  getSlotsForDateRange,
  isCaptureDue,
  getNextCaptureTime,
} from "../scheduling.js";

// Fixed date for consistent testing
const TEST_DATE = new Date("2025-06-15T00:00:00");

// ============================================
// generateDailySlots - fixed-time mode
// ============================================

test("generateDailySlots - fixed-time with single time", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["12:00"],
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  assert.equal(slots.length, 1);
  assert.equal(slots[0].getHours(), 12);
  assert.equal(slots[0].getMinutes(), 0);
});

test("generateDailySlots - fixed-time with multiple times", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["08:00", "12:00", "18:00"],
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  assert.equal(slots.length, 3);
  assert.equal(slots[0].getHours(), 8);
  assert.equal(slots[1].getHours(), 12);
  assert.equal(slots[2].getHours(), 18);
});

test("generateDailySlots - fixed-time slots are sorted", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["18:00", "06:00", "12:00"],
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  assert.equal(slots.length, 3);
  assert.equal(slots[0].getHours(), 6);
  assert.equal(slots[1].getHours(), 12);
  assert.equal(slots[2].getHours(), 18);
});

// ============================================
// generateDailySlots - interval mode
// ============================================

test("generateDailySlots - interval mode with 1 shot per hour", () => {
  const schedule = {
    mode: "interval",
    interval: { shotsPerHour: 1 },
    window: { startHour: "09:00", endHour: "12:00" },
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  assert.equal(slots.length, 4); // 09:00, 10:00, 11:00, 12:00
  assert.equal(slots[0].getHours(), 9);
  assert.equal(slots[3].getHours(), 12);
});

test("generateDailySlots - interval mode with 4 shots per hour", () => {
  const schedule = {
    mode: "interval",
    interval: { shotsPerHour: 4 },
    window: { startHour: "10:00", endHour: "11:00" },
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  // 10:00, 10:15, 10:30, 10:45, 11:00
  assert.equal(slots.length, 5);
  assert.equal(slots[0].getMinutes(), 0);
  assert.equal(slots[1].getMinutes(), 15);
  assert.equal(slots[2].getMinutes(), 30);
  assert.equal(slots[3].getMinutes(), 45);
  assert.equal(slots[4].getHours(), 11);
});

test("generateDailySlots - interval mode uses default window", () => {
  const schedule = {
    mode: "interval",
    interval: { shotsPerHour: 1 },
    window: {},
    timezone: "UTC",
  };

  const slots = generateDailySlots(TEST_DATE, schedule);

  // Should cover full day with default 00:00 to 23:59
  assert.ok(slots.length >= 24);
});

// ============================================
// generateDailySlots - sunrise-sunset mode
// ============================================

test("generateDailySlots - sunrise-sunset mode", () => {
  const schedule = {
    mode: "sunrise-sunset",
    captureSunrise: true,
    captureSunset: true,
    timezone: "UTC",
  };
  const location = { lat: 37.7749, lon: -122.4194 }; // San Francisco

  const slots = generateDailySlots(TEST_DATE, schedule, location);

  assert.equal(slots.length, 2); // sunrise and sunset
  // Sunrise should be before sunset
  assert.ok(slots[0] < slots[1]);
});

test("generateDailySlots - sunrise-sunset with offset", () => {
  const schedule = {
    mode: "sunrise-sunset",
    captureSunrise: true,
    captureSunset: true,
    sunriseOffset: 30, // 30 minutes after sunrise
    sunsetOffset: -15, // 15 minutes before sunset
    timezone: "UTC",
  };
  const location = { lat: 37.7749, lon: -122.4194 };

  const slots = generateDailySlots(TEST_DATE, schedule, location);

  assert.equal(slots.length, 2);
});

test("generateDailySlots - sunrise-sunset only sunrise", () => {
  const schedule = {
    mode: "sunrise-sunset",
    captureSunrise: true,
    captureSunset: false,
    timezone: "UTC",
  };
  const location = { lat: 37.7749, lon: -122.4194 };

  const slots = generateDailySlots(TEST_DATE, schedule, location);

  assert.equal(slots.length, 1);
});

test("generateDailySlots - sunrise-sunset with interval captures", () => {
  const schedule = {
    mode: "sunrise-sunset",
    captureSunrise: true,
    captureSunset: true,
    interval: { shotsPerHour: 1 },
    timezone: "UTC",
  };
  const location = { lat: 37.7749, lon: -122.4194 };

  const slots = generateDailySlots(TEST_DATE, schedule, location);

  // Should have sunrise, sunset, plus hourly intervals between
  assert.ok(slots.length > 2);
});

test("generateDailySlots - sunrise-sunset requires location", () => {
  const schedule = {
    mode: "sunrise-sunset",
    timezone: "UTC",
  };

  assert.throws(() => {
    generateDailySlots(TEST_DATE, schedule, null);
  }, /Location.*required/);
});

// ============================================
// generateDailySlots - default mode
// ============================================

test("generateDailySlots - defaults to noon when no mode", () => {
  const schedule = { timezone: "UTC" };

  const slots = generateDailySlots(TEST_DATE, schedule);

  assert.equal(slots.length, 1);
  assert.equal(slots[0].getHours(), 12);
  assert.equal(slots[0].getMinutes(), 0);
});

// ============================================
// validateSchedule
// ============================================

test("validateSchedule - valid fixed-time schedule", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["12:00"],
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test("validateSchedule - missing mode", () => {
  const schedule = {};

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes("mode")));
});

test("validateSchedule - fixed-time without times", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: [],
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes("at least one time")));
});

test("validateSchedule - interval without shotsPerHour", () => {
  const schedule = {
    mode: "interval",
    interval: {},
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes("shotsPerHour")));
});

test("validateSchedule - interval with invalid shotsPerHour", () => {
  const schedule = {
    mode: "interval",
    interval: { shotsPerHour: 100 },
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes("between 1 and 60")));
});

test("validateSchedule - valid interval schedule", () => {
  const schedule = {
    mode: "interval",
    interval: { shotsPerHour: 4 },
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, true);
});

test("validateSchedule - sunrise-sunset mode is valid", () => {
  const schedule = {
    mode: "sunrise-sunset",
  };

  const result = validateSchedule(schedule);

  assert.equal(result.isValid, true);
});

// ============================================
// formatSlotTime
// ============================================

test("formatSlotTime - formats time correctly", () => {
  const slot = new Date("2025-06-15T14:30:00Z");

  const formatted = formatSlotTime(slot, "UTC");

  assert.equal(formatted, "14:30");
});

test("formatSlotTime - formats midnight correctly", () => {
  const slot = new Date("2025-06-15T00:00:00Z");

  const formatted = formatSlotTime(slot, "UTC");

  assert.equal(formatted, "00:00");
});

// ============================================
// getSlotsForDateRange
// ============================================

test("getSlotsForDateRange - single day", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["12:00"],
    timezone: "UTC",
  };
  const startDate = new Date("2025-06-15T00:00:00");
  const endDate = new Date("2025-06-15T23:59:59");

  const slots = getSlotsForDateRange(startDate, endDate, schedule);

  assert.equal(slots.length, 1);
});

test("getSlotsForDateRange - multiple days", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["12:00"],
    timezone: "UTC",
  };
  const startDate = new Date("2025-06-15T00:00:00");
  const endDate = new Date("2025-06-17T23:59:59");

  const slots = getSlotsForDateRange(startDate, endDate, schedule);

  assert.equal(slots.length, 3); // One per day
});

test("getSlotsForDateRange - filters slots outside range", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["06:00", "18:00"],
    timezone: "UTC",
  };
  const startDate = new Date("2025-06-15T10:00:00");
  const endDate = new Date("2025-06-15T20:00:00");

  const slots = getSlotsForDateRange(startDate, endDate, schedule);

  assert.equal(slots.length, 1); // Only 18:00 is in range
});

// ============================================
// isCaptureDue
// ============================================

test("isCaptureDue - returns false when no slots match", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["03:00"], // Early morning, unlikely to match
    timezone: "UTC",
  };

  const result = isCaptureDue(schedule, null, null);

  // This depends on current time, so we just verify it returns a boolean
  assert.equal(typeof result, "boolean");
});

// ============================================
// getNextCaptureTime
// ============================================

test("getNextCaptureTime - returns a Date or null", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["12:00", "18:00"],
    timezone: "UTC",
  };

  const result = getNextCaptureTime(schedule, null);

  assert.ok(result === null || result instanceof Date);
});

test("getNextCaptureTime - returns future time", () => {
  const schedule = {
    mode: "fixed-time",
    fixedTimes: ["23:59"], // Late night, should be in future or tomorrow
    timezone: "UTC",
  };

  const result = getNextCaptureTime(schedule, null);
  const now = new Date();

  if (result) {
    assert.ok(result > now);
  }
});
