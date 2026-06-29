import { SkillDB } from '@prompthub/db';
import type { SkillCatalogMarketplaceRow } from '@prompthub/db';
import type { Actor, SkillCatalogRow } from '@prompthub/core';
import {
  ValidationError,
  buildLikePattern,
  canRead,
  matchesQuery,
  normalizeSearchQuery,
  normalizeVisibility,
  paginate,
  toPrivateSummary,
  toPublicSummary,
  validateSearchInput,
  validateSkillId,
} from '@prompthub/core';
import type {
  PaginatedResult,
  SkillDetail,
  SkillPrivateSummary,
  SkillPublicSummary,
  SkillSortType,
  SkillStats,
  SkillVisibility,
} from '@prompthub/shared';
import { SKILLHUB, SkillHubErrorCode } from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { readSkillMarkdownById } from './skill-workspace.js';

/**
 * Typed error thrown by {@link SkillCatalogService}. Mirrors the repo's
 * service-error pattern (`status` + `code` + `message`) so routes can map it to
 * a uniform HTTP response via `utils/response.ts`. The `code` carries a
 * {@link SkillHubErrorCode} value. Messages are English (for logs); user-facing
 * copy is rendered by the client via i18n.
 */
export class SkillCatalogServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillCatalogServiceError';
  }
}

/**
 * Skill_Catalog_Service orchestration for the SkillHub feature (apps/web).
 *
 * This service composes pure core logic (validation / normalization / matching /
 * pagination / summary mapping + read policy) with `SkillDB` storage queries and
 * filesystem `SKILL.md` reads. It owns no business policy of its own: visibility
 * decisions come from `@prompthub/core` (`canRead`/`normalizeVisibility`) and all
 * SQL lives in `SkillDB`.
 *
 * Validation always runs before any database query (Property 16): `validateSkillId`
 * and `validateSearchInput` are invoked prior to the corresponding `SkillDB` call.
 */
export class SkillCatalogService {
  private readonly skillDb = new SkillDB(getServerDatabase());

  /**
   * Browse public (shared) skills, paginated and name-ascending.
   *
   * Uses database-level pagination: `countShared()` for the total and
   * `listShared(PAGE_SIZE, offset)` for the requested page slice, then maps each
   * row to a public summary (description truncated to 500 chars) and assembles
   * the pagination metadata (Requirements 1.1, 1.2, 1.5, 8.3, 8.4).
   */
  browsePublic(page: number): PaginatedResult<SkillPublicSummary> {
    const safePage = normalizePage(page);
    const total = this.skillDb.countShared();
    const offset = (safePage - 1) * SKILLHUB.PAGE_SIZE;
    const rows = this.skillDb.listShared(SKILLHUB.PAGE_SIZE, offset);
    const items = rows.map((row) => toPublicSummary(row));
    return buildPagedResult(items, total, safePage, offset);
  }

  /**
   * Browse public skills with marketplace sort, category filtering, and
   * engagement counters.
   *
   * Uses database-level pagination via {@link SkillDB.listMarketplace} and
   * {@link SkillDB.countMarketplace}, then maps each row to a rich public
   * summary with author info and engagement metrics.
   */
  browseMarketplace(
    sort: SkillSortType,
    category: string | undefined,
    page: number,
    userId?: string,
  ): PaginatedResult<SkillPublicSummary> {
    const safePage = normalizePage(page);
    const total = this.skillDb.countMarketplace(category);
    const offset = (safePage - 1) * SKILLHUB.PAGE_SIZE;
    const rows = this.skillDb.listMarketplace(
      sort,
      SKILLHUB.PAGE_SIZE,
      offset,
      category,
    );
    const items = rows.map((row) => toMarketplaceSummary(row, userId));
    return buildPagedResult(items, total, safePage, offset);
  }

