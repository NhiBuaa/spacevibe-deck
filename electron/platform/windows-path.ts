/**
 * Deck's own PATH on Windows, kept in step with the registry.
 *
 * A Windows process inherits its environment once, at launch, and nothing
 * updates it afterwards. An installer that adds a directory to the Machine or
 * User `Path` while Deck runs — Deck's own Install button included — would stay
 * invisible to discovery, and to every pane spawned from this environment,
 * until Deck restarts. So discovery re-reads the registry before each probe
 * and merges it into `process.env.PATH`, and panes spawned after the probe can
 * run what it found.
 *
 * `assignPath` is the one place that writes PATH. Everything else here is pure
 * or reads through an injected seam, and every seam defaults to the real thing.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createCachedExecutableResolver } from "./windows";

/** A wedged PowerShell must not hold discovery longer than this. */
export const REGISTRY_READ_TIMEOUT_MS = 5_000;

/** `;` — `path.win32.delimiter`, named for the reason `windows.ts` gives. */
const WINDOWS_PATH_DELIMITER = ";";

/** Matches a `%VAR%` reference the registry read left unexpanded. */
const ENV_REFERENCE = /%([^%;]+)%/g;
/** The same, without the global flag's `lastIndex` state, for a yes/no test. */
const UNEXPANDED_REFERENCE = /%[^%;]+%/;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Both registry values, each printed as base64 of its UTF-8 bytes on a
 * labelled line.
 *
 * Base64 because piped console output, from `reg.exe` or from PowerShell
 * itself, is encoded in the OEM codepage, which mangles a non-ASCII profile
 * path such as `C:\Users\Nguyễn`. The `[string]` cast turns a missing value
 * into an empty string. The script uses single quotes only, as
 * `SNAPSHOT_SCRIPT` in `windows.ts` does.
 */
const READ_SCRIPT = [
  "foreach ($scope in 'Machine', 'User') {",
  "[string]$value = [Environment]::GetEnvironmentVariable('Path', $scope);",
  "$scope + '=' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))",
  "}",
].join(" ");

const resolvePowerShell = createCachedExecutableResolver("powershell.exe", "powershell.exe");

export interface RegistryPath {
  readonly machine: string;
  readonly user: string;
}

/** Runs a process and resolves its stdout; rejects on any failure or timeout. */
export type ExecText = (
  file: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<string>;

/** Injection points for tests; each defaults to the real process. */
export interface WindowsPathSeams {
  readonly env?: NodeJS.ProcessEnv;
  readonly isDirectory?: (candidate: string) => boolean;
  readonly read?: () => Promise<RegistryPath>;
  readonly log?: (message: string, error: unknown) => void;
}

const execText: ExecText = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { encoding: "utf8", timeout: timeoutMs, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });

function isDirectoryOnDisk(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/** The env's own spelling of `name`. A plain object is case-sensitive; the
 * real Windows `process.env` is not, and keeps whatever spelling it had. */
function envKey(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toUpperCase();
  return Object.keys(env).find((key) => key.toUpperCase() === wanted);
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = envKey(env, name);
  return key === undefined ? undefined : env[key];
}

/**
 * PATH strings joined in the order given, with each `%VAR%` expanded from
 * `env` and every directory kept once.
 *
 * Directories compare case-insensitively and without a trailing `\`, since
 * both spellings name the same directory; the first one seen is kept. An unknown
 * `%VAR%` stays as written rather than collapsing to an empty segment.
 */
export function mergeWindowsPath(paths: readonly string[], env: NodeJS.ProcessEnv): string {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const entry of paths.flatMap((value) => value.split(WINDOWS_PATH_DELIMITER))) {
    if (entry.trim().length === 0) {
      continue;
    }
    const expanded = entry.replace(
      ENV_REFERENCE,
      (reference, name: string) => envValue(env, name) ?? reference,
    );
    const key = expanded.replace(/\\+$/, "").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(expanded);
    }
  }
  return merged.join(WINDOWS_PATH_DELIMITER);
}

