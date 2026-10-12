import {
  ProtectClient,
  ProtectAuthError,
  ProtectAuthorizationError,
  ProtectNetworkError,
  ProtectTimeoutError,
} from "unifi-protect";

/**
 * Connect to a UniFi Protect controller, which logs in and fetches the camera list
 * @param {string} host - Controller hostname or IP
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<{success: boolean, error?: string, detail?: string, protect?: ProtectClient}>}
 *   On success, `protect` is a connected client the caller must close with
 *   `protect[Symbol.asyncDispose]()`. On failure, `error` is a category for
 *   getErrorMessage and `detail` is the library's own message.
 */
export async function testAuthentication(host, username, password) {
  try {
    const protect = await ProtectClient.connect({
      host,
      username,
      password,
      refreshIntervalMs: false,
    });
    return { success: true, protect };
  } catch (error) {
    return {
      success: false,
      error: categorizeError(error),
      detail: error.message,
    };
  }
}

/**
 * Categorize a connection failure from the unifi-protect library
 * @param {Error} error - Error thrown by ProtectClient.connect
 * @returns {string} - Categorized error type
 */
export function categorizeError(error) {
  if (error instanceof ProtectAuthorizationError) {
    return "INSUFFICIENT_PRIVILEGES";
  }
  if (error instanceof ProtectAuthError) {
    return "INVALID_CREDENTIALS";
  }
  if (error instanceof ProtectTimeoutError) {
    return "TIMEOUT";
  }
  if (error instanceof ProtectNetworkError) {
    return "CONNECTION_FAILED";
  }
  return "UNKNOWN";
}

/**
 * Get user-friendly error message for error type
 * @param {string} errorType - Error type from categorizeError
 * @param {string} host - Controller hostname/IP for context
 * @param {string} [detail] - The library's own message, shown for UNKNOWN
 * @returns {string} - User-friendly error message
 */
export function getErrorMessage(errorType, host, detail) {
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
      return detail
        ? `Authentication failed: ${detail}`
        : `Authentication failed. Please check your credentials and try again.`;
  }
}
