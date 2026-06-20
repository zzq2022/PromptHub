/**
 * SkillHub core 摘要映射与描述截断（纯逻辑，无 I/O、无副作用）。
 *
 * 这里集中存放从 `skills` 表原始行（`SkillCatalogRow`）派生只读摘要视图的
 * 纯函数：公开摘要（`SkillPublicSummary`）与私有摘要（`SkillPrivateSummary`），
 * 以及描述截断逻辑，便于属性测试覆盖（见 design.md「Correctness Properties」）。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared` 的契约类型/常量与本模块
 * 内部类型，不依赖 `apps/*` 或 Electron。
 */

import type {
  SkillPrivateSummary,
  SkillPublicSummary,
} from "@prompthub/shared/types";
import { SKILLHUB } from "@prompthub/shared/types";

import { normalizeVisibility } from "./visibility";
import type { SkillCatalogRow } from "./types";

/**
 * 将技能描述截断为至多 `SKILLHUB.DESCRIPTION_MAX`（500）个字符的前缀。
 *
 * - 当描述为 `null` 或空字符串时，返回空字符串。
 * - 当描述长度（按 Unicode 码点计）不超过上限时，原样返回。
 * - 否则返回原描述按码点的前 `DESCRIPTION_MAX` 个字符。
 *
 * 截断按 Unicode 码点（而非 UTF-16 码元）进行，使用 `Array.from` 展开，
 * 以避免将多码元字符（如 emoji、CJK 扩展区字符）从中间切断（需求 1.3）。
 */
export function truncateDescription(desc: string | null): string {
  if (desc === null || desc === "") {
    return "";
  }
  const codePoints = Array.from(desc);
  if (codePoints.length <= SKILLHUB.DESCRIPTION_MAX) {
    return desc;
  }
  return codePoints.slice(0, SKILLHUB.DESCRIPTION_MAX).join("");
}

/**
 * 从 `skills` 行派生面向匿名访客的公开摘要。
 *
 * 恰含 `id`、`name`、`description` 三个字段，其中 `description` 已截断至
 * ≤500 个字符（需求 1.3）。
 */
export function toPublicSummary(row: SkillCatalogRow): SkillPublicSummary {
  return {
    id: row.id,
    name: row.name,
    description: truncateDescription(row.description),
    slug: row.registry_slug ?? undefined,
  };
}

/**
 * 从 `skills` 行派生面向所有者的私有摘要。
 *
 * 恰含 `id`、`name`、`description`、`visibility` 四个字段（需求 5.3）。
 * `visibility` 由 `normalizeVisibility` 对原始 `row.visibility` 归一化得到，
 * 使存储侧为空或无法识别的值在摘要中被当作 `'private'`（需求 7.8）。
 */
export function toPrivateSummary(row: SkillCatalogRow): SkillPrivateSummary {
  return {
    id: row.id,
    name: row.name,
    description: truncateDescription(row.description),
    visibility: normalizeVisibility(row.visibility),
    slug: row.registry_slug ?? undefined,
  };
}
