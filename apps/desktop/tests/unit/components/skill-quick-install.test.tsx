import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { SkillQuickInstall } from "../../../src/renderer/components/skill/SkillQuickInstall";
import { installWindowMocks } from "../../helpers/window";

import en from "../../../src/renderer/i18n/locales/en.json";

type TranslationTree = Record<string, unknown>;
let currentTranslations: TranslationTree = en as TranslationTree;

function getPathValue(source: TranslationTree, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!segment) return current;
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as TranslationTree)[segment];
  }, source);
}

function interpolate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    String(values[key] ?? ""),
  );
}

function translate(
  key: string,
  defaultValueOrOptions?: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>,
): string {
  const options =
    typeof defaultValueOrOptions === "object" && defaultValueOrOptions !== null
      ? defaultValueOrOptions
      : maybeOptions || {};
  const defaultValue =
    typeof defaultValueOrOptions === "string"
      ? defaultValueOrOptions
      : typeof options.defaultValue === "string"
        ? options.defaultValue
        : key;
  const value = getPathValue(currentTranslations, key);
  const template = typeof value === "string" ? value : defaultValue;
  return interpolate(template, options);
}

const useSkillStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillPlatformMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSkillStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/components/skill/use-skill-platform", () => ({
  useSkillPlatform: (...args: unknown[]) => useSkillPlatformMock(...args),
}));

const baseSkill: Skill = {
  id: "skill-write",
  name: "write",
  description: "Write better",
  instructions: "# Write\n\nHelp the user write better.",
  content: "# Write\n\nHelp the user write better.",
  protocol_type: "skill",
  author: "Local",
  local_repo_path: "/Users/demo/skills/write",
  source_url: "/Users/demo/skills/write",
  tags: ["general"],
  is_favorite: false,
  currentVersion: 0,
  created_at: Date.now(),
  updated_at: Date.now(),
};

function createSkillStoreState(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    projectScanState: {
      "project-1": {
        scannedSkills: [],
        isScanning: false,
        error: null,
      },
      "project-2": {
        scannedSkills: [
          {
            name: "write",
            localPath: "/tmp/workspace2/.agents/skills/write",
            version: "1.0.0",
          },
        ],
        isScanning: false,
        error: null,
      },
    },
    scanProjectSkills: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createSettingsState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    skillInstallMethod: "symlink",
    skillProjects: [
      {
        id: "project-1",
        name: "Workspace 1",
        rootPath: "/tmp/workspace1",
        scanPaths: [],
        deployTargets: ["/tmp/workspace1/.agents/skills"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "project-2",
        name: "Workspace 2",
        rootPath: "/tmp/workspace2",
        scanPaths: [],
        deployTargets: ["/tmp/workspace2/.agents/skills"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    updateSkillProject: vi.fn(),
    ...overrides,
  };
}

function bindStoreSelector<TState extends Record<string, unknown>>(
  state: TState,
) {
  return (selector?: ((value: TState) => unknown) | undefined) =>
    typeof selector === "function" ? selector(state) : state;
}

describe("SkillQuickInstall Component", () => {
  const showToast = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast });
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [{ id: "claude", name: "Claude Code" }],
      batchInstall: vi.fn().mockResolvedValue({
        successCount: 0,
        totalCount: 0,
        failures: [],
        fallbacks: [],
      }),
      deselectAllPlatforms: vi.fn(),
      installProgress: null,
      installDetails: {},
      installStatus: {},
      isBatchInstalling: false,
      selectedPlatforms: new Set<string>(),
      selectAllPlatforms: vi.fn(),
      togglePlatformSelection: vi.fn(),
      uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
      uninstalledPlatforms: [{ id: "claude", name: "Claude Code" }],
    });
  });

  it("hides the project section if skillProjects is empty", async () => {
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue("/local/path/to/skill"),
        },
      },
    });

    useSkillStoreMock.mockImplementation(
      bindStoreSelector(createSkillStoreState()),
    );
    useSettingsStoreMock.mockImplementation(
      bindStoreSelector(createSettingsState({ skillProjects: [] })),
    );

    await act(async () => {
      render(<SkillQuickInstall skill={baseSkill} onClose={onClose} />);
    });

    expect(screen.queryByText("Select projects to install")).toBeNull();
  });

  it("renders project list, allows selecting projects, and correctly displays 'Installed' for projects already possessing the skill", async () => {
    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue("/local/path/to/skill"),
        },
      },
    });

    useSkillStoreMock.mockImplementation(
      bindStoreSelector(createSkillStoreState()),
    );
    useSettingsStoreMock.mockImplementation(
      bindStoreSelector(createSettingsState()),
    );

    await act(async () => {
      render(<SkillQuickInstall skill={baseSkill} onClose={onClose} />);
    });

    // Wait for the repo path to resolve and trigger state updates
    await waitFor(() => {
      expect(screen.getByText("Workspace 1")).toBeInTheDocument();
    });

    expect(screen.getByText("Workspace 2")).toBeInTheDocument();

    // Workspace 2 is already installed
    await waitFor(() => {
      const workspace2Card = screen.getByText("Workspace 2").closest(".rounded-xl");
      expect(workspace2Card).toHaveTextContent("Installed");
    });

    // Click Workspace 1 to select it
    const workspace1Card = screen.getByText("Workspace 1");
    await act(async () => {
      fireEvent.click(workspace1Card);
    });

    // Install Selected should now be enabled and show (1) selected target
    const installBtn = screen.getByRole("button", { name: /Install Selected/ });
    expect(installBtn).not.toBeDisabled();
    expect(installBtn).toHaveTextContent("Install Selected (1)");
  });

  it("correctly invokes symlink copy to project folders and triggers rescans upon clicking install", async () => {
    const copyRepoMock = vi.fn().mockResolvedValue("");
    const scanProjectSkillsMock = vi.fn().mockResolvedValue([]);
    const updateSkillProjectMock = vi.fn();

    installWindowMocks({
      api: {
        skill: {
          getRepoPath: vi.fn().mockResolvedValue("/local/path/to/skill"),
          copyRepoByPathToDirectory: copyRepoMock,
        },
      },
    });

    useSkillStoreMock.mockImplementation(
      bindStoreSelector(
        createSkillStoreState({
          scanProjectSkills: scanProjectSkillsMock,
        }),
      ),
    );
    useSettingsStoreMock.mockImplementation(
      bindStoreSelector(
        createSettingsState({
          updateSkillProject: updateSkillProjectMock,
        }),
      ),
    );

    await act(async () => {
      render(<SkillQuickInstall skill={baseSkill} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Workspace 1")).toBeInTheDocument();
    });

    // Click to select Workspace 1
    await act(async () => {
      fireEvent.click(screen.getByText("Workspace 1"));
    });

    // Click install button
    const installBtn = screen.getByRole("button", { name: /Install Selected/ });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    // Verify copy call
    expect(copyRepoMock).toHaveBeenCalledWith(
      "/local/path/to/skill",
      "write",
      "/tmp/workspace1/.agents/skills",
      { ifExists: "skip", mode: "symlink" },
    );

    // Verify scan triggering and update settings store
    await waitFor(() => {
      expect(scanProjectSkillsMock).toHaveBeenCalled();
      expect(updateSkillProjectMock).toHaveBeenCalledWith("project-1", {
        lastScannedAt: expect.any(Number),
      });
    });

    // Toast check
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("1/1"),
      "success",
    );

    // Verify onClose is called after 1s
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    }, { timeout: 1500 });
  });
});
