import { SkillDB } from '@prompthub/db';
import type { SkillCatalogRow } from '@prompthub/db';
import type { SkillPublicSummary, SkillApprovalStatus } from '@prompthub/shared';
import { normalizeVisibility, toPublicSummary } from '@prompthub/core/skillhub';
import type { Actor } from '@prompthub/core/skillhub';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';

export class SkillAdminError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillAdminError';
  }
}

export interface SkillAdminReviewResult {
  id: string;
  name: string;
  approvalStatus: SkillApprovalStatus;
  visibility: string;
}

export class SkillAdminService {
  private readonly skillDb: SkillDB;

  constructor() {
    this.skillDb = new SkillDB(getServerDatabase());
  }

  /**
   * Admin reviews a pending skill — approve or reject.
   */
  review(actor: Actor | null, id: string, decision: 'approved' | 'rejected'): SkillAdminReviewResult {
    if (!actor?.userId || actor.role !== 'admin') {
      throw new SkillAdminError(403, ErrorCode.FORBIDDEN, 'Only admin can review skills');
    }

    const row = this.skillDb.getOwnership(id);
    if (!row) {
      throw new SkillAdminError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    const db = getServerDatabase();
    const skillRow = db.get('SELECT approval_status, visibility, registry_slug FROM skills WHERE id = ?', id) as {
      approval_status: string | null;
      visibility: string;
      registry_slug: string | null;
    } | undefined;

    if (!skillRow) {
      throw new SkillAdminError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    if (skillRow.approval_status !== 'pending') {
      throw new SkillAdminError(400, ErrorCode.VALIDATION_ERROR, 'Skill is not pending review');
    }

    if (decision === 'approved') {
      const targetSlug = skillRow.registry_slug;
      if (targetSlug) {
        const conflict = this.skillDb.getByRegistrySlug(targetSlug);
        if (conflict && conflict.id !== id) {
          throw new SkillAdminError(409, ErrorCode.VALIDATION_ERROR, '公开市场上已存在相同命名空间的技能，审批被拦截。');
        }
      }
    }

    // Apply the decision
    this.skillDb.setApprovalStatus(id, decision);

    // If approved, also set visibility to 'shared'
    if (decision === 'approved') {
      this.skillDb.setVisibility(id, 'shared');
    }

    const updatedRow = db.get('SELECT approval_status, visibility FROM skills WHERE id = ?', id) as {
      approval_status: string | null;
      visibility: string;
    } | undefined;

    return {
      id,
      name: row.name,
      approvalStatus: (updatedRow?.approval_status ?? decision) as SkillApprovalStatus,
      visibility: updatedRow?.visibility ?? skillRow.visibility,
    };
  }

  /**
   * List pending skills for admin review.
   */
  listPending(page: number = 1, pageSize: number = 20) {
    const safePage = Math.max(1, page);
    const total = this.skillDb.countPendingApproval();
    const offset = (safePage - 1) * pageSize;
    const rows = this.skillDb.listPendingApproval(pageSize, offset);

    return {
      items: rows.map((row: SkillCatalogRow) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        ownerUserId: row.owner_user_id,
      })),
      total,
      page: safePage,
      pageSize,
      startIndex: offset,
      endIndex: offset + rows.length - 1,
    };
  }
}
