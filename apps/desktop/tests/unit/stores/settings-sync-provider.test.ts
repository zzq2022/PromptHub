import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStoreWithSettingsSpies(
  settingsFromMain: Record<string, unknown> = { githubToken: "" },
) {
  vi.resetModules();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  const getSpy = vi.fn().mockResolvedValue(settingsFromMain);
  window.api = {
    ...(window.api ?? {}),
    settings: {
      ...(window.api?.settings ?? {}),
      get: getSpy,
      set: setSpy,
    },
  };
  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return {
    useSettingsStore: mod.useSettingsStore,
    setSpy,
    getSpy,
    loadSettingsFromMainProcess: mod.loadSettingsFromMainProcess,
  };
}

function lastPayloadWithKey(
  spy: ReturnType<typeof vi.fn>,
  key: string,
): Record<string, unknown> | undefined {
  for (let i = spy.mock.calls.length - 1; i >= 0; i -= 1) {
    const payload = spy.mock.calls[i]?.[0] as
      | Record<string, unknown>
      | undefined;
    if (payload && key in payload) {
      return payload;
    }
  }
  return undefined;
}

describe("settings sync provider guards", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("falls back to manual when disabling the active self-hosted sync provider", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setSelfHostedSyncEnabled(true);
    useSettingsStore.getState().setSyncProvider("self-hosted");
    setSpy.mockClear();

    useSettingsStore.getState().setSelfHostedSyncEnabled(false);

    expect(useSettingsStore.getState().selfHostedSyncEnabled).toBe(false);
    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("rejects selecting an automatic sync provider that is not enabled", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setSyncProvider("self-hosted");

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("infers the only active legacy auto-sync provider during migration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          selfHostedSyncEnabled: true,
          selfHostedSyncOnStartup: true,
        },
        version: 8,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().syncProvider).toBe("self-hosted");
  });

  it("clamps an invalid persisted sync provider after migration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          selfHostedSyncEnabled: false,
          syncProvider: "self-hosted",
        },
        version: 9,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
  });

  it("clamps a main-process sync provider to manual when that provider is disabled locally", async () => {
    const { useSettingsStore, setSpy, loadSettingsFromMainProcess } =
      await importStoreWithSettingsSpies({
        githubToken: "",
        sync: { provider: "self-hosted" },
      });

    expect(useSettingsStore.getState().selfHostedSyncEnabled).toBe(false);
    setSpy.mockClear();

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });
});
