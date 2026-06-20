import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';

export const ACCESS_COOKIE_NAME = 'prompthub_access';
export const REFRESH_COOKIE_NAME = 'prompthub_refresh';

function getCookieOptions(c: Context, maxAge: number) {
  const requestUrl = new URL(c.req.url);

  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: requestUrl.protocol === 'https:',
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
): void {
  setCookie(
    c,
    ACCESS_COOKIE_NAME,
    accessToken,
    getCookieOptions(c, config.jwt.accessTtl),
  );
  setCookie(
    c,
    REFRESH_COOKIE_NAME,
    refreshToken,
    getCookieOptions(c, config.jwt.refreshTtl),
  );
}

export function clearAuthCookies(c: Context): void {
  const requestUrl = new URL(c.req.url);
  const secure = requestUrl.protocol === 'https:';
  deleteCookie(c, ACCESS_COOKIE_NAME, { path: '/', secure, sameSite: 'Lax' });
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/', secure, sameSite: 'Lax' });
}

export function getAccessTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, ACCESS_COOKIE_NAME);
}

export function getRefreshTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE_NAME);
}
