import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerPeriodicAutoSyncController,
  type PeriodicAutoSyncController,
  type PeriodicAutoSyncSettings,
} from "../../../src/renderer/services/periodic-auto-sync";

function createSettingsHarness(initial: PeriodicAutoSyncSettings) {
  let settings = initial;
  const listeners = new Set<
    (state: PeriodicAutoSyncSettings, previous: PeriodicAutoSyncSettings) => void
  >();

  return {
    getSettings: () => settings,
    setSettings: (next: PeriodicAutoSyncSettings) => {
      const previous = settings;
      settings = next;
      listeners.forEach((listener) => listener(settings, previous));
    },
    subscribe: (
      listener: (
        state: PeriodicAutoSyncSettings,
        previous: PeriodicAutoSyncSettings,
      ) => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const manualSettings: PeriodicAutoSyncSettings = {
  syncProvider: "manual",
  selfHostedSyncEnabled: false,
  selfHostedSyncUrl: "",
  selfHostedSyncUsername: "",
  selfHostedSyncPassword: "",
  selfHostedSyncOnStartup: false,
  selfHostedAutoSyncInterval: 0,
};

describe("periodic auto sync controller", () => {
  const controllers: PeriodicAutoSyncController[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.dispose());
    vi.useRealTimers();
  });

  it("starts periodic self-hosted upload scheduling when settings become valid after app startup", async () => {
    const harness = createSettingsHarness(manualSettings);
    const runSelfHosted = vi.fn();

    controllers.push(
      registerPeriodicAutoSyncController({
        getSettings: harness.getSettings,
        subscribe: harness.subscribe,
        runSelfHosted,
      }),
    );

    harness.setSettings({
      ...manualSettings,
      syncProvider: "self-hosted",
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://backup.example.com",
      selfHostedSyncUsername: "user",
      selfHostedSyncPassword: "password",
      selfHostedAutoSyncInterval: 0.001,
    });

    await vi.advanceTimersByTimeAsync(59);
    expect(runSelfHosted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runSelfHosted).toHaveBeenCalledTimes(1);
  });

  it("stops periodic upload scheduling when the active interval is disabled", async () => {
    const harness = createSettingsHarness({
      ...manualSettings,
      syncProvider: "self-hosted",
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://backup.example.com",
      selfHostedSyncUsername: "user",
      selfHostedSyncPassword: "password",
      selfHostedAutoSyncInterval: 0.001,
    });
    const runSelfHosted = vi.fn();

    controllers.push(
      registerPeriodicAutoSyncController({
        getSettings: harness.getSettings,
        subscribe: harness.subscribe,
        runSelfHosted,
      }),
    );

    harness.setSettings({
      ...harness.getSettings(),
      selfHostedAutoSyncInterval: 0,
    });

    await vi.advanceTimersByTimeAsync(120);

    expect(runSelfHosted).not.toHaveBeenCalled();
  });
});
