import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SkillCatalogPage from './SkillCatalog';
import * as AuthContext from '../contexts/AuthContext';

// Define a single hoisted object for mock functions and translation to ensure initialization before mocks run
const mocks = vi.hoisted(() => ({
  mockFetchPublicSkills: vi.fn(),
  mockSearchPublicSkills: vi.fn(),
  mockFetchPublicSkillDetail: vi.fn(),
  mockCreateSkill: vi.fn(),
  mockFetchMarketplaceStats: vi.fn(),
  mockFetchFeaturedSkills: vi.fn(),
  mockToggleSkillStar: vi.fn(),
  mockReportSkillView: vi.fn(),
  stableT: (key: string) => key,
}));

// Mock using functions that delegate to the hoisted object properties
vi.mock('../api/skillhub', () => ({
  fetchPublicSkills: (...args: any[]) => mocks.mockFetchPublicSkills(...args),
  searchPublicSkills: (...args: any[]) => mocks.mockSearchPublicSkills(...args),
  fetchPublicSkillDetail: (...args: any[]) => mocks.mockFetchPublicSkillDetail(...args),
  fetchMarketplaceStats: (...args: any[]) => mocks.mockFetchMarketplaceStats(...args),
  fetchFeaturedSkills: (...args: any[]) => mocks.mockFetchFeaturedSkills(...args),
  toggleSkillStar: (...args: any[]) => mocks.mockToggleSkillStar(...args),
  reportSkillView: (...args: any[]) => mocks.mockReportSkillView(...args),
}));

vi.mock('../api/endpoints', () => ({
  createSkill: (...args: any[]) => mocks.mockCreateSkill(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mocks.stableT,
  }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('SkillCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'user-1', username: 'testuser', role: 'user' },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      isBootstrapLoading: false,
      isInitialized: true,
      registrationAllowed: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshBootstrap: vi.fn(),
    });

    mocks.mockFetchPublicSkills.mockResolvedValue({
      items: [
        { id: 'skill-1', name: 'Python Helper', description: 'Help write python' },
        { id: 'skill-2', name: 'JS Expert', description: 'JS codes' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      startIndex: 0,
      endIndex: 1,
    });

    mocks.mockFetchMarketplaceStats.mockResolvedValue({
      totalSkills: 10,
      totalStars: 50,
      totalDownloads: 200,
      topCategories: [],
    });

    mocks.mockFetchFeaturedSkills.mockResolvedValue([]);

    mocks.mockToggleSkillStar.mockResolvedValue({ starred: true });

    mocks.mockReportSkillView.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders skill list', async () => {
    render(
      <MemoryRouter>
        <SkillCatalogPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Python Helper')).toBeTruthy();
      expect(screen.getByText('JS Expert')).toBeTruthy();
    });
  });

  it('triggers search on form submit', async () => {
    mocks.mockSearchPublicSkills.mockResolvedValue({
      items: [{ id: 'skill-1', name: 'Python Helper', description: 'Help write python' }],
      total: 1,
      page: 1,
      pageSize: 20,
      startIndex: 0,
      endIndex: 0,
    });

    render(
      <MemoryRouter>
        <SkillCatalogPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Python Helper')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText('搜索技能名称或描述...');
    fireEvent.change(input, { target: { value: 'Python' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(mocks.mockSearchPublicSkills).toHaveBeenCalledWith(
        'Python',
        1,
        'trending',
        undefined,
      );
    });
  });

  it('opens detail modal and renders download zip button', async () => {
    mocks.mockFetchPublicSkillDetail.mockResolvedValue({
      id: 'skill-1',
      name: 'Python Helper',
      description: 'Help write python',
      visibility: 'shared',
      ownerUserId: 'user-1',
      skillMd: '# Python instructions',
      skillMdAvailable: true,
    });

    render(
      <MemoryRouter>
        <SkillCatalogPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Python Helper')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Python Helper'));

    await waitFor(() => {
      expect(mocks.mockFetchPublicSkillDetail).toHaveBeenCalledWith('skill-1');
      expect(screen.getByText('Python instructions')).toBeTruthy();
    });

    const downloadLink = screen.getByRole('link', { name: '下载 ZIP 包' });
    expect(downloadLink.getAttribute('href')).toBe('/api/skillhub/skill-1/download');
    expect(downloadLink.getAttribute('download')).toBe('Python Helper.zip');
    expect(screen.queryByText('导入至工作区')).toBeNull();
  });
});
