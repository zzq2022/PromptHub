/**
 * SkillHub core 模块入口。
 *
 * 汇总 `packages/core/src/skillhub` 下的纯逻辑：内部类型、类型化错误，
 * 以及后续任务（2.1–7.1）实现的 visibility / search / summary / pagination /
 * validation / archive-plan 等无副作用函数。
 *
 * 依赖方向（AGENTS.md）：本模块不依赖 `apps/*` 或 Electron；
 * 仅可依赖 `@prompthub/shared`。
 */

export * from "./types";
export * from "./errors";
export * from "./summary";
export * from "./validation";
export * from "./search";
export * from "./visibility";
export * from "./pagination";
export * from "./archive-plan";
