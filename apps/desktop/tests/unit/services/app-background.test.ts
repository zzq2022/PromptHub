import { describe, expect, it } from "vitest";
import {
  hasValidSelfHostedConfig,
  shouldRunPeriodicSelfHostedSync,
  shouldRunBackgroundUpdateCheck,
  shouldRunStartupSelfHostedSync,
} from "../../../src/renderer/services/app-background";

const baseSelfHostedSettings = {
  syncProvider: "self-hosted" as const,
  selfHostedSyncEnabled: true,
  selfHostedSyncUrl: "https://backup.example.com",
  selfHostedSyncUsername: "owner",
  selfHostedSyncPassword: "secret",
  selfHostedSyncOnStartup: true,
  selfHostedAutoSyncInterval: 15,
};

describe("app-background", () => {
  it("runs update checks only when visible, online, and idle", () => {
    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: true,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(true);

    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: false,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(false);

    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: true,
        isOnline: false,
        isRunning: false,
      }),
    ).toBe(false);
  });

  it("validates required self-hosted configuration", () => {
    expect(hasValidSelfHostedConfig(baseSelfHostedSettings)).toBe(true);
    expect(
      hasValidSelfHostedConfig({
        ...baseSelfHostedSettings,
        selfHostedSyncPassword: "",
      }),
    ).toBe(false);
  });

  it("blocks self-hosted startup sync while hidden or already running", () => {
    expect(
      shouldRunStartupSelfHostedSync(baseSelfHostedSettings, {
        isVisible: true,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(true);

    expect(
      shouldRunStartupSelfHostedSync(baseSelfHostedSettings, {
        isVisible: false,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(false);

    expect(
      shouldRunPeriodicSelfHostedSync(baseSelfHostedSettings, {
        isVisible: true,
        isOnline: true,
        isRunning: true,
      }),
    ).toBe(false);
  });

  it("requires a positive interval for periodic self-hosted sync", () => {
    expect(
      shouldRunPeriodicSelfHostedSync(
        {
          ...baseSelfHostedSettings,
          selfHostedAutoSyncInterval: 0,
        },
        {
          isVisible: true,
          isOnline: true,
          isRunning: false,
        },
      ),
    ).toBe(false);
  });

  it("prevents self-hosted auto sync when manual sync provider is selected", () => {
    expect(
      shouldRunStartupSelfHostedSync(
        {
          ...baseSelfHostedSettings,
          syncProvider: "manual",
        },
        {
          isVisible: true,
          isOnline: true,
          isRunning: false,
        },
      ),
    ).toBe(false);
  });
});
