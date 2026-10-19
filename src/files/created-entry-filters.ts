/**
 * Keeps a freshly created entry visible (design §5.3.4, IGN17).
 *
 * A hidden or ignored name under its filter would create something the user
 * cannot see. Turning the filter on is the honest answer, and it is said out
 * loud on the status line. The root row's toggles turn each back off.
 *
 * Runs after the parent's re-list, because whether git ignores the name is in
 * that listing's verdict.
 */
import {
  clearExplorerStatus,
  setExplorerStatus,
  setShowHidden,
  setShowIgnored,
  surfaceFor,
} from "./file-surface-store";
import { isHidden, isIgnoredName } from "./file-tree";

/** The status line for the filters turned on, or null when none was. */
function statusFor(name: string, hidden: boolean, ignored: boolean): string | null {
  if (hidden && ignored) {
    return `Showing hidden and ignored files so ${name} is visible.`;
  }
  if (hidden) {
    return `Showing hidden files so ${name} is visible.`;
  }
  return ignored ? `Showing ignored files so ${name} is visible.` : null;
}

export function showCreatedEntry(workspacePath: string, parent: string, name: string): void {
  const surface = surfaceFor(workspacePath);
  const needsHidden = isHidden(name) && !surface.showHidden;
  const needsIgnored = !surface.showIgnored && isIgnoredName(name, surface.verdicts.get(parent));
  if (needsHidden) {
    setShowHidden(workspacePath, true);
  }
  if (needsIgnored) {
    setShowIgnored(workspacePath, true);
  }
  const message = statusFor(name, needsHidden, needsIgnored);
  if (message === null) {
    clearExplorerStatus();
  } else {
    setExplorerStatus(workspacePath, message, false);
  }
}
