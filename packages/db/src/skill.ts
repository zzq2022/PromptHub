import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  Skill,
  CreateSkillParams,
  UpdateSkillParams,
  SkillVersion,
  SkillFileSnapshot,
  SkillSafetyReport,
  SkillVisibility,
  SkillApprovalStatus,
} from "@prompthub/shared/types";

interface SkillRow {
  id: string;
  owner_user_id: string | null;
  visibility: SkillVisibility;
  name: string;
  description: string | null;
  content: string | null;
  mcp_config: string | null;
  protocol_type: Skill["protocol_type"];
  version: string | null;
  author: string | null;
  tags: string | null;
  original_tags: string | null;
  is_favorite: number;
  source_url: string | null;
  source_id: string | null;
  source_label: string | null;
  source_branch: string | null;
  source_directory: string | null;
  canonical_skill_path: string | null;
  local_repo_path: string | null;
  directory_fingerprint: string | null;
  installed_content_hash: string | null;
  installed_version: string | null;
  installed_at: number | null;
  updated_from_store_at: number | null;
  icon_url: string | null;
  icon_emoji: string | null;
  icon_background: string | null;
  category: Skill["category"] | null;
  is_builtin: number;
  registry_slug: string | null;
  content_url: string | null;
  prerequisites: string | null;
  compatibility: string | null;
  approval_status: SkillApprovalStatus | null;
  current_version: number | null;
  version_tracking_enabled: number | null;
  created_at: number;
  updated_at: number;
  // Safety columns (added via migration)
  safety_level: string | null;
  safety_score: number | null;
  safety_report: string | null;
  safety_scanned_at: number | null;
}

interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  content: string | null;
  files_snapshot: string | null;
  note: string | null;
  created_at: number;
}

/**
 * Minimal projection of a skill row used by SkillHub catalog/ownership
 * queries. Only the columns required for visibility/ownership decisions and
 * summary mapping are selected; the rest of the `skills` row is intentionally
 * omitted to keep the surface area small.
 * SkillHub 目录/所有权查询所用的技能行最小投影。仅选取可见性/所有权判定与摘要
 * 映射所需的列，其余列有意省略以保持最小接口面。
 */
export interface SkillCatalogRow {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  visibility: string | null;
}

function parseJsonArray<T>(value: string | null | undefined): T[] | undefined {
  return value ? (JSON.parse(value) as T[]) : undefined;
}

export class SkillDB {
  constructor(private db: Database.Database) {}

