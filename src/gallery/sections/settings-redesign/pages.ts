import type { ComponentType } from "preact";
import type { PageId } from "./model";
import { AboutPage } from "./page-about";
import { AgentsPage } from "./page-agents";
import { AppearancePage } from "./page-appearance";
import { DataPage } from "./page-data";
import { FilesPage } from "./page-files";
import { NotificationsPage } from "./page-notifications";
import { ShortcutsPage } from "./page-shortcuts";
import { TerminalPage } from "./page-terminal";

/** Each page renders its own `PageIntro` and groups; the shell only mounts it. */
export const PAGE_COMPONENTS: Readonly<Record<PageId, ComponentType>> = {
  appearance: AppearancePage,
  terminal: TerminalPage,
  agents: AgentsPage,
  notifications: NotificationsPage,
  files: FilesPage,
  shortcuts: ShortcutsPage,
  about: AboutPage,
  data: DataPage,
};
