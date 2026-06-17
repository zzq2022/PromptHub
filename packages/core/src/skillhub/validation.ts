/**
 * SkillHub core 输入校验（纯逻辑，无 I/O、无数据库访问）。
 *
 * 这些函数在执行任何数据库查询之前对外部输入进行校验（需求 8.6、8.7，
 * 见 design.md 「Property 16: 输入校验先于任何数据库查询」）。它们是无副作用
 * 的纯函数：校验通过则原样返回输入，否则抛出 `ValidationError`。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared`，不依赖 `apps/*` 或 Electron。
 */

import { SKILLHUB } from "@prompthub/shared/types";

import { ValidationError } from "./errors";

/**
 * 控制字符判定：拒绝 C0 控制字符（U+0000–U+001F，含空字节 `\x00`）与
 * DEL（U+007F）。
 *
 * 这是 design.md 中“拒绝空字节与控制字符”的精确定义：
 * - `0x00`–`0x1F`：C0 控制字符（包含空字节、制表符、换行、回车等）。
 * - `0x7F`：DEL 控制字符。
 *
 * 可打印字符（含空格 `0x20`、CJK、emoji、其他 Unicode 字母）均不视为控制字符。
 */
function containsControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * 校验技能标识符。
 *
 * 标识符必须匹配 `SKILLHUB.SKILL_ID_PATTERN`（UUID v4 形状）。校验通过返回原始
 * `id`；否则抛出 `ValidationError`，且不触达任何数据库查询（需求 8.6、8.7）。
 *
 * @param id 待校验的技能标识符。
 * @returns 校验通过的同一标识符。
 * @throws {ValidationError} 当 `id` 不匹配定义的标识符格式时。
 */
export function validateSkillId(id: string): string {
  if (!SKILLHUB.SKILL_ID_PATTERN.test(id)) {
    throw new ValidationError(
      `Invalid skill id: must match the skill identifier format (UUID v4), got length ${id.length}`,
    );
  }
  return id;
}

/**
 * 校验搜索输入。
 *
 * 接受长度介于 0 到 `SKILLHUB.SEARCH_INPUT_MAX`（256）之间、且不包含空字节
 * （`\x00`）或控制字符的字符串。长度为 0 的输入有效（表示空搜索）。校验通过
 * 返回原始 `raw`；否则抛出 `ValidationError`，且不触达任何数据库查询
 * （需求 8.6、8.7）。
 *
 * 注意：本函数仅做输入校验，不做规范化（trim / 截断 / 转小写由
 * `normalizeSearchQuery` 负责）。长度以 UTF-16 码元计（与 `string.length` 一致）。
 *
 * @param raw 待校验的原始搜索输入。
 * @returns 校验通过的同一字符串。
 * @throws {ValidationError} 当长度超过上限或包含空字节 / 控制字符时。
 */
export function validateSearchInput(raw: string): string {
  if (raw.length > SKILLHUB.SEARCH_INPUT_MAX) {
    throw new ValidationError(
      `Invalid search input: length ${raw.length} exceeds maximum of ${SKILLHUB.SEARCH_INPUT_MAX}`,
    );
  }
  if (containsControlCharacter(raw)) {
    throw new ValidationError(
      "Invalid search input: must not contain null bytes or control characters",
    );
  }
  return raw;
}