  /**
   * Get Skill by name (case-insensitive)
   * 根据名称获取 Skill（不区分大小写）
   */
  getByName(name: string): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skills WHERE LOWER(name) = LOWER(?)",
    );
    const row = stmt.get(name) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  getByOwnerAndName(ownerUserId: string, name: string): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skills WHERE owner_user_id = ? AND LOWER(name) = LOWER(?)",
    );
    const row = stmt.get(ownerUserId, name) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  getBySourceId(sourceId: string): Skill | null {
    const normalizedSourceId = sourceId.trim();
    if (!normalizedSourceId) {
      return null;
    }
    const stmt = this.db.prepare("SELECT * FROM skills WHERE source_id = ?");
    const row = stmt.get(normalizedSourceId) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Create Skill
   * 创建 Skill
   *
   * @param data - Skill creation parameters
   * @param options.skipInitialVersion - If true, skip creating the initial version snapshot
   *   (used during backup restore to avoid spurious versions).
   *   如果为 true，跳过创建初始版本快照（用于备份恢复时避免产生多余版本）。
   */
  create(
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
  ): Skill {
    const normalizedName =
      typeof data.name === "string" ? data.name.trim() : data.name;

    if (!normalizedName || typeof normalizedName !== "string") {
      throw new Error(
        `Cannot create skill: name is required but got "${data.name}"`,
      );
    }

    const existing = data.ownerUserId
      ? this.getByOwnerAndName(data.ownerUserId, normalizedName)
      : (data.source_id
          ? this.getBySourceId(data.source_id)
          : this.getByName(normalizedName));
    if (existing) {
      if (options?.overwriteExisting) {
        return (
          this.update(existing.id, {
            ...data,
            name: normalizedName,
          }) ?? existing
        );
      }
      throw new Error(
        data.source_id
          ? `Skill source already exists: ${data.source_id}`
          : `Skill already exists: ${normalizedName}`,
      );
    }

    const id = uuidv4();
    const now = Date.now();

    const tagsJson = JSON.stringify(data.tags || []);

    const stmt = this.db.prepare(`
      INSERT INTO skills (
        id, owner_user_id, visibility, name, description, content, mcp_config,
        protocol_type, version, author, tags, original_tags, is_favorite,
        source_url, source_id, source_label, source_branch, source_directory, canonical_skill_path, local_repo_path, directory_fingerprint, icon_url, icon_emoji, icon_background, category, is_builtin,
        registry_slug, content_url, installed_content_hash, installed_version, installed_at,
        updated_from_store_at, prerequisites, compatibility, approval_status, current_version,
        version_tracking_enabled, safety_level, safety_score, safety_report, safety_scanned_at,
        created_at, updated_at
      ) VALUES (
        @id, @owner_user_id, @visibility, @name, @description, @content, @mcp_config,
        @protocol_type, @version, @author, @tags, @original_tags, @is_favorite,
        @source_url, @source_id, @source_label, @source_branch, @source_directory, @canonical_skill_path, @local_repo_path, @directory_fingerprint, @icon_url, @icon_emoji, @icon_background, @category, @is_builtin,
        @registry_slug, @content_url, @installed_content_hash, @installed_version, @installed_at,
        @updated_from_store_at, @prerequisites, @compatibility, @approval_status, @current_version,
        @version_tracking_enabled, @safety_level, @safety_score, @safety_report, @safety_scanned_at,
        @created_at, @updated_at
      )
    `);

    const safetyReport = data.safetyReport;

    stmt.run({
      "@id": id,
      "@owner_user_id": this.resolveOwnerUserId(data.ownerUserId),
      "@visibility": data.visibility || "private",
      "@name": normalizedName,
      "@description": data.description || null,
      "@content": data.content || data.instructions || null,
      "@mcp_config": data.mcp_config || null,
      "@protocol_type": data.protocol_type || "mcp",
      "@version": data.version || "1.0.0",
      "@author": data.author || "User",
      "@tags": tagsJson,
      "@original_tags": data.original_tags
        ? JSON.stringify(data.original_tags)
        : tagsJson,
      "@is_favorite": data.is_favorite ? 1 : 0,
      "@source_url": data.source_url || null,
      "@source_id": data.source_id || null,
      "@source_label": data.source_label || null,
      "@source_branch": data.source_branch || null,
      "@source_directory": data.source_directory || null,
      "@canonical_skill_path": data.canonical_skill_path || null,
      "@local_repo_path": data.local_repo_path || null,
      "@directory_fingerprint": data.directory_fingerprint || null,
      "@icon_url": data.icon_url || null,
      "@icon_emoji": data.icon_emoji || null,
      "@icon_background": data.icon_background || null,
      "@category": data.category || "general",
      "@is_builtin": data.is_builtin ? 1 : 0,
      "@registry_slug": data.registry_slug || null,
      "@content_url": data.content_url || null,
      "@installed_content_hash": data.installed_content_hash || null,
      "@installed_version": data.installed_version || null,
      "@installed_at": data.installed_at ?? null,
      "@updated_from_store_at": data.updated_from_store_at ?? null,
      "@prerequisites": data.prerequisites
        ? JSON.stringify(data.prerequisites)
        : null,
      "@compatibility": data.compatibility
        ? JSON.stringify(data.compatibility)
        : null,
      "@approval_status": data.approvalStatus || null,
      "@current_version": data.currentVersion ?? 0,
      "@version_tracking_enabled":
        (data.versionTrackingEnabled ?? true) ? 1 : 0,
      "@safety_level": safetyReport?.level ?? null,
      "@safety_score": safetyReport?.score ?? null,
      "@safety_report": safetyReport ? JSON.stringify(safetyReport) : null,
      "@safety_scanned_at": safetyReport?.scannedAt ?? null,
      "@created_at": now,
      "@updated_at": now,
    });

    return this.getById(id)!;
  }

  /**
   * Get Skill by ID
   * 根据 ID 获取 Skill
   */
  getById(id: string): Skill | null {
    const stmt = this.db.prepare("SELECT * FROM skills WHERE id = ?");
    const row = stmt.get(id) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Get all Skills
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    const stmt = this.db.prepare(
      "SELECT * FROM skills ORDER BY updated_at DESC",
    );
    const rows = stmt.all() as SkillRow[];
    return rows.map((row) => this.rowToSkill(row));
  }

  /**
   * Update Skill
   * 更新 Skill
   * Performance optimized: Builds return object in memory instead of re-querying
   * 性能优化：在内存中构建返回对象，而不是重新查询
   */
  update(id: string, data: UpdateSkillParams): Skill | null {
    const existingSkill = this.getById(id);
    if (!existingSkill) return null;

    const normalizedName = data.name?.trim();
    if (data.name !== undefined && !normalizedName) {
      throw new Error("Skill name cannot be empty");
    }

    if (data.name !== undefined || data.source_id !== undefined) {
      const effectiveName = normalizedName ?? existingSkill.name;
      const effectiveSourceId =
        data.source_id !== undefined
          ? data.source_id.trim()
          : existingSkill.source_id?.trim();
      const duplicateSkill = effectiveSourceId
        ? this.getBySourceId(effectiveSourceId)
        : this.getByName(effectiveName);
      if (duplicateSkill && duplicateSkill.id !== id) {
        throw new Error(
          effectiveSourceId
            ? `Skill source already exists: ${effectiveSourceId}`
            : `Skill already exists: ${effectiveName}`,
        );
      }
    }

    const now = Date.now();
    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];

    if (data.name !== undefined) {
      if (normalizedName === undefined) {
        throw new Error("Skill name cannot be empty");
      }
      updates.push("name = ?");
      values.push(normalizedName);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    // Handle both content and instructions (instructions syncs to content)
    // 处理 content 和 instructions（instructions 同步到 content）
    if (data.instructions !== undefined) {
      updates.push("content = ?");
      values.push(data.instructions);
    } else if (data.content !== undefined) {
      updates.push("content = ?");
      values.push(data.content);
    }
    if (data.mcp_config !== undefined) {
      updates.push("mcp_config = ?");
      values.push(data.mcp_config);
    }
    if (data.protocol_type !== undefined) {
      updates.push("protocol_type = ?");
      values.push(data.protocol_type);
    }
    if (data.version !== undefined) {
      updates.push("version = ?");
      values.push(data.version);
    }
    if (data.author !== undefined) {
      updates.push("author = ?");
      values.push(data.author);
    }
    if (data.tags !== undefined) {
      updates.push("tags = ?");
      values.push(JSON.stringify(data.tags));
    }
    if (data.ownerUserId !== undefined) {
      updates.push("owner_user_id = ?");
      values.push(this.resolveOwnerUserId(data.ownerUserId));
    }
    if (data.visibility !== undefined) {
      updates.push("visibility = ?");
      values.push(data.visibility);
    }
    if (data.approvalStatus !== undefined) {
      updates.push("approval_status = ?");
      values.push(data.approvalStatus);
    }
    if (data.is_favorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(data.is_favorite ? 1 : 0);
    }
    if (data.source_url !== undefined) {
      updates.push("source_url = ?");
      values.push(data.source_url);
    }
    if (data.source_id !== undefined) {
      updates.push("source_id = ?");
      values.push(data.source_id);
    }
    if (data.source_label !== undefined) {
      updates.push("source_label = ?");
      values.push(data.source_label);
    }
    if (data.source_branch !== undefined) {
      updates.push("source_branch = ?");
      values.push(data.source_branch);
    }
    if (data.source_directory !== undefined) {
      updates.push("source_directory = ?");
      values.push(data.source_directory);
    }
    if (data.canonical_skill_path !== undefined) {
      updates.push("canonical_skill_path = ?");
      values.push(data.canonical_skill_path);
    }
    if (data.local_repo_path !== undefined) {
      updates.push("local_repo_path = ?");
      values.push(data.local_repo_path);
    }
    if (data.directory_fingerprint !== undefined) {
      updates.push("directory_fingerprint = ?");
      values.push(data.directory_fingerprint);
    }
    if (data.icon_url !== undefined) {
      updates.push("icon_url = ?");
      values.push(data.icon_url);
    }
    if (data.icon_emoji !== undefined) {
      updates.push("icon_emoji = ?");
      values.push(data.icon_emoji);
    }
    if (data.icon_background !== undefined) {
      updates.push("icon_background = ?");
      values.push(data.icon_background);
    }
    if (data.category !== undefined) {
      updates.push("category = ?");
      values.push(data.category);
    }
    if (data.is_builtin !== undefined) {
      updates.push("is_builtin = ?");
      values.push(data.is_builtin ? 1 : 0);
    }
    if (data.registry_slug !== undefined) {
      updates.push("registry_slug = ?");
      values.push(data.registry_slug);
    }
    if (data.content_url !== undefined) {
      updates.push("content_url = ?");
      values.push(data.content_url);
    }
    if (data.installed_content_hash !== undefined) {
      updates.push("installed_content_hash = ?");
      values.push(data.installed_content_hash);
    }
    if (data.installed_version !== undefined) {
      updates.push("installed_version = ?");
      values.push(data.installed_version);
    }
    if (data.installed_at !== undefined) {
      updates.push("installed_at = ?");
      values.push(data.installed_at);
    }
    if (data.updated_from_store_at !== undefined) {
      updates.push("updated_from_store_at = ?");
      values.push(data.updated_from_store_at);
    }
    if (data.prerequisites !== undefined) {
      updates.push("prerequisites = ?");
      values.push(JSON.stringify(data.prerequisites));
    }
    if (data.compatibility !== undefined) {
      updates.push("compatibility = ?");
      values.push(JSON.stringify(data.compatibility));
    }
    if (data.currentVersion !== undefined) {
      updates.push("current_version = ?");
      values.push(data.currentVersion);
    }
    if (data.versionTrackingEnabled !== undefined) {
      updates.push("version_tracking_enabled = ?");
      values.push(data.versionTrackingEnabled ? 1 : 0);
    }
    if (data.safetyReport !== undefined) {
      const report = data.safetyReport;
      updates.push("safety_level = ?");
      values.push(report.level);
      updates.push("safety_score = ?");
      values.push(report.score ?? null);
      updates.push("safety_report = ?");
      values.push(JSON.stringify(report));
      updates.push("safety_scanned_at = ?");
      values.push(report.scannedAt);
    }

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE skills SET ${updates.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);

    // Build updated skill in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 skill 对象，而不是重新查询（性能优化）
    // Determine the new content value (instructions takes priority)
    // 确定新的 content 值（instructions 优先）
    const newContent =
      data.instructions ?? data.content ?? existingSkill.content;

    const updatedSkill: Skill = {
      ...existingSkill,
      updated_at: now,
      ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId }),
      ...(data.visibility !== undefined && { visibility: data.visibility }),
      ...(data.approvalStatus !== undefined && { approvalStatus: data.approvalStatus }),
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...((data.content !== undefined || data.instructions !== undefined) && {
        content: newContent,
        instructions: newContent, // Keep instructions synced with content
      }),
      ...(data.mcp_config !== undefined && { mcp_config: data.mcp_config }),
      ...(data.protocol_type !== undefined && {
        protocol_type: data.protocol_type,
      }),
      ...(data.version !== undefined && { version: data.version }),
      ...(data.author !== undefined && { author: data.author }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.is_favorite !== undefined && { is_favorite: data.is_favorite }),
      ...(data.source_url !== undefined && { source_url: data.source_url }),
      ...(data.source_id !== undefined && { source_id: data.source_id }),
      ...(data.source_label !== undefined && { source_label: data.source_label }),
      ...(data.source_branch !== undefined && {
        source_branch: data.source_branch,
      }),
      ...(data.source_directory !== undefined && {
        source_directory: data.source_directory,
      }),
      ...(data.canonical_skill_path !== undefined && {
        canonical_skill_path: data.canonical_skill_path,
      }),
      ...(data.local_repo_path !== undefined && {
        local_repo_path: data.local_repo_path,
      }),
      ...(data.directory_fingerprint !== undefined && {
        directory_fingerprint: data.directory_fingerprint,
      }),
      ...(data.icon_url !== undefined && { icon_url: data.icon_url }),
      ...(data.icon_emoji !== undefined && { icon_emoji: data.icon_emoji }),
      ...(data.icon_background !== undefined && {
        icon_background: data.icon_background,
      }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.is_builtin !== undefined && { is_builtin: data.is_builtin }),
      ...(data.registry_slug !== undefined && {
        registry_slug: data.registry_slug,
      }),
      ...(data.content_url !== undefined && { content_url: data.content_url }),
      ...(data.installed_content_hash !== undefined && {
        installed_content_hash: data.installed_content_hash,
      }),
      ...(data.installed_version !== undefined && {
        installed_version: data.installed_version,
      }),
      ...(data.installed_at !== undefined && { installed_at: data.installed_at }),
      ...(data.updated_from_store_at !== undefined && {
        updated_from_store_at: data.updated_from_store_at,
      }),
      ...(data.prerequisites !== undefined && {
        prerequisites: data.prerequisites,
      }),
      ...(data.compatibility !== undefined && {
        compatibility: data.compatibility,
      }),
      ...(data.currentVersion !== undefined && {
        currentVersion: data.currentVersion,
      }),
      ...(data.versionTrackingEnabled !== undefined && {
        versionTrackingEnabled: data.versionTrackingEnabled,
      }),
      ...(data.safetyReport !== undefined && {
        safetyReport: data.safetyReport,
      }),
    };

    return updatedSkill;
  }

  // ==================== Version Management ====================
  // ==================== 版本管理 ====================

  /**
   * Create version snapshot (wrapped in a transaction for atomicity).
   * 创建版本快照（使用事务保证原子性）。
   *
   * @param skillId - Skill ID
   * @param note - Optional version note
   * @param filesSnapshot - Optional multi-file snapshot
   * @param existingSkill - Pre-fetched skill object (avoids re-query in update flow)
   */
  createVersion(
    skillId: string,
    note?: string,
    filesSnapshot?: SkillFileSnapshot[],
    existingSkill?: Skill,
  ): SkillVersion | null {
    const skill = existingSkill ?? this.getById(skillId);
    if (!skill) return null;

    // Use a transaction to atomically insert version + increment counter,
    // preventing UNIQUE(skill_id, version) conflicts from concurrent calls.
    // 使用事务原子化地插入版本 + 递增计数器，防止并发调用导致 UNIQUE 约束冲突。
    const txn = this.db.transaction(() => {
      // Re-read current_version inside transaction for consistency
      // 在事务内重新读取 current_version 以保证一致性
      const freshRow = this.db
        .prepare("SELECT current_version FROM skills WHERE id = ?")
        .get(skillId) as { current_version: number } | undefined;
      if (!freshRow) return null;

      const version = (freshRow.current_version ?? 0) + 1;
      const id = uuidv4();
      const now = Date.now();

      this.db
        .prepare(
          `INSERT INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (
          @id, @skill_id, @version, @content, @files_snapshot, @note, @created_at
        )`,
        )
        .run({
          "@id": id,
          "@skill_id": skillId,
          "@version": version,
          "@content": skill.content || null,
          "@files_snapshot": filesSnapshot
            ? JSON.stringify(filesSnapshot)
            : null,
          "@note": note || null,
          "@created_at": now,
        });

      // Update current version number
      // 更新当前版本号
      this.db
        .prepare("UPDATE skills SET current_version = ? WHERE id = ?")
        .run(version, skillId);

      this.db
        .prepare("UPDATE skills SET version_tracking_enabled = 1 WHERE id = ?")
        .run(skillId);

      return {
        id,
        skillId,
        version,
        content: skill.content,
        filesSnapshot,
        note,
        createdAt: new Date(now).toISOString(),
      } as SkillVersion;
    });

    return txn();
  }

  /**
   * Get all versions for a skill
   * 获取 Skill 的所有版本
   */
  getVersions(skillId: string): SkillVersion[] {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC",
    );
    const rows = stmt.all(skillId) as SkillVersionRow[];
    return rows.map((row) => this.rowToSkillVersion(row));
  }

  /**
   * Get one specific version for a skill.
   * 获取 Skill 的指定版本。
   */
  getVersion(skillId: string, version: number): SkillVersion | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? AND version = ?",
    );
    const row = stmt.get(skillId, version) as SkillVersionRow | undefined;
    return row ? this.rowToSkillVersion(row) : null;
  }

  /**
   * Delete one version snapshot for a skill.
   * 删除 Skill 的单个版本快照。
   */
  deleteVersion(skillId: string, versionId: string): boolean {
    const stmt = this.db.prepare(
      "DELETE FROM skill_versions WHERE skill_id = ? AND id = ?",
    );
    const result = stmt.run(skillId, versionId);
    return result.changes > 0;
  }

  /**
   * Rollback to specified version
   * 回滚到指定版本
   */
  rollbackVersion(skillId: string, version: number): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? AND version = ?",
    );
    const row = stmt.get(skillId, version) as SkillVersionRow | undefined;
    if (!row) return null;

    const versionData = this.rowToSkillVersion(row);

    // Restore content via update (which will auto-create a new version snapshot)
    // 通过 update 恢复内容（会自动创建新版本快照）
    return this.update(skillId, {
      content: versionData.content,
    });
  }

  /**
   * Delete Skill
   * 删除 Skill
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM skills WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all skills and their versions (for backup restore).
   * 删除所有 Skill 及其版本（用于备份恢复）。
   */
  deleteAll(): void {
    const txn = this.db.transaction(() => {
      this.db.prepare("DELETE FROM skill_versions").run();
      this.db.prepare("DELETE FROM skills").run();
    });
    txn();
  }

  // ==================== SkillHub Catalog / Ownership ====================
  // ==================== SkillHub 目录 / 所有权 ====================

  /**
   * List public (shared) skills, name-ascending (case-insensitive), paginated.
   * Sorting is performed at the query layer (`ORDER BY name COLLATE NOCASE ASC,
   * id ASC`) so callers do not need to re-sort.
   * 列出公开（shared）技能，按名称升序（不区分大小写）分页。排序在查询层完成，
   * 调用方无需再次排序。
   * _Requirements: 1.1, 1.2, 7.5_
   */
  listShared(limit: number, offset: number): SkillCatalogRow[] {
    const stmt = this.db.prepare(
      `SELECT id, name, description, owner_user_id, visibility, registry_slug
       FROM skills
       WHERE visibility = 'shared'
       ORDER BY name COLLATE NOCASE ASC, id ASC
       LIMIT ? OFFSET ?`,
    );
    return stmt.all(limit, offset) as SkillCatalogRow[];
  }

  /**
   * Count public (shared) skills.
   * 统计公开（shared）技能数量。
   * _Requirements: 1.5_
   */
  countShared(): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) AS count FROM skills WHERE visibility = 'shared'",
    );
    const row = stmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Search public (shared) skills by a caller-built LIKE pattern, matching
   * against name or description. The pattern and escape character are produced
   * by the core search layer (`buildLikePattern`) so FTS/SQL operator
   * characters are treated literally. All SQL is parameterized.
   * 按调用方构建的 LIKE 模式搜索公开（shared）技能，匹配名称或描述。模式与转义符
   * 由 core 搜索层（`buildLikePattern`）生成，使 FTS/SQL 操作符字符按字面处理。
   * 所有 SQL 均参数化。
   * _Requirements: 2.1, 2.4_
   */
  searchShared(likePattern: string, escape: string): SkillCatalogRow[] {
    const stmt = this.db.prepare(
      `SELECT id, name, description, owner_user_id, visibility, registry_slug
       FROM skills
       WHERE visibility = 'shared'
         AND (name LIKE ? ESCAPE ? OR description LIKE ? ESCAPE ?)
       ORDER BY name COLLATE NOCASE ASC, id ASC`,
    );
    return stmt.all(
      likePattern,
      escape,
      likePattern,
      escape,
    ) as SkillCatalogRow[];
  }

  /**
   * List the requesting user's own private skills: `owner_user_id` non-null and
   * equal to the requester, and `visibility = 'private'`. Skills with a null
   * owner are excluded (Requirement 7.5).
   * 列出请求者自己的私有技能：`owner_user_id` 非空且等于请求者，且
   * `visibility = 'private'`。owner 为空的技能被排除（需求 7.5）。
   * _Requirements: 5.1, 5.2, 7.5_
   */
  listPrivateByOwner(ownerUserId: string): SkillCatalogRow[] {
    const stmt = this.db.prepare(
      `SELECT id, name, description, owner_user_id, visibility, registry_slug
       FROM skills
       WHERE owner_user_id IS NOT NULL
         AND owner_user_id = ?
         AND visibility = 'private'
       ORDER BY name COLLATE NOCASE ASC, id ASC`,
    );
    return stmt.all(ownerUserId) as SkillCatalogRow[];
  }

  /**
   * Get ownership/visibility projection for a single skill, or null when the
   * skill id does not exist.
   * 获取单个技能的所有权/可见性投影；技能标识符不存在时返回 null。
   * _Requirements: 6.7, 8.1, 8.2_
   */
  getOwnership(id: string): SkillCatalogRow | null {
    const stmt = this.db.prepare(
      `SELECT id, name, description, owner_user_id, visibility, registry_slug
       FROM skills
       WHERE id = ?`,
    );
    const row = stmt.get(id) as SkillCatalogRow | undefined;
    return row ?? null;
  }

  /**
   * Set a skill's visibility within a single transaction, updating both
   * `visibility` and `updated_at`. Returns whether a row was updated (false when
   * the id does not exist). The `visibility` CHECK constraint plus the core
   * `assertWritableVisibility` provide double rejection of invalid values.
   * 在单个事务内设置技能可见性，同时更新 `visibility` 与 `updated_at`。返回是否有
   * 行被更新（id 不存在时为 false）。`visibility` 的 CHECK 约束与 core 的
   * `assertWritableVisibility` 对非法值双重拒绝。
   * _Requirements: 6.6, 6.8, 7.6, 7.7_
   */
  setVisibility(id: string, visibility: SkillVisibility): boolean {
    const txn = this.db.transaction(() => {
      const result = this.db
        .prepare("UPDATE skills SET visibility = ?, updated_at = ? WHERE id = ?")
        .run(visibility, Date.now(), id);
      return result.changes > 0;
    });
    return txn();
  }

  /**
   * Set approval status for a skill (SkillHub review workflow).
   */
  setApprovalStatus(id: string, status: SkillApprovalStatus | null): boolean {
    const txn = this.db.transaction(() => {
      const result = this.db
        .prepare("UPDATE skills SET approval_status = ?, updated_at = ? WHERE id = ?")
        .run(status, Date.now(), id);
      return result.changes > 0;
    });
    return txn();
  }

  /**
   * List skills awaiting admin review (approval_status = 'pending').
   */
  listPendingApproval(limit: number, offset: number): SkillCatalogRow[] {
    const stmt = this.db.prepare(
      `SELECT id, name, description, owner_user_id, visibility, registry_slug
       FROM skills
       WHERE approval_status = 'pending'
       ORDER BY updated_at ASC, id ASC
       LIMIT ? OFFSET ?`,
    );
    return stmt.all(limit, offset) as SkillCatalogRow[];
  }

  /**
   * Count skills awaiting admin review.
   */
  countPendingApproval(): number {
    const row = this.db.get(
      "SELECT COUNT(*) AS count FROM skills WHERE approval_status = 'pending'",
    ) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  insertSkillDirect(skill: Skill): void {
    const safetyReport = skill.safetyReport;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO skills (
          id, owner_user_id, visibility, name, description, content, mcp_config,
          protocol_type, version, author, tags, original_tags, is_favorite,
          source_url, source_id, source_label, source_branch, source_directory, canonical_skill_path, local_repo_path, directory_fingerprint, icon_url, icon_emoji, icon_background, category, is_builtin,
          registry_slug, content_url, installed_content_hash, installed_version, installed_at,
          updated_from_store_at, prerequisites, compatibility, approval_status, current_version,
          version_tracking_enabled, safety_level, safety_score, safety_report, safety_scanned_at,
          created_at, updated_at
        ) VALUES (
          @id, @owner_user_id, @visibility, @name, @description, @content, @mcp_config,
          @protocol_type, @version, @author, @tags, @original_tags, @is_favorite,
          @source_url, @source_id, @source_label, @source_branch, @source_directory, @canonical_skill_path, @local_repo_path, @directory_fingerprint, @icon_url, @icon_emoji, @icon_background, @category, @is_builtin,
          @registry_slug, @content_url, @installed_content_hash, @installed_version, @installed_at,
          @updated_from_store_at, @prerequisites, @compatibility, @approval_status, @current_version,
          @version_tracking_enabled, @safety_level, @safety_score, @safety_report, @safety_scanned_at,
          @created_at, @updated_at
        )`,
      )
      .run({
        "@id": skill.id,
        "@owner_user_id": this.resolveOwnerUserId(skill.ownerUserId),
        "@visibility": skill.visibility ?? "private",
        "@name": skill.name,
        "@description": skill.description ?? null,
        "@content": skill.content ?? skill.instructions ?? null,
        "@mcp_config": skill.mcp_config ?? null,
        "@protocol_type": skill.protocol_type,
        "@version": skill.version ?? null,
        "@author": skill.author ?? null,
        "@tags": JSON.stringify(skill.tags ?? []),
        "@original_tags": JSON.stringify(skill.original_tags ?? skill.tags ?? []),
        "@is_favorite": skill.is_favorite ? 1 : 0,
        "@source_url": skill.source_url ?? null,
        "@source_id": skill.source_id ?? null,
        "@source_label": skill.source_label ?? null,
        "@source_branch": skill.source_branch ?? null,
        "@source_directory": skill.source_directory ?? null,
        "@canonical_skill_path": skill.canonical_skill_path ?? null,
        "@local_repo_path": skill.local_repo_path ?? null,
        "@directory_fingerprint": skill.directory_fingerprint ?? null,
        "@icon_url": skill.icon_url ?? null,
        "@icon_emoji": skill.icon_emoji ?? null,
        "@icon_background": skill.icon_background ?? null,
        "@category": skill.category ?? "general",
        "@is_builtin": skill.is_builtin ? 1 : 0,
        "@registry_slug": skill.registry_slug ?? null,
        "@content_url": skill.content_url ?? null,
        "@installed_content_hash": skill.installed_content_hash ?? null,
        "@installed_version": skill.installed_version ?? null,
        "@installed_at": skill.installed_at ?? null,
        "@updated_from_store_at": skill.updated_from_store_at ?? null,
        "@prerequisites": skill.prerequisites
          ? JSON.stringify(skill.prerequisites)
          : null,
        "@compatibility": skill.compatibility
          ? JSON.stringify(skill.compatibility)
          : null,
        "@current_version": skill.currentVersion ?? 0,
        "@version_tracking_enabled":
          (skill.versionTrackingEnabled ?? true) ? 1 : 0,
        "@safety_level": safetyReport?.level ?? null,
        "@safety_score": safetyReport?.score ?? null,
        "@safety_report": safetyReport ? JSON.stringify(safetyReport) : null,
        "@safety_scanned_at": safetyReport?.scannedAt ?? null,
        "@created_at": skill.created_at || Date.now(),
        "@updated_at": skill.updated_at || Date.now(),
      });
  }

  /**
   * Insert a version row directly (for backup restore).
   * 直接插入版本行（用于备份恢复）。
   *
   * Unlike `createVersion`, this does NOT auto-increment `current_version`
   * and accepts explicit values for all fields.
   * 与 `createVersion` 不同，此方法不会自动递增 `current_version`，
   * 且接受所有字段的显式值。
   */
  insertVersionDirect(version: SkillVersion): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (
          @id, @skill_id, @version, @content, @files_snapshot, @note, @created_at
        )`,
      )
      .run({
        "@id": version.id,
        "@skill_id": version.skillId,
        "@version": version.version,
        "@content": version.content || null,
        "@files_snapshot": version.filesSnapshot
          ? JSON.stringify(version.filesSnapshot)
          : null,
        "@note": version.note || null,
        "@created_at": version.createdAt
          ? new Date(version.createdAt).getTime()
          : Date.now(),
      });
  }

  /**
   * Convert database row to Skill object
   * 数据库行转 Skill 对象
   */
  private rowToSkill(row: SkillRow): Skill {
    let safetyReport: SkillSafetyReport | undefined;
    if (row.safety_report) {
      try {
        safetyReport = JSON.parse(row.safety_report) as SkillSafetyReport;
      } catch {
        // malformed JSON — ignore
      }
    }
    return {
      id: row.id,
      name: row.name,
      ...(row.description !== null && { description: row.description }),
      ...(row.content !== null && { content: row.content }),
      ...(row.content !== null && { instructions: row.content }),
      ...(row.mcp_config !== null && { mcp_config: row.mcp_config }),
      protocol_type: row.protocol_type,
      ...(row.version !== null && { version: row.version }),
      ...(row.author !== null && { author: row.author }),
      tags: parseJsonArray<string>(row.tags) ?? [],
      is_favorite: row.is_favorite === 1,
      currentVersion: row.current_version ?? 0,
      versionTrackingEnabled: row.version_tracking_enabled === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_url: row.source_url || undefined,
      source_id: row.source_id || undefined,
      source_label: row.source_label || undefined,
      source_branch: row.source_branch || undefined,
      source_directory: row.source_directory || undefined,
      canonical_skill_path: row.canonical_skill_path || undefined,
      local_repo_path: row.local_repo_path || undefined,
      directory_fingerprint: row.directory_fingerprint || undefined,
      icon_url: row.icon_url || undefined,
      icon_emoji: row.icon_emoji || undefined,
      icon_background: row.icon_background || undefined,
      category: row.category || "general",
      is_builtin: row.is_builtin === 1,
      registry_slug: row.registry_slug || undefined,
      content_url: row.content_url || undefined,
      installed_content_hash: row.installed_content_hash || undefined,
      installed_version: row.installed_version || undefined,
      installed_at: row.installed_at ?? undefined,
      updated_from_store_at: row.updated_from_store_at ?? undefined,
      prerequisites: parseJsonArray<string>(row.prerequisites),
      compatibility: parseJsonArray<string>(row.compatibility),
      original_tags: parseJsonArray<string>(row.original_tags),
      safetyReport,
      ownerUserId: row.owner_user_id || undefined,
      visibility: row.visibility,
      approvalStatus: row.approval_status || undefined,
    };
  }

  /**
   * Convert database row to SkillVersion object
   * 数据库行转 SkillVersion 对象
   */
  private rowToSkillVersion(row: SkillVersionRow): SkillVersion {
    return {
      id: row.id,
      skillId: row.skill_id,
      version: row.version,
      ...(row.content !== null && { content: row.content }),
      filesSnapshot: parseJsonArray<SkillFileSnapshot>(row.files_snapshot),
      ...(row.note !== null && { note: row.note }),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private resolveOwnerUserId(ownerUserId: string | null | undefined): string | null {
    if (!ownerUserId) {
      return null;
    }
    try {
      const row = this.db
        .prepare("SELECT id FROM users WHERE id = ?")
        .get(ownerUserId) as { id: string } | undefined;
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
}
