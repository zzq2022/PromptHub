import type { Database } from '@prompthub/db';
import { SkillDB } from '@prompthub/db';
import type { SkillPublicSummary } from '@prompthub/shared';
import { canPublish, normalizeVisibility, toPublicSummary } from '@prompthub/core/skillhub';
import type { Actor } from '@prompthub/core/skillhub';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';

/**
 * SkillHub skill publisher service (Skill_Publisher).
 *
 * SkillHub-specific publishing path that turns an owner's `private` skill into a
 * `shared` (public) one. It is intentionally INDEPENDENT of the existing
 * `skill.service.ts` admin-only contract (`assertCanCreate`/`assertCanWrite`):
 * that service keeps its admin-only create/modify/publish behaviour unchanged,
 * while SkillHub publishing uses the confirmed OWNER-BASED model (Conflict A).
 *
 * Authorization is decided by the pure core policy `canPublish(actor, owner)`
 * (`owner === actor.userId`), NOT by role. Reusing the core policy keeps the
 * durable rule in `packages/core` and the I/O/orchestration here.
 *
 * Visibility is the only field changed by publishing; `owner_user_id`, `id`,
 * `name`, `description`, SKILL.md content, and the on-disk directory tree are
 * left untouched (Requirement 6.5). The visibility write is performed inside a
 * single transaction by `SkillDB.setVisibility` (Requirements 6.6 / 6.8).
 */

/** Successful publish of a previously `private` skill (Requirement 6.1). */
export interface SkillPublishedResult {
  published: true;
  /** The now-public skill, mapped to its public summary shape. */
  skill: SkillPublicSummary;
}

/**
 * Idempotent publish of an already-`shared` skill: no database write occurs and
 * the stored visibility is left unchanged (Requirement 6.4).
 */
export interface SkillAlreadyPublicResult {
  alreadyPublic: true;
}

/** Result of {@link SkillPublisher.publish}. */
export type PublishResult = SkillPublishedResult | SkillAlreadyPublicResult;

/**
 * Typed error mapped to a unified HTTP response by the route layer (task 16).
 * Backend messages are in English (for logs); user-facing copy is rendered via
 * i18n on the client.
 */
export class SkillPublisherError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillPublisherError';
  }
}

export interface SkillPublisherDeps {
  database?: Database;
  skillDb?: SkillDB;
}

export class SkillPublisher {
  private readonly skillDb: SkillDB;

  constructor(deps: SkillPublisherDeps = {}) {
    const db = deps.database ?? getServerDatabase();
    this.skillDb = deps.skillDb ?? new SkillDB(db);
  }

  /**
   * Publish a skill owned by `actor`, making it publicly browsable/downloadable.
   *
   * Flow (Requirements 6.1, 6.3–6.8):
   * 1. Require an authenticated actor, else `UNAUTHORIZED` (also enforced at the
   *    route layer; guarded here as defence in depth).
   * 2. `getOwnership(id)` is null ⇒ `NOT_FOUND`, no data change (6.7).
   * 3. `canPublish(actor, owner)` false ⇒ `FORBIDDEN`, visibility unchanged (6.3).
   * 4. Already `shared` ⇒ `{ alreadyPublic: true }` WITHOUT a DB write (6.4).
   * 5. Owner + currently `private` ⇒ `setVisibility(id,'shared')` in a single
   *    transaction (6.1/6.6); a transaction failure rolls back and leaves the
   *    visibility as `private`, surfacing an error (6.8).
   */
  publish(actor: Actor | null, id: string): PublishResult {
    if (actor === null || !actor.userId) {
      throw new SkillPublisherError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authentication is required to publish a skill',
      );
    }

    const row = this.skillDb.getOwnership(id);
    if (row === null) {
      throw new SkillPublisherError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    if (!canPublish(actor, row.owner_user_id)) {
      throw new SkillPublisherError(
        403,
        ErrorCode.FORBIDDEN,
        'Only the skill owner can publish this skill',
      );
    }

    // Idempotent: already public ⇒ no write, visibility preserved (6.4).
    if (normalizeVisibility(row.visibility) === 'shared') {
      return { alreadyPublic: true };
    }

    let updated: boolean;
    try {
      // Single-transaction visibility write (6.6); on failure the transaction
      // rolls back and the stored visibility remains 'private' (6.8).
      updated = this.skillDb.setVisibility(id, 'shared');
    } catch (cause) {
      throw new SkillPublisherError(
        500,
        ErrorCode.INTERNAL_ERROR,
        `Failed to publish skill: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!updated) {
      // The row existed at read time but no row was updated (e.g. concurrent
      // delete). No visibility change was persisted.
      throw new SkillPublisherError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    const publishedRow = this.skillDb.getOwnership(id);
    if (publishedRow === null) {
      throw new SkillPublisherError(
        500,
        ErrorCode.INTERNAL_ERROR,
        'Skill not found after publishing',
      );
    }

    return { published: true, skill: toPublicSummary(publishedRow) };
  }
}
