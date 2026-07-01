/**
 * 项目状态管理 Store
 */

import { create } from 'zustand';
import { fetchWithAuth } from '../services/authFetch';
import type { ProjectNode } from '../types';

interface ProjectState {
  // 状态
  currentProjectId: string | null;
  currentProject: any | null;
  projectTree: ProjectNode[];
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;

  // 操作
  setCurrentProject: (id: string | null) => void;
  loadProjects: () => Promise<any[]>;
  createProject: (name: string, description?: string, isPublic?: boolean) => Promise<any>;
  updateProject: (
    projectId: string,
    updates: { name?: string; description?: string; is_public?: boolean }
  ) => Promise<any>;
  deleteProject: (projectId: string) => Promise<void>;
  loadProjectTree: (projectId: string) => Promise<void>;
  loadNodeChildren: (nodeId: string) => Promise<ProjectNode[]>;
  createNode: (projectId: string, node: Partial<ProjectNode>) => Promise<any>;
  updateNode: (nodeId: string, updates: Partial<ProjectNode>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNode: (nodeId: string | null) => void;
  setError: (error: string | null) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

export const useProjectStore = create<ProjectState>((set, get) => ({
  // 初始状态
  currentProjectId: null,
  currentProject: null,
  projectTree: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,

  // 设置当前项目 ID
  setCurrentProject: id => {
    set({ currentProjectId: id, selectedNodeId: null });
  },

  // 加载项目列表
  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects`);
      if (!response.ok) {
        throw new Error('获取项目列表失败');
      }
      const data = await response.json();
      set({ isLoading: false });
      return data.projects || [];
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 创建项目
  createProject: async (name, description, isPublic) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description, is_public: isPublic }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '创建项目失败');
      }

      const project = await response.json();
      set({ isLoading: false, currentProjectId: project.id, currentProject: project });

      // Initialize default tree structure immediately
      // This is a simplified client-side logic, ideally backend handles initialization
      return project;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 更新项目
  updateProject: async (projectId, updates) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '更新项目失败');
      }

      const project = await response.json();
      const { currentProjectId, currentProject } = get();
      set({
        isLoading: false,
        currentProject: currentProjectId === project.id ? project : currentProject,
      });
      return project;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 删除项目
  deleteProject: async projectId => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '删除项目失败');
      }

      const { currentProjectId } = get();
      set({
        isLoading: false,
        currentProjectId: currentProjectId === projectId ? null : currentProjectId,
        currentProject: currentProjectId === projectId ? null : get().currentProject,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 加载项目树（完整）
  loadProjectTree: async projectId => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects/${projectId}/tree`);
      if (!response.ok) {
        throw new Error('获取项目树失败');
      }
      const tree = await response.json();
      set({ projectTree: tree, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 懒加载节点子节点
  loadNodeChildren: async nodeId => {
    const { currentProjectId } = get();
    if (!currentProjectId) return [];

    try {
      const response = await fetchWithAuth(
        `${API_BASE}/projects/${currentProjectId}/nodes/${nodeId}/children`
      );
      if (!response.ok) {
        throw new Error('获取子节点失败');
      }
      const children = await response.json();

      // 更新本地树结构
      set(state => ({
        projectTree: updateNodeInTree(state.projectTree, nodeId, node => ({
          ...node,
          children: children.map((child: any) => ({
            id: child.id,
            name: child.name,
            type: child.type,
            color: child.color,
            isOpen: child.is_open,
            hasChildren: child.hasChildren,
            children: node.children,
          })),
        })),
      }));

      return children;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 创建节点
  createNode: async (projectId, node) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/projects/${projectId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '创建节点失败');
      }

      const newNode = await response.json();

      // 更新本地树
      set(state => ({
        projectTree: addNodeToTree(state.projectTree, node.parent_id || null, {
          id: newNode.id,
          name: newNode.name,
          type: newNode.type,
          color: newNode.color,
          isOpen: newNode.is_open,
          children: [],
        }),
      }));
      return newNode;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 更新节点
  updateNode: async (nodeId, updates) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '更新节点失败');
      }

      // 更新本地树
      set(state => ({
        projectTree: updateNodeInTree(state.projectTree, nodeId, node => ({
          ...node,
          ...updates,
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.color !== undefined && { color: updates.color }),
          ...(updates.is_open !== undefined && { isOpen: updates.is_open }),
        })),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 删除节点
  deleteNode: async nodeId => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '删除节点失败');
      }

      // 从本地树中移除
      set(state => ({
        projectTree: removeNodeFromTree(state.projectTree, nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 设置选中节点
  setSelectedNode: nodeId => {
    set({ selectedNodeId: nodeId });
  },

  // 设置错误
  setError: error => {
    set({ error });
  },
}));

// 辅助函数：更新树中的节点
function updateNodeInTree(
  tree: ProjectNode[],
  nodeId: string,
  updater: (node: ProjectNode) => ProjectNode
): ProjectNode[] {
  return tree.map(node => {
    if (node.id === nodeId) {
      return updater(node);
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updater),
      };
    }
    return node;
  });
}

// 辅助函数：从树中移除节点
function removeNodeFromTree(tree: ProjectNode[], nodeId: string): ProjectNode[] {
  return tree
    .filter(node => node.id !== nodeId)
    .map(node => ({
      ...node,
      children: node.children ? removeNodeFromTree(node.children, nodeId) : undefined,
    }));
}

// 辅助函数：向已有的树中添加节点
function addNodeToTree(
  tree: ProjectNode[],
  parentId: string | null,
  newNode: ProjectNode
): ProjectNode[] {
  // 如果是根节点 (假设parentId为null或undefined时直接添加到根列表)
  if (!parentId) {
    return [...tree, newNode];
  }

  return tree.map(node => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...(node.children || []), newNode],
      };
    }
    if (node.children) {
      return {
        ...node,
        children: addNodeToTree(node.children, parentId, newNode),
      };
    }
    return node;
  });
}
