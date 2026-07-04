// ---------------------------------------------------------------------------
// Debug logging utility for Bookmarklet Runner.
// Logging is off by default — enable via the options page.
// ---------------------------------------------------------------------------

let enabled = false;

/** Set whether debug-level logging is active. */
export function setDebugEnabled(value: boolean): void {
  enabled = value;
}

const PREFIX = "[bm-runner]";

/**
 * Progress / trace-level message. Only emitted when debug logging is enabled.
 */
export function log(message: string, ...args: unknown[]): void {
  if (enabled) {
    console.log(`${PREFIX} ${message}`, ...args);
  }
}

/**
 * Warning-level message. Always emitted regardless of debug setting.
 */
export function warn(message: string, ...args: unknown[]): void {
  console.warn(`${PREFIX} ${message}`, ...args);
}

/**
 * Error-level message. Always emitted regardless of debug setting.
 */
export function error(message: string, ...args: unknown[]): void {
  console.error(`${PREFIX} ${message}`, ...args);
}
