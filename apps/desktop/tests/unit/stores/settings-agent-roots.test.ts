import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStore(settingsFromMain?: Record<string, unknown>) {
  vi.resetModules();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  window.api = {
    ...(window.api ?? {}),
    settings: {
      ...(window.api?.settings ?? {}),
      get: vi.fn().mockResolvedValue({ githubToken: "", ...(settingsFromMain ?? {}) }),
      set: setSpy,
    },
  };

  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return {
    useSettingsStore: mod.useSettingsStore,
    setSpy,
    loadSettingsFromMainProcess: mod.loadSettingsFromMainProcess,
  };
}

describe("settings store agent roots", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("migrates legacy custom skill scan paths into custom agent roots", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          customSkillScanPaths: ["~/.agents", "~/.agents/"],
        },
        version: 11,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().customAgents).toEqual([
      expect.objectContaining({ name: "Custom Agent 1", rootPath: "~/.agents" }),
    ]);
    expect(useSettingsStore.getState().customAgentRootPaths).toEqual(["~/.agents"]);
    expect(useSettingsStore.getState().customSkillScanPaths).toEqual(["~/.agents"]);
  });

  it("preserves custom agent capability fields when updating one property", async () => {
    const { useSettingsStore } = await importStore();

    useSettingsStore.getState().setCustomAgents([
      {
        id: "team-agents",
        name: "Team Agents",
        rootPath: "~/.agents",
        enabled: false,
        skillsRelativePath: "skills",
        rulesRelativePath: "AGENTS.md",
        agentsRelativePath: "agents",
        commandsRelativePath: "commands",
        configRelativePaths: ["settings.json"],
      },
    ]);

    useSettingsStore.getState().updateCustomAgent("team-agents", {
      name: "Team Agents Updated",
    });

    expect(useSettingsStore.getState().customAgents).toEqual([
      expect.objectContaining({
        id: "team-agents",
        name: "Team Agents Updated",
        rootPath: "~/.agents",
        enabled: false,
        skillsRelativePath: "skills",
        rulesRelativePath: "AGENTS.md",
        agentsRelativePath: "agents",
        commandsRelativePath: "commands",
        configRelativePaths: ["settings.json"],
      }),
    ]);
  });

  it("adds default project deploy targets under .agents/skills", async () => {
    const { useSettingsStore } = await importStore();

    const project = useSettingsStore.getState().addSkillProject({
      name: "Workspace",
      rootPath: "/tmp/workspace",
      scanPaths: [],
    });

    expect(project.deployTargets).toEqual(["/tmp/workspace/.agents/skills"]);
    expect(useSettingsStore.getState().skillProjects[0]?.deployTargets).toEqual([
      "/tmp/workspace/.agents/skills",
    ]);
  });

  it("migrates legacy Trae CN root overrides onto the trae-cn platform", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          customPlatformRootPaths: { trae: "~/.trae-cn" },
          disabledPlatformIds: ["trae"],
          skillPlatformOrder: ["claude", "trae", "codex"],
        },
        version: 12,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().customPlatformRootPaths).toEqual({
      "trae-cn": "~/.trae-cn",
    });
    expect(useSettingsStore.getState().disabledPlatformIds).toEqual(["trae-cn"]);
    expect(useSettingsStore.getState().skillPlatformOrder).toEqual([
      "claude",
      "trae-cn",
      "codex",
    ]);
  });

  it("loads legacy custom agent root paths from main process when custom agents are absent", async () => {
    const { useSettingsStore, loadSettingsFromMainProcess } = await importStore({
      customAgents: [],
      customAgentRootPaths: ["~/.legacy-agents"],
      githubToken: "",
    });

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().customAgents).toEqual([]);
    expect(useSettingsStore.getState().customAgentRootPaths).toEqual([
      "~/.legacy-agents",
    ]);
    expect(useSettingsStore.getState().customSkillScanPaths).toEqual([
      "~/.legacy-agents",
    ]);
  });

  it("migrates legacy built-in root overrides into builtinAgentOverrides", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          customPlatformRootPaths: { opencode: "~/.opencode-custom" },
        },
        version: 13,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().builtinAgentOverrides).toEqual({
      opencode: { rootPath: "~/.opencode-custom" },
    });
    expect(useSettingsStore.getState().customPlatformRootPaths).toEqual({
      opencode: "~/.opencode-custom",
    });
  });

});
