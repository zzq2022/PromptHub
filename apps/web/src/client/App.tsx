import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import SkillCatalogPage from './pages/SkillCatalog';
import { MySkillsPage } from './pages/MySkillsPage';
import { ConsoleLayout } from './layouts/ConsoleLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  AdminLayout,
  AdminDashboard,
  AdminSkillReview,
  AdminSkillManage,
  AdminUserManage,
} from './pages/admin';
 
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isBootstrapLoading, isInitialized } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (isLoading || isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (!isInitialized) {
    return <Navigate to="/setup" state={{ from: location }} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isInitialized, isBootstrapLoading } = useAuth();
  const { t } = useTranslation();

  if (isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (!isInitialized) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapLoading, isInitialized } = useAuth();
  const { t } = useTranslation();

  if (isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (isInitialized) {
    return <Navigate to={isAuthenticated ? '/console/skills' : '/login'} replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupRoute><SetupPage /></SetupRoute>} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/console"
            element={<ProtectedRoute><ConsoleLayout /></ProtectedRoute>}
          >
            <Route index element={<Navigate to="/console/skills" replace />} />
            <Route path="skills" element={<MySkillsPage />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="skills" element={<AdminSkillManage />} />
              <Route path="skills/review" element={<AdminSkillReview />} />
              <Route path="users" element={<AdminUserManage />} />
            </Route>
          </Route>
          <Route path="/" element={<PublicRoute><SkillCatalogPage /></PublicRoute>} />
          <Route path="/dashboard" element={<Navigate to="/console/skills" replace />} />
          <Route path="/workspace" element={<Navigate to="/console/skills" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
