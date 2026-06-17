/**
 * SkillHub 搜索规范化与匹配（纯逻辑，无 I/O、无副作用）。
 *
 * 该模块实现需求 2 的核心搜索语义，全部为确定性纯函数，便于属性测试：
 * - `normalizeSearchQuery`：去首尾空白 → 截断至 `SEARCH_MATCH_MAX`（200）→ 转小写，
 *   并标记是否为空（需求 2.1 / 2.2 / 2.3）。
 * - `matchesQuery`：对 `name` 或 `description` 执行不区分大小写的子串匹配（需求 2.6）。
 * - `buildLikePattern`：构造参数化 `LIKE ... ESCAPE '\'` 模式，转义 `% _ \`，
 *   使 FTS5/SQL 操作符字符按字面处理而不引发查询语法错误（需求 2.4）。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared`，不依赖 `apps/*` 或 Electron。
 */

import { SKILLHUB } from "@prompthub/shared/types";

/**
 * 规范化后的搜索查询。
 *
 * `term` 已经过去空白 → 截断至 200 字符 → 转小写处理；当 `term` 为空字符串时
 * `isEmpty` 为 `true`，调用方据此返回全部 shared 技能（需求 2.2）。
 */
export interface NormalizedQuery {
  isEmpty: boolean;
  /** 已 trim、截断至 SEARCH_MATCH_MAX、并转小写的查询词。 */
  term: string;
}

/**
 * 规范化原始搜索查询：去首尾空白 → 截断至 `SKILLHUB.SEARCH_MATCH_MAX`（200）→ 转小写。
 *
 * 截断在转小写之前按字符进行（需求 2.3：仅对去空白后的前 200 个字符匹配）。
 * 去空白后为空字符串时 `isEmpty` 为 `true`（需求 2.2）。
 *
 * @param raw 用户提交的原始查询字符串。
 * @returns 规范化查询，含 `isEmpty` 标记与 `term`。
 */
export function normalizeSearchQuery(raw: string): NormalizedQuery {
  const trimmed = raw.trim();
  const truncated = trimmed.slice(0, SKILLHUB.SEARCH_MATCH_MAX);
  const term = truncated.toLowerCase();
  return { isEmpty: term.length === 0, term };
}

/**
 * 判断某个技能的 `name` 或 `description` 是否以不区分大小写的子串方式匹配查询（需求 2.1 / 2.6）。
 *
 * `q.term` 已为小写；此处将 `name` 与 `description` 转小写后做 `includes` 比较。
 * 当 `q.isEmpty` 为 `true`（空查询词）时，空子串可匹配任意字符串，返回 `true`，
 * 与需求 2.2「空查询返回全部 shared」语义一致。
 *
 * @param name 技能名称。
 * @param description 技能描述，可能为 `null`。
 * @param q 已规范化的查询。
 * @returns 名称或描述包含查询词时为 `true`。
 */
export function matchesQuery(
  name: string,
  description: string | null,
  q: NormalizedQuery,
): boolean {
  const term = q.term;
  if (name.toLowerCase().includes(term)) {
    return true;
  }
  if (description !== null && description.toLowerCase().includes(term)) {
    return true;
  }
  return false;
}

/**
 * 由查询词构造参数化 `LIKE` 子串模式与 `ESCAPE` 字符（需求 2.4）。
 *
 * 转义 LIKE 的通配符 `%`、`_` 以及转义符 `\` 本身（先转义 `\` 以避免二次转义），
 * 使查询词被当作字面文本匹配；FTS5/SQL 操作符字符（如 `AND OR NOT NEAR * ^ " :`）
 * 在 `LIKE` 下本就是字面量，因此不会引发查询语法错误。
 *
 * 返回的 `pattern` 形如 `%<escaped>%`，配合 SQL `LIKE ? ESCAPE '\'` 使用。
 *
 * @param term 查询词（通常为 `normalizeSearchQuery` 产生的 `term`）。
 * @returns `{ pattern, escape }`，其中 `escape` 固定为单个反斜杠字符。
 */
export function buildLikePattern(term: string): { pattern: string; escape: "\\" } {
  const escaped = term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return { pattern: `%${escaped}%`, escape: "\\" };
}
