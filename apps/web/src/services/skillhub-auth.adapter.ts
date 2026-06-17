import { z } from 'zod';
import type { Database } from '@prompthub/db';
import { getServerDatabase } from '../database.js';
import { AuthService, AuthServiceError } from './auth.service.js';
import { ErrorCode } from '../utils/response.js';

/**
 * SkillHub authentication validation/idle adapter (Conflict B — confirmed).
 *
 * This adapter is the SkillHub-specific entry for credential validation and
 * session idle expiry. It is intentionally separate from the global auth route
 * schema in `routes/auth.ts` so that:
 *
 * - SkillHub registration/validation enforces username ≤ 254 and password ≤ 128
 *   characters (Requirement 4.9), WITHOUT modifying the existing global zod
 *   schema (username 3–50 / password 8–512) used by the login path. The login
 *   bounds are intentionally left unchanged to avoid locking out existing users
 *   whose stored passwords may exceed 128 characters.
 * - A 30-minute sliding idle timeout (Requirement 4.8) is layered on top of the
 *   existing JWT flow (15-min access / 7-day refresh) incrementally, by tracking
 *   `refresh_tokens.last_active_at` and updating it on each authenticated
 *   verification. The underlying access/refresh TTLs are not changed.
 */

/** Maximum accepted username length at the SkillHub entry (Requirement 4.9). */
export const SKILLHUB_USERNAME_MAX = 254;
/** Maximum accepted password length at the SkillHub entry (Requirement 4.9). */
export const SKILLHUB_PASSWORD_MAX = 128;
/** Sliding idle window: a session with no authenticated request for this long
 *  is treated as invalid on the next request (Requirement 4.8). */
export const SKILLHUB_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * SkillHub username validation: trims surrounding whitespace, requires a
 * non-empty value, and rejects anything longer than {@link SKILLHUB_USERNAME_MAX}.
 */
export const skillHubUsernameSchema = z
  .string()
  .trim()
  .min(1, 'username is required')
  .max(SKILLHUB_USERNAME_MAX, `username must be at most ${SKILLHUB_USERNAME_MAX} characters`);

/**
 * SkillHub password validation: requires a non-empty value and rejects anything
 * longer than {@link SKILLHUB_PASSWORD_MAX}.
 */
export const skillHubPasswordSchema = z
  .string()
  .min(1, 'password is required')
  .max(SKILLHUB_PASSWORD_MAX, `password must be at most ${SKILLHUB_PASSWORD_MAX} characters`);

export const skillHubCredentialsSchema = z.object({
  username: skillHubUsernameSchema,
  password: skillHubPasswordSchema,
});

export interface SkillHubCredentials {
  username: string;
  password: string;
}

interface SessionActivityRow {
  last_active: number | null;
}

/**
 * Pure policy helper: returns true when a session whose most recent activity was
 * at `lastActiveAt` should be considered idle-expired at `now`.
 *
 * Kept side-effect free so it can be unit/property tested independently.
 */
export function isSessionIdleExpired(
  lastActiveAt: number,
  now: number,
  idleTimeoutMs: number = SKILLHUB_IDLE_TIMEOUT_MS,
): boolean {
  return now - lastActiveAt > idleTimeoutMs;
}

export interface SkillHubAuthAdapterDeps {
  database?: Database;
  authService?: AuthService;
}

export class SkillHubAuthAdapter {
  private readonly db: Database;
  private readonly authService: AuthService;

  constructor(deps: SkillHubAuthAdapterDeps = {}) {
    this.db = deps.database ?? getServerDatabase();
    this.authService = deps.authService ?? new AuthService(this.db);
  }

  /**
   * Validate SkillHub registration/validation credentials against the
   * SkillHub-specific bounds (username ≤ 254, password ≤ 128). Over-limit or
   * empty input is rejected with a validation error and NO session is created
   * (callers must only proceed to authentication on success).
   *
   * @throws {AuthServiceError} 422 VALIDATION_ERROR when the input is invalid.
   */
  validateCredentials(input: { username: unknown; password: unknown }): SkillHubCredentials {
    const parsed = skillHubCredentialsSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw new AuthServiceError(422, ErrorCode.VALIDATION_ERROR, message);
    }
    return parsed.data;
  }

  /**
   * Verify a SkillHub access token AND enforce the 30-minute sliding idle
   * timeout for the owning user's session(s).
   *
   * Behaviour:
   * - Verifies the access token via the existing {@link AuthService}.
   * - If the user's most-recently-active session has been idle longer than
   *   {@link SKILLHUB_IDLE_TIMEOUT_MS}, the idle session(s) are invalidated and
   *   the request is rejected (the next request is then unauthenticated).
   * - Otherwise the sliding window is advanced (last_active_at = now).
   *
   * Note: access tokens carry only the user id (no session id), so idle tracking
   * is performed at the user level over the user's active refresh-token sessions.
   * This is an incremental layer on top of the existing JWT flow and does not
   * change the access/refresh TTLs.
   *
   * @throws {AuthServiceError} 401 UNAUTHORIZED when the token is invalid or the
   *   session has expired due to inactivity.
   */
  async verifyActiveSession(
    accessToken: string,
    now: number = Date.now(),
  ): Promise<{ userId: string; role: 'admin' | 'user' }> {
    const result = await this.authService.verifyAccessToken(accessToken);
    this.enforceAndTouchIdle(result.userId, now);
    return result;
  }

  /**
   * Enforce the sliding idle timeout for a user and, when still active, advance
   * the activity window. Exposed so other authenticated entry points (e.g. the
   * refresh route) can record activity on verification (Requirement 4.8).
   *
   * @throws {AuthServiceError} 401 UNAUTHORIZED when the session is idle-expired.
   */
  enforceAndTouchIdle(userId: string, now: number = Date.now()): void {
    const lastActiveAt = this.getLatestActivity(userId, now);

    // No active (non-expired) session row to track. This can happen when the
    // user has logged out but still holds an access token within its short TTL.
    // There is nothing to slide or invalidate here.
    if (lastActiveAt === null) {
      return;
    }

    if (isSessionIdleExpired(lastActiveAt, now)) {
      // Invalidate the idle session(s) so subsequent access AND refresh attempts
      // are treated as unauthenticated.
      this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
      throw new AuthServiceError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Session expired due to inactivity',
      );
    }

    // Slide the window forward for the user's active sessions.
    this.db
      .prepare(
        'UPDATE refresh_tokens SET last_active_at = ? WHERE user_id = ? AND expires_at > ?',
      )
      .run(now, userId, now);
  }

  /**
   * Returns the most recent activity timestamp across the user's non-expired
   * sessions, or null when the user has no active session. Falls back to
   * `created_at` for any legacy rows where `last_active_at` is null.
   */
  private getLatestActivity(userId: string, now: number): number | null {
    const row = this.db
      .prepare(
        `SELECT MAX(COALESCE(last_active_at, created_at)) AS last_active
         FROM refresh_tokens
         WHERE user_id = ? AND expires_at > ?`,
      )
      .get(userId, now) as SessionActivityRow | undefined;

    const value = row?.last_active;
    return typeof value === 'number' ? value : null;
  }
}
