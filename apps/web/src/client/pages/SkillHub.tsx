import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getStoredAccessToken } from '../api/auth-session';
import type { SkillPublicSummary, SkillPrivateSummary, SkillDetail, PaginatedResult } from '@prompthub/shared';
import {
  fetchPublicSkills,
  searchPublicSkills,
  fetchPublicSkillDetail,
  downloadSkill,
  fetchPrivateSkills,
  publishSkill,
} from '../api/skillhub';

type ViewMode = 'browse' | 'detail' | 'private' | 'privateDetail';

/**
 * SkillHub page — single-page component with internal tabs/sections.
 *
 * Publicly accessible (no ProtectedRoute wrapper). Authenticated users can
 * additionally view their private skills and publish them.
 */
export function SkillHubPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // -- Public browsing state --
  const [view, setView] = useState<ViewMode>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [publicResult, setPublicResult] = useState<PaginatedResult<SkillPublicSummary> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // -- Detail state --
  const [selectedDetail, setSelectedDetail] = useState<SkillDetail | null>(null);

  // -- Private state --
  const [privateSkills, setPrivateSkills] = useState<SkillPrivateSummary[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);

  // -------------------------------------------------------------------
  // Public browse/search
  // -------------------------------------------------------------------

  const loadPublicSkills = useCallback(async (page: number, query: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = query.trim()
        ? await searchPublicSkills(query, page)
        : await fetchPublicSkills(page);
      setPublicResult(result);
      setCurrentPage(page);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('skillhub.error'));
      // Keep previous data on error (Req 1.7)
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPublicSkills(1, '');
  }, [loadPublicSkills]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    void loadPublicSkills(1, searchInput);
  };

  const handlePageChange = (page: number) => {
    void loadPublicSkills(page, searchQuery);
  };

  // -------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------

  const openPublicDetail = async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const detail = await fetchPublicSkillDetail(id);
      setSelectedDetail(detail);
      setView('detail');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('skillhub.error'));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------
  // Download
  // -------------------------------------------------------------------

  const handleDownload = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      const { blob, fileName } = await downloadSkill(id, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed');
    }
  };

  // -------------------------------------------------------------------
  // Private skills
  // -------------------------------------------------------------------

  const loadPrivateSkills = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setPrivateLoading(true);
    try {
      const skills = await fetchPrivateSkills(token);
      setPrivateSkills(skills);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('skillhub.error'));
    } finally {
      setPrivateLoading(false);
    }
  }, [t]);

  const handlePublish = async (id: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setStatusMsg(null);
    try {
      const result = await publishSkill(token, id);
      if (result.alreadyPublic) {
        setStatusMsg(t('skillhub.alreadyPublic'));
      } else {
        setStatusMsg(t('skillhub.publishSuccess'));
      }
      // Refresh both lists
      await loadPrivateSkills();
      void loadPublicSkills(currentPage, searchQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  // -------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------

  const showBrowse = () => {
    setView('browse');
    setSelectedDetail(null);
    setStatusMsg(null);
  };

  const showPrivate = () => {
    setView('private');
    setSelectedDetail(null);
    setStatusMsg(null);
    void loadPrivateSkills();
  };

  const totalPages = publicResult
    ? Math.max(1, Math.ceil(publicResult.total / publicResult.pageSize))
    : 1;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="skillhub-page">
      {/* Header */}
      <div className="skillhub-header">
        <div className="skillhub-header-left">
          <h1 className="skillhub-title">{t('skillhub.title')}</h1>
          <p className="skillhub-subtitle">{t('skillhub.subtitle')}</p>
        </div>
        {isAuthenticated && (
          <div className="skillhub-user-badge">
            <span className="skillhub-user-icon">●</span>
            {user?.username ?? ''}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <nav className="skillhub-tabs">
        <button
          id="skillhub-tab-browse"
          className={`skillhub-tab ${view === 'browse' || view === 'detail' ? 'skillhub-tab-active' : ''}`}
          onClick={showBrowse}
        >
          {t('skillhub.browse')}
        </button>
        {isAuthenticated && (
          <button
            id="skillhub-tab-private"
            className={`skillhub-tab ${view === 'private' || view === 'privateDetail' ? 'skillhub-tab-active' : ''}`}
            onClick={showPrivate}
          >
            {t('skillhub.private')}
          </button>
        )}
        {!isAuthenticated && (
          <a
            href="/login"
            className="skillhub-login-link"
          >
            {t('skillhub.loginToManage')}
          </a>
        )}
      </nav>

      {/* Status / error banners */}
      {statusMsg && (
        <div className="status-banner status-banner-success" role="status">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="status-banner status-banner-error" role="alert">
          {errorMsg}
        </div>
      )}

      {/* Browse view */}
      {(view === 'browse') && (
        <div className="skillhub-browse">
          {/* Search bar */}
          <form onSubmit={handleSearch} className="skillhub-search-form">
            <input
              id="skillhub-search-input"
              type="text"
              className="skillhub-search-input"
              placeholder={t('skillhub.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className="skillhub-search-btn" id="skillhub-search-btn">
              {t('skillhub.search')}
            </button>
          </form>

          {/* Loading */}
          {loading && <p className="empty-state">{t('skillhub.loading')}</p>}

          {/* Skill list */}
          {!loading && publicResult && publicResult.items.length === 0 && (
            <p className="empty-state">
              {searchQuery.trim() ? t('skillhub.noResults') : t('skillhub.noSkills')}
            </p>
          )}

          {!loading && publicResult && publicResult.items.length > 0 && (
            <>
              <div className="resource-list">
                {publicResult.items.map((skill) => (
                  <button
                    key={skill.id}
                    className="resource-card resource-card-button"
                    onClick={() => void openPublicDetail(skill.id)}
                    id={`skillhub-skill-${skill.id}`}
                  >
                    <div className="resource-card-top">
                      <h3 className="resource-title">{skill.name}</h3>
                    </div>
                    <p className="resource-body resource-body-truncate">
                      {skill.description || t('skills.noDescription')}
                    </p>
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="skillhub-pagination">
                  <button
                    className="secondary-button"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    id="skillhub-prev-page"
                  >
                    {t('skillhub.prev')}
                  </button>
                  <span className="skillhub-page-info">
                    {t('skillhub.page', { current: currentPage, total: totalPages })}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    id="skillhub-next-page"
                  >
                    {t('skillhub.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Public detail view */}
      {view === 'detail' && selectedDetail && (
        <div className="skillhub-detail">
          <button
            className="secondary-button skillhub-back-btn"
            onClick={showBrowse}
            id="skillhub-back-browse"
          >
            ← {t('skillhub.browse')}
          </button>

          <div className="content-card">
            <h2 className="section-title">{selectedDetail.name}</h2>
            <p className="resource-meta">
              {selectedDetail.description || t('skills.noDescription')}
            </p>

            {selectedDetail.skillMdAvailable && selectedDetail.skillMd ? (
              <div className="skillhub-skill-md">
                <h3 className="detail-label">SKILL.md</h3>
                <pre className="data-preview">{selectedDetail.skillMd}</pre>
              </div>
            ) : (
              <p className="empty-state">{t('skillhub.contentUnavailable')}</p>
            )}

            <div className="inline-actions">
              <button
                className="primary-button"
                onClick={() => void handleDownload(selectedDetail.id)}
                id="skillhub-download-btn"
              >
                {t('skillhub.download')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private skills view */}
      {view === 'private' && isAuthenticated && (
        <div className="skillhub-private">
          {privateLoading && <p className="empty-state">{t('skillhub.loading')}</p>}

          {!privateLoading && privateSkills.length === 0 && (
            <p className="empty-state">{t('skillhub.noSkills')}</p>
          )}

          {!privateLoading && privateSkills.length > 0 && (
            <div className="resource-list">
              {privateSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="resource-card"
                  id={`skillhub-private-${skill.id}`}
                >
                  <div className="resource-card-top">
                    <h3 className="resource-title">{skill.name}</h3>
                    <span className="resource-badge skillhub-badge-private">
                      {skill.visibility === 'shared' ? t('common.shared') : t('common.private')}
                    </span>
                  </div>
                  <p className="resource-body resource-body-truncate">
                    {skill.description || t('skills.noDescription')}
                  </p>
                  <div className="inline-actions">
                    {skill.visibility === 'private' && (
                      <button
                        className="primary-button"
                        onClick={() => void handlePublish(skill.id)}
                        id={`skillhub-publish-${skill.id}`}
                      >
                        {t('skillhub.publish')}
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      onClick={() => void handleDownload(skill.id)}
                    >
                      {t('skillhub.download')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
