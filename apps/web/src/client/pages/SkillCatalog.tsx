import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchPublicSkills,
  searchPublicSkills,
  fetchPublicSkillDetail,
  fetchMarketplaceStats,
  toggleSkillStar,
  fetchFeaturedSkills,
  reportSkillView,
} from '../api/skillhub';
import { createSkill } from '../api/endpoints';
import { SimpleMarkdown } from '../components/SimpleMarkdown';
import type {
  SkillPublicSummary,
  SkillDetail,
  SkillSortType,
  SkillStats,
} from '@prompthub/shared';

// ─── Constants ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: '全部', icon: '🌐' },
  { key: 'general', label: '通用', icon: '🛠️' },
  { key: 'office', label: '办公', icon: '📊' },
  { key: 'dev', label: '开发', icon: '💻' },
  { key: 'ai', label: 'AI智能', icon: '🤖' },
  { key: 'data', label: '数据分析', icon: '📈' },
  { key: 'management', label: '项目管理', icon: '📅' },
  { key: 'deploy', label: '运维部署', icon: '🚀' },
] as const;

const SORT_TABS: { key: SkillSortType; label: string }[] = [
  { key: 'trending', label: '🔥 热门趋势' },
  { key: 'top', label: '⬇️ 下载排行' },
  { key: 'new', label: '🆕 最新发布' },
  { key: 'most_starred', label: '⭐ 最多收藏' },
  { key: 'featured', label: '✨ 精选推荐' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format a number with K/M suffixes for display. */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Calculate a human-readable "time ago" string from a unix timestamp. */
function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2_592_000) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 31_536_000) return `${Math.floor(diff / 2_592_000)} 月前`;
  return `${Math.floor(diff / 31_536_000)} 年前`;
}

