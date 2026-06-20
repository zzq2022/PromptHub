interface SelfHostedSyncSettings {
  syncProvider?: "manual" | "self-hosted";
  selfHostedSyncEnabled: boolean;
  selfHostedSyncUrl: string;
  selfHostedSyncUsername: string;
  selfHostedSyncPassword: string;
  selfHostedSyncOnStartup: boolean;
  selfHostedAutoSyncInterval: number;
}

interface BackgroundTaskState {
  isVisible: boolean;
  isOnline: boolean;
  isRunning: boolean;
}

export function shouldRunBackgroundUpdateCheck(
  autoCheckUpdate: boolean,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    autoCheckUpdate && state.isVisible && state.isOnline && !state.isRunning,
  );
}

export function hasValidSelfHostedConfig(
  settings: SelfHostedSyncSettings,
): boolean {
  return Boolean(
    settings.selfHostedSyncEnabled &&
    settings.selfHostedSyncUrl?.trim() &&
    settings.selfHostedSyncUsername?.trim() &&
    settings.selfHostedSyncPassword?.trim(),
  );
}

export function shouldRunStartupSelfHostedSync(
  settings: SelfHostedSyncSettings,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    settings.syncProvider === "self-hosted" &&
    settings.selfHostedSyncOnStartup &&
    hasValidSelfHostedConfig(settings) &&
    state.isVisible &&
    state.isOnline &&
    !state.isRunning,
  );
}

export function shouldRunPeriodicSelfHostedSync(
  settings: SelfHostedSyncSettings,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    settings.syncProvider === "self-hosted" &&
    settings.selfHostedAutoSyncInterval > 0 &&
    hasValidSelfHostedConfig(settings) &&
    state.isVisible &&
    state.isOnline &&
    !state.isRunning,
  );
}
