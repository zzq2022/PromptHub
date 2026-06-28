import os from "os";
import path from "path";
import fs from "fs";

import { resolveInitialUserDataPath } from "./data-path";

const DEFAULT_PRODUCT_NAME = "PromptHub";
const LAYOUT_MIGRATION_MARKER = ".data-layout-v0.5.5.json";

interface LayoutMarkerRecord {
  dbLayoutVersion?: string;
}

export interface RuntimePathOverrides {
  appDataPath?: string;
  userDataPath?: string;
  productName?: string;
  exePath?: string;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
}

let runtimePathOverrides: RuntimePathOverrides = {};
let activeAccountId: string | null = null;
let initialized = false;

interface GlobalConfig {
  lastActiveAccountId: string | null;
  updatedAt: string;
}

export function configureRuntimePaths(overrides: RuntimePathOverrides): void {
  runtimePathOverrides = {
    ...runtimePathOverrides,
    ...overrides,
  };
  initialized = false;
}

let testConfig: GlobalConfig = { lastActiveAccountId: null, updatedAt: "" };

export function resetRuntimePaths(): void {
  runtimePathOverrides = {};
  initialized = false;
  activeAccountId = null;
  testConfig = { lastActiveAccountId: null, updatedAt: "" };
}

function getPlatform(): NodeJS.Platform {
  return runtimePathOverrides.platform ?? process.platform;
}

function getProductName(): string {
  return runtimePathOverrides.productName ?? DEFAULT_PRODUCT_NAME;
}

function getDefaultAppDataPath(platform: NodeJS.Platform): string {
  const homeDir = process.env.HOME || os.homedir();

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support");
  }

  if (platform === "win32") {
    return process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
  }

  return process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
}

export function getAppDataPath(): string {
  return path.resolve(
    runtimePathOverrides.appDataPath ?? getDefaultAppDataPath(getPlatform()),
  );
}

export function getBaseUserDataPath(): string {
  if (runtimePathOverrides.userDataPath) {
    return path.resolve(runtimePathOverrides.userDataPath);
  }

  const appDataPath = getAppDataPath();
  const defaultUserDataPath = path.join(appDataPath, getProductName());

  return resolveInitialUserDataPath({
    appDataPath,
    defaultUserDataPath,
    exePath: runtimePathOverrides.exePath ?? process.execPath,
    isPackaged: runtimePathOverrides.isPackaged ?? false,
    platform: getPlatform(),
  });
}

export function getOSUsername(): string {
  try {
    const userInfo = os.userInfo();
    if (userInfo && userInfo.username) {
      return userInfo.username;
    }
  } catch (e) {
    // ignore
  }
  return process.env.USERNAME || process.env.USER || "default_user";
}

export function loadGlobalConfig(): GlobalConfig {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return testConfig;
  }
  const baseDir = getBaseUserDataPath();
  const configPath = path.join(baseDir, "global-config.json");
  if (!fs.existsSync(configPath)) {
    return { lastActiveAccountId: null, updatedAt: "" };
  }
  try {
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content) as GlobalConfig;
  } catch (err) {
    console.error("Failed to read global-config.json:", err);
    return { lastActiveAccountId: null, updatedAt: "" };
  }
}

export function saveGlobalConfig(config: Partial<GlobalConfig>): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    testConfig = {
      lastActiveAccountId:
        config.lastActiveAccountId !== undefined
          ? config.lastActiveAccountId
          : testConfig.lastActiveAccountId,
      updatedAt: new Date().toISOString(),
    };
    return;
  }
  const baseDir = getBaseUserDataPath();
  const configPath = path.join(baseDir, "global-config.json");
  const existing = loadGlobalConfig();
  const updated: GlobalConfig = {
    lastActiveAccountId:
      config.lastActiveAccountId !== undefined
        ? config.lastActiveAccountId
        : existing.lastActiveAccountId,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write global-config.json:", err);
  }
}

export function getActiveAccountId(): string | null {
  ensureInitialized();
  return activeAccountId;
}

export function setActiveAccountId(accountId: string | null): void {
  activeAccountId = accountId;
  saveGlobalConfig({ lastActiveAccountId: accountId });
  initialized = true;
}

