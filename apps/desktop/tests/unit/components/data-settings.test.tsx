import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataSettings } from "../../../src/renderer/components/settings/DataSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { restoreFromFile } from "../../../src/renderer/services/database-backup";
import { previewImportFile } from "../../../src/renderer/services/database-backup";
import { downloadSelectiveExport } from "../../../src/renderer/services/database-backup";
import {
  createUpgradeBackup,
  listUpgradeBackups,
  restoreUpgradeBackup,
} from "../../../src/renderer/services/upgrade-backup";
import {
  runFullExportBackup,
  runSelfHostedConnectionCheck,
} from "../../../src/renderer/services/backup-orchestrator";

const useSettingsStoreMock = Object.assign(vi.fn(), { setState: vi.fn() });
const useToastMock = vi.fn();
const useSkillStoreMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: Object.assign(
    () => useSettingsStoreMock(),
    {
      setState: (...args: any[]) => useSettingsStoreMock.setState(...args),
    }
  ),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      scanInstalledSkillSafety: useSkillStoreMock,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  BACKUP_IMPORT_ACCEPT: ".json,.phub,.gz,.zip",
  downloadBackup: vi.fn(),
  downloadCompressedBackup: vi.fn(),
  downloadSelectiveExport: vi.fn(),
  formatBackupImportError: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("FOREIGN KEY constraint failed")) {
      return "备份中的文件夹或 Prompt 引用关系不完整，PromptHub 无法安全导入。建议重新导出一份新备份后再试。";
    }
    return message;
  },
  pickSupportedBackupFile: vi.fn((files: FileList | File[]) =>
    Array.from(files)[0] ?? null,
  ),
  previewImportFile: vi.fn(),
  restoreFromFile: vi.fn(),
}));

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: vi.fn(),
}));



vi.mock("../../../src/renderer/services/self-hosted-sync", () => ({
  testSelfHostedConnection: vi.fn(),
  pushToSelfHostedWeb: vi.fn(),
  pullFromSelfHostedWeb: vi.fn(),
}));

vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runFullExportBackup: vi.fn(),
  runSelfHostedConnectionCheck: vi.fn(),
  runSelfHostedPull: vi.fn(),
  runSelfHostedPush: vi.fn(),
}));

vi.mock("../../../src/renderer/services/upgrade-backup", () => ({
  createUpgradeBackup: vi.fn(),
  listUpgradeBackups: vi.fn(),
  deleteUpgradeBackup: vi.fn(),
  restoreUpgradeBackup: vi.fn(),
}));

function createSettingsState() {
  return {
    aiModels: [],
    dataPath: "/stale/path",
    setDataPath: vi.fn(),
    skillInstallMethod: "symlink",
    setSkillInstallMethod: vi.fn(),
    customPlatformRootPaths: {},
    setCustomPlatformRootPath: vi.fn(),
    resetCustomPlatformRootPath: vi.fn(),
    customSkillPlatformPaths: {},
    setCustomSkillPlatformPath: vi.fn(),
    resetCustomSkillPlatformPath: vi.fn(),
    skillPlatformOrder: [],
    setSkillPlatformOrder: vi.fn(),
    resetSkillPlatformOrder: vi.fn(),
    customSkillScanPaths: [],
    addCustomSkillScanPath: vi.fn(),
    removeCustomSkillScanPath: vi.fn(),
    syncProvider: "manual",
    setSyncProvider: vi.fn(),
    selfHostedSyncEnabled: false,
    selfHostedSyncUrl: "",
    selfHostedSyncUsername: "",
    selfHostedSyncPassword: "",
    selfHostedSyncOnStartup: false,
    selfHostedSyncOnStartupDelay: 10,
    selfHostedAutoSyncInterval: 0,
    setSelfHostedSyncEnabled: vi.fn(),
    setSelfHostedSyncUrl: vi.fn(),
    setSelfHostedSyncUsername: vi.fn(),
    setSelfHostedSyncPassword: vi.fn(),
    setSelfHostedSyncOnStartup: vi.fn(),
    setSelfHostedSyncOnStartupDelay: vi.fn(),
    setSelfHostedAutoSyncInterval: vi.fn(),
    isSyncVerified: false,
    setIsSyncVerified: vi.fn(),
  };
}

