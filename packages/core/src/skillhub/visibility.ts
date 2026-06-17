/**
 * SkillHub core 可见性策略与归一化（纯逻辑，无 I/O、无副作用）。
 *
 * 这里集中存放可见性的读取归一化、写入校验，以及读取/下载/发布的纯策略
 * 决策函数，便于属性测试覆盖（见 design.md「Correctness Properties」）。
 *
 * 依赖方向（AGENTS.md）：仅依赖 `@prompthub/shared` 的类型与本模块内部类型，
 * 不依赖 `apps/*` 或 Electron。
 */

import type { SkillVisibility } from "@prompthub/shared/types";

import { ValidationError } from "./errors";
import type { Actor } from "./types";

/**
 * 读取侧归一化：将存储的原始可见性值归一化为 `'private' | 'shared'`。
 *
 * 仅当值严格等于 `'shared'` 时归一化为 `'shared'`；其余一切情况——包括
 * `null`、`undefined`、空字符串、`'private'`，以及任何无法识别的字符串——
 * 都归一化为 `'private'`。这保证存储侧为空或无法识别的可见性在读取时被
 * 当作私有，从而排除于公开结果之外（需求 7.8）。
 */
export function normalizeVisibility(
  value: string | null | undefined,
): SkillVisibility {
  return value === "shared" ? "shared" : "private";
}

/**
 * 写入侧校验：仅接受 `'private'` 或 `'shared'` 作为可写入的可见性值。
 *
 * 任何其它值（错误类型、空值、无法识别的字符串）都会抛出 `ValidationError`，
 * 使调用方在执行数据库写入之前拒绝该请求并保留现有存储值（需求 7.6、7.7）。
 */
export function assertWritableVisibility(value: unknown): SkillVisibility {
  if (value === "private" || value === "shared") {
    return value;
  }
  throw new ValidationError(
    `Invalid skill visibility: expected 'private' or 'shared', received ${JSON.stringify(
      value,
    )}`,
  );
}

/**
 * 判断某个 actor 是否被允许读取（浏览/查看详情）一个技能。
 *
 * 当技能为 `'shared'` 时，任意 actor（含匿名 `null`）均可读取；当技能为
 * `'private'` 时，仅其所有者可读取（需求 8.1、8.2、8.3）。
 */
export function canRead(
  actor: Actor | null,
  owner: string | null,
  vis: SkillVisibility,
): boolean {
  if (vis === "shared") {
    return true;
  }
  return actor !== null && owner !== null && actor.userId === owner;
}

/**
 * 判断某个 actor 是否被允许下载一个技能。
 *
 * 下载授权与读取授权同构：`'shared'` 对任意 actor（含匿名）开放，`'private'`
 * 仅对其所有者开放（需求 3.5、8.1、8.2）。
 */
export function canDownload(
  actor: Actor | null,
  owner: string | null,
  vis: SkillVisibility,
): boolean {
  return canRead(actor, owner, vis);
}

/**
 * 判断某个已认证 actor 是否被允许发布一个技能。
 *
 * 采用「基于所有者」模型（设计冲突 A 已确认）：仅当 actor 是技能的所有者
 * （`owner === actor.userId`）时可发布，非所有者一律被拒（需求 6.3）。
 */
export function canPublish(actor: Actor, owner: string | null): boolean {
  return owner !== null && actor.userId === owner;
}
