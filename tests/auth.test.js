import test from "node:test";
import assert from "node:assert/strict";
import {
  ProtectAuthError,
  ProtectAuthorizationError,
  ProtectNetworkError,
  ProtectTimeoutError,
} from "unifi-protect";
import { categorizeError, getErrorMessage } from "../auth.js";

// Errors shaped like the ones ProtectClient.connect throws (messages and codes
// observed against a live controller with unifi-protect 5.3.1).
const networkError = (code) =>
  new ProtectNetworkError(
    "A network error occurred communicating with the UniFi Protect controller.",
    { code },
  );

test("testAuthentication - bad IP (ENOTFOUND)", async () => {
  const result = categorizeError(networkError("ENOTFOUND"));

  assert.equal(result, "CONNECTION_FAILED");

  const message = getErrorMessage(result, "192.168.999.999");
  assert.ok(message.includes("Unable to connect"));
  assert.ok(message.includes("192.168.999.999"));
});

test("testAuthentication - bad IP (ECONNREFUSED)", async () => {
  const result = categorizeError(networkError("ECONNREFUSED"));

  assert.equal(result, "CONNECTION_FAILED");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("Unable to connect"));
});

test("testAuthentication - bad username or password", async () => {
  const result = categorizeError(
    new ProtectAuthError(
      "Unable to authenticate with the UniFi Protect controller. Please check the configured address, username, and password.",
    ),
  );

  assert.equal(result, "INVALID_CREDENTIALS");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.equal(message, "Invalid username or password.");
});

test("testAuthentication - insufficient privileges", async () => {
  const result = categorizeError(
    new ProtectAuthorizationError("Forbidden", { statusCode: 403 }),
  );

  assert.equal(result, "INSUFFICIENT_PRIVILEGES");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("Insufficient privileges"));
  assert.ok(message.includes("Full Management"));
});

test("testAuthentication - timeout", async () => {
  const result = categorizeError(
    new ProtectTimeoutError("Request timed out", { elapsedMs: 10000 }),
  );

  assert.equal(result, "TIMEOUT");

  const message = getErrorMessage(result, "192.168.1.1");
  assert.ok(message.includes("timeout"));
});

test("testAuthentication - unrecognized error", async () => {
  const error = new Error("Something unexpected");
  const result = categorizeError(error);

  assert.equal(result, "UNKNOWN");

  const message = getErrorMessage(result, "192.168.1.1", error.message);
  assert.equal(message, "Authentication failed: Something unexpected");
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
