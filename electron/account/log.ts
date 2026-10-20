/**
 * One reporter for the account service. It names the failure, never the data:
 * no token, no email and no URL goes through it (A7), so only the error's class
 * is logged.
 */
export type Report = (message: string) => void;

export function createLogger(report: Report | undefined) {
  const out = report ?? ((message: string) => console.error(message));
  return (message: string, error?: unknown): void => {
    const kind = error instanceof Error ? error.name : error === undefined ? "" : typeof error;
    out(`Deck: ${message}${kind === "" ? "" : ` (${kind})`}`);
  };
}
