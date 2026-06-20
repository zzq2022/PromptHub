import React from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Admin layout — left sidebar navigation + right content area.
 * Guards behind admin role; redirects non-admins to `/`.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    { to: '/admin', label: t('admin.navDashboard'), end: true },
    { to: '/admin/skills/review', label: t('admin.navReview') },
    { to: '/admin/skills', label: t('admin.navSkills') },
    { to: '/admin/users', label: t('admin.navUsers') },
  ];

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2 className="admin-sidebar-title">{t('admin.title')}</h2>
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav-item ${isActive ? 'admin-nav-item-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <NavLink to="/" className="admin-nav-item admin-back-link">
            {t('admin.backToApp')}
          </NavLink>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
