/**
 * 变量状态管理 Store
 */

import { create } from 'zustand';
import type { TagDefinition } from '../types';

interface TagsState {
  // 状态
  tags: TagDefinition[];
  filteredTags: TagDefinition[];
  currentProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };

  // 筛选条件
  filters: {
    search: string;
    dataType: string;
  };

  // 操作
  loadTags: (projectId: string, page?: number, pageSize?: number) => Promise<void>;
  createTag: (projectId: string, tag: Partial<TagDefinition>) => Promise<void>;
  updateTag: (tagId: string, updates: Partial<TagDefinition>) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  setFilters: (filters: { search?: string; dataType?: string }) => void;
  setError: (error: string | null) => void;
}

const API_BASE = 'http://localhost:3310/api/v1';

export const useTagStore = create<TagsState>((set, get) => ({
  // 初始状态
  tags: [],
  filteredTags: [],
  currentProjectId: null,
  isLoading: false,
  error: null,
  pagination: {
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  },
  filters: {
    search: '',
    dataType: '',
  },

  // 加载变量列表
  loadTags: async (projectId, page = 1, pageSize = 50) => {
    set({ isLoading: true, error: null, currentProjectId: projectId });
    try {
      const { search, dataType } = get().filters;
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(dataType && { dataType }),
      });

      const response = await fetch(`${API_BASE}/projects/${projectId}/tags?${params}`);
      if (!response.ok) {
        throw new Error('获取变量列表失败');
      }

      const data = await response.json();
      set({
        tags: data.data,
        filteredTags: data.data,
        pagination: {
          total: data.total,
          page: data.page,
          pageSize: data.pageSize,
          totalPages: data.totalPages,
        },
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 创建变量
  createTag: async (projectId, tag) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tag),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '创建变量失败');
      }

      const newTag = await response.json();

      // 添加到本地列表
      set((state) => ({
        tags: [newTag, ...state.tags],
        filteredTags: [newTag, ...state.filteredTags],
        pagination: {
          ...state.pagination,
          total: state.pagination.total + 1,
        },
        isLoading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 更新变量
  updateTag: async (tagId, updates) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '更新变量失败');
      }

      const updatedTag = await response.json();

      // 更新本地列表
      set((state) => ({
        tags: state.tags.map((tag) =>
          tag.id === tagId ? { ...tag, ...updatedTag } : tag
        ),
        filteredTags: state.filteredTags.map((tag) =>
          tag.id === tagId ? { ...tag, ...updatedTag } : tag
        ),
        isLoading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 删除变量
  deleteTag: async (tagId) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/tags/${tagId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '删除变量失败');
      }

      // 从本地列表移除
      set((state) => ({
        tags: state.tags.filter((tag) => tag.id !== tagId),
        filteredTags: state.filteredTags.filter((tag) => tag.id !== tagId),
        pagination: {
          ...state.pagination,
          total: state.pagination.total - 1,
        },
        isLoading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 设置筛选条件
  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));

    // 重新加载列表
    const { currentProjectId, pagination } = get();
    if (currentProjectId) {
      get().loadTags(currentProjectId, pagination.page, pagination.pageSize);
    }
  },

  // 设置错误
  setError: (error) => {
    set({ error });
  },
}));
