/**
 * SkillHub client API layer (Task 18.1).
 *
 * Wraps the SkillHub server routes into typed async functions for the React UI.
 * Public endpoints use plain `fetch`; authenticated endpoints use
 * `fetchWithAuthRetry` for automatic token refresh on 401.
 */

import type {
  PaginatedResult,
  SkillDetail,
  SkillPrivateSummary,
  SkillPublicSummary,
} from '@prompthub/shared';
import type { SkillApprovalStatus } from '@prompthub/shared/types/skill';
import { fetchWithAuthRetry } from './auth-session';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface PublishResult {
  published?: true;
  alreadyPublic?: boolean;
  alreadyPending?: boolean;
  pendingApproval?: boolean;
  skill?: SkillPublicSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function extractErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function getAuthHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Public endpoints (no auth required)
// ---------------------------------------------------------------------------

/**
 * Browse public shared skills, paginated.
 */
export async function fetchPublicSkills(
  page = 1,
): Promise<PaginatedResult<SkillPublicSummary>> {
  const response = await fetch(`/api/skillhub/public?page=${page}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to load skills'));
  }
  const envelope = (await response.json()) as ApiEnvelope<PaginatedResult<SkillPublicSummary>>;
  return envelope.data;
}

/**
 * Search public shared skills by name/description substring.
 */
export async function searchPublicSkills(
  query: string,
  page = 1,
): Promise<PaginatedResult<SkillPublicSummary>> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const response = await fetch(`/api/skillhub/public/search?${params}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Search failed'));
  }
  const envelope = (await response.json()) as ApiEnvelope<PaginatedResult<SkillPublicSummary>>;
  return envelope.data;
}

/**
 * Get public skill detail (name, description, SKILL.md content).
 */
export async function fetchPublicSkillDetail(
  id: string,
): Promise<SkillDetail> {
  const response = await fetch(`/api/skillhub/public/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Skill not found'));
  }
  const envelope = (await response.json()) as ApiEnvelope<SkillDetail>;
  return envelope.data;
}

/**
 * Download a skill as a ZIP archive.
 *
 * When a token is provided, it is sent via Authorization header so the server
 * can identify the owner for private skill downloads.
 */
export async function downloadSkill(
  id: string,
  token?: string | null,
): Promise<{ blob: Blob; fileName: string }> {
  const headers: HeadersInit = token ? getAuthHeaders(token) : {};
  const response = await fetch(
    `/api/skillhub/${encodeURIComponent(id)}/download`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Download failed'));
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const fileName = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : 'skill.zip';

  const blob = await response.blob();
  return { blob, fileName };
}

// ---------------------------------------------------------------------------
// Private endpoints (auth required)
// ---------------------------------------------------------------------------

/**
 * List the authenticated user's own private skills.
 */
export async function fetchPrivateSkills(
  token: string,
): Promise<SkillPrivateSummary[]> {
  const response = await fetchWithAuthRetry('/api/skillhub/private', {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to load private skills'));
  }
  const envelope = (await response.json()) as ApiEnvelope<SkillPrivateSummary[]>;
  return envelope.data;
}

/**
 * Submit a private skill for admin review.
 */
export async function publishSkill(
  token: string,
  id: string,
): Promise<PublishResult> {
  const response = await fetchWithAuthRetry(
    `/api/skillhub/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    },
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Submit for review failed'));
  }
  const envelope = (await response.json()) as ApiEnvelope<PublishResult>;
  return envelope.data;
}

// ---------------------------------------------------------------------------
// Admin endpoints (auth required + admin role)
// ---------------------------------------------------------------------------

export interface PendingSkillSummary {
  id: string;
  name: string;
  description: string;
  ownerUserId: string | null;
}

export interface PendingReviewResult {
  items: PendingSkillSummary[];
  total: number;
  page: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
}

export interface AdminReviewResult {
  id: string;
  name: string;
  approvalStatus: SkillApprovalStatus;
  visibility: string;
}

/**
 * List skills pending admin review (admin only).
 */
export async function fetchPendingSkills(
  token: string,
  page = 1,
): Promise<PendingReviewResult> {
  const response = await fetchWithAuthRetry(
    `/api/skillhub/admin/pending?page=${page}`,
    { headers: getAuthHeaders(token) },
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to load pending skills'));
  }
  const envelope = (await response.json()) as ApiEnvelope<PendingReviewResult>;
  return envelope.data;
}

/**
 * Approve a pending skill (admin only).
 */
export async function approveSkill(
  token: string,
  id: string,
): Promise<AdminReviewResult> {
  const response = await fetchWithAuthRetry(
    `/api/skillhub/admin/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    },
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Approve failed'));
  }
  const envelope = (await response.json()) as ApiEnvelope<AdminReviewResult>;
  return envelope.data;
}

/**
 * Reject a pending skill (admin only).
 */
export async function rejectSkill(
  token: string,
  id: string,
): Promise<AdminReviewResult> {
  const response = await fetchWithAuthRetry(
    `/api/skillhub/admin/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    },
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Reject failed'));
  }
  const envelope = (await response.json()) as ApiEnvelope<AdminReviewResult>;
  return envelope.data;
}
