/**
 * The PATH refresh, with every seam injected: no PowerShell runs, the real
 * `process.env` is never touched and no directory is stat'ed. Whether
 * `[Environment]::GetEnvironmentVariable` answers as documented on a real
 * Windows is not something a run on this machine can show.
 */
import { describe, expect, it, vi } from "vitest";
import {
  addLocalBinToPath,
  mergeWindowsPath,
  readRegistryPath,
  refreshWindowsPath,
  REGISTRY_READ_TIMEOUT_MS,
  type ExecText,
} from "./windows-path";

const PROFILE = "C:\\Users\\Nguyễn Văn A";
const LOCAL_BIN = `${PROFILE}\\.local\\bin`;
const CODEX_BIN = `${PROFILE}\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin`;

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** What the read script prints: one labelled line per scope, CRLF-terminated. */
function registryOutput(machine: string, user: string): string {
  return `Machine=${base64(machine)}\r\nUser=${base64(user)}\r\n`;
}

describe("mergeWindowsPath", () => {
  it("keeps the current entries first, then Machine, User and extras", () => {
    const merged = mergeWindowsPath(
      ["C:\\deck\\bin;C:\\Windows", "C:\\Windows\\System32", "C:\\user\\bin", "C:\\extra"],
      {},
    );

    expect(merged).toBe("C:\\deck\\bin;C:\\Windows;C:\\Windows\\System32;C:\\user\\bin;C:\\extra");
  });

  it("dedupes case-insensitively, ignoring a trailing backslash, and keeps the first spelling", () => {
    const merged = mergeWindowsPath(
      ["C:\\Tools\\;;C:\\Windows", "c:\\tools;C:\\WINDOWS\\", ""],
      {},
    );

    expect(merged).toBe("C:\\Tools\\;C:\\Windows");
  });

  it("expands a leftover %VAR% case-insensitively and leaves an unknown one alone", () => {
    const merged = mergeWindowsPath(
      [`${PROFILE}\\bin`, "%userprofile%\\bin;%LocalAppData%\\x;%NOT_SET%\\y"],
      { USERPROFILE: PROFILE, LOCALAPPDATA: `${PROFILE}\\AppData\\Local` },
    );

    // The expanded `%userprofile%\bin` is the entry already present.
    expect(merged).toBe(`${PROFILE}\\bin;${PROFILE}\\AppData\\Local\\x;%NOT_SET%\\y`);
  });
});

describe("readRegistryPath", () => {
  it("round-trips a non-ASCII profile path through the base64 output", async () => {
    // The reason the script prints base64: piped console output is in the OEM
    // codepage, where "Nguyễn" does not survive.
    const exec = vi.fn<ExecText>(() =>
      Promise.resolve(registryOutput("C:\\Windows\\System32;C:\\Windows", CODEX_BIN)),
    );

    const registry = await readRegistryPath(exec, "powershell.exe");

    expect(registry).toEqual({ machine: "C:\\Windows\\System32;C:\\Windows", user: CODEX_BIN });
    const [file, args, timeoutMs] = exec.mock.calls[0];
    expect(file).toBe("powershell.exe");
    expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(timeoutMs).toBe(REGISTRY_READ_TIMEOUT_MS);
    expect(REGISTRY_READ_TIMEOUT_MS).toBe(5000);
  });

  it("reads a missing User value as no entries", async () => {
    const exec: ExecText = () => Promise.resolve("Machine=QzpcV2luZG93cw==\r\nUser=\r\n");

    expect(await readRegistryPath(exec, "powershell.exe")).toEqual({
      machine: "C:\\Windows",
      user: "",
    });
  });

  it("rejects output it cannot read rather than guessing", async () => {
    const exec: ExecText = () => Promise.resolve("Get-Foo : not recognized\r\n");

    await expect(readRegistryPath(exec, "powershell.exe")).rejects.toThrow(
      "Unexpected registry PATH output",
    );
  });

  it.each([
    ["only the Machine line", `Machine=${base64("C:\\Windows")}\r\n`],
    ["a Machine value that is not base64", `Machine=C:\\Windows\r\nUser=${base64("")}\r\n`],
  ])("rejects %s", async (_case, stdout) => {
    await expect(readRegistryPath(() => Promise.resolve(stdout), "powershell.exe")).rejects.toThrow(
      "Unexpected registry PATH output",
    );
  });

  it("asks PowerShell for the two labelled lines the parser reads", async () => {
    const exec = vi.fn<ExecText>(() => Promise.resolve(registryOutput("C:\\Windows", "")));

    await readRegistryPath(exec, "powershell.exe");

    const script = exec.mock.calls[0][1][3];
    expect(script).toContain("foreach ($scope in 'Machine', 'User')");
    expect(script).toContain("$scope + '=' + [Convert]::ToBase64String(");
  });
});

