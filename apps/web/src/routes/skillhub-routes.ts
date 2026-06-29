/**
 * SkillHub route module (Task 16).
 *
 * Exports two Hono routers:
 *
 * - **`skillhubPublicRoutes`** (default export) — mounted directly on `app` at
 *   `/api/skillhub` so anonymous visitors can browse/search/view/download public
 *   skills. The download endpoint uses `optionalAuth()` to identify owners so
 *   they can download their own private skills.
 *
 * - **`skillhubPrivateRoutes`** — mounted under `protectedApi` at `/skillhub`
 *   (inheriting the global `authMiddleware`). Provides the authenticated user's
 *   private skill list and the publish action.
 *
 * Error mapping: each service error type is caught and mapped to a uniform HTTP
 * response via `utils/response.ts`, matching the pattern in `routes/skills.ts`.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { optionalAuth } from '../middleware/optional-auth.js';
import { getAuthUser } from '../middleware/auth.js';
import { SkillCatalogService, SkillCatalogServiceError } from '../services/skill-catalog.service.js';
import { SkillDownloadService, SkillDownloadError } from '../services/skill-download.service.js';
import { SkillPublisher, SkillPublisherError } from '../services/skill-publisher.service.js';
import { error, success } from '../utils/response.js';
import type { Actor } from '@prompthub/core/skillhub';
import type { SkillSortType } from '@prompthub/shared';
import { SkillHubErrorCode } from '@prompthub/shared';

// ---------------------------------------------------------------------------
// Service singletons (stateless, safe to reuse across requests)
// ---------------------------------------------------------------------------

const catalogService = new SkillCatalogService();
const downloadService = new SkillDownloadService();
const publisher = new SkillPublisher();

// ---------------------------------------------------------------------------
// Public routes — mounted directly on `app` (no authMiddleware)
// ---------------------------------------------------------------------------

const skillhubPublicRoutes = new Hono();

/**
 * GET /public — browse public (shared) skills, paginated.
 * Requirements: 1.1, 2.1, 8.3
 */