/** Get category info by key. */
function getCategoryInfo(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SkillCatalog() {
// eslint-disable-next-line react/display-name
const SkillCatalogPage = SkillCatalog; // named re-export for existing imports
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, logout, isAuthenticated } = useAuth();

  // ── Marketplace state ──
  const [skills, setSkills] = useState<SkillPublicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const loadingMoreRef = useRef(false);

  // ── Sort & Category state ──
  const [activeSort, setActiveSort] = useState<SkillSortType>('trending');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // ── Stats state ──
  const [stats, setStats] = useState<SkillStats | null>(null);

  // ── Featured state ──
  const [featured, setFeatured] = useState<SkillPublicSummary[]>([]);

  // ── Detail modal state ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Escape key closes detail modal
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  // ── Load skills (first page) ──
  const loadSkills = useCallback(
    async (p: number, q: string, sort: SkillSortType, category: string) => {
      setLoading(true);
      setError(null);
      try {
        let result;
        if (q.trim()) {
          result = await searchPublicSkills(q, p, sort, category === 'all' ? undefined : category);
        } else {
          result = await fetchPublicSkills(p, sort, category === 'all' ? undefined : category);
        }
        setSkills(result.items);
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.items.length === result.pageSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('skillhub.error'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Load more (append next page)
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    try {
      const nextPage = page + 1;
      let result;
      if (activeSearch.trim()) {
        result = await searchPublicSkills(
          activeSearch,
          nextPage,
          activeSort,
          selectedCategory === 'all' ? undefined : selectedCategory,
        );
      } else {
        result = await fetchPublicSkills(
          nextPage,
          activeSort,
          selectedCategory === 'all' ? undefined : selectedCategory,
        );
      }
      setSkills((prev) => [...prev, ...result.items]);
      setPage(result.page);
      setHasMore(result.items.length === result.pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skillhub.error'));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [page, hasMore, activeSearch, activeSort, selectedCategory, t]);

  // ── Load stats & featured on mount ──
  useEffect(() => {
    void fetchMarketplaceStats().then(setStats).catch(() => {});
    void fetchFeaturedSkills(6).then(setFeatured).catch(() => {});
  }, []);

  // ── Reload when sort/category/search changes ──
  useEffect(() => {
    setPage(1);
    void loadSkills(1, activeSearch, activeSort, selectedCategory);
  }, [activeSort, selectedCategory, loadSkills, activeSearch]);

  // ── Handlers ──

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchQuery);
  };

  const handleSortChange = (sort: SkillSortType) => {
    setActiveSort(sort);
  };

  const handleCategoryChange = (catKey: string) => {
    setSelectedCategory(catKey);
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setActionSuccess(null);
    setActionError(null);
    try {
      // Fetch detail and report view concurrently
      const detailPromise = fetchPublicSkillDetail(id);
      reportSkillView(id).catch(() => {}); // fire-and-forget
      const data = await detailPromise;
      setDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to fetch details');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setActionSuccess(null);
    setActionError(null);
  };

  const handleStarToggle = async () => {
    if (!isAuthenticated || !selectedId) {
      navigate('/login', { state: { from: location } });
      return;
    }
    try {
      const result = await toggleSkillStar(selectedId);
      // Update detail state optimistically
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              isStarred: result.starred,
              starCount: result.starred
                ? (prev.starCount ?? 0) + 1
                : (prev.starCount ?? 1) - 1,
            }
          : prev,
      );
      // Also update in the skills list
      setSkills((prev) =>
        prev.map((s) =>
          s.id === selectedId
            ? {
                ...s,
                isStarred: result.starred,
                starCount: result.starred
                  ? (s.starCount ?? 0) + 1
                  : (s.starCount ?? 1) - 1,
              }
            : s,
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleImport = async () => {
    if (!isAuthenticated || !detail) return;
    setActionSuccess(null);
    setActionError(null);
    try {
      await createSkill(token || '', {
        name: detail.name,
        description: detail.description,
        content: detail.skillMd ?? detail.description,
      });
      setActionSuccess('技能已成功导入到工作区');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '导入失败');
    }
  };

  // ── Render ──

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl">🔧</span>
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              SkillHub
            </span>
          </div>
          <nav className="flex items-center space-x-1">
            {user && (
              <>
                {user.role === 'admin' && (
                  <button
                    onClick={() => navigate('/console/admin')}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    管理后台
                  </button>
                )}
                <button
                  onClick={() => navigate('/console/skills')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  我的技能
                </button>
              </>
            )}
          </nav>
          <div className="flex items-center space-x-3">
            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-slate-600">{user.username}</span>
                <button
                  onClick={() => {
                    void logout();
                    window.location.assign('/');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all shadow-sm"
                >
                  退出
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login', { state: { from: location } })}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10 transition-all hover:scale-[1.02]"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <section className="relative overflow-hidden py-16 border-b border-slate-200/60 bg-gradient-to-b from-white via-indigo-50/10 to-slate-50/20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-violet-900 bg-clip-text text-transparent">
            🔧 SkillHub
          </h1>
          <p className="text-lg text-slate-500 mb-8 max-w-xl mx-auto">
            发现、分享和下载可复用的 AI 技能，提升你的工作效率
          </p>

          {/* Stats Bar */}
          {stats && (
            <div className="flex items-center justify-center space-x-8 mb-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">{formatCount(stats.totalSkills)}</div>
                <div className="text-xs text-slate-500 mt-0.5">公开技能</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{formatCount(stats.totalStars)}</div>
                <div className="text-xs text-slate-500 mt-0.5">全站收藏</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">{formatCount(stats.totalDownloads)}</div>
                <div className="text-xs text-slate-500 mt-0.5">累计下载</div>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索技能名称或描述..."
              className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all shadow-sm"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all"
            >
              🔍 搜索
            </button>
          </form>
        </div>
      </section>

      {/* ── Featured Skills ── */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-10 pb-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            ✨ 精选推荐
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.slice(0, 3).map((skill) => (
              <div
                key={skill.id}
                onClick={() => void openDetail(skill.id)}
                className="bg-gradient-to-br from-white to-slate-50/50 hover:from-white hover:to-indigo-50/20 border border-slate-200/80 hover:border-indigo-200/80 rounded-2xl p-5 cursor-pointer transition-all shadow-sm hover:shadow-md group"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg text-indigo-600 shrink-0">
                    {skill.iconEmoji ?? '\uD83E\uDDE0'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                      {skill.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {skill.description?.slice(0, 80) ?? '暂无描述'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 mt-3 text-[11px] text-slate-500">
                  {skill.authorName && <span>{skill.authorName}</span>}
                  <span>{'★'} {formatCount(skill.starCount ?? 0)}</span>
                  <span>{'\u2B07\uFE0F'} {formatCount(skill.downloadCount ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sort Tabs + Category Dropdown ── */}
      <section className="max-w-7xl mx-auto px-4 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Sort Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1">
            {SORT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleSortChange(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeSort === tab.key
                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">分类:</span>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer shadow-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Card Grid ── */}
      <main className="max-w-7xl mx-auto px-4 pb-16">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm mb-6 shadow-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-44 bg-white border border-slate-200 rounded-2xl animate-pulse shadow-sm"
              />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-20 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
            <span className="text-4xl">{'\uD83D\uDCED'}</span>
            <p className="mt-4 text-slate-500 font-medium">未找到任何公开的 AI 技能</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => void openDetail(skill.id)}
                  className="bg-white hover:bg-white border border-slate-200/80 hover:border-indigo-200/60 rounded-2xl p-5 cursor-pointer transition-all shadow-sm hover:shadow-md hover:shadow-indigo-500/5 group flex flex-col justify-between min-h-[190px]"
                >
                  <div>
                    {/* Card Header: Icon + Slug + Category badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shadow-inner group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        {skill.iconEmoji ?? '\uD83E\uDDE0'}
                      </div>
                      <div className="flex items-center space-x-2">
                        {skill.category && skill.category !== 'all' && (
                          <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                            {getCategoryInfo(skill.category).icon} {getCategoryInfo(skill.category).label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Body: Name + Description */}
                    <h3 className="text-base font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors mb-1">
                      {skill.slug ? (
                        <>
                          <span className="text-xs font-normal text-slate-400 mr-1">
                            {skill.slug.split('/')[0]} /
                          </span>
                          <span>{skill.slug.split('/')[1] || skill.name}</span>
                        </>
                      ) : (
                        skill.name
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {skill.description?.slice(0, 120) || '暂无描述'}
                    </p>
                  </div>

                  {/* Card Footer: Author + Stats */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center space-x-2">
                      {skill.authorAvatar ? (
                        <img
                          src={skill.authorAvatar}
                          alt={skill.authorName ?? ''}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center text-[9px] font-bold text-indigo-600 border border-indigo-100">
                          {(skill.authorName ?? '?')[0]}
                        </div>
                      )}
                      <span className="text-[11px] text-slate-500 truncate max-w-[80px]">
                        {skill.authorName ?? '匿名'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-500">
                      {skill.isStarred ? (
                        <span className="text-yellow-500">{'★'} {formatCount(skill.starCount ?? 0)}</span>
                      ) : (
                        <span className="text-slate-400">{'☆'} {formatCount(skill.starCount ?? 0)}</span>
                      )}
                      <span>{'\u2B07\uFE0F'} {formatCount(skill.downloadCount ?? 0)}</span>
                      {skill.updatedAt && (
                        <span title={new Date(skill.updatedAt).toLocaleString()}>
                          {timeAgo(Math.floor(new Date(skill.updatedAt).getTime() / 1000))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={() => void loadMore()}
                  disabled={loading}
                  className="px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all disabled:opacity-50 shadow-sm"
                >
                  {loading ? t('skillhub.loading') : '加载更多'}
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="text-center text-xs text-slate-500 mt-4">
              共 {total} 个技能
            </p>
          </>
        )}
      </main>

      {/* ── Detail Modal ── */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl shadow-slate-200/60">
            {detailLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-sm text-slate-500">{t('skillhub.loading')}</p>
              </div>
            ) : detailError ? (
              <div className="p-8 text-center">
                <p className="text-rose-600 text-sm mb-4">{detailError}</p>
                <button
                  onClick={closeDetail}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition-all border border-slate-200"
                >
                  关闭
                </button>
              </div>
            ) : detail ? (
              <>
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                     <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl text-slate-800 shrink-0 border border-slate-100">
                        {detail.iconEmoji ?? '\uD83E\uDDE0'}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          {detail.slug ? (
                            <>
                              <span className="text-sm font-normal text-slate-400 mr-1.5">
                                {detail.slug.split('/')[0]} /
                              </span>
                              <span>{detail.slug.split('/')[1] || detail.name}</span>
                            </>
                          ) : (
                            detail.name
                          )}
                        </h2>
                        <div className="flex items-center space-x-3 mt-1 text-xs text-slate-500">
                          {detail.authorName && <span>by {detail.authorName}</span>}
                          {detail.category && (
                            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                              {getCategoryInfo(detail.category).icon} {getCategoryInfo(detail.category).label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Star Toggle */}
                      <button
                        onClick={() => void handleStarToggle()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                          detail.isStarred
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200 shadow-sm'
                            : 'bg-slate-50 text-slate-500 hover:bg-yellow-50 hover:text-yellow-600 border-slate-200'
                        }`}
                      >
                        {detail.isStarred ? '★' : '☆'} {formatCount(detail.starCount ?? 0)}
                      </button>
                      {/* Close Button */}
                      <button
                        onClick={closeDetail}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all text-lg border border-slate-200"
                      >
                        {'\u00D7'}
                      </button>
                    </div>
                  </div>
                  {/* Stats Row */}
                  <div className="flex items-center space-x-6 mt-4 text-xs text-slate-500">
                    <span>{'\u2B07\uFE0F'} {formatCount(detail.downloadCount ?? 0)} 下载</span>
                    <span>{'\uD83D\uDC41\uFE0F'} {formatCount(detail.viewCount ?? 0)} 查看</span>
                  </div>
                </div>

                {/* Modal Body: Markdown Content */}
                <div className="p-6">
                  <div className="text-sm leading-relaxed text-slate-700">
                    <SimpleMarkdown content={detail.skillMd ?? detail.description ?? ''} />
                  </div>
                </div>

                {/* Action Feedback */}
                {actionSuccess && (
                  <div className="mx-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm shadow-sm">
                    {actionSuccess}
                  </div>
                )}
                {actionError && (
                  <div className="mx-6 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm shadow-sm">
                    {actionError}
                  </div>
                )}

                {/* Modal Footer */}
                <div className="p-6 border-t border-slate-100 flex items-center justify-end">
                  <a
                    download={`${detail.name}.zip`}
                    href={`/api/skillhub/${detail.id}/download`}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all text-center shadow-lg shadow-indigo-600/10"
                  >
                    下载 ZIP 包
                  </a>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
