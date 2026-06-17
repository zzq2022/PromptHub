/**
 * SkillHub 技能下载服务（Skill_Download_Service）。
 *
 * 职责：将一个技能包的完整目录树组装为可下载的 ZIP 归档。本服务承担所有 I/O
 * （文件系统遍历 + 打包），而“清单与大小决策”等纯逻辑复用
 * `@prompthub/core/skillhub` 的 `planArchiveEntries`（排除 `.git` / `.prompthub`、
 * 校验 500MB 上限），授权决策复用 `canDownload`，标识符校验复用 `validateSkillId`。
 *
 * 打包库：使用 **fflate** 的 `zipSync`（见下）。选择理由记录于活动 change 的
 * `implementation.md`：
 * - fflate 已是 `apps/web` 的既有依赖（`apps/web/package.json`，并已在
 *   `routes/import-export.ts` 中通过 `unzipSync` 使用），无需引入新依赖；
 * - `zipSync` 在内存中一次性同步构建完整归档缓冲，天然满足需求 3.7 的原子性：
 *   仅在完整成功后返回缓冲，任何中途失败抛错且不返回任何部分字节。
 *
 * 关键语义（需求 3.1/3.2/3.3/3.5/3.6/3.7）：
 * - 校验 id → `getOwnership`（缺失 ⇒ NOT_FOUND，3.6）→ `canDownload`（非所有者私有
 *   ⇒ FORBIDDEN，3.5）→ 解析技能目录 → 遍历文件得 `ArchiveEntry[]` →
 *   `planArchiveEntries`（排除忽略项、enforce 500MB ⇒ ARCHIVE_TOO_LARGE，3.4）→
 *   读取保留条目内容并完整打包 ZIP，仅在完整成功后返回 `SkillArchiveResult`。
 * - 任何中途失败（目录缺失、读文件异常、打包异常）抛 `ARCHIVE_FAILED` 且不返回
 *   部分字节（3.7 原子性）。
 * - `SKILL.md` 在源存在时必含于归档（3.2，由“包含全部非忽略文件”自然推得）。
 *
 * 路径穿越安全（复用 `skill-workspace.ts` 的等价约束）：遍历仅基于真实目录项构建
 * 相对路径，跳过符号链接（无符号链接逃逸），并对每个相对路径做防御性校验（拒绝
 * 绝对路径、`..` 段、空字节）；技能目录解析锚定在 `getSkillsDir()` 之内。
 *
 * 依赖方向（AGENTS.md）：本服务属于 `apps/web` 编排/IO 层，依赖
 * `@prompthub/core`、`@prompthub/db`、`@prompthub/shared`。
 */

import fs from 'node:fs';
import path from 'node:path';

import { SkillDB } from '@prompthub/db';
import type { SkillCatalogRow } from '@prompthub/db';
import { SKILLHUB, SkillHubErrorCode } from '@prompthub/shared';
import type { SkillArchiveResult } from '@prompthub/shared';
import {
  ArchiveTooLargeError,
  ValidationError,
  canDownload,
  normalizeVisibility,
  planArchiveEntries,
  validateSkillId,
} from '@prompthub/core/skillhub';
import type { Actor, ArchiveEntry } from '@prompthub/core/skillhub';
import { zipSync } from 'fflate';

import { getServerDatabase } from '../database.js';
import { getSkillsDir } from '../runtime-paths.js';

/**
 * 下载服务的类型化错误。携带 HTTP 状态码与 `SkillHubErrorCode`，供路由层
 * （任务 16）映射为统一响应。错误消息使用英文（用于日志）。
 */
export class SkillDownloadError extends Error {
  constructor(
    public readonly status: 403 | 404 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillDownloadError';
  }
}

/**
 * 将技能名称归一化为文件名 slug（与 `skill-workspace.ts` 的目录 slug 规则一致）：
 * 转小写、非字母数字折叠为 `-`、去除首尾 `-`，空结果回退为 `untitled`。
 */
function slugify(input: string | null | undefined): string {
  const normalized = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'untitled';
}

/**
 * 防御性相对路径校验：拒绝空字节、绝对路径与包含 `..` 的路径段。
 * 由于相对路径仅由真实目录项构建，这是纵深防御（路径穿越，AGENTS.md 8.5）。
 */
