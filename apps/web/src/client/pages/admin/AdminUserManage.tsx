import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchUsers,
  updateUserRole,
  deleteUser,
  type UserSummary,
  type PaginatedUsers,
} from '../../api/admin';

export function AdminUserManage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUsers(p);
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

  const handleToggleRole = async (u: UserSummary) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    setStatusMsg(null);
    try {
      await updateUserRole(u.id, newRole);
      setStatusMsg(t('admin.roleUpdated'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    }
  };

  const handleDelete = async (u: UserSummary) => {
    if (u.id === currentUser?.id) {
      setError(t('admin.cannotDeleteSelf'));
      return;
    }
    if (!window.confirm(t('admin.confirmDeleteUser', { username: u.username }))) return;
    setStatusMsg(null);
    try {
      await deleteUser(u.id);
      setStatusMsg(t('admin.userDeleted'));
      void load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">{t('admin.usersTitle')}</h1>

      {statusMsg && <div className="admin-status">{statusMsg}</div>}
      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">{t('admin.loading')}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">{t('admin.noUsers')}</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.tableUsername')}</th>
                <th>{t('admin.tableRole')}</th>
                <th>{t('admin.tableCreatedAt')}</th>
                <th>{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="admin-table-name">
                    {u.username}
                    {u.id === currentUser?.id && (
                      <span className="admin-badge admin-badge-self"> {t('admin.badgeSelf')}</span>
                    )}
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${u.role}`}>
                      {u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}
                    </span>
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="admin-table-actions">
                    {u.id !== currentUser?.id && (
                      <>
                        <button
                          className="admin-btn admin-btn-secondary"
                          onClick={() => handleToggleRole(u)}
                        >
                          {u.role === 'admin' ? t('admin.actionDemote') : t('admin.actionPromote')}
                        </button>
                        <button
                          className="admin-btn admin-btn-delete"
                          onClick={() => handleDelete(u)}
                        >
                          {t('admin.actionDelete')}
                        </button>
                      </>
                    )}
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
