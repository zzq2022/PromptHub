import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { username: 'admin' },
    registrationAllowed: false,
    isInitialized: true,
    logout: vi.fn(),
  },
}));

vi.mock('@desktop-toast-provider', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@desktop-renderer-app', () => ({
  default: () => (
    <div>
      desktop app web flag: {String(Reflect.get(window, '__PROMPTHUB_WEB__'))}
    </div>
  ),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { DesktopWorkspacePage } from './DesktopWorkspace';

describe('DesktopWorkspacePage', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB__');
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB_CONTEXT__');
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB_LOGOUT__');
    Reflect.deleteProperty(window, 'api');
    Reflect.deleteProperty(window, 'electron');
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('installs the web bridge before the desktop renderer first renders', () => {
    render(<DesktopWorkspacePage />);

    expect(screen.getByText('desktop app web flag: true')).toBeTruthy();
    expect(Reflect.get(window, 'api')).toBeTruthy();
    expect(Reflect.get(window, 'electron')).toBeTruthy();
  });
});