  /**
   * Aggregate marketplace statistics: total public skills, total stars, and
   * total downloads across all public skills.
   */
  getMarketplaceStats(): SkillStats {
    const totalSkills = this.skillDb.countMarketplace();
    // Sum stars and downloads across all public skills via a single query.
    const db = getServerDatabase();
    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(star_count), 0)     AS totalStars,
           COALESCE(SUM(download_count), 0)  AS totalDownloads
         FROM skills
         WHERE visibility = 'shared'`,
      )
      .get() as { totalStars: number; totalDownloads: number } | undefined;
    return {
      totalSkills,
      totalStars: row?.totalStars ?? 0,
      totalDownloads: row?.totalDownloads ?? 0,
    };
  }

  /**
   * Toggle star on a skill for the given actor. Returns `{ starred: true }`
   * when starred, `{ starred: false }` when unstarred.
   *
   * Validates the skill id before any mutation (Property 16). Verifies the
   * skill exists and is public before allowing a star action.
   */
  starSkill(
    actor: Actor | null,
    skillId: string,
  ): { starred: boolean } {
    const authed = requireActor(actor);
    const validId = this.runValidation(() => validateSkillId(skillId));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(
        404,
        SkillHubErrorCode.NOT_FOUND,
        'Skill not found',
      );
    }
    const vis = normalizeVisibility(row.visibility);
    if (vis === 'private') {
      throw new SkillCatalogServiceError(
        404,
        SkillHubErrorCode.NOT_FOUND,
        'Skill not found',
      );
    }
    return this.skillDb.toggleStar(authed.userId, validId);
  }

  /**
   * Get featured skills for the hero/landing section.
   * Returns an array of public summaries for skills marked as featured,
   * ordered by trending score.
   */
  getFeaturedSkills(limit: number = 6): SkillPublicSummary[] {
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const rows = this.skillDb.listFeatured(safeLimit);
    return rows.map((row) => toMarketplaceSummary(row));
  }

  /**
   * Increment the view count for a skill (fire-and-forget).
   * Validates the skill id before any mutation (Property 16).
   */
  incrementView(skillId: string): void {
    const validId = this.runValidation(() => validateSkillId(skillId));
    this.skillDb.incrementViewCount(validId);
  }

  /**
   * Increment the download count for a skill.
   * Called after a successful download. Validates the skill id before any
   * mutation (Property 16).
   */
  incrementDownload(skillId: string): void {
    const validId = this.runValidation(() => validateSkillId(skillId));
    this.skillDb.incrementDownloadCount(validId);
  }

  /**
   * Search public (shared) skills by a case-insensitive substring of name or
   * description.
   *
   * Validates the raw input before any query (Property 16), normalizes the query
   * (trim → truncate to 200 → lowercase). An empty normalized query is equivalent
   * to {@link browsePublic}. Otherwise a parameterized `LIKE ... ESCAPE` pattern
   * is built (operators treated literally) and the database matches are re-checked
   * in memory via `matchesQuery` to keep case/literal semantics consistent before
   * paginating (Requirements 2.1, 2.2, 2.4, 2.6).
   */
  searchPublic(
    rawQuery: string,
    page: number,
    sort?: SkillSortType,
    category?: string,
    userId?: string,
  ): PaginatedResult<SkillPublicSummary> {
    const validated = this.runValidation(() => validateSearchInput(rawQuery));
    const query = normalizeSearchQuery(validated);
    if (query.isEmpty) {
      return this.browseMarketplace(sort ?? 'trending', category, page, userId);
    }

    const { pattern, escape } = buildLikePattern(query.term);
    const rows = this.skillDb.searchShared(pattern, escape);
    const items = rows
      .filter((row) => matchesQuery(row.name, row.description, query))
      .map((row) => toPublicSummary(row));

    return paginate(items, page, SKILLHUB.PAGE_SIZE);
  }

  /**
   * Get the public detail view for a skill.
   *
   * Validates the id before any query (Property 16). Anonymous callers may only
   * read `shared` skills; a `private` skill (or a missing id) is reported as
   * NOT_FOUND so private skills are not leaked (Requirements 1.6, 1.8, 8.1, 8.2).
   */
  getPublicDetail(id: string, userId?: string): SkillDetail {
    const validId = this.runValidation(() => validateSkillId(id));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    const visibility = normalizeVisibility(row.visibility);
    if (!canRead(null, row.owner_user_id, visibility)) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    return this.toDetail(row, visibility, userId);
  }

  /**
   * List the requesting user's own private skills.
   *
   * Requires an authenticated actor; a null actor is rejected with UNAUTHORIZED
   * and no skill data is returned (Requirements 4.6, 5.6, 8.5). Results are
   * exactly the actor's own `private` skills (Requirements 5.1, 5.2, 5.3, 7.5).
   */
  listPrivate(actor: Actor | null): SkillPrivateSummary[] {
    const authed = requireActor(actor);
    const rows = this.skillDb.listPrivateByOwner(authed.userId);
    return rows.map((row) => toPrivateSummary(row));
  }

  /**
   * Get the private detail view for a skill on behalf of an authenticated actor.
   *
   * Requires an authenticated actor (Property 11). Validates the id before any
   * query (Property 16). A non-owner requesting a `private` skill (or a missing
   * id) is reported as NOT_FOUND rather than FORBIDDEN, so the skill's existence
   * is not leaked (Requirements 5.4, 8.1, 8.2).
   */
  getPrivateDetail(actor: Actor | null, id: string): SkillDetail {
    const authed = requireActor(actor);
    const validId = this.runValidation(() => validateSkillId(id));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    const visibility = normalizeVisibility(row.visibility);
    if (!canRead(authed, row.owner_user_id, visibility)) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    return this.toDetail(row, visibility);
  }

  /**
   * Unpublish a shared skill — revert its visibility to private.
   * Only the skill owner may perform this action.
   * 取消发布已共享的技能——将可见性恢复为私有。仅技能所有者可执行此操作。
   */
  unpublish(actor: Actor | null, id: string): { ok: boolean } {
    const authed = requireActor(actor);
    const validId = this.runValidation(() => validateSkillId(id));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }
    if (row.owner_user_id !== authed.userId) {
      throw new SkillCatalogServiceError(403, SkillHubErrorCode.FORBIDDEN, 'Not the skill owner');
    }
    const ok = this.skillDb.setVisibility(validId, 'private');
    return { ok };
  }

  /**
   * Delete a private skill permanently. Shared skills cannot be deleted —
   * they must be unpublished first.
   * 永久删除一个私有技能。已共享的技能不能直接删除——需先取消发布。
   */
  deleteSkill(actor: Actor | null, id: string): { deleted: boolean } {
    const authed = requireActor(actor);
    const validId = this.runValidation(() => validateSkillId(id));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }
    if (row.owner_user_id !== authed.userId) {
      throw new SkillCatalogServiceError(403, SkillHubErrorCode.FORBIDDEN, 'Not the skill owner');
    }
    const visibility = normalizeVisibility(row.visibility);
    if (visibility === 'shared') {
      throw new SkillCatalogServiceError(
        409,
        SkillHubErrorCode.VALIDATION_ERROR,
        'Cannot delete a shared skill. Unpublish it first.',
      );
    }
    const deleted = this.skillDb.deleteSkill(validId);
    return { deleted };
  }

  /**
   * Map a wider marketplace row to the public summary contract.
   */
  private toMarketplaceSummary(row: SkillCatalogMarketplaceRow, userId?: string): SkillPublicSummary {
    const isStarred = userId ? this.skillDb.isStarred(userId, row.id) : undefined;
    return {
      id: row.id,
      name: row.name,
      description: (row.description ?? '').slice(0, 500),
      slug: row.slug ?? undefined,
      authorName: row.owner_display_name ?? undefined,
      authorAvatar: row.owner_avatar_url ?? undefined,
      category: row.category ?? undefined,
      iconEmoji: row.icon_emoji ?? undefined,
      iconUrl: row.icon_url ?? undefined,
      starCount: row.star_count ?? 0,
      downloadCount: row.download_count ?? 0,
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      isStarred,
    };
  }

  private toDetail(row: SkillCatalogRow, visibility: SkillVisibility, userId?: string): SkillDetail {
    const skillMd = readSkillMarkdownById(row.id);
    const starCount = row.star_count ?? 0;
    const downloadCount = row.download_count ?? 0;
    const viewCount = row.view_count ?? 0;
    const isStarred = userId ? this.skillDb.isStarred(userId, row.id) : false;
    const featured = row.featured === 1;

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      visibility,
      ownerUserId: row.owner_user_id,
      skillMd,
      skillMdAvailable: skillMd !== null,
      slug: row.registry_slug ?? undefined,
      approvalStatus: (row.approval_status as any) || undefined,
      starCount,
      downloadCount,
      viewCount,
      isStarred,
      featured,
    };
  }

  /**
   * Run a core validation function, converting its `ValidationError` into a
   * typed 422 service error. Unexpected errors are rethrown unchanged.
   */
  private runValidation<T>(validate: () => T): T {
    try {
      return validate();
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new SkillCatalogServiceError(
          422,
          SkillHubErrorCode.VALIDATION_ERROR,
          err.message,
        );
      }
      throw err;
    }
  }
}

/** Convert a marketplace row to a rich public summary with engagement counters. */
function toMarketplaceSummary(
  row: SkillCatalogMarketplaceRow,
  userId?: string,
): SkillPublicSummary {
  return {
    id: row.id,
    name: row.name,
    description: truncateDescription(row.description),
    slug: row.slug ?? undefined,
    authorName: row.owner_display_name ?? undefined,
    authorAvatar: row.owner_avatar_url ?? undefined,
    category: row.category ?? undefined,
    iconEmoji: row.icon_emoji ?? undefined,
    iconUrl: row.icon_url ?? undefined,
    starCount: row.star_count,
    downloadCount: row.download_count,
    updatedAt: row.updated_at ?? new Date(0).toISOString(),
    isStarred: userId ? undefined : undefined, // TODO: batch-star check
  };
}

/** Truncate description to a max length for summary display. */
function truncateDescription(desc: string | null, maxLen = 500): string {
  if (!desc) return '';
  return desc.length > maxLen ? desc.slice(0, maxLen) + '…' : desc;
}

/** Normalize a 1-based page number to a finite integer >= 1 (matches `paginate`). */
function normalizePage(page: number): number {
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

/**
 * Require an authenticated actor for a private operation. Throws UNAUTHORIZED
 * when the actor is null so no private data is exposed (Property 11).
 */
function requireActor(actor: Actor | null): Actor {
  if (actor === null) {
    throw new SkillCatalogServiceError(
      401,
      SkillHubErrorCode.UNAUTHORIZED,
      'Authentication required',
    );
  }
  return actor;
}

/**
 * Assemble a {@link PaginatedResult} from a pre-paged (database-sliced) item
 * list. Empty-page semantics match `paginate`: `startIndex = 0`, `endIndex = -1`.
 */
function buildPagedResult<T>(
  items: T[],
  total: number,
  page: number,
  offset: number,
): PaginatedResult<T> {
  const isEmptyPage = items.length === 0;
  return {
    items,
    total,
    page,
    pageSize: SKILLHUB.PAGE_SIZE,
    startIndex: isEmptyPage ? 0 : offset,
    endIndex: isEmptyPage ? -1 : offset + items.length - 1,
  };
}
