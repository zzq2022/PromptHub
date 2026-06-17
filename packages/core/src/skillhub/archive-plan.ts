/**
 * SkillHub core 归档清单计算（纯逻辑，无 I/O、无文件系统访问）。
 *
 * 该模块只做“清单与大小决策”：从一组待归档条目中过滤掉被忽略的条目
 * （`SKILLHUB.IGNORED_ENTRIES`，即 `.git` / `.prompthub`），并对过滤后保留的
 * 条目累计未压缩大小进行上限校验（`SKILLHUB.ARCHIVE_MAX_UNCOMPRESSED_BYTES`，
 * 500 MB）。实际的文件读取与 ZIP 打包等 I/O 由 `apps/web` 的下载服务承担
 * （见 design.md「packages/core/src/skillhub」与「Error Handling」）。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared`，不依赖 `apps/*` 或 Electron。
 *
 * 需求：3.3（排除忽略项）、3.4（累计未压缩大小上限）。
 */

import { SKILLHUB } from "@prompthub/shared/types";

import { ArchiveTooLargeError } from "./errors";

/**
 * 单个待归档条目。
 *
 * `relativePath` 为相对于技能包根目录的路径（可能使用 `/` 或 `\` 作为分隔符）；
 * `byteLength` 为该条目的未压缩字节数。
 */
export interface ArchiveEntry {
  relativePath: string;
  byteLength: number;
}

/**
 * 将相对路径拆分为非空路径段，同时归一化 POSIX（`/`）与 Windows（`\`）分隔符。
 *
 * 连续分隔符或首尾分隔符产生的空段会被丢弃，使得
 * `".git/config"`、`"/.git/config"`、`".git\\config"` 都解析为
 * `[".git", "config"]`。
 */
function toPathSegments(relativePath: string): string[] {
  return relativePath.split(/[/\\]+/).filter((segment) => segment.length > 0);
}

/**
 * 判定某个条目是否应被排除在归档之外。
 *
 * 当条目的任意路径段等于 `SKILLHUB.IGNORED_ENTRIES` 中的任一被忽略名称时，
 * 该条目被排除。这覆盖了被忽略目录作为顶层目录的情形（如 `.git`、
 * `.git/config`、`.prompthub/x`）以及其作为嵌套段出现的情形，符合
 * design.md「过滤掉以 IGNORED_ENTRIES 任一为顶层目录/名的条目」（需求 3.3）。
 */
function isIgnoredEntry(entry: ArchiveEntry): boolean {
  const segments = toPathSegments(entry.relativePath);
  return segments.some((segment) =>
    (SKILLHUB.IGNORED_ENTRIES as readonly string[]).includes(segment),
  );
}

/**
 * 计算技能归档的最终条目清单。
 *
 * 步骤：
 * 1. 过滤掉被忽略的条目（任意路径段等于 `.git` / `.prompthub`，需求 3.3）。
 * 2. 累计过滤后保留条目的 `byteLength`；若总和超过
 *    `SKILLHUB.ARCHIVE_MAX_UNCOMPRESSED_BYTES`（500 MB），抛出
 *    `ArchiveTooLargeError`（需求 3.4）。大小校验针对的是过滤后的条目集合。
 *
 * 本函数为纯函数：不修改入参，按原有顺序返回保留的条目。
 *
 * @param entries 待归档的条目集合（含可能被忽略的条目）。
 * @returns 过滤掉被忽略条目后保留的条目（保持原有顺序）。
 * @throws {ArchiveTooLargeError} 当保留条目的累计未压缩大小超过上限时。
 */
export function planArchiveEntries(entries: ArchiveEntry[]): ArchiveEntry[] {
  const included = entries.filter((entry) => !isIgnoredEntry(entry));

  let totalBytes = 0;
  for (const entry of included) {
    totalBytes += entry.byteLength;
  }

  if (totalBytes > SKILLHUB.ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
    throw new ArchiveTooLargeError(
      `Archive too large: total uncompressed size ${totalBytes} bytes exceeds maximum of ${SKILLHUB.ARCHIVE_MAX_UNCOMPRESSED_BYTES} bytes`,
    );
  }

  return included;
}
