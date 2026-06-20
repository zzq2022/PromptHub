import { downloadSelectiveExport } from "./database-backup";
import { type ManualBackupStatus, recordManualBackup } from "./backup-status";
import { createUpgradeBackup } from "./upgrade-backup";
import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
  testSelfHostedConnection,
  type PullFromSelfHostedOptions,
  type SelfHostedSyncConfig,
  type SelfHostedSyncSummary,
} from "./self-hosted-sync";

export interface FullExportBackupOptions {
  currentVersion?: string;
  recordManualBackup?: boolean;
}

export interface SelfHostedPullOptions {
  config: SelfHostedSyncConfig;
  options?: PullFromSelfHostedOptions;
}

export type AutoSyncReason = "startup" | "startup-resume" | "interval";

export interface SelfHostedAutoSyncResult {
  success: boolean;
  localChanged: boolean;
  message: string;
  summary?: SelfHostedSyncSummary;
}

async function createSnapshotIfPossible(
  currentVersion?: string,
): Promise<void> {
  await createUpgradeBackup(
    currentVersion ? { fromVersion: currentVersion } : undefined,
  );
}

async function downloadExportFile(): Promise<void> {
  await downloadSelectiveExport({
    prompts: true,
    folders: true,
    versions: true,
    images: true,
    videos: true,
    aiConfig: true,
    settings: true,
    rules: true,
    skills: true,
  });
}

export async function runFullExportBackup(
  options: FullExportBackupOptions,
): Promise<ManualBackupStatus | null> {
  await createSnapshotIfPossible(options.currentVersion);
  await downloadExportFile();

  if (options.recordManualBackup && options.currentVersion) {
    return recordManualBackup(options.currentVersion);
  }

  return null;
}

export async function runPreUpgradeBackup(
  currentVersion: string,
): Promise<ManualBackupStatus> {
  await createSnapshotIfPossible(currentVersion);
  await downloadExportFile();
  return recordManualBackup(currentVersion);
}

export async function runSelfHostedConnectionCheck(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  return testSelfHostedConnection(config);
}

export async function runSelfHostedPush(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  return pushToSelfHostedWeb(config);
}

export async function runSelfHostedPull(
  input: SelfHostedPullOptions,
): Promise<SelfHostedSyncSummary> {
  return pullFromSelfHostedWeb(input.config, input.options);
}

export async function runSelfHostedAutoSync(
  reason: AutoSyncReason,
  config: SelfHostedSyncConfig,
): Promise<SelfHostedAutoSyncResult> {
  try {
    const summary =
      reason === "interval"
        ? await pushToSelfHostedWeb(config)
        : await pullFromSelfHostedWeb(config, { mode: "replace" });

    return {
      success: true,
      localChanged: reason !== "interval",
      message:
        reason === "interval"
          ? `self-hosted push synced: ${summary.prompts} prompts, ${summary.folders} folders, ${summary.skills} skills`
          : `self-hosted pull synced: ${summary.prompts} prompts, ${summary.folders} folders, ${summary.skills} skills`,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      localChanged: false,
      message:
        error instanceof Error ? error.message : "self-hosted auto sync failed",
    };
  }
}
