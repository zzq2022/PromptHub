import { SkillDB } from '@prompthub/db';
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
  searchPublic(rawQuery: string, page: number): PaginatedResult<SkillPublicSummary> {
    const validated = this.runValidation(() => validateSearchInput(rawQuery));
    const query = normalizeSearchQuery(validated);
    if (query.isEmpty) {
      return this.browsePublic(page);
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
  getPublicDetail(id: string): SkillDetail {
    const validId = this.runValidation(() => validateSkillId(id));
    const row = this.skillDb.getOwnership(validId);
    if (!row) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    const visibility = normalizeVisibility(row.visibility);
    if (!canRead(null, row.owner_user_id, visibility)) {
      throw new SkillCatalogServiceError(404, SkillHubErrorCode.NOT_FOUND, 'Skill not found');
    }

    return this.toDetail(row, visibility);
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
   * Build a {@link SkillDetail} from an ownership row, reading the on-disk
   * `SKILL.md`. A missing/unreadable `SKILL.md` yields `skillMd = null` and
   * `skillMdAvailable = false` rather than failing the request (Req 1.8 / 5.8).
   */
  private toDetail(row: SkillCatalogRow, visibility: SkillVisibility): SkillDetail {
    const skillMd = readSkillMarkdownById(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      visibility,
      ownerUserId: row.owner_user_id,
      skillMd,
      skillMdAvailable: skillMd !== null,
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
