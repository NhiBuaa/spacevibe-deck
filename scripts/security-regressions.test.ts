import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(target);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.includes(".test.") ? [target] : [];
  });
}

describe("terminal diagnostics", () => {
  it("never ships a raw keystroke network tap", () => {
    // `fileURLToPath`, not `URL.pathname`: on Windows the latter yields
    // `/D:/a/…`, which `readdirSync` resolves against the current drive as
    // `D:\\D:\\a\\…` and cannot open. `scripts/design-language.test.ts` and
    // `scripts/gallery-entry.test.ts` already carry the same note.
    const terminalRoot = fileURLToPath(new URL("../src/terminal/", import.meta.url));
    const sources = sourceFiles(terminalRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const pane = readFileSync(new URL("../src/terminal/pane.ts", import.meta.url), "utf8");

    expect(sources).not.toContain("127.0.0.1:8792");
    expect(pane).not.toContain("installImeTrace");
    expect(pane).not.toContain('from "./ime-trace"');
  });
});

describe("privacy regressions: upstream telemetry, crash reporting, account and updater", () => {
  const read = (relPath: string) =>
    readFileSync(fileURLToPath(new URL(`../${relPath}`, import.meta.url)), "utf8");

  it("never initializes Sentry in main entry or renderer entry", () => {
    const mainTs = read("electron/main.ts");
    const mainRendererTsx = read("src/main.tsx");
    const crashInit = read("electron/crash-reporting/init.ts");
    const crashRenderer = read("src/telemetry/crash-reporting.ts");

    expect(mainTs).not.toContain("initCrashReporting()");
    expect(mainRendererTsx).not.toContain("initRendererCrashReporting()");
    expect(crashInit).not.toContain("@sentry/electron/main");
    expect(crashRenderer).not.toContain("@sentry/electron/renderer");
  });

  it("never includes Sentry or Supabase SDK in package.json dependencies", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@sentry/electron"]).toBeUndefined();
    expect(pkg.dependencies?.["@supabase/supabase-js"]).toBeUndefined();
  });

  it("disconnects publisher telemetry network transport", () => {
    const registerTelemetryTs = read("electron/ipc/register-telemetry.ts");
    expect(registerTelemetryTs).not.toContain("fetch(TELEMETRY_ENDPOINT");
    expect(registerTelemetryTs).not.toContain("createTelemetryService");
  });

  it("disconnects upstream updater feed and auto-updater registration", () => {
    const registerUpdaterTs = read("electron/ipc/register-updater.ts");
    expect(registerUpdaterTs).not.toContain('repo: "spacevibe-deck"');
    expect(registerUpdaterTs).not.toContain("autoUpdater.setFeedURL");
  });

  it("disconnects Supabase client in account service", () => {
    const accountServiceTs = read("electron/account/service.ts");
    expect(accountServiceTs).not.toContain("@supabase/supabase-js");
  });

  it("isolates application identity and userData from upstream SpaceVibe", () => {
    const mainTs = read("electron/main.ts");
    expect(mainTs).toContain('app.name = "SpaceDeck Local"');
    expect(mainTs).toContain('app.setAppUserModelId("io.github.nhibuaa.spacedeck.local")');
    expect(mainTs).not.toContain('app.setAppUserModelId("dev.spacevibe.deck.electron")');

    const builderYml = read("electron-builder.yml");
    expect(builderYml).toContain("appId: io.github.nhibuaa.spacedeck.local");
    expect(builderYml).toContain("productName: SpaceDeck Local");

    const releaseBuilderYml = read("electron-builder.release.yml");
    expect(releaseBuilderYml).toContain("appId: io.github.nhibuaa.spacedeck.local");
    expect(releaseBuilderYml).toContain("productName: SpaceDeck Local");
  });

  it("installs loopback-only browser network policy in main and browser view", () => {
    const mainTs = read("electron/main.ts");
    expect(mainTs).toContain("installBrowserSessionPolicy");
    expect(mainTs).toContain('session.fromPartition("persist:deck-browser")');

    const viewTs = read("electron/browser/view.ts");
    expect(viewTs).toContain("installBrowserSessionPolicy");
  });
});
