/** Metadata names must never introduce terminal controls or extra prompt lines. */
export function hasTerminalControls(text: string): boolean {
  // oxlint-disable-next-line no-control-regex -- terminal C0/C1 validation
  return /[\u0000-\u001F\u007F-\u009F]/.test(text);
}

/** Keep ordinary text layout; remove controls before xterm adds its paste frame. */
export function sanitizeTerminalPaste(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // oxlint-disable-next-line no-control-regex -- tabs/newlines are content, other controls are not
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
  );
}
