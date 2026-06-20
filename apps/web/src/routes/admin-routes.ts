/**
 * Admin routes — dashboard stats, skill management, user management.
 *
 * All routes require authentication + admin role. Mounted under `protectedApi`
 * at `/admin` (inheriting global `authMiddleware`).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { getServerDatabase } from '../database.js';
import { SkillDB } from '@prompthub/db';
import { error, ErrorCode, success } from '../utils/response.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAdmin(c: Context) {
  const actor = getAuthUser(c);
  if (actor.role !== 'admin') {
    return null;
  }
  return actor;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const adminRoutes = new Hono();

/**
 * GET /stats — dashboard statistics.
 */
adminRoutes.get('/stats', (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const db = getServerDatabase();
  const skillDb = new SkillDB(db);

  const totalSkills = (db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number }).count;
  const publicSkills = (db.prepare("SELECT COUNT(*) as count FROM skills WHERE visibility = 'shared'").get() as { count: number }).count;
  const pendingSkills = (db.prepare("SELECT COUNT(*) as count FROM skills WHERE approval_status = 'pending'").get() as { count: number }).count;
  const approvedSkills = (db.prepare("SELECT COUNT(*) as count FROM skills WHERE approval_status = 'approved'").get() as { count: number }).count;
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const adminUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;

  return success(c, {
    totalSkills,
    publicSkills,
    pendingSkills,
    approvedSkills,
    totalUsers,
    adminUsers,
  });
});

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/**
 * GET /users — list all users (paginated).
 */
