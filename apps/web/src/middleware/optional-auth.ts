import type { MiddlewareHandler } from 'hono';
import { AuthService } from '../services/auth.service.js';
import { getAccessTokenFromCookie } from '../utils/auth-cookies.js';

/**
 * Optional authentication middleware for SkillHub public endpoints.
 *
 * Unlike {@link auth}, this middleware never rejects the request:
 * - When a valid Bearer access token (or access cookie) is present, it verifies
 *   the token via {@link AuthService.verifyAccessToken} and injects `userId`/`role`
 *   into the request context, exactly like {@link auth} does.
 * - When the token is missing OR invalid/expired, it does NOT throw and continues
 *   as an anonymous request (the auth context stays unset).
 *
 * This allows endpoints such as the public skill download route to identify an
 * owner so they can download their own private skills, while still serving
 * anonymous visitors.
 */
export function optionalAuth(): MiddlewareHandler {
  const authService = new AuthService();

  return async (c, next) => {
    const header = c.req.header('Authorization');
    const tokenFromHeader = header?.startsWith('Bearer ')
      ? header.slice(7)
      : null;
    const token = tokenFromHeader ?? getAccessTokenFromCookie(c) ?? null;

    if (token) {
      try {
        const { userId, role } = await authService.verifyAccessToken(token);
        c.set('userId', userId);
        c.set('role', role);
      } catch {
        // Invalid or expired token: continue as anonymous, do not throw.
      }
    }

    await next();
  };
}