function assertSafeRelativePath(relativePath: string): void {
  if (relativePath.includes('\u0000')) {
    throw new SkillDownloadError(
      500,
      SkillHubErrorCode.ARCHIVE_FAILED,
      'Archive failed: skill file path contains a null byte',
    );
  }

  const normalized = path.posix.normalize(relativePath.replace(/\\/g, '/'));
  if (
    normalized === '' ||
    normalized === '.' ||
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new SkillDownloadError(
      500,
      SkillHubErrorCode.ARCHIVE_FAILED,
      `Archive failed: invalid skill file path: ${relativePath}`,
    );
  }
}

interface WalkedFile {
  /** 相对于技能目录根的 POSIX 路径。 */
  relativePath: string;
  /** 该文件在磁盘上的绝对路径（用于后续读取内容）。 */
  absolutePath: string;
  /** 未压缩字节数（来自 stat，不读取内容）。 */
  byteLength: number;
}

export class SkillDownloadService {
  private readonly skillDb = new SkillDB(getServerDatabase());

  /**
   * 下载一个技能：组装完整 ZIP 归档并仅在完整成功后返回缓冲。
   *
   * @param actor 发起请求的已认证用户；匿名访客为 `null`。
   * @param id 技能标识符（UUID v4）。
   * @returns 完整成功时的归档结果（`fileName` / `byteLength` / `body`）。
   * @throws {SkillDownloadError} VALIDATION_ERROR(422) / NOT_FOUND(404) /
   *   FORBIDDEN(403) / ARCHIVE_TOO_LARGE(422) / ARCHIVE_FAILED(500)。
   */
  download(actor: Actor | null, id: string): SkillArchiveResult {
    const skillId = this.validateId(id);

    const row = this.skillDb.getOwnership(skillId);
    if (!row) {
      // 需求 3.6：未找到该技能标识符。
      throw new SkillDownloadError(
        404,
        SkillHubErrorCode.NOT_FOUND,
        'Skill not found',
      );
    }

    const visibility = normalizeVisibility(row.visibility);
    if (!canDownload(actor, row.owner_user_id, visibility)) {
      // 需求 3.5：非所有者请求私有技能 ⇒ 拒绝、不生成归档。
      throw new SkillDownloadError(
        403,
        SkillHubErrorCode.FORBIDDEN,
        'Skill is not accessible',
      );
    }

    const skillDir = this.resolveSkillDirectory(skillId);

    // 遍历得到全部条目（含忽略项），交给 core 做清单与大小决策。
    const walked = this.walkSkillFiles(skillDir);
    const planned = this.planEntries(walked);

    // 仅打包 core 返回的条目，完整成功后才返回缓冲（需求 3.7 原子性）。
    const body = this.packageArchive(skillDir, walked, planned);

    return {
      fileName: `${slugify(row.name)}.zip`,
      byteLength: body.byteLength,
      body,
    };
  }

  /**
   * 校验技能标识符，将 core 的 `ValidationError` 映射为 422 下载错误。
   */
  private validateId(id: string): string {
    try {
      return validateSkillId(id);
    } catch (cause) {
      if (cause instanceof ValidationError) {
        throw new SkillDownloadError(
          422,
          SkillHubErrorCode.VALIDATION_ERROR,
          cause.message,
        );
      }
      throw cause;
    }
  }

