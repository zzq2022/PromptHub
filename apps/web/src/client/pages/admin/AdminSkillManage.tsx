import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminSkills,
  updateAdminSkill,
  deleteAdminSkill,
  type SkillSummary,
  type PaginatedSkills,
} from '../../api/admin';

export function AdminSkillManage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PaginatedSkills | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Filters
  const [filterVisibility, setFilterVisibility] = useState<string>('');
  const [filterApproval, setFilterApproval] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const filters: {
        visibility?: 'private' | 'shared';
        approvalStatus?: 'pending' | 'approved' | 'rejected';
        q?: string;
      } = {};
      if (filterVisibility) filters.visibility = filterVisibility as 'private' | 'shared';
      if (filterApproval) filters.approvalStatus = filterApproval as 'pending' | 'approved' | 'rejected';
      if (searchQuery) filters.q = searchQuery;
      const result = await fetchAdminSkills(p, 15, Object.keys(filters).length > 0 ? filters : undefined);
      setData(result);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.error'));
    } finally {
      setLoading(false);
    }
  }, [t, filterVisibility, filterApproval, searchQuery]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const handleVisibilityToggle = async (skill: SkillSummary) => {
    const newVis = skill.visibility === 'shared' ? 'private' : 'shared';
    setStatusMsg(null);
    try {
      await updateAdminSkill(skill.id, { visibility: newVis });
      setStatusMsg(t('admin.skillUpdated'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async (skill: SkillSummary) => {
    if (!window.confirm(t('admin.confirmDelete', { name: skill.name }))) return;
    setStatusMsg(null);
    try {
      await deleteAdminSkill(skill.id);
      setStatusMsg(t('admin.skillDeleted'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const approvalLabels: Record<string, string> = {
    pending: t('admin.statusPending'),
    approved: t('admin.statusApproved'),
    rejected: t('admin.statusRejected'),
  };

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">{t('admin.skillsTitle')}</h1>

      {statusMsg && <div className="admin-status">{statusMsg}</div>}
      {error && <div className="admin-error">{error}</div>}

      {/* Filters */}
      <div className="admin-filters">
        <form onSubmit={handleSearch} className="admin-search-form">
          <input
            className="admin-search-input"
            type="text"
            placeholder={t('skillhub.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="admin-btn">
            {t('skillhub.search')}
          </button>
        </form>
        <select
          className="admin-select"
          value={filterVisibility}
          onChange={(e) => { setFilterVisibility(e.target.value); setPage(1); }}
        >
          <option value="">{t('admin.filterAllVisibility')}</option>
          <option value="shared">{t('admin.filterPublic')}</option>
          <option value="private">{t('admin.filterPrivate')}</option>
        </select>
        <select
          className="admin-select"
          value={filterApproval}
          onChange={(e) => { setFilterApproval(e.target.value); setPage(1); }}
        >
          <option value="">{t('admin.filterAllApproval')}</option>
          <option value="pending">{t('admin.statusPending')}</option>
          <option value="approved">{t('admin.statusApproved')}</option>
          <option value="rejected">{t('admin.statusRejected')}</option>
        </select>
      </div>

      {loading ? (
        <div className="admin-loading">{t('admin.loading')}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">{t('admin.noSkills')}</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.tableName')}</th>
                <th>{t('admin.tableAuthor')}</th>
                <th>{t('admin.tableVersion')}</th>
                <th>{t('admin.tableVisibility')}</th>
                <th>{t('admin.tableApproval')}</th>
                <th>{t('admin.tableCreatedAt')}</th>
                <th>{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((skill) => (
                <tr key={skill.id}>
                  <td className="admin-table-name">
                    <div>{skill.name}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6, fontFamily: 'monospace' }}>
                      ID: {skill.id}{skill.registrySlug ? ` (${skill.registrySlug})` : ''}
                    </div>
                  </td>
                  <td>{skill.author || skill.ownerUsername || '—'}</td>
                  <td>{skill.version}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${skill.visibility}`}>
                      {skill.visibility === 'shared' ? t('admin.badgePublic') : t('admin.badgePrivate')}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${skill.approvalStatus ?? 'none'}`}>
                      {skill.approvalStatus ? approvalLabels[skill.approvalStatus] : '—'}
                    </span>
                  </td>
                  <td>{new Date(skill.createdAt).toLocaleDateString()}</td>
                  <td className="admin-table-actions">
                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={() => handleVisibilityToggle(skill)}
                    >
                      {skill.visibility === 'shared' ? t('admin.actionHide') : t('admin.actionShow')}
                    </button>
                    <button
                      className="admin-btn admin-btn-delete"
                      onClick={() => handleDelete(skill)}
                    >
                      {t('admin.actionDelete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="admin-pagination">
              <button
                className="admin-btn"
                disabled={page <= 1}
                onClick={() => void load(page - 1)}
              >
                {t('skillhub.prev')}
              </button>
              <span className="admin-page-info">
                {t('skillhub.page', { current: page, total: totalPages })}
              </span>
              <button
                className="admin-btn"
                disabled={page >= totalPages}
                onClick={() => void load(page + 1)}
              >
                {t('skillhub.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
