import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { authState, stableT } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
    isLoading: false,
    isBootstrapLoading: false,
    isInitialized: true,
    registrationAllowed: true,
    refreshBootstrap: vi.fn(),
  },
  stableT: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: stableT,
  }),
}));

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => authState,
}));

vi.mock('./pages/Login', () => ({ LoginPage: () => <div>login page</div> }));
vi.mock('./pages/Setup', () => ({ SetupPage: () => <div>setup page</div> }));
vi.mock('./pages/SkillCatalog', () => ({ default: () => <div>skill catalog page</div> }));
vi.mock('./pages/MySkillsPage', () => ({
  MySkillsPage: () => <div>desktop workspace</div>,
}));

import { App } from './App';

describe('client App routing', () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.isBootstrapLoading = false;
    authState.isInitialized = true;
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  it('allows unauthenticated users to browse the public catalog', async () => {
    authState.isAuthenticated = false;
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    render(<App />);

    expect(await screen.findByText('skill catalog page')).toBeTruthy();
  });

  it('redirects unauthenticated users accessing workspace to the login page', async () => {
    authState.isAuthenticated = false;
    window.history.pushState({}, '', '/console/skills');
    window.dispatchEvent(new PopStateEvent('popstate'));

    render(<App />);

    expect(await screen.findByText('login page')).toBeTruthy();
  });

  it('redirects uninitialized installs to the setup page', async () => {
    authState.isAuthenticated = false;
    authState.isInitialized = false;
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    render(<App />);

    expect(await screen.findByText('setup page')).toBeTruthy();
  });

  it('shows a loading screen while auth state is loading', () => {
    authState.isLoading = true;
    window.history.pushState({}, '', '/console/skills');
    window.dispatchEvent(new PopStateEvent('popstate'));

    render(<App />);

    expect(screen.getByText('dashboard.loading')).toBeTruthy();
  });

  it('renders the desktop workspace for authenticated users on console/skills route', async () => {
    window.history.pushState({}, '', '/console/skills');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<App />);

    expect(await screen.findByText('desktop workspace')).toBeTruthy();
  });

  it('redirects legacy /dashboard to /console/skills', async () => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<App />);

    expect(await screen.findByText('desktop workspace')).toBeTruthy();
  });

  it('redirects legacy /workspace to /console/skills', async () => {
    window.history.pushState({}, '', '/workspace');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<App />);

    expect(await screen.findByText('desktop workspace')).toBeTruthy();
  });
});
