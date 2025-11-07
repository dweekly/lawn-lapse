import { ProtectApi } from "unifi-protect";

/**
 * Test authentication credentials against UniFi Protect controller
 * @param {string} host - Controller hostname or IP
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<{success: boolean, error?: string, protect?: ProtectApi}>}
 */
export async function testAuthentication(host, username, password) {
  const protect = new ProtectApi();

  // Capture API errors during authentication
  const originalConsoleError = console.error;
  const errorLogs = [];
  console.error = (...args) => {
    errorLogs.push(args.join(" "));
  };

  try {
    await protect.login(host, username, password);
  } catch (error) {
    console.error = originalConsoleError;
    return {
      success: false,
      error: categorizeError(error.message, errorLogs),
    };
  } finally {
    console.error = originalConsoleError;
  }

  // Check if any errors were logged during login
  if (errorLogs.length > 0) {
    return {
      success: false,
      error: categorizeError(errorLogs.join(" "), errorLogs),
    };
  }

  return {
    success: true,
    protect,
  };
}

/**
 * Categorize authentication errors into user-friendly messages
 * @param {string} errorText - Error message or logs
 * @param {string[]} errorLogs - Array of captured error logs
 * @returns {string} - Categorized error type
 */
function categorizeError(errorText, errorLogs = []) {
  const allErrors = [errorText, ...errorLogs].join(" ");

  if (
    allErrors.includes("ENOTFOUND") ||
    allErrors.includes("ECONNREFUSED") ||
    allErrors.includes("ETIMEDOUT")
  ) {
    return "CONNECTION_FAILED";
  }

  if (allErrors.includes("Insufficient privileges")) {
    return "INSUFFICIENT_PRIVILEGES";
  }

  if (
    allErrors.includes("Invalid credentials") ||
    allErrors.includes("Unauthorized") ||
    allErrors.includes("401")
  ) {
    return "INVALID_CREDENTIALS";
  }

  if (allErrors.includes("timeout")) {
    return "TIMEOUT";
  }

  return "UNKNOWN";
}

/**
 * Get user-friendly error message for error type
 * @param {string} errorType - Error type from categorizeError
 * @param {string} host - Controller hostname/IP for context
 * @returns {string} - User-friendly error message
 */
export function getErrorMessage(errorType, host) {
  switch (errorType) {
    case "CONNECTION_FAILED":
      return `Unable to connect to ${host}. Please check the hostname/IP address and ensure the UniFi Protect controller is running and accessible.`;
    case "INSUFFICIENT_PRIVILEGES":
      return `Insufficient privileges. Please ensure this user has "Full Management" role in UniFi Protect settings.`;
    case "INVALID_CREDENTIALS":
      return "Invalid username or password.";
    case "TIMEOUT":
      return `Connection timeout. Please check your network connection and ensure ${host} is accessible.`;
    default:
      return `Authentication failed. Please check your credentials and try again.`;
  }
}