skillhubPublicRoutes.get('/public', optionalAuth(), (c) => {
  const actor = extractOptionalActor(c);
  const page = Number(c.req.query('page') ?? '1');
  const sort = (c.req.query('sort') ?? 'trending') as SkillSortType;
  const category = c.req.query('category') ?? undefined;
  try {
    return success(c, catalogService.browseMarketplace(sort, category, page, actor?.userId));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * GET /public/search — search public skills by name/description substring.
 * Requirements: 1.1, 2.1, 8.3
 */
skillhubPublicRoutes.get('/public/search', optionalAuth(), (c) => {
  const actor = extractOptionalActor(c);
  const q = c.req.query('q') ?? '';
  const page = Number(c.req.query('page') ?? '1');
  const sort = (c.req.query('sort') ?? undefined) as SkillSortType | undefined;
  const category = c.req.query('category') ?? undefined;
  try {
    return success(c, catalogService.searchPublic(q, page, sort, category, actor?.userId));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * GET /public/stats — aggregate marketplace statistics.
 */
skillhubPublicRoutes.get('/public/stats', (c) => {
  try {
    return success(c, catalogService.getMarketplaceStats());
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * GET /public/featured — featured skills for the hero section.
 */
skillhubPublicRoutes.get('/public/featured', (c) => {
  const limit = Number(c.req.query('limit') ?? '6');
  try {
    return success(c, catalogService.getFeaturedSkills(limit));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * GET /public/:id — get public skill detail (name, description, SKILL.md).
 * Requirements: 1.6, 1.8
 */
skillhubPublicRoutes.get('/public/:id', optionalAuth(), (c) => {
  const actor = extractOptionalActor(c);
  try {
    return success(c, catalogService.getPublicDetail(c.req.param('id'), actor?.userId));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * GET /:id/download — download a skill as a ZIP archive.
 *
 * Uses `optionalAuth()`: when a valid token is present the actor is identified
 * so owners can download their own private skills. Anonymous visitors can only
 * download shared skills.
 * Requirements: 3.1, 3.5, 8.1
 */
skillhubPublicRoutes.get('/:id/download', optionalAuth(), (c) => {
  const actor = extractOptionalActor(c);
  try {
    const result = downloadService.download(actor, c.req.param('id'));
    catalogService.incrementDownload(c.req.param('id'));
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`);
    c.header('Content-Length', String(result.byteLength));
    return c.body(result.body as any);
  } catch (err) {
    return toDownloadErrorResponse(c, err);
  }
});

/**
 * POST /public/:id/star — toggle star on a skill (auth required).
 */
skillhubPublicRoutes.post('/public/:id/star', optionalAuth(), (c) => {
  const actor = extractOptionalActor(c);
  if (!actor) {
    return error(c, 401, SkillHubErrorCode.UNAUTHORIZED, 'Authentication required');
  }
  try {
    return success(c, catalogService.starSkill(actor, c.req.param('id')));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * POST /public/:id/view — increment view count (fire-and-forget, no auth required).
 */
skillhubPublicRoutes.post('/public/:id/view', (c) => {
  try {
    catalogService.incrementView(c.req.param('id'));
    return success(c, { ok: true });
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

// ---------------------------------------------------------------------------
// Private routes — mounted under `protectedApi` (authMiddleware)
// ---------------------------------------------------------------------------

export const skillhubPrivateRoutes = new Hono();

/**
 * GET /private — list the authenticated user's own private skills.
 * Requirements: 4.6, 5.1, 5.6
 */
skillhubPrivateRoutes.get('/private', (c) => {
  const actor = toActor(c);
  try {
    return success(c, catalogService.listPrivate(actor));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * POST /:id/publish — submit a private skill for admin review (owner-based authorization).
 */
skillhubPrivateRoutes.post('/:id/publish', (c) => {
  const actor = toActor(c);
  try {
    return success(c, publisher.submitForApproval(actor, c.req.param('id')));
  } catch (err) {
    return toPublisherErrorResponse(c, err);
  }
});

/**
 * POST /:id/unpublish — revert a shared skill to private (owner-based authorization).
 */
skillhubPrivateRoutes.post('/:id/unpublish', (c) => {
  const actor = toActor(c);
  try {
    return success(c, catalogService.unpublish(actor, c.req.param('id')));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

/**
 * DELETE /:id — permanently delete a private skill (owner-based authorization).
 */
skillhubPrivateRoutes.delete('/:id', (c) => {
  const actor = toActor(c);
  try {
    return success(c, catalogService.deleteSkill(actor, c.req.param('id')));
  } catch (err) {
    return toCatalogErrorResponse(c, err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract an optional actor from the request context (set by `optionalAuth`). */
function extractOptionalActor(c: Context): Actor | null {
  const userId = c.get('userId') as string | undefined;
  const role = c.get('role') as 'admin' | 'user' | undefined;
  if (!userId) {
    return null;
  }
  return { userId, role: role ?? 'user' };
}

/** Extract a required actor from the request context (set by `authMiddleware`). */
function toActor(c: Context): Actor {
  const { userId, role } = getAuthUser(c);
  return { userId, role };
}

/** Map `SkillCatalogServiceError` to a uniform HTTP error response. */
function toCatalogErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof SkillCatalogServiceError) {
    return error(c, err.status, err.code, err.message);
  }
  return error(c, 500, 'INTERNAL_ERROR', 'Internal server error');
}

/** Map `SkillDownloadError` to a uniform HTTP error response. */
function toDownloadErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof SkillDownloadError) {
    return error(c, err.status, err.code, err.message);
  }
  return error(c, 500, 'INTERNAL_ERROR', 'Internal server error');
}

/** Map `SkillPublisherError` to a uniform HTTP error response. */
function toPublisherErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof SkillPublisherError) {
    return error(c, err.status, err.code, err.message);
  }
  return error(c, 500, 'INTERNAL_ERROR', 'Internal server error');
}

export default skillhubPublicRoutes;
