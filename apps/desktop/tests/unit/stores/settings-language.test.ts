import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings language actions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes locale variants before updating settings", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setLanguage("en-US");

    expect(useSettingsStore.getState().language).toBe("en");
    expect(changeLanguageMock).toHaveBeenCalledWith("en");
  });

  it("maps traditional chinese locale aliases to zh", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setLanguage("zh-Hant");

    expect(useSettingsStore.getState().language).toBe("zh");
    expect(changeLanguageMock).toHaveBeenCalledWith("zh");
  });
});
