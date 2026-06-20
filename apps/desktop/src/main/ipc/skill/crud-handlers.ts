import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { SkillInstaller } from "../../services/skill-installer";
import { isInternalSkillRepoEntry } from "../../services/skill-installer-repo";
import { ensureLocalRepoPath } from "./shared";
import {
  hasMetadataChanges,
  syncFrontmatterToRepo,
} from "../../services/skill-repo-sync";
import type {
  CreateSkillParams,
  PublishResult,
  SkillDeleteOptions,
  SkillSafetyScanInput,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import type { SkillIPCContext } from "./shared";
import { readCurrentFilesSnapshot } from "./shared";

export function registerSkillCrudHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_CREATE,
    async (
      _,
      data: CreateSkillParams,
      options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
    ) => {
      if (
        !data ||
        !data.name ||
        typeof data.name !== "string" ||
        data.name.trim().length === 0
      ) {
        throw new Error("skill:create requires a non-empty name field");
      }

      if (
        data.source_url &&
        /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(
          data.source_url,
        ) &&
        !data.content &&
        !data.instructions
      ) {
        const id = await SkillInstaller.installFromGithub(data.source_url, db);
        return db.getById(id);
      }

      // Allow skipInitialVersion and overwriteExisting options from the renderer
      // where the user has explicitly confirmed overwriting a same-name skill.
      const safeOptions = options
        ? {
            skipInitialVersion: options.skipInitialVersion,
            overwriteExisting: options.overwriteExisting,
          }
        : undefined;

      return db.create(data, safeOptions);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET, async (_, id: string) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:get requires a non-empty id");
    }
    return db.getById(id);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_ALL, async () => db.getAll());

  ipcMain.handle(
    IPC_CHANNELS.SKILL_UPDATE,
    async (_, id: string, data: UpdateSkillParams) => {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("skill:update requires a non-empty id");
      }
      if (!data || typeof data !== "object") {
        throw new Error("skill:update requires a non-null data object");
      }

      const existingSkill = db.getById(id);
      if (!existingSkill) {
        return null;
      }

      const nextName =
        typeof data.name === "string" ? data.name.trim() : undefined;
      const isRenaming =
        typeof nextName === "string" && nextName !== existingSkill.name;
      const nextData: UpdateSkillParams = { ...data };
      let deployedPlatforms: string[] = [];

      if (isRenaming && nextName) {
        try {
          const platformStatus =
            await SkillInstaller.getSkillMdInstallStatusForSkill(
              existingSkill,
              [existingSkill.name],
            );
          deployedPlatforms = Object.entries(platformStatus)
            .filter(([, installed]) => installed)
            .map(([platformId]) => platformId);
        } catch (error) {
          console.warn(
            `Failed to inspect deployed status before renaming "${existingSkill.name}":`,
            error,
          );
        }

        const migratedRepoPath = await SkillInstaller.renameManagedLocalRepo(
          existingSkill.name,
          nextName,
          existingSkill.local_repo_path,
        );
        if (migratedRepoPath !== existingSkill.local_repo_path) {
          nextData.local_repo_path = migratedRepoPath ?? undefined;
        }
        nextData.name = nextName;
      }

      if (data.instructions !== undefined || data.content !== undefined) {
        const filesSnapshot = await readCurrentFilesSnapshot(db, id);
        db.createVersion(
          id,
          "Before updating SKILL.md",
          filesSnapshot,
          existingSkill,
        );
      }

      const updatedSkill = db.update(id, nextData);

      // When metadata-only fields changed (no instructions/content update),
      // sync the frontmatter back to SKILL.md so that `syncSkillFromRepo`
      // does not revert the edit with stale file data.
      if (
        updatedSkill &&
        hasMetadataChanges(data) &&
        data.instructions === undefined &&
        data.content === undefined
      ) {
        try {
          const repoPath = await ensureLocalRepoPath(db, id);
          await syncFrontmatterToRepo(updatedSkill, repoPath);
        } catch (err) {
          console.warn(
            `Failed to sync frontmatter to SKILL.md for "${updatedSkill.name}":`,
            err,
          );
        }
      }

      if (
        updatedSkill &&
        isRenaming &&
        nextName &&
        deployedPlatforms.length > 0
      ) {
        const nextContent =
          updatedSkill.instructions ??
          updatedSkill.content ??
          existingSkill.instructions ??
          existingSkill.content ??
          "";

        await Promise.allSettled(
          deployedPlatforms.map(async (platformId) => {
            if (nextContent.trim()) {
              await SkillInstaller.installSkillMdForSkill(
                {
                  id: updatedSkill.id,
                  name: nextName,
                  source_id: updatedSkill.source_id,
                },
                nextContent,
                platformId,
                updatedSkill.local_repo_path ?? undefined,
                [existingSkill.name, nextName],
              );
            }
            await SkillInstaller.uninstallSkillMdForSkill(
              existingSkill,
              platformId,
              [existingSkill.name, nextName],
            );
          }),
        );
      }

      return updatedSkill;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE,
    async (_, id: string, options?: SkillDeleteOptions) => {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("skill:delete requires a non-empty id");
      }
      if (
        options !== undefined &&
        (!options || typeof options !== "object" || Array.isArray(options))
      ) {
        throw new Error("skill:delete options must be an object");
      }

      const skill = db.getById(id);
      if (skill?.name) {
        // Only uninstall SKILL.md from platforms, do NOT delete the source directory.
        // Deletion from PromptHub should only clean PromptHub-managed files, never the original external source.
        try {
          const platforms = SkillInstaller.getSupportedPlatforms();
          const installDetails =
            await SkillInstaller.getSkillMdInstallStatusDetailsForSkill(skill, [
              skill.name,
            ]);
          const shouldRemoveCopyInstallations =
            options?.removeCopyInstallations ?? true;
          await Promise.allSettled(
            platforms
              .filter((platform) => {
                const installStatus = installDetails[platform.id];
                if (!installStatus?.installed) {
                  return false;
                }
                if (installStatus.mode === "symlink") {
                  return true;
                }
                return shouldRemoveCopyInstallations;
              })
              .map((platform) =>
                SkillInstaller.uninstallSkillMdForSkill(skill, platform.id, [
                  skill.name,
                ]),
              ),
          );
        } catch (error) {
          console.warn(
            `Failed to uninstall SKILL.md for skill "${skill.name}":`,
            error,
          );
        }

        try {
          const managedContainerPath =
            await SkillInstaller.getManagedContainerPathForSkill(skill);
          if (await SkillInstaller.isManagedRepoPath(managedContainerPath)) {
            await SkillInstaller.deleteManagedVariantContainer(skill);
          }
        } catch (error) {
          console.warn(
            `Failed to delete managed repo container for skill "${skill.name}":`,
            error,
          );
        }
      }

      return db.delete(id);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_LOCAL, async () =>
    SkillInstaller.scanLocal(db),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW,
    async (
      _,
      customPaths?: string[],
      aiConfig?: SkillSafetyScanInput["aiConfig"],
    ) => {
      if (customPaths !== undefined && !Array.isArray(customPaths)) {
        throw new Error(
          "skill:scanLocalPreview expects customPaths to be an array",
        );
      }
      return SkillInstaller.scanLocalPreview(customPaths, db, aiConfig);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT, async (_, id: string, format) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:export requires a non-empty id");
    }
    if (format !== "skillmd" && format !== "json") {
      throw new Error("skill:export format must be 'skillmd' or 'json'");
    }
    const skill = db.getById(id);
    if (!skill) throw new Error("Skill not found");
    return format === "skillmd"
      ? SkillInstaller.exportAsSkillMd(skill)
      : SkillInstaller.exportAsJson(skill);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT_ZIP, async (_, id: string) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:exportZip requires a non-empty id");
    }

    const skill = db.getById(id);
    if (!skill) {
      throw new Error("Skill not found");
    }

    const repoPath = await ensureLocalRepoPath(db, id);
    if (!repoPath) {
      throw new Error(`Unable to resolve local repo for skill: ${id}`);
    }

    const fileEntries =
      await SkillInstaller.readLocalRepoFileBuffersByPath(repoPath);

    if (fileEntries.length === 0) {
      throw new Error(`Skill repo is empty: ${skill.name}`);
    }

    const { zipSync } = await import("fflate");
    const zipFiles: Record<string, Uint8Array> = {};

    for (const file of fileEntries) {
      if (isInternalSkillRepoEntry(file.path)) {
        continue;
      }
      zipFiles[file.path.replace(/\\/g, "/")] = file.data;
    }

    const zipped = zipSync(zipFiles, { level: 1 });

    return {
      fileName: `${skill.name}.zip`,
      base64: Buffer.from(zipped).toString("base64"),
    };
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_IMPORT, async (_, jsonContent: string) => {
    if (typeof jsonContent !== "string" || jsonContent.trim().length === 0) {
      throw new Error("skill:import requires a non-empty JSON content string");
    }
    const id = await SkillInstaller.importFromJson(jsonContent, db);
    return db.getById(id);
  });

  /**
   * `skill:publish` — atomic publish-to-SkillHub.
   *
   * Local-first: flips the local row's `visibility` to `'shared'` via
   * `SkillDB.setVisibility` (single transaction, mirrors web's
   * `SkillPublisher.publish`). When the same skill is already shared the call
   * is idempotent: no DB write, returns `{ alreadyPublic: true, skill }`.
   *
   * The handler does NOT push to a self-hosted PromptHub Web. That side-effect
   * is best-effort and is orchestrated by the renderer (see
   * `apps/desktop/src/renderer/services/skillhub-publish.ts`) so that web
   * auth, captcha handling and the publish HTTP call live next to the rest of
   * the self-hosted sync logic. A web push failure never rolls back the local
   * visibility write.
   */
  ipcMain.handle(
    IPC_CHANNELS.SKILL_PUBLISH,
    async (_, id: string): Promise<PublishResult | null> => {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("skill:publish requires a non-empty id");
      }

      const existing = db.getById(id);
      if (!existing) {
        return null;
      }

      // Idempotent: already public ⇒ no DB write, return the current row.
      if (existing.visibility === "shared") {
        return { alreadyPublic: true, skill: existing };
      }

      // Single-transaction visibility write; on failure the row stays as-is.
      const updated = db.setVisibility(id, "shared");
      if (!updated) {
        // The row existed at read time but no row was updated (e.g. concurrent
        // delete). Surface the missing row instead of pretending success.
        const after = db.getById(id);
        if (!after) {
          return null;
        }
        // If another writer raced us to 'shared', return the idempotent shape.
        if (after.visibility === "shared") {
          return { alreadyPublic: true, skill: after };
        }
        throw new Error("Failed to publish skill: database write was rejected");
      }

      const published = db.getById(id);
      if (!published || published.visibility !== "shared") {
        throw new Error("Skill not found after publishing");
      }
      return { published: true, skill: published };
    },
  );
}
