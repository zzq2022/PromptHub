/**
 * SkillHub core 类型化错误类。
 *
 * 这些错误由纯逻辑模块抛出，并由 `apps/web` 服务层映射为统一的 HTTP 响应
 * （见 design.md「Error Handling」）。错误消息使用英文（用于日志）；
 * 面向用户的文案由前端经 i18n 呈现。
 */

/**
 * 输入校验失败。
 *
 * 由 `validateSkillId` / `validateSearchInput` / `assertWritableVisibility`
 * 在执行任何数据库查询或写入之前抛出（需求 7.7、8.7）。
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 归档的累计未压缩大小超过支持上限。
 *
 * 由 `planArchiveEntries` 在累计未压缩字节数超过
 * `ARCHIVE_MAX_UNCOMPRESSED_BYTES` 时抛出（需求 3.4）。
 */
export class ArchiveTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveTooLargeError";
  }
}