  /**
   * 在 `getSkillsDir()` 下解析技能目录 `<slug>__<id>/`。
   *
   * 为对名称 slug 的变化稳健，按“目录名以 `__<id>` 结尾”匹配；解析结果锚定在
   * 技能根目录之内（拒绝逃逸）。目录缺失视为归档失败（需求 3.7）。
   */
  private resolveSkillDirectory(skillId: string): string {
    const skillsRoot = getSkillsDir();
    const suffix = `__${skillId}`;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    } catch (cause) {
      throw new SkillDownloadError(
        500,
        SkillHubErrorCode.ARCHIVE_FAILED,
        `Archive failed: unable to read skills directory: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    const match = entries.find(
      (entry) => entry.isDirectory() && entry.name.endsWith(suffix),
    );
    if (!match) {
      throw new SkillDownloadError(
        500,
        SkillHubErrorCode.ARCHIVE_FAILED,
        `Archive failed: skill directory not found for id ${skillId}`,
      );
    }

    const resolvedRoot = path.resolve(skillsRoot);
    const skillDir = path.resolve(skillsRoot, match.name);
    const relative = path.relative(resolvedRoot, skillDir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new SkillDownloadError(
        500,
        SkillHubErrorCode.ARCHIVE_FAILED,
        'Archive failed: resolved skill directory escapes the skills root',
      );
    }

    return skillDir;
  }

  /**
   * 递归遍历技能目录，收集普通文件（跳过符号链接以防逃逸）。
   * 仅 stat 取大小，不读取内容；相对路径以 POSIX 分隔符表示。
   */
  private walkSkillFiles(skillDir: string): WalkedFile[] {
    const files: WalkedFile[] = [];

    const walk = (currentDir: string): void => {
      const dirents = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const dirent of dirents) {
        const absolutePath = path.join(currentDir, dirent.name);

        // 跳过符号链接：不跟随，防止符号链接逃逸出技能目录。
        if (dirent.isSymbolicLink()) {
          continue;
        }

        if (dirent.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        if (!dirent.isFile()) {
          continue;
        }

        const relativePath = path
          .relative(skillDir, absolutePath)
          .split(path.sep)
          .join('/');
        assertSafeRelativePath(relativePath);

        const stats = fs.statSync(absolutePath);
        files.push({
          relativePath,
          absolutePath,
          byteLength: stats.size,
        });
      }
    };

    try {
      walk(skillDir);
    } catch (cause) {
      if (cause instanceof SkillDownloadError) {
        throw cause;
      }
      throw new SkillDownloadError(
        500,
        SkillHubErrorCode.ARCHIVE_FAILED,
        `Archive failed while walking skill files: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    return files;
  }

  /**
   * 将遍历到的全部条目交给 core 的 `planArchiveEntries`（排除 `.git`/`.prompthub`，
   * 校验 500MB 上限），把 `ArchiveTooLargeError` 映射为 422。
   */
  private planEntries(walked: WalkedFile[]): ArchiveEntry[] {
    const entries: ArchiveEntry[] = walked.map((file) => ({
      relativePath: file.relativePath,
      byteLength: file.byteLength,
    }));

    try {
      return planArchiveEntries(entries);
    } catch (cause) {
      if (cause instanceof ArchiveTooLargeError) {
        throw new SkillDownloadError(
          422,
          SkillHubErrorCode.ARCHIVE_TOO_LARGE,
          cause.message,
        );
      }
      throw cause;
    }
  }

  /**
   * 读取保留条目内容并在内存中一次性打包为完整 ZIP 缓冲。
   *
   * 任何文件读取或打包异常都会抛出 `ARCHIVE_FAILED`，且不返回任何部分字节
   * （需求 3.7 原子性）。
   */
  private packageArchive(
    skillDir: string,
    walked: WalkedFile[],
    planned: ArchiveEntry[],
  ): Uint8Array {
    const absoluteByRelative = new Map<string, string>(
      walked.map((file) => [file.relativePath, file.absolutePath]),
    );

    const zipInput: Record<string, Uint8Array> = {};

    try {
      for (const entry of planned) {
        const absolutePath = absoluteByRelative.get(entry.relativePath);
        if (!absolutePath) {
          throw new Error(
            `planned entry has no source file: ${entry.relativePath}`,
          );
        }

        // 读取为原始字节，避免对二进制内容做文本转换（需求 3.8 往返一致）。
        const contents = fs.readFileSync(absolutePath);
        zipInput[entry.relativePath] = new Uint8Array(
          contents.buffer,
          contents.byteOffset,
          contents.byteLength,
        );
      }

      return zipSync(zipInput);
    } catch (cause) {
      if (cause instanceof SkillDownloadError) {
        throw cause;
      }
      throw new SkillDownloadError(
        500,
        SkillHubErrorCode.ARCHIVE_FAILED,
        `Archive generation failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }
}
