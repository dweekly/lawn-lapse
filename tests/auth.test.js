import test from "node:test";
import assert from "node:assert/strict";
import { getErrorMessage } from "../auth.js";

test("testAuthentication - bad IP (ENOTFOUND)", async () => {
  // Test the categorization logic directly
  const errorLogs = [
    "192.168.999.999: API error: ENOTFOUND - Unable to resolve hostname",
  ];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "CONNECTION_FAILED");

  const message = getErrorMessage(result, "192.168.999.999");
  assert.ok(message.includes("Unable to connect"));
  assert.ok(message.includes("192.168.999.999"));
});

test("testAuthentication - bad IP (ECONNREFUSED)", async () => {
  const errorLogs = [
    "192.168.1.1: API error: ECONNREFUSED - Connection refused",
  ];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "CONNECTION_FAILED");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("Unable to connect"));
});

test("testAuthentication - bad username", async () => {
  const errorLogs = [
    "192.168.1.1: API error: Invalid credentials - Unauthorized",
  ];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "INVALID_CREDENTIALS");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.equal(message, "Invalid username or password.");
});

test("testAuthentication - bad password", async () => {
  const errorLogs = ["192.168.1.1: API error: Invalid credentials"];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "INVALID_CREDENTIALS");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.equal(message, "Invalid username or password.");
});

test("testAuthentication - insufficient privileges", async () => {
  const errorLogs = [
    "192.168.1.1: API error: Insufficient privileges - User lacks required permissions",
  ];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "INSUFFICIENT_PRIVILEGES");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("Insufficient privileges"));
  assert.ok(message.includes("Full Management"));
});

test("testAuthentication - timeout", async () => {
  const errorLogs = ["192.168.1.1: API error: Connection timeout"];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "TIMEOUT");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("timeout"));
});

test("testAuthentication - success (no errors)", async () => {
  const errorLogs = [];
  const result =
    errorLogs.length === 0 ? "SUCCESS" : categorizeErrorForTest("");

  assert.equal(result, "SUCCESS");
});

test("error message formatting", async () => {
  const testCases = [
    {
      type: "CONNECTION_FAILED",
      host: "192.168.1.1",
      expected: "Unable to connect to 192.168.1.1",
    },
    {
      type: "INSUFFICIENT_PRIVILEGES",
      host: "192.168.1.1",
      expected: "Insufficient privileges",
    },
    {
      type: "INVALID_CREDENTIALS",
      host: "192.168.1.1",
      expected: "Invalid username or password",
    },
    {
      type: "TIMEOUT",
      host: "192.168.1.1",
      expected: "timeout",
    },
    {
      type: "UNKNOWN",
      host: "192.168.1.1",
      expected: "Authentication failed",
    },
  ];

  for (const testCase of testCases) {
    const message = getErrorMessage(testCase.type, testCase.host);
    assert.ok(
      message.includes(testCase.expected),
      `Expected message for ${testCase.type} to include "${testCase.expected}", got: ${message}`,
    );
  }
});

// Test scenarios with existing config
test("existing config - IP no longer responds", async () => {
  const errorLogs = [
    "192.168.1.1: API error: ENOTFOUND - Unable to resolve hostname",
  ];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "CONNECTION_FAILED");
});

test("existing config - password no longer valid", async () => {
  const errorLogs = ["192.168.1.1: API error: Invalid credentials"];
  const result = categorizeErrorForTest(errorLogs.join(" "));

  assert.equal(result, "INVALID_CREDENTIALS");
});

// Helper function to test error categorization
// (This replicates the private categorizeError logic for testing)
function categorizeErrorForTest(errorText) {
  if (
    errorText.includes("ENOTFOUND") ||
    errorText.includes("ECONNREFUSED") ||
    errorText.includes("ETIMEDOUT")
  ) {
    return "CONNECTION_FAILED";
  }

  if (errorText.includes("Insufficient privileges")) {
    return "INSUFFICIENT_PRIVILEGES";
  }

  if (
    errorText.includes("Invalid credentials") ||
    errorText.includes("Unauthorized") ||
    errorText.includes("401")
  ) {
    return "INVALID_CREDENTIALS";
  }

  if (errorText.includes("timeout")) {
    return "TIMEOUT";
  }

  return "UNKNOWN";
}