describe("DataSettings", { timeout: 15_000 }, () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);
    useSkillStoreMock.mockResolvedValue({
      total: 0,
      blocked: 0,
      highRisk: 0,
      warn: 0,
    });

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
        database: {
          switchAccount: vi.fn().mockResolvedValue({ success: true }),
        },
        settings: {
          set: vi.fn().mockResolvedValue(true),
          get: vi.fn().mockResolvedValue({}),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: "/next/data",
          currentPath: "/actual/data",
          needsRestart: true,
        }),
        getRuntimePaths: vi.fn().mockResolvedValue({
          userDataPath: "/actual/data",
          dataDir: "/actual/data/data",
          databasePath: "/actual/data/data/prompthub.db",
          promptsDir: "/actual/data/data/prompts",
          rulesDir: "/actual/data/data/rules",
          skillsDir: "/actual/data/data/skills",
          backupsDir: "/actual/data/backups",
          logsDir: "/actual/data/logs",
          activeAccountId: null,
        }),
      },
    });

    useSettingsStoreMock.mockReturnValue(createSettingsState());
    useToastMock.mockReturnValue({ showToast: vi.fn() });
    vi.mocked(listUpgradeBackups).mockResolvedValue([]);
    vi.mocked(createUpgradeBackup).mockResolvedValue({
      created: true,
      skipped: false,
      backupId: "backup-1",
      backupPath: "/tmp/PromptHub/backups/backup-1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__;
  });

  it("shows the real current data path and the pending path after restart", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "/actual/data" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("Will switch to this directory after restart:"),
    ).toBeInTheDocument();
    expect(screen.getByText("/next/data")).toBeInTheDocument();
  });

  it("offers switching instead of migrating when the selected directory already has data", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    const relaunchApp = vi.fn().mockResolvedValue({ success: true });
    const applyDataPathChange = vi.fn().mockResolvedValue({
      success: true,
      newPath: "/copied/PromptHub",
      needsRestart: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        relaunchApp,
        selectFolder: vi.fn().mockResolvedValue("/copied/PromptHub"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/copied/PromptHub",
          exists: true,
          hasPromptHubData: true,
          isCurrentPath: false,
          markers: [{ name: "prompthub.db" }, { name: "data" }],
          targetSummary: {
            promptCount: 4,
            folderCount: 2,
            skillCount: 1,
            available: true,
          },
        }),
        applyDataPathChange,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Target directory already contains PromptHub data"),
      ).toBeInTheDocument();
    });
    expect(applyDataPathChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to this directory" }),
      );
    });

    await waitFor(() => {
      expect(applyDataPathChange).toHaveBeenCalledWith(
        "/copied/PromptHub",
        "switch",
      );
    });
    expect(showToast).toHaveBeenCalledWith(
      "Data directory switched Please restart the app",
      "success",
    );

    await waitFor(
      () => {
        expect(relaunchApp).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );
  });

  it("migrates immediately after confirmation when the selected directory is empty", async () => {
    const applyDataPathChange = vi.fn().mockResolvedValue({
      success: true,
      newPath: "/empty/PromptHub",
      needsRestart: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        selectFolder: vi.fn().mockResolvedValue("/empty/PromptHub"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/empty/PromptHub",
          exists: true,
          hasPromptHubData: false,
          isCurrentPath: false,
          markers: [],
        }),
        applyDataPathChange,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(applyDataPathChange).toHaveBeenCalledWith(
        "/empty/PromptHub",
        "migrate",
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
  });

  it("does not prompt for restart when the chosen data directory is already active", async () => {
    const showToast = vi.fn();
    const relaunchApp = vi.fn().mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    useToastMock.mockReturnValue({ showToast });

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        relaunchApp,
        selectFolder: vi.fn().mockResolvedValue("/actual/data"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/actual/data",
          exists: true,
          hasPromptHubData: true,
          isCurrentPath: true,
          markers: [{ name: "prompthub.db" }],
        }),
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Data directory switched",
        "success",
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
  });

  it("lets users add manual recovery scan directories and open the recovery browser", async () => {
    const checkRecoveryMock = vi.fn().mockResolvedValue([
      {
        sourcePath: "C:/Users/test/AppData/Roaming/prompthub",
        sourceType: "external-user-data",
        displayName: "Previous data directory",
        displayPath: "C:/Users/test/AppData/Roaming/prompthub",
        promptCount: 12,
        folderCount: 3,
        skillCount: 2,
        dbSizeBytes: 16384,
        lastModified: "2026-04-18T12:00:00.000Z",
        previewAvailable: false,
        dataSources: ["browser-storage"],
        description: "Detected legacy renderer storage only.",
      },
    ]);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: "/next/data",
          currentPath: "/actual/data",
          needsRestart: true,
        }),
        selectFolder: vi.fn().mockResolvedValue("D:/PromptHub-legacy"),
        checkRecovery: checkRecoveryMock,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="recovery" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add folder" }));

    await waitFor(() => {
      expect(screen.getByText("D:/PromptHub-legacy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Scan now" }));

    await waitFor(() => {
      expect(checkRecoveryMock).toHaveBeenCalledWith({
        extraPaths: ["D:/PromptHub-legacy"],
        ignoreDismissMarker: true,
      });
    });

    expect(screen.getByText("Recovery Sources")).toBeInTheDocument();
    expect(
      screen.getAllByText("C:/Users/test/AppData/Roaming/prompthub").length,
    ).toBeGreaterThan(0);
  });

  it("imports a backup file through the import action with preview confirmation", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(previewImportFile).mockResolvedValue({
      backup: {
        version: 1,
        exportedAt: "2026-04-17T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
      },
      summary: {
        kind: "prompthub-backup",
        exportedAt: "2026-04-17T00:00:00.000Z",
        counts: {
          prompts: 0,
          folders: 0,
          versions: 0,
          skills: 0,
          skillVersions: 0,
          skillFiles: 0,
          images: 0,
          videos: 0,
        },
        skipped: {
          folders: 0,
          prompts: 0,
          skillFiles: 0,
          skillVersions: 0,
          skills: 0,
          versions: 0,
        },
      },
    });
    vi.mocked(restoreFromFile).mockResolvedValue({
      folders: 0,
      prompts: 0,
      skillFiles: 0,
      skillVersions: 0,
      skills: 0,
      versions: 0,
    });

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".json,.phub,.gz,.zip");

    const file = { name: "prompthub-export.phub.gz" } as File;

    await act(async () => {
      await input.onchange?.({
        target: { files: [file] },
      } as unknown as Event);
    });

    expect(previewImportFile).toHaveBeenCalledWith(file);

    await waitFor(() => {
      expect(screen.getByText("Review import summary")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Back up current data and import" }),
    );

    await waitFor(() => {
      expect(createUpgradeBackup).toHaveBeenCalled();
    });
    expect(restoreFromFile).toHaveBeenCalledWith(file);
    expect(showToast).toHaveBeenCalledWith("Data imported successfully", "success");
  });

  it("runs full backup export from the full backup button", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "zh",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "全量备份" }));

    await waitFor(() => {
      expect(runFullExportBackup).toHaveBeenCalledWith({
        currentVersion: "0.4.5",
        recordManualBackup: true,
      });
    });
    expect(showToast).toHaveBeenCalledWith("数据导出成功", "success");
  });

  it("shows a friendly restore error message when import fails", async () => {
    const showToast = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(previewImportFile).mockRejectedValue(
      new Error(
        "Error invoking remote method 'folder:insertDirect': SQLite3Error: FOREIGN KEY constraint failed",
      ),
    );
    vi.mocked(restoreFromFile).mockRejectedValue(
      new Error(
        "Error invoking remote method 'folder:insertDirect': SQLite3Error: FOREIGN KEY constraint failed",
      ),
    );

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));

    await act(async () => {
      await input.onchange?.({
        target: { files: [{ name: "broken.phub.gz" }] },
      } as unknown as Event);
    });

    expect(showToast).toHaveBeenCalledWith(
      "Import failed: 备份中的文件夹或 Prompt 引用关系不完整，PromptHub 无法安全导入。建议重新导出一份新备份后再试。",
      "error",
    );
  });

  it("accepts dropping a backup file into the backup restore target", async () => {
    const beginImportFromFile = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(
        <DataSettings
          activeSubsection="backup"
          backupImportController={{
            requestFileSelection: vi.fn(),
            beginImportFromFile,
          }}
        />,
        {
          language: "en",
        },
      );
    });

    const heading = screen.getByText("Drag to Restore Backup");
    const dropTarget = heading.closest("div.rounded-xl") as HTMLDivElement | null;
    expect(dropTarget).not.toBeNull();

    const file = new File(["backup"], "prompthub-export.phub.gz", {
      type: "application/gzip",
    });

    fireEvent.dragEnter(dropTarget!, {
      dataTransfer: {
        items: [{ kind: "file", type: file.type }],
        files: [file],
      },
    });
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        items: [{ kind: "file", type: file.type }],
        files: [file],
      },
    });

    await waitFor(() => {
      expect(beginImportFromFile).toHaveBeenCalledWith(file);
    });
  });

  it("tests a self-hosted PromptHub connection from desktop settings", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue({
      ...createSettingsState(),
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://backup.example.com",
      selfHostedSyncUsername: "owner",
      selfHostedSyncPassword: "secret",
    });
    vi.mocked(runSelfHostedConnectionCheck).mockResolvedValue({
      prompts: 3,
      folders: 2,
      rules: 4,
      skills: 1,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="selfHosted" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(runSelfHostedConnectionCheck).toHaveBeenCalledWith({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      });
    });
    expect(showToast).toHaveBeenCalledWith(
      "Connection successful. Remote workspace currently stores 3 prompts, 2 folders, 4 rules, and 1 skills.",
      "success",
    );
  });

  it("lets users choose one active sync source while keeping self-hosted target enabled", async () => {
    const settingsState = createSettingsState();
    settingsState.selfHostedSyncEnabled = true;
    settingsState.syncProvider = "manual";
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="selfHosted" />, {
        language: "en",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Manual only" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Self-Hosted PromptHub" }),
    );

    expect(settingsState.setSyncProvider).toHaveBeenCalledWith("self-hosted");
  });

  it("includes rules in selective export by default", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(downloadSelectiveExport).toHaveBeenCalledWith(
        expect.objectContaining({
          rules: true,
          skills: true,
        }),
      );
    });
  });

  it("keeps web data settings focused on backup flows", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ = true;

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Data Path")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear Data" })).toBeNull();
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.queryByText("Will switch to this directory after restart:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Test Connection" })).toBeNull();
  });

  it("keeps desktop data settings free of standalone skill configuration controls", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Skill Install Method")).toBeNull();
    expect(screen.queryByText("Platform Display Order")).toBeNull();
    expect(screen.queryByText("Platform Target Directories")).toBeNull();
    expect(screen.queryByText("Extra Scan Directories")).toBeNull();
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
  });

  it("renders automatic upgrade backups returned by the desktop API", async () => {
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "v0.5.3-2026-04-17T00-00-00-000Z",
        backupPath: "/tmp/PromptHub/backups/v0.5.3-2026-04-17T00-00-00-000Z",
        sizeBytes: 2048,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db", "workspace"],
          platform: "darwin",
        },
      },
    ]);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Roll back data")).toBeInTheDocument();
    });

    expect(screen.getByText("0.5.3 -> 0.5.4")).toBeInTheDocument();
    expect(
      screen.getByText(/包含项目|Included items/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Roll back to this snapshot" }),
    ).toBeInTheDocument();
  });

  it("shows only the latest three upgrade backups until expanded", async () => {
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "backup-1",
        backupPath: "/tmp/PromptHub/backups/backup-1",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.1",
          toVersion: "0.5.2",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-2",
        backupPath: "/tmp/PromptHub/backups/backup-2",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-18T00:00:00.000Z",
          fromVersion: "0.5.2",
          toVersion: "0.5.3",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-3",
        backupPath: "/tmp/PromptHub/backups/backup-3",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-19T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-4",
        backupPath: "/tmp/PromptHub/backups/backup-4",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-20T00:00:00.000Z",
          fromVersion: "0.5.4",
          toVersion: "0.5.5",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
    ]);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("4 rollback snapshot(s)")).toBeInTheDocument();
    });

    expect(
      screen.getAllByRole("button", { name: "Roll back to this snapshot" }),
    ).toHaveLength(3);
    expect(screen.queryByText("0.5.4 -> 0.5.5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all 4" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Roll back to this snapshot" }),
      ).toHaveLength(4);
    });
    expect(screen.getByText("0.5.4 -> 0.5.5")).toBeInTheDocument();
  });

  it("confirms and restores an upgrade backup", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "v0.5.3-2026-04-17T00-00-00-000Z",
        backupPath: "/tmp/PromptHub/backups/v0.5.3-2026-04-17T00-00-00-000Z",
        sizeBytes: 2048,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db", "workspace"],
          platform: "darwin",
        },
      },
    ]);
    vi.mocked(restoreUpgradeBackup).mockResolvedValue({
      success: true,
      needsRestart: true,
      restoredBackupId: "v0.5.3-2026-04-17T00-00-00-000Z",
      currentStateBackupPath: "/tmp/PromptHub/backups/insurance",
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Roll back to this snapshot" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Roll back to this snapshot" }));

    await waitFor(() => {
      expect(screen.getByText("Restore upgrade backup")).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole("button", {
      name: "Roll back to this snapshot",
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(restoreUpgradeBackup).toHaveBeenCalledWith(
        "v0.5.3-2026-04-17T00-00-00-000Z",
      );
    });

    expect(showToast).toHaveBeenCalledWith(
      "Upgrade backup restored. PromptHub will restart automatically.",
      "success",
    );
  }, 10000);

  it("displays current account status and switches back to guest", async () => {
    const switchAccount = vi.fn().mockResolvedValue({ success: true });
    const originalReload = window.location.reload;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    
    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
        database: {
          switchAccount,
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        getRuntimePaths: vi.fn().mockResolvedValue({
          userDataPath: "/actual/data/users/zzq02",
          dataDir: "/actual/data/users/zzq02/data",
          databasePath: "/actual/data/users/zzq02/data/prompthub.db",
          promptsDir: "/actual/data/users/zzq02/data/prompts",
          rulesDir: "/actual/data/users/zzq02/data/rules",
          skillsDir: "/actual/data/users/zzq02/data/skills",
          backupsDir: "/actual/data/users/zzq02/backups",
          logsDir: "/actual/data/users/zzq02/logs",
          activeAccountId: "zzq02",
        }),
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "zh",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("当前本地账户")).toBeInTheDocument();
    });

    expect(screen.getByText(/云端同步账户.*zzq02/)).toBeInTheDocument();
    expect(screen.getAllByText("/actual/data/users/zzq02").length).toBeGreaterThanOrEqual(1);

    const logoutBtn = screen.getByRole("button", { name: "注销并切回访客" });
    expect(logoutBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    await waitFor(() => {
      expect(switchAccount).toHaveBeenCalledWith(null);
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: originalReload },
    });
  });

  it("scans and displays local accounts in guest mode, and loads a selected account", async () => {
    const getLocalAccounts = vi.fn().mockResolvedValue(["user_a"]);
    const switchAccount = vi.fn().mockResolvedValue({ success: true });
    const getSettings = vi.fn().mockResolvedValue({
      syncProvider: "self-hosted",
      selfHostedSyncUsername: "user_a",
      selfHostedSyncUrl: "https://example.com/api",
      sync: { provider: "self-hosted" }
    });
    
    const originalReload = window.location.reload;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
        database: {
          getLocalAccounts,
          switchAccount,
        },
        settings: {
          get: getSettings,
          set: vi.fn().mockResolvedValue(true),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        getRuntimePaths: vi.fn().mockResolvedValue({
          userDataPath: "/actual/data/users/guest",
          dataDir: "/actual/data/users/guest/data",
          databasePath: "/actual/data/users/guest/data/prompthub.db",
          promptsDir: "/actual/data/users/guest/data/prompts",
          rulesDir: "/actual/data/users/guest/data/rules",
          skillsDir: "/actual/data/users/guest/data/skills",
          backupsDir: "/actual/data/users/guest/backups",
          logsDir: "/actual/data/users/guest/logs",
          activeAccountId: null,
        }),
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "zh",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("本机已缓存的云端账户")).toBeInTheDocument();
    });

    expect(screen.getByText("user_a")).toBeInTheDocument();
    const loadBtn = screen.getByRole("button", { name: "载入此账号数据" });
    expect(loadBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(loadBtn);
    });

    await waitFor(() => {
      expect(switchAccount).toHaveBeenCalledWith("user_a");
    });
    expect(getSettings).toHaveBeenCalled();
    expect(useSettingsStoreMock.setState).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: originalReload },
    });
  });
});