function ensureInitialized() {
  if (!initialized) {
    try {
      const config = loadGlobalConfig();
      activeAccountId = config.lastActiveAccountId;
    } catch {
      activeAccountId = null;
    }
    initialized = true;
  }
}

export function getUserDataPath(): string {
  ensureInitialized();

  const baseDir = getBaseUserDataPath();
  const subFolder = activeAccountId
    ? `users/${activeAccountId}`
    : `users/${getOSUsername()}`;

  return path.join(baseDir, subFolder);
}

function resolvePreferredPath(
  primaryPath: string,
  legacyPath?: string,
): string {
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }
  if (legacyPath && fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  return primaryPath;
}

function readLayoutMarker(userDataPath: string): LayoutMarkerRecord | null {
  const markerPath = path.join(userDataPath, LAYOUT_MIGRATION_MARKER);
  if (!fs.existsSync(markerPath)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(markerPath, "utf8"),
    ) as LayoutMarkerRecord;
  } catch {
    return null;
  }
}

export function getDataDir(): string {
  return path.join(getUserDataPath(), "data");
}

export function getLegacyDatabasePath(): string {
  return path.join(getUserDataPath(), "prompthub.db");
}

export function getDatabasePath(): string {
  const userDataPath = getUserDataPath();
  const unifiedDbPath = path.join(getDataDir(), "prompthub.db");
  const legacyDbPath = getLegacyDatabasePath();
  const globalLegacyDbPath = path.join(getBaseUserDataPath(), "prompthub.db");
  const marker = readLayoutMarker(userDataPath);

  if (marker?.dbLayoutVersion === "0.5.7" && fs.existsSync(unifiedDbPath)) {
    return unifiedDbPath;
  }

  if (fs.existsSync(legacyDbPath)) {
    return legacyDbPath;
  }

  if (fs.existsSync(globalLegacyDbPath)) {
    return globalLegacyDbPath;
  }

  return unifiedDbPath;
}

export function getConfigDir(): string {
  return path.join(getUserDataPath(), "config");
}

export function getLogsDir(): string {
  return path.join(getUserDataPath(), "logs");
}

export function getAssetsDir(): string {
  return path.join(getDataDir(), "assets");
}

export function getAttachmentsDir(): string {
  return path.join(getAssetsDir(), "attachments");
}

export function getLegacySkillsDir(): string {
  return path.join(getUserDataPath(), "skills");
}

export function getSkillsDir(): string {
  return resolvePreferredPath(
    path.join(getDataDir(), "skills"),
    getLegacySkillsDir(),
  );
}

export function getRulesDir(): string {
  return path.join(getDataDir(), "rules");
}

export function getLegacyWorkspaceDir(): string {
  return path.join(getUserDataPath(), "workspace");
}

export function getLegacyPromptsWorkspaceDir(): string {
  return path.join(getLegacyWorkspaceDir(), "prompts");
}

export function getPromptsDir(): string {
  return resolvePreferredPath(
    path.join(getDataDir(), "prompts"),
    getLegacyPromptsWorkspaceDir(),
  );
}

export function getWorkspaceDir(): string {
  const dataDir = getDataDir();
  if (
    fs.existsSync(path.join(dataDir, "prompts")) ||
    fs.existsSync(path.join(dataDir, "folders.json"))
  ) {
    return dataDir;
  }

  const legacyWorkspaceDir = getLegacyWorkspaceDir();
  if (fs.existsSync(legacyWorkspaceDir)) {
    return legacyWorkspaceDir;
  }

  return dataDir;
}

export function getPromptsWorkspaceDir(): string {
  return getPromptsDir();
}

export function getLegacyImagesDir(): string {
  return path.join(getUserDataPath(), "images");
}

export function getImagesDir(): string {
  return resolvePreferredPath(
    path.join(getAssetsDir(), "images"),
    getLegacyImagesDir(),
  );
}

export function getLegacyVideosDir(): string {
  return path.join(getUserDataPath(), "videos");
}

export function getVideosDir(): string {
  return resolvePreferredPath(
    path.join(getAssetsDir(), "videos"),
    getLegacyVideosDir(),
  );
}
