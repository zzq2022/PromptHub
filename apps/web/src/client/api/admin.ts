/**
 * Admin API — client-side functions for the admin dashboard.
 *
 * All endpoints require JWT authentication + admin role.
 */

import { fetchWithAuthRetry } from './auth-session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalSkills: number;
  publicSkills: number;
  pendingSkills: number;
  approvedSkills: number;
  totalUsers: number;
  adminUsers: number;
}

export interface UserSummary {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  items: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  visibility: 'private' | 'shared';
  approvalStatus: 'pending' | 'approved' | 'rejected' | null;
  tags: string[];
  ownerUserId: string | null;
  ownerUsername: string | null;
  createdAt: string;
  updatedAt: string;
  registrySlug?: string | null;
  category: string;
}

export interface PaginatedSkills {
  items: SkillSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithAuthRetry(`/api/admin${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithAuthRetry(`/api/admin${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(errBody?.error?.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetchWithAuthRetry(`/api/admin${path}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(errBody?.error?.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function fetchAdminStats(): Promise<AdminStats> {
  return apiGet<AdminStats>('/stats');
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function fetchUsers(page = 1, pageSize = 20): Promise<PaginatedUsers> {
  return apiGet<PaginatedUsers>(`/users?page=${page}&pageSize=${pageSize}`);
}

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'user',
): Promise<{ id: string; role: string }> {
  return apiPut<{ id: string; role: string }>(`/users/${userId}/role`, { role });
}

export async function deleteUser(userId: string): Promise<{ deleted: boolean }> {
  return apiDelete<{ deleted: boolean }>(`/users/${userId}`);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function fetchAdminSkills(
  page = 1,
  pageSize = 20,
  filters?: {
    visibility?: 'private' | 'shared';
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    q?: string;
  },
): Promise<PaginatedSkills> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters?.visibility) params.set('visibility', filters.visibility);
  if (filters?.approvalStatus) params.set('approvalStatus', filters.approvalStatus);
  if (filters?.q) params.set('q', filters.q);
  return apiGet<PaginatedSkills>(`/skills?${params}`);
}

export async function updateAdminSkill(
  skillId: string,
  updates: { visibility?: 'private' | 'shared'; approvalStatus?: 'pending' | 'approved' | 'rejected' | null; category?: string },
): Promise<{ id: string; updated: boolean }> {
  return apiPut<{ id: string; updated: boolean }>(`/skills/${skillId}`, updates);
}

export async function deleteAdminSkill(skillId: string): Promise<{ deleted: boolean }> {
  return apiDelete<{ deleted: boolean }>(`/skills/${skillId}`);
}
