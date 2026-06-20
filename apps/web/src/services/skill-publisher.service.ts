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
 * SkillHub-specific publishing path that submits an owner's `private` skill
 * for admin review. The skill is NOT immediately made public — instead its
 * `approval_status` is set to `'pending'`. An admin must approve it via
 * {@link SkillAdminService.approve} before visibility flips to `'shared'`.
 *
 * Authorization is decided by the pure core policy `canPublish(actor, owner)`.
 * Visibility is NOT changed during submit — only `approval_status` is set.
 */

/** Submit request accepted, awaiting admin review. */
export interface SkillPendingApprovalResult {
  pendingApproval: true;
}

/**
 * Idempotent: the skill is already `shared` (previously approved or
 * published before the approval gate was introduced).
 */
export interface SkillAlreadyPublicResult {
  alreadyPublic: true;
}

/** The skill already has a pending review — no duplicate submission. */
export interface SkillAlreadyPendingResult {
  alreadyPending: true;
}

/** Result of {@link SkillPublisher.submitForApproval}. */
export type PublishResult =
  | SkillPendingApprovalResult
  | SkillAlreadyPublicResult
  | SkillAlreadyPendingResult;

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
   * Submit a private skill for admin review before going public.
   *
   * Flow:
   * 1. Require an authenticated actor → UNAUTHORIZED.
   * 2. getOwnership(id) is null → NOT_FOUND.
   * 3. canPublish(actor, owner) false → FORBIDDEN.
   * 4. Already `shared` → alreadyPublic (idempotent, no write).
   * 5. approval_status already 'pending' → alreadyPending (idempotent).
   * 6. Owner + currently private → setApprovalStatus(id, 'pending').
   */
  submitForApproval(actor: Actor | null, id: string): PublishResult {
    if (actor === null || !actor.userId) {
      throw new SkillPublisherError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authentication is required to submit a skill for review',
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
        'Only the skill owner can submit this skill for review',
      );
    }

    if (normalizeVisibility(row.visibility) === 'shared') {
      return { alreadyPublic: true };
    }

    // Check if already pending
    const ownership = this.skillDb.getOwnership(id);
    if (ownership) {
      // Check approval_status via direct query since getOwnership doesn't return it
      const db = getServerDatabase();
      const row = db.get('SELECT approval_status FROM skills WHERE id = ?', id) as { approval_status: string | null } | undefined;
      if (row?.approval_status === 'pending') {
        return { alreadyPending: true };
      }
    }

    let updated: boolean;
    try {
      updated = this.skillDb.setApprovalStatus(id, 'pending');
    } catch (cause) {
      throw new SkillPublisherError(
        500,
        ErrorCode.INTERNAL_ERROR,
        `Failed to submit skill for review: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!updated) {
      throw new SkillPublisherError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    return { pendingApproval: true };
  }
}