adminRoutes.get('/users', (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const db = getServerDatabase();
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
  const offset = (page - 1) * pageSize;

  const total = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const rows = db.prepare(
    'SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).all(pageSize, offset) as Array<{
    id: string;
    username: string;
    role: 'admin' | 'user';
    created_at: number;
    updated_at: number;
  }>;

  return success(c, {
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * PUT /users/:id/role — change a user's role.
 * Body: { role: 'admin' | 'user' }
 * Safety: cannot demote yourself if you are the last admin.
 */
adminRoutes.put('/users/:id/role', async (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as { role?: string } | null;
  const newRole = body?.role;

  if (newRole !== 'admin' && newRole !== 'user') {
    return error(c, 400, ErrorCode.VALIDATION_ERROR, 'Role must be "admin" or "user"');
  }

  const db = getServerDatabase();

  // Safety: prevent demoting yourself if last admin
  if (targetId === admin.userId && newRole === 'user') {
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
    if (adminCount <= 1) {
      return error(c, 400, ErrorCode.VALIDATION_ERROR, 'Cannot demote the last admin');
    }
  }

  const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as { id: string; role: string } | undefined;
  if (!existing) {
    return error(c, 404, ErrorCode.NOT_FOUND, 'User not found');
  }

  if (existing.role === newRole) {
    return success(c, { id: targetId, role: newRole, unchanged: true });
  }

  const now = Date.now();
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(newRole, now, targetId);

  return success(c, { id: targetId, role: newRole });
});

/**
 * DELETE /users/:id — delete a user.
 * Safety: cannot delete yourself.
 */
adminRoutes.delete('/users/:id', (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const targetId = c.req.param('id');

  if (targetId === admin.userId) {
    return error(c, 400, ErrorCode.VALIDATION_ERROR, 'Cannot delete yourself');
  }

  const db = getServerDatabase();
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!existing) {
    return error(c, 404, ErrorCode.NOT_FOUND, 'User not found');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  return success(c, { deleted: true });
});

// ---------------------------------------------------------------------------
// Skill management (admin)
// ---------------------------------------------------------------------------

/**
 * GET /skills — list all skills with optional filters.
 * Query params: visibility, approvalStatus, page, pageSize, q (search)
 */
adminRoutes.get('/skills', (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const db = getServerDatabase();
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
  const offset = (page - 1) * pageSize;
  const visibility = c.req.query('visibility') as string | null;
  const approvalStatus = c.req.query('approvalStatus') as string | null;
  const q = c.req.query('q') as string | null;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (visibility && ['private', 'shared'].includes(visibility)) {
    conditions.push('s.visibility = ?');
    params.push(visibility);
  }
  if (approvalStatus && ['pending', 'approved', 'rejected'].includes(approvalStatus)) {
    conditions.push('s.approval_status = ?');
    params.push(approvalStatus);
  }
  if (q && q.trim()) {
    conditions.push('(s.name LIKE ? OR s.description LIKE ?)');
    const pattern = `%${q.trim()}%`;
    params.push(pattern, pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM skills s ${where}`).get(...params) as { count: number }).count;

  const rows = db.prepare(`
    SELECT s.id, s.name, s.description, s.version, s.author, s.visibility,
           s.approval_status, s.tags, s.created_at, s.updated_at, s.owner_user_id,
           s.registry_slug,
           u.username as owner_username
    FROM skills s
    LEFT JOIN users u ON s.owner_user_id = u.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as Array<{
    id: string;
    name: string;
    description: string | null;
    version: string | null;
    author: string | null;
    visibility: 'private' | 'shared';
    approval_status: 'pending' | 'approved' | 'rejected' | null;
    tags: string | null;
    created_at: number;
    updated_at: number;
    owner_user_id: string | null;
    owner_username: string | null;
    registry_slug: string | null;
  }>;

  return success(c, {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      version: r.version ?? '1.0.0',
      author: r.author ?? '',
      visibility: r.visibility,
      approvalStatus: r.approval_status ?? null,
      tags: r.tags ? JSON.parse(r.tags) : [],
      ownerUserId: r.owner_user_id,
      ownerUsername: r.owner_username,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      registrySlug: r.registry_slug ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * PUT /skills/:id — update skill fields (visibility, approval_status).
 * Body: { visibility?, approvalStatus? }
 */
adminRoutes.put('/skills/:id', async (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const skillId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as {
    visibility?: string;
    approvalStatus?: string;
  } | null;

  if (!body) {
    return error(c, 400, ErrorCode.VALIDATION_ERROR, 'Request body required');
  }

  const db = getServerDatabase();
  const existing = db.prepare('SELECT id FROM skills WHERE id = ?').get(skillId) as { id: string } | undefined;
  if (!existing) {
    return error(c, 404, ErrorCode.NOT_FOUND, 'Skill not found');
  }

  const updates: string[] = [];
  const updateParams: unknown[] = [];

  if (body.visibility !== undefined) {
    if (!['private', 'shared'].includes(body.visibility)) {
      return error(c, 400, ErrorCode.VALIDATION_ERROR, 'visibility must be "private" or "shared"');
    }
    updates.push('visibility = ?');
    updateParams.push(body.visibility);
  }

  if (body.approvalStatus !== undefined) {
    if (!['pending', 'approved', 'rejected', null].includes(body.approvalStatus as string | null)) {
      return error(c, 400, ErrorCode.VALIDATION_ERROR, 'approvalStatus must be "pending", "approved", "rejected", or null');
    }
    updates.push('approval_status = ?');
    updateParams.push(body.approvalStatus ?? null);
  }

  if (updates.length === 0) {
    return error(c, 400, ErrorCode.VALIDATION_ERROR, 'No valid fields to update');
  }

  updates.push('updated_at = ?');
  updateParams.push(Date.now());
  updateParams.push(skillId);

  db.prepare(`UPDATE skills SET ${updates.join(', ')} WHERE id = ?`).run(...updateParams);

  return success(c, { id: skillId, updated: true });
});

/**
 * DELETE /skills/:id — delete a skill and its versions.
 */
adminRoutes.delete('/skills/:id', (c) => {
  const admin = requireAdmin(c);
  if (!admin) {
    return error(c, 403, ErrorCode.FORBIDDEN, 'Admin access required');
  }

  const skillId = c.req.param('id');
  const db = getServerDatabase();

  const existing = db.prepare('SELECT id FROM skills WHERE id = ?').get(skillId) as { id: string } | undefined;
  if (!existing) {
    return error(c, 404, ErrorCode.NOT_FOUND, 'Skill not found');
  }

  // Delete versions first (FK constraint), then the skill
  db.prepare('DELETE FROM skill_versions WHERE skill_id = ?').run(skillId);
  db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);

  return success(c, { deleted: true });
});

export default adminRoutes;
