/**
 * SkillHub API — Client-side functions for the SkillHub feature.
 */

import { fetchWithAuthRetry } from './auth-session';
import type {
  PaginatedResult,
  SkillDetail,
  SkillPublicSummary,
  SkillSortType,
  SkillStats,
} from '@prompthub/shared';

// Helper for HTTP requests
async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetchWithAuthRetry(url, options);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

/**
 * Fetch public (shared) skills with marketplace browsing.
 * Supports sort (trending, top, new, most_starred, featured) and category filtering.
 */
export async function fetchPublicSkills(
  page = 1,
  sort?: SkillSortType,
  category?: string,
): Promise<PaginatedResult<SkillPublicSummary>> {
  const params = new URLSearchParams({ page: String(page) });
  if (sort) params.set('sort', sort);
  if (category) params.set('category', category);
  return request<PaginatedResult<SkillPublicSummary>>(`/api/skillhub/public?${params}`);
}

/**
 * Search public skills by a query string with optional sort and category filtering.
 */
export async function searchPublicSkills(
  q: string,
  page = 1,
  sort?: SkillSortType,
  category?: string,
): Promise<PaginatedResult<SkillPublicSummary>> {
  const params = new URLSearchParams({ q, page: String(page) });
  if (sort) params.set('sort', sort);
  if (category) params.set('category', category);
  return request<PaginatedResult<SkillPublicSummary>>(`/api/skillhub/public/search?${params}`);
}

/**
 * Fetch aggregate marketplace stats (totalSkills, totalStars, totalDownloads).
 */
export async function fetchMarketplaceStats(): Promise<SkillStats> {
  return request<SkillStats>('/api/skillhub/public/stats');
}

/**
 * Fetch featured skills (top N by featured flag).
 */
export async function fetchFeaturedSkills(limit = 6): Promise<SkillPublicSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<SkillPublicSummary[]>(`/api/skillhub/public/featured?${params}`);
}

/**
 * Toggle star on a skill for the current authenticated user.
 * Returns { starred: true } if starred, { starred: false } if unstarred.
 * Throws if user is not authenticated.
 */
export async function toggleSkillStar(skillId: string): Promise<{ starred: boolean }> {
  return request<{ starred: boolean }>(`/api/skillhub/public/${skillId}/star`, {
    method: 'POST',
  });
}

/**
 * Report a view for a skill (fire-and-forget, no auth required).
 */
export async function reportSkillView(skillId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/skillhub/public/${skillId}/view`, {
    method: 'POST',
  });
}

/**
 * Get public skill details by id.
 */
export async function fetchPublicSkillDetail(id: string): Promise<SkillDetail> {
  return request<SkillDetail>(`/api/skillhub/public/${id}`);
}

/**
 * Submit a private skill for review/approval.
 */
export async function publishSkill(id: string): Promise<{ ok: boolean; message?: string }> {
  return request<{ ok: boolean; message?: string }>(`/api/skillhub/${id}/publish`, {
    method: 'POST',
  });
}

/**
 * Unpublish a shared skill (revert to private).
 */
export async function unpublishSkill(id: string): Promise<{ ok: boolean; message?: string }> {
  return request<{ ok: boolean; message?: string }>(`/api/skillhub/${id}/unpublish`, {
    method: 'POST',
  });
}

/**
 * Delete a private skill permanently.
 */
export async function deleteSkill(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/skillhub/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Fetch the authenticated user's own private skills.
 */
export async function fetchPrivateSkills(): Promise<import('@prompthub/shared').SkillPrivateSummary[]> {
  return request<import('@prompthub/shared').SkillPrivateSummary[]>('/api/skillhub/private');
}
