/**
 * 项目状态管理 Store
 */

import { create } from 'zustand';
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
  loadProjects: () => Promise<void>;
  loadProjectTree: (projectId: string) => Promise<void>;
  loadNodeChildren: (nodeId: string) => Promise<ProjectNode[]>;
  createNode: (projectId: string, node: Partial<ProjectNode>) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<ProjectNode>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNode: (nodeId: string | null) => void;
  setError: (error: string | null) => void;
}

const API_BASE = 'http://localhost:3310/api/v1';

export const useProjectStore = create<ProjectState>((set, get) => ({
  // 初始状态
  currentProjectId: null,
  currentProject: null,
  projectTree: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,

  // 设置当前项目 ID
  setCurrentProject: (id) => {
    set({ currentProjectId: id, selectedNodeId: null });
  },

  // 加载项目列表
  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/projects`);
      if (!response.ok) {
        throw new Error('获取项目列表失败');
      }
      const data = await response.json();
      set({ isLoading: false });
      return data;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 加载项目树（完整）
  loadProjectTree: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/tree`);
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
  loadNodeChildren: async (nodeId) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return [];

    try {
      const response = await fetch(`${API_BASE}/projects/${currentProjectId}/nodes/${nodeId}/children`);
      if (!response.ok) {
        throw new Error('获取子节点失败');
      }
      const children = await response.json();

      // 更新本地树结构
      set((state) => ({
        projectTree: updateNodeInTree(state.projectTree, nodeId, (node) => ({
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
      const response = await fetch(`${API_BASE}/projects/${projectId}/nodes`, {
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
      set((state) => {
        const parentId = node.parent_id || null;
        const newTree = [...state.projectTree];

        if (parentId) {
          // 添加到父节点的 children
          return {
            projectTree: updateNodeInTree(newTree, parentId, (parent) => ({
              ...parent,
              children: [...(parent.children || []), {
                id: newNode.id,
                name: newNode.name,
                type: newNode.type,
                color: newNode.color,
                isOpen: newNode.is_open,
                children: [],
              }],
            })),
          };
        } else {
          // 添加到根级别
          return {
            projectTree: [...newTree, {
              id: newNode.id,
              name: newNode.name,
              type: newNode.type,
              color: newNode.color,
              isOpen: newNode.is_open,
              children: [],
            }],
          };
        }
      });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 更新节点
  updateNode: async (nodeId, updates) => {
    try {
      const response = await fetch(`${API_BASE}/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '更新节点失败');
      }

      // 更新本地树
      set((state) => ({
        projectTree: updateNodeInTree(state.projectTree, nodeId, (node) => ({
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
  deleteNode: async (nodeId) => {
    try {
      const response = await fetch(`${API_BASE}/nodes/${nodeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '删除节点失败');
      }

      // 从本地树中移除
      set((state) => ({
        projectTree: removeNodeFromTree(state.projectTree, nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 设置选中节点
  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  // 设置错误
  setError: (error) => {
    set({ error });
  },
}));

// 辅助函数：更新树中的节点
function updateNodeInTree(
  tree: ProjectNode[],
  nodeId: string,
  updater: (node: ProjectNode) => ProjectNode
): ProjectNode[] {
  return tree.map((node) => {
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
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: node.children ? removeNodeFromTree(node.children, nodeId) : undefined,
    }));
}