describe("refreshWindowsPath", () => {
  it("merges the registry into the env's own Path key", async () => {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows", USERPROFILE: PROFILE };

    await refreshWindowsPath({
      env,
      read: () =>
        Promise.resolve({ machine: "C:\\Windows;C:\\Program Files\\Git\\cmd", user: CODEX_BIN }),
      isDirectory: () => false,
    });

    expect(env).toEqual({
      Path: `C:\\Windows;C:\\Program Files\\Git\\cmd;${CODEX_BIN}`,
      USERPROFILE: PROFILE,
    });
  });

  it("drops registry entries that do not name an absolute directory", async () => {
    // An unexpanded `%VAR%` or a relative entry would reach every new pane as a
    // directory relative to its cwd — one a cloned repo could supply.
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };

    await refreshWindowsPath({
      env,
      read: () =>
        Promise.resolve({
          machine: "%NOT_SET%\\bin;tools;C:\\Users\\%NOT_SET%\\bin",
          user: `%USERPROFILE%\\bin;${CODEX_BIN}`,
        }),
      isDirectory: () => false,
    });

    expect(env.PATH).toBe(`C:\\Windows;${PROFILE}\\bin;${CODEX_BIN}`);
  });

  it("keeps a literal % in a directory name, and a quoted or padded entry unquoted", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };

    await refreshWindowsPath({
      env,
      read: () =>
        Promise.resolve({
          machine: 'C:\\Tools\\100%\\bin;"C:\\Program Files\\Foo"',
          user: " C:\\Padded ",
        }),
      isDirectory: () => false,
    });

    expect(env.PATH).toBe("C:\\Windows;C:\\Tools\\100%\\bin;C:\\Program Files\\Foo;C:\\Padded");
  });

  it("keeps PATH and warns when the read fails", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };
    const log = vi.fn();
    const failure = new Error("powershell.exe timed out");

    await refreshWindowsPath({
      env,
      read: () => Promise.reject(failure),
      isDirectory: () => true,
      log,
    });

    expect(env.PATH).toBe("C:\\Windows");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("PATH"), failure);
  });

  it("adds %USERPROFILE%\\.local\\bin only when it exists", async () => {
    const read = () => Promise.resolve({ machine: "C:\\Windows", user: "" });
    const present: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };
    const absent: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };

    await refreshWindowsPath({ env: present, read, isDirectory: (dir) => dir === LOCAL_BIN });
    await refreshWindowsPath({ env: absent, read, isDirectory: () => false });

    expect(present.PATH).toBe(`C:\\Windows;${LOCAL_BIN}`);
    expect(absent.PATH).toBe("C:\\Windows");
  });
});

describe("addLocalBinToPath", () => {
  it("appends %USERPROFILE%\\.local\\bin when it exists", () => {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows", USERPROFILE: PROFILE };

    addLocalBinToPath({ env, isDirectory: (dir) => dir === LOCAL_BIN });

    expect(env).toEqual({ Path: `C:\\Windows;${LOCAL_BIN}`, USERPROFILE: PROFILE });
  });

  it("leaves PATH alone when the directory is missing or already there", () => {
    const missing: NodeJS.ProcessEnv = { PATH: "C:\\Windows", USERPROFILE: PROFILE };
    const already = `C:\\Windows;${LOCAL_BIN.toUpperCase()}\\`;
    const present: NodeJS.ProcessEnv = { PATH: already, USERPROFILE: PROFILE };

    addLocalBinToPath({ env: missing, isDirectory: () => false });
    addLocalBinToPath({ env: present, isDirectory: () => true });

    expect(missing.PATH).toBe("C:\\Windows");
    expect(present.PATH).toBe(already);
  });

  it("does nothing without a profile directory", () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows" };

    addLocalBinToPath({ env, isDirectory: () => true });

    expect(env).toEqual({ PATH: "C:\\Windows" });
  });
});
