import path from "node:path";
import { describe, expect, it } from "vitest";
import { configureAppIdentity, type AppLike } from "./app-identity";

function createMockApp(options: {
  isPackaged: boolean;
  name?: string;
  appData?: string;
}): AppLike & { paths: Map<string, string>; userModelId: string | null } {
  const paths = new Map<string, string>();
  paths.set("appData", options.appData ?? path.resolve("/mock/appdata"));

  return {
    isPackaged: options.isPackaged,
    name: options.name ?? "spacevibe-deck",
    paths,
    userModelId: null,
    getPath(name: string): string {
      return paths.get(name) ?? "";
    },
    setPath(name: string, value: string): void {
      paths.set(name, value);
    },
    setAppUserModelId(id: string): void {
      this.userModelId = id;
    },
  };
}

describe("configureAppIdentity", () => {
  const mockAppData = path.resolve("/mock/appdata");

  describe("source dev mode (!app.isPackaged)", () => {
    it("assigns SpaceDeck Local Dev name and isolates userData under SpaceDeck Local Dev without test override", () => {
      const app = createMockApp({
        isPackaged: false,
        name: "spacevibe-deck",
        appData: mockAppData,
      });
      const identity = configureAppIdentity(app, { platform: "win32" });

      expect(identity.appName).toBe("SpaceDeck Local Dev");
      expect(identity.appId).toBe("io.github.nhibuaa.spacedeck.local.dev");
      expect(identity.userData).toBe(path.join(mockAppData, "SpaceDeck Local Dev"));
      expect(app.name).toBe("SpaceDeck Local Dev");
      expect(app.paths.get("userData")).toBe(path.join(mockAppData, "SpaceDeck Local Dev"));
      expect(app.userModelId).toBe("io.github.nhibuaa.spacedeck.local.dev");
    });

    it("respects testUserData override in dev mode", () => {
      const app = createMockApp({
        isPackaged: false,
        name: "spacevibe-deck",
        appData: mockAppData,
      });
      const override = path.resolve("/tmp/custom-test-dir");
      const identity = configureAppIdentity(app, { testUserData: override });

      expect(identity.appName).toBe("SpaceDeck Local Dev");
      expect(identity.userData).toBe(override);
      expect(app.paths.get("userData")).toBe(override);
    });
  });

  describe("packaged preview build (electron-builder.yml)", () => {
    it("preserves SpaceDeck Local Dev productName and isolates userData to SpaceDeck Local Dev", () => {
      const app = createMockApp({
        isPackaged: true,
        name: "SpaceDeck Local Dev",
        appData: mockAppData,
      });
      const identity = configureAppIdentity(app, { platform: "win32" });

      expect(identity.appName).toBe("SpaceDeck Local Dev");
      expect(identity.appId).toBe("io.github.nhibuaa.spacedeck.local.dev");
      expect(identity.userData).toBe(path.join(mockAppData, "SpaceDeck Local Dev"));
      expect(app.name).toBe("SpaceDeck Local Dev");
      expect(app.paths.get("userData")).toBe(path.join(mockAppData, "SpaceDeck Local Dev"));
      expect(app.userModelId).toBe("io.github.nhibuaa.spacedeck.local.dev");
    });
  });

  describe("packaged release build (electron-builder.release.yml)", () => {
    it("assigns SpaceDeck Local and isolates userData to SpaceDeck Local", () => {
      const app = createMockApp({
        isPackaged: true,
        name: "SpaceDeck Local",
        appData: mockAppData,
      });
      const identity = configureAppIdentity(app, { platform: "win32" });

      expect(identity.appName).toBe("SpaceDeck Local");
      expect(identity.appId).toBe("io.github.nhibuaa.spacedeck.local");
      expect(identity.userData).toBe(path.join(mockAppData, "SpaceDeck Local"));
      expect(app.name).toBe("SpaceDeck Local");
      expect(app.paths.get("userData")).toBe(path.join(mockAppData, "SpaceDeck Local"));
      expect(app.userModelId).toBe("io.github.nhibuaa.spacedeck.local");
    });

    it("falls back to SpaceDeck Local if packaged name is generic package name", () => {
      const app = createMockApp({
        isPackaged: true,
        name: "spacevibe-deck",
        appData: mockAppData,
      });
      const identity = configureAppIdentity(app, { platform: "darwin" });

      expect(identity.appName).toBe("SpaceDeck Local");
      expect(identity.appId).toBe("io.github.nhibuaa.spacedeck.local");
      expect(identity.userData).toBe(path.join(mockAppData, "SpaceDeck Local"));
      expect(app.name).toBe("SpaceDeck Local");
      expect(app.paths.get("userData")).toBe(path.join(mockAppData, "SpaceDeck Local"));
    });
  });
});
