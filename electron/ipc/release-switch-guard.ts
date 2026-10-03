import { app } from "electron";
import {
  requireReleaseSwitch,
  resolveReleaseSwitches,
  type ReleaseSwitchId,
  type ReleaseSwitchSnapshot,
} from "../../src/lib/release-switches";

/** Wrap dedicated feature handlers; shared handlers guard only the feature branch. */
export function guardReleaseSwitchHandler<Args extends unknown[], Result>(
  id: ReleaseSwitchId,
  handler: (...args: Args) => Result,
  snapshot: () => ReleaseSwitchSnapshot = () => resolveReleaseSwitches(!app.isPackaged),
): (...args: Args) => Result {
  return (...args) => {
    // Main owns this decision. No renderer payload is an enable override.
    requireReleaseSwitch(id, snapshot());
    return handler(...args);
  };
}