/** Both scopes, decoded. Rejects on anything but the two labelled lines. */
function parseRegistryOutput(stdout: string): RegistryPath {
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    const encoded = line.slice(separator + 1).trim();
    if (separator > 0 && BASE64.test(encoded)) {
      values.set(line.slice(0, separator).trim(), Buffer.from(encoded, "base64").toString("utf8"));
    }
  }
  const machine = values.get("Machine");
  const user = values.get("User");
  if (machine === undefined || user === undefined) {
    throw new Error(`Unexpected registry PATH output: ${JSON.stringify(stdout.slice(0, 200))}`);
  }
  return { machine, user };
}

/** The Machine and User `Path` as the registry holds them now. */
export async function readRegistryPath(
  exec: ExecText = execText,
  shell: string = resolvePowerShell(),
): Promise<RegistryPath> {
  const stdout = await exec(
    shell,
    ["-NoProfile", "-NonInteractive", "-Command", READ_SCRIPT],
    REGISTRY_READ_TIMEOUT_MS,
  );
  return parseRegistryOutput(stdout);
}

/**
 * `%USERPROFILE%\.local\bin`, when it exists.
 *
 * Claude Code's native Windows installer puts `claude.exe` there and does not
 * add the directory to PATH, so without this Deck reports Codex installed and
 * Claude not, restart or no restart.
 */
function localBin(env: NodeJS.ProcessEnv, isDirectory: (candidate: string) => boolean): string[] {
  const profile = envValue(env, "USERPROFILE");
  if (profile === undefined || profile.length === 0) {
    return [];
  }
  const directory = path.win32.join(profile, ".local", "bin");
  return isDirectory(directory) ? [directory] : [];
}

function currentPath(env: NodeJS.ProcessEnv): string {
  return envValue(env, "PATH") ?? "";
}

/**
 * A registry value reduced to the entries that name an absolute directory.
 *
 * A `%VAR%` this process cannot expand — one an installer defined after Deck
 * started — or a relative entry would otherwise reach every new pane as a
 * directory relative to its cwd, which a cloned repo could supply.
 * `resolveOnPath` already skips such entries; panes must not search them either.
 * A single `%` is a legal directory name and stays; a quoted or padded entry
 * is kept in its bare form.
 */
function resolvableEntries(value: string, env: NodeJS.ProcessEnv): string {
  return mergeWindowsPath([value], env)
    .split(WINDOWS_PATH_DELIMITER)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
    .filter((entry) => !UNEXPANDED_REFERENCE.test(entry) && path.win32.isAbsolute(entry))
    .join(WINDOWS_PATH_DELIMITER);
}

/** The single write to PATH, under the env's own spelling of the key. */
function assignPath(env: NodeJS.ProcessEnv, value: string): void {
  env[envKey(env, "PATH") ?? "PATH"] = value;
}

/**
 * Re-read the registry `Path` and merge it after the current entries, then
 * `%USERPROFILE%\.local\bin`. Never rejects: a failed or timed-out read warns
 * and keeps PATH as it was, so discovery still answers from it.
 */
export async function refreshWindowsPath({
  env = process.env,
  isDirectory = isDirectoryOnDisk,
  read = () => readRegistryPath(),
  log = console.warn,
}: WindowsPathSeams = {}): Promise<void> {
  let registry: RegistryPath;
  try {
    registry = await read();
  } catch (error) {
    log("Deck: could not re-read PATH from the registry; keeping the current PATH", error);
    return;
  }
  // PATH is read after the await, so a concurrent refresh is merged, not lost.
  const paths = [
    currentPath(env),
    resolvableEntries(registry.machine, env),
    resolvableEntries(registry.user, env),
    ...localBin(env, isDirectory),
  ];
  assignPath(env, mergeWindowsPath(paths, env));
}

/**
 * Put `%USERPROFILE%\.local\bin` on PATH at startup, synchronously.
 *
 * Panes restored at boot spawn before any discovery probe runs, and a
 * `claude --resume` in one of them must find the `claude.exe` that the native
 * installer left off PATH. The refresh above covers a Claude installed later.
 */
export function addLocalBinToPath({
  env = process.env,
  isDirectory = isDirectoryOnDisk,
}: WindowsPathSeams = {}): void {
  const extras = localBin(env, isDirectory);
  if (extras.length > 0) {
    assignPath(env, mergeWindowsPath([currentPath(env), ...extras], env));
  }
}
