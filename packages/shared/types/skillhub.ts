import type { SkillVisibility } from "./skill";

/**
 * SkillHub shared contracts.
 *
 * These types and constants are the single source of truth for the
 * SkillHub feature's request/response shapes, validation bounds, and
 * error codes. They are consumed by `packages/core` (pure logic) and
 * `apps/web` (HTTP services/routes).
 *
 * Visibility uses the existing `SkillVisibility` from `./skill`
 * (`'private' | 'shared'`) as the single source of truth; it is
 * re-exported here for ergonomic SkillHub imports.
 */
export type { SkillVisibility };

/**
 * Public-facing skill summary returned for anonymous browsing/search.
 * Requirement 1.3: id, name, and description (truncated to 500 chars).
 */
export interface SkillPublicSummary {
  id: string;
  name: string;
  /** Truncated to <=500 characters; shorter descriptions are kept as-is. */
  description: string;
}

/**
 * Owner-facing private skill summary.
 * Requirement 5.3: id, name, description, and visibility.
 */
export interface SkillPrivateSummary {
  id: string;
  name: string;
  description: string;
  visibility: SkillVisibility;
}

/**
 * Full skill detail view for browse/private detail pages.
 * Requirements 1.8 / 5.8: when SKILL.md content cannot be loaded,
 * `skillMd` is null and `skillMdAvailable` is false.
 */
export interface SkillDetail {
  id: string;
  name: string;
  description: string;
  visibility: SkillVisibility;
  ownerUserId: string | null;
  /** SKILL.md content; null when unavailable. */
  skillMd: string | null;
  /** Corresponds to Requirements 1.8 / 5.8. */
  skillMdAvailable: boolean;
}

/**
 * Generic pagination envelope.
 * Requirement 1.5: includes total count, current page, and item index range.
 */
export interface PaginatedResult<T> {
  items: T[];
  /** Total number of matching items across all pages. */
  total: number;
  /** 1-based current page number. */
  page: number;
  /** Fixed page size (see `SKILLHUB.PAGE_SIZE`). */
  pageSize: number;
  /** 0-based global index of the first item on this page (0 when empty). */
  startIndex: number;
  /** 0-based global index of the last item on this page, inclusive (-1 when empty). */
  endIndex: number;
}

/**
 * Result of assembling a downloadable skill archive.
 * Requirements 3.1 / 3.4.
 */
export interface SkillArchiveResult {
  /** Archive file name, e.g. `<slug>.zip`. */
  fileName: string;
  /** Total byte length of the archive body. */
  byteLength: number;
  /** Archive bytes (MVP buffers the full archive before returning). */
  body: Uint8Array;
}

/**
 * SkillHub-wide numeric and policy constants.
 * Requirements 1.3, 1.5, 3.1, 3.4, 7.2, 8.6.
 */
export const SKILLHUB = {
  /** Fixed page size for public browse/search pagination (Requirement 1.5). */
  PAGE_SIZE: 20,
  /** Max length for truncated summary descriptions (Requirement 1.3). */
  DESCRIPTION_MAX: 500,
  /** Query is truncated to this many characters for matching (Requirement 2.3). */
  SEARCH_MATCH_MAX: 200,
  /** Upper bound for accepted search input length (Requirement 8.6). */
  SEARCH_INPUT_MAX: 256,
  /** Max total uncompressed archive size: 500 MB (Requirement 3.4). */
  ARCHIVE_MAX_UNCOMPRESSED_BYTES: 500 * 1024 * 1024,
  /** Entries excluded from archives and packaging (Requirement 3.3). */
  IGNORED_ENTRIES: [".git", ".prompthub"] as const,
  /** Skill identifiers are UUID v4 (matches SkillDB). */
  SKILL_ID_PATTERN:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

/**
 * Stable error codes for SkillHub services/routes.
 * Mapped to HTTP responses in `apps/web`.
 */
export const SkillHubErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ARCHIVE_FAILED: "ARCHIVE_FAILED",
  ARCHIVE_TOO_LARGE: "ARCHIVE_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Union of SkillHub error code string values. */
export type SkillHubErrorCode =
  (typeof SkillHubErrorCode)[keyof typeof SkillHubErrorCode];
