/**
 * Crash and error reporting.
 *
 * In this privacy-first fork (`SpaceDeck Local`), Sentry crash reporting is
 * completely disabled and disconnected in both development and packaged builds.
 * No SDK is initialized and no reports are sent.
 */

export const CRASH_REPORTING_DSN = "";

/** In this privacy-first fork, crash reporting is a no-op. */
export function initCrashReporting(): void {
  // Permanently disabled in this privacy-first fork.
}
