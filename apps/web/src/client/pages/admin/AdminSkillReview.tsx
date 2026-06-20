import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminSkills,
  updateAdminSkill,
  type SkillSummary,
  type PaginatedSkills,
} from '../../api/admin';

export function AdminSkillReview() {
  const { t } = useTranslation();
  const [data, setData] = useState<PaginatedSkills | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminSkills(p, 10, { approvalStatus: 'pending' });
      setData(result);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const handleApprove = async (skillId: string) => {
    setStatusMsg(null);
    try {
      await updateAdminSkill(skillId, { visibility: 'shared', approvalStatus: 'approved' });
      setStatusMsg(t('admin.approveSuccess'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleReject = async (skillId: string) => {
    setStatusMsg(null);
    try {
      await updateAdminSkill(skillId, { approvalStatus: 'rejected' });
      setStatusMsg(t('admin.rejectSuccess'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">{t('admin.reviewTitle')}</h1>
      <p className="admin-page-subtitle">{t('admin.reviewSubtitle')}</p>

      {statusMsg && <div className="admin-status">{statusMsg}</div>}
      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">{t('admin.loading')}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">{t('admin.noPendingSkills')}</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.tableName')}</th>
                <th>{t('admin.tableAuthor')}</th>
                <th>{t('admin.tableDescription')}</th>
                <th>{t('admin.tableSubmittedAt')}</th>
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
                  <td>{skill.ownerUsername || skill.author || '—'}</td>
                  <td className="admin-table-desc">{skill.description || '—'}</td>
                  <td>{new Date(skill.createdAt).toLocaleString()}</td>
                  <td className="admin-table-actions">
                    <button
                      className="admin-btn admin-btn-approve"
                      onClick={() => handleApprove(skill.id)}
                    >
                      {t('admin.approve')}
                    </button>
                    <button
                      className="admin-btn admin-btn-reject"
                      onClick={() => handleReject(skill.id)}
                    >
                      {t('admin.reject')}
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
