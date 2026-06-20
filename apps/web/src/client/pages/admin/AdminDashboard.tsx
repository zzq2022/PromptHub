import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminStats, type AdminStats } from '../../api/admin';

export function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="admin-loading">{t('admin.loading')}</div>;
  if (error) return <div className="admin-error">{error}</div>;
  if (!stats) return null;

  const cards = [
    { label: t('admin.totalSkills'), value: stats.totalSkills, className: 'admin-card' },
    { label: t('admin.publicSkills'), value: stats.publicSkills, className: 'admin-card' },
    { label: t('admin.pendingSkills'), value: stats.pendingSkills, className: stats.pendingSkills > 0 ? 'admin-card admin-card-attention' : 'admin-card' },
    { label: t('admin.approvedSkills'), value: stats.approvedSkills, className: 'admin-card' },
    { label: t('admin.totalUsers'), value: stats.totalUsers, className: 'admin-card' },
    { label: t('admin.adminUsers'), value: stats.adminUsers, className: 'admin-card' },
  ];

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">{t('admin.dashboard')}</h1>
      <div className="admin-stats-grid">
        {cards.map((card) => (
          <div key={card.label} className={card.className}>
            <div className="admin-card-value">{card.value}</div>
            <div className="admin-card-label">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
