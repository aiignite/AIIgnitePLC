/**
 * API 客户端服务层
 * 提供与后端 API 的统一接口
 * 支持自动令牌刷新和认证
 */

import { useAuthStore } from '../stores/authStore';
import type { ProjectNode, TagDefinition } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

/**
 * 通用 API 错误处理
 */
class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * 通用请求处理（支持自动令牌刷新）
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { accessToken, refreshAccessToken } = useAuthStore.getState();

  let headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  // 如果有访问令牌，添加到请求头
  if (accessToken) {
    headers = {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  let response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  // 如果返回 401，尝试刷新令牌
  if (response.status === 401 && accessToken) {
    try {
      await refreshAccessToken();
      const newAccessToken = useAuthStore.getState().accessToken;

      if (newAccessToken) {
        // 使用新令牌重试请求
        response = await fetch(`${API_BASE}${url}`, {
          ...options,
          headers: {
            ...headers,
            Authorization: `Bearer ${newAccessToken}`,
          },
        });
      }
    } catch (error) {
      // 刷新失败，用户需要重新登录
      console.error('令牌刷新失败:', error);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { code: 'UNKNOWN', message: '未知错误' },
    }));
    throw new APIError(
      error.error?.code || 'UNKNOWN',
      error.error?.message || '请求失败',
      error.error?.details
    );
  }

  return response.json();
}

// ============================================================================
// 项目 API
// ============================================================================

export const projectAPI = {
  /**
   * 获取项目列表
   */
  list: () => request<{ projects: any[]; total: number }>('/projects'),

  /**
   * 获取项目详情
   */
  get: (id: string) => request<any>(`/projects/${id}`),

  /**
   * 创建项目
   */
  create: (data: { name: string; description?: string }) =>
    request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新项目
   */
  update: (id: string, data: { name?: string; description?: string }) =>
    request<any>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除项目
   */
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/projects/${id}`, {
      method: 'DELETE',
    }),

  /**
   * 获取项目树
   */
  getTree: (id: string) => request<ProjectNode[]>(`/projects/${id}/tree`),
};

// ============================================================================
// 节点 API
// ============================================================================

export const nodeAPI = {
  /**
   * 创建节点
   */
  create: (
    projectId: string,
    data: {
      parent_id?: string;
      name: string;
      type: ProjectNode['type'];
      color?: string;
    }
  ) =>
    request<any>(`/projects/${projectId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取节点子节点（懒加载）
   */
  getChildren: (projectId: string, nodeId: string) =>
    request<any[]>(`/projects/${projectId}/nodes/${nodeId}/children`),

  /**
   * 更新节点
   */
  update: (
    id: string,
    data: {
      name?: string;
      color?: string;
      is_open?: boolean;
      order_index?: number;
    }
  ) =>
    request<any>(`/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除节点
   */
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/nodes/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================================================
// 变量 (Tags) API
// ============================================================================

export const tagAPI = {
  /**
   * 获取变量列表
   */
  list: (
    projectId: string,
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      dataType?: string;
    }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.dataType) searchParams.set('dataType', params.dataType);

    return request<{
      data: TagDefinition[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/projects/${projectId}/tags?${searchParams}`);
  },

  /**
   * 创建变量
   */
  create: (
    projectId: string,
    data: {
      name: string;
      address: string;
      data_type: string;
      comment?: string;
      is_retentive?: boolean;
    }
  ) =>
    request<TagDefinition>(`/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新变量
   */
  update: (
    id: string,
    data: {
      name?: string;
      address?: string;
      data_type?: string;
      comment?: string;
      is_retentive?: boolean;
    }
  ) =>
    request<TagDefinition>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除变量
   */
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/tags/${id}`, {
      method: 'DELETE',
    }),

  /**
   * 检查地址是否可用
   */
  checkAddress: (params: { address: string; projectId: string; excludeId?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('address', params.address);
    searchParams.set('projectId', params.projectId);
    if (params.excludeId) searchParams.set('excludeId', params.excludeId);

    return request<{
      available: boolean;
      conflictingTag: TagDefinition | null;
    }>(`/tags/check-address?${searchParams}`);
  },
};

// ============================================================================
// 程序块 (Blocks) API
// ============================================================================

export const blockAPI = {
  /**
   * 获取程序块详情
   */
  get: (id: string) => request<any>(`/blocks/${id}`),

  /**
   * 保存程序块
   */
  save: (id: string, data: { content: any; version: number }) =>
    request<any>(`/blocks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * 编译程序块
   */
  compile: (id: string) =>
    request<any>(`/blocks/${id}/compile`, {
      method: 'POST',
    }),
};

// ============================================================================
// 导出所有 API
// ============================================================================

export const api = {
  project: projectAPI,
  node: nodeAPI,
  tag: tagAPI,
  block: blockAPI,
};

export { APIError };
