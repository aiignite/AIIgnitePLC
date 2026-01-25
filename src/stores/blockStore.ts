/**
 * 程序块状态管理 Store
 */

import { create } from 'zustand';
import type { Network } from '../types';

interface BlockState {
  // 状态
  currentBlockId: string | null;
  currentBlock: any | null;
  networks: Network[];
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  error: string | null;

  // 编译状态
  compilationErrors: any[];
  isCompiling: boolean;

  // 操作
  loadBlock: (blockId: string) => Promise<void>;
  saveBlock: (blockId: string, content: any, version: number) => Promise<void>;
  addNetwork: (network: Network) => void;
  updateNetwork: (networkId: string, updates: Partial<Network>) => void;
  deleteNetwork: (networkId: string) => void;
  compileBlock: (blockId: string) => Promise<void>;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setError: (error: string | null) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

export const useBlockStore = create<BlockState>((set, get) => ({
  // 初始状态
  currentBlockId: null,
  currentBlock: null,
  networks: [],
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,
  error: null,
  compilationErrors: [],
  isCompiling: false,

  // 加载程序块
  loadBlock: async (blockId) => {
    set({ isLoading: true, error: null, currentBlockId: blockId });
    try {
      const response = await fetch(`${API_BASE}/blocks/${blockId}`);
      if (!response.ok) {
        throw new Error('获取程序块失败');
      }

      const block = await response.json();
      set({
        currentBlock: block,
        networks: block.content?.networks || [],
        isLoading: false,
        hasUnsavedChanges: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // 保存程序块
  saveBlock: async (blockId, content, version) => {
    set({ isSaving: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/blocks/${blockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, version }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.error?.code === 'VERSION_CONFLICT') {
          throw new Error('数据已在别处被修改，请刷新后重试');
        }
        throw new Error(error.error?.message || '保存失败');
      }

      const savedBlock = await response.json();
      set({
        currentBlock: savedBlock,
        isSaving: false,
        hasUnsavedChanges: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isSaving: false });
      throw error;
    }
  },

  // 添加网络段
  addNetwork: (network) => {
    set((state) => ({
      networks: [...state.networks, network],
      hasUnsavedChanges: true,
    }));
  },

  // 更新网络段
  updateNetwork: (networkId, updates) => {
    set((state) => ({
      networks: state.networks.map((network) =>
        network.id === networkId ? { ...network, ...updates } : network
      ),
      hasUnsavedChanges: true,
    }));
  },

  // 删除网络段
  deleteNetwork: (networkId) => {
    set((state) => ({
      networks: state.networks.filter((network) => network.id !== networkId),
      hasUnsavedChanges: true,
    }));
  },

  // 编译程序块
  compileBlock: async (blockId) => {
    set({ isCompiling: true, compilationErrors: [], error: null });
    try {
      // TODO: 实现编译 API 调用
      // const response = await fetch(`${API_BASE}/blocks/${blockId}/compile`, {
      //   method: 'POST',
      // });

      // 模拟编译结果
      await new Promise((resolve) => setTimeout(resolve, 1000));

      set({
        isCompiling: false,
        compilationErrors: [], // 如果有错误，设置错误列表
      });
    } catch (error) {
      set({ error: (error as Error).message, isCompiling: false });
      throw error;
    }
  },

  // 设置未保存更改标志
  setHasUnsavedChanges: (hasChanges) => {
    set({ hasUnsavedChanges: hasChanges });
  },

  // 设置错误
  setError: (error) => {
    set({ error });
  },
}));
