import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import DesktopApp from '@desktop-renderer-app';
import { ToastProvider } from '@desktop-toast-provider';
import { installDesktopBridge } from '../desktop/install-bridge';
import { useAuth } from '../contexts/AuthContext';

function getOrCreateBrowserDeviceId(): string {
  const storageKey = 'prompthub-web-device-id';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}

function detectClientBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return 'Google Chrome';
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return 'Safari';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  return 'Browser';
}

function detectClientPlatform(userAgent: string): string {
  if (/mac os x/i.test(userAgent)) return 'macOS';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/(iphone|ipad|ios)/i.test(userAgent)) return 'iOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown OS';
}

export function DesktopWorkspacePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, registrationAllowed, isInitialized, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  installDesktopBridge();

  useEffect(() => {
    const heartbeat = async () => {
      if (!user?.username) {
        return;
      }

      const userAgent = navigator.userAgent;
      await fetch('/api/devices/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: getOrCreateBrowserDeviceId(),
          type: 'browser',
          name: detectClientBrowser(userAgent),
          platform: detectClientPlatform(userAgent),
          clientVersion: 'self-hosted-web',
          userAgent,
        }),
      });
    };

    void heartbeat().catch((error) => {
      console.warn('Failed to register browser device heartbeat:', error);
    });
  }, [user?.username]);

  useEffect(() => {
    Reflect.set(window, '__PROMPTHUB_WEB_CONTEXT__', {
      mode: 'self-hosted',
      origin: window.location.origin,
      username: user?.username,
      registrationAllowed,
      initialized: isInitialized,
    });

    Reflect.set(window, '__PROMPTHUB_WEB_LOGOUT__', async () => {
      await logout();
      window.location.assign('/login');
    });

    window.dispatchEvent(new CustomEvent('prompthub:web-context-changed'));
  }, [isInitialized, logout, registrationAllowed, user?.username]);

  return (
    <ToastProvider>
      <div className="workspace-web-wrapper">
        <nav className="workspace-topbar">
          <span className="workspace-topbar-brand">PromptHub</span>
          <div className="workspace-topbar-right">
            <a href="/skillhub" className="workspace-topbar-link">
              {t('workspace.skillHub', 'SkillHub')}
            </a>
            {isAdmin && (
              <button
                className="workspace-topbar-link workspace-topbar-admin"
                onClick={() => navigate('/admin')}
              >
                {t('workspace.adminPanel', 'Admin Panel')}
              </button>
            )}
            <span className="workspace-topbar-user">{user?.username ?? ''}</span>
            <button
              className="workspace-topbar-link"
              onClick={() => { void logout(); window.location.assign('/login'); }}
            >
              {t('common.logout', 'Logout')}
            </button>
          </div>
        </nav>
        <div className="workspace-app-container">
          <DesktopApp />
        </div>
      </div>
    </ToastProvider>
  );
}
