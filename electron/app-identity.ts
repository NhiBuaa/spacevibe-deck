import path from "node:path";

export interface AppLike {
  isPackaged: boolean;
  name: string;
  getPath(name: string): string;
  setPath(name: string, value: string): void;
  setAppUserModelId?(id: string): void;
}

export interface ResolvedAppIdentity {
  readonly appName: string;
  readonly appId: string;
  readonly userData: string;
}

/**
 * Configures application identity and isolates userData directories across:
 * 1. Source dev (`npm run electron:dev`): "SpaceDeck Local Dev" -> `<appData>/SpaceDeck Local Dev`
 * 2. Packaged preview (`electron-builder.yml`): "SpaceDeck Local Dev" -> `<appData>/SpaceDeck Local Dev`
 * 3. Packaged release (`electron-builder.release.yml`): "SpaceDeck Local" -> `<appData>/SpaceDeck Local`
 *
 * Honors `testUserData` when provided for isolated test runs.
 */
export function configureAppIdentity(
  app: AppLike,
  options: {
    testUserData?: string;
    platform?: string;
  } = {},
): ResolvedAppIdentity {
  const isDev = !app.isPackaged;
  // If packaged with preview productName or running in dev, use SpaceDeck Local Dev.
  // Otherwise, default to SpaceDeck Local for release builds.
  const appName =
    isDev || app.name === "SpaceDeck Local Dev" ? "SpaceDeck Local Dev" : "SpaceDeck Local";
  const appId =
    appName === "SpaceDeck Local Dev"
      ? "io.github.nhibuaa.spacedeck.local.dev"
      : "io.github.nhibuaa.spacedeck.local";

  app.name = appName;

  const userData = options.testUserData
    ? path.resolve(options.testUserData)
    : path.join(app.getPath("appData"), appName);

  app.setPath("userData", userData);

  const platform = options.platform ?? process.platform;
  if (platform === "win32" && typeof app.setAppUserModelId === "function") {
    app.setAppUserModelId(appId);
  }

  return { appName, appId, userData };
}
