/**
 * SkillHub core 分页（纯逻辑，无 I/O、无副作用）。
 *
 * `paginate` 从一个完整的条目序列中切出某一页，并计算分页元数据
 * （总数、当前页码、页大小、本页首/末条目的全局索引），便于属性测试覆盖
 * （见 design.md「Correctness Properties」Property 3）。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared` 的类型，
 * 不依赖 `apps/*` 或 Electron。
 */

import type { PaginatedResult } from "@prompthub/shared/types";

/**
 * 将 `items` 按 `page`（1-based）与 `pageSize` 分页，并返回该页条目及分页元数据。
 *
 * 语义（需求 1.5 / Property 3）：
 * - `total` 等于 `items.length`（命中条目总数）。
 * - 本页条目为半开区间 `[(page-1)*pageSize, page*pageSize)` 的切片，条目数 ≤ `pageSize`。
 * - `startIndex` 为本页首条在原序列中的 0-based 全局索引；空页时为 `0`。
 * - `endIndex` 为本页末条在原序列中的 0-based 全局（含）索引；空页时为 `-1`。
 * - 将所有有效页（`page = 1..ceil(total/pageSize)`）依序拼接，恰好无重叠、无遗漏地
 *   还原原序列。
 *
 * 边界/越界输入的确定性处理：
 * - `page` 被规范化为不小于 1 的整数（`< 1`、非整数或非有限值一律按 `1` 处理），
 *   以避免负偏移导致从序列尾部反向切片。
 * - `pageSize` 被规范化为不小于 1 的整数（`< 1`、非整数或非有限值一律按 `1` 处理）。
 * - 当规范化后的页码超出有效范围时，本页为空页（`items=[]`、`startIndex=0`、`endIndex=-1`）。
 * 返回的 `page` 与 `pageSize` 反映规范化后实际使用的值。
 */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const total = items.length;
  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.trunc(pageSize))
    : 1;

  const startOffset = (safePage - 1) * safePageSize;
  const pageItems = items.slice(startOffset, startOffset + safePageSize);

  const isEmptyPage = pageItems.length === 0;
  const startIndex = isEmptyPage ? 0 : startOffset;
  const endIndex = isEmptyPage ? -1 : startOffset + pageItems.length - 1;

  return {
    items: pageItems,
    total,
    page: safePage,
    pageSize: safePageSize,
    startIndex,
    endIndex,
  };
}
