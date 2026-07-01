import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { fetchWithAuth } from '../services/authFetch';
import type { Network, SfcProgram } from '../types';

interface BlockState {
  currentBlockId: string | null;
  currentBlock: Record<string, unknown> | null;
  networks: Network[];
  stSource: string;
  sfcProgram: SfcProgram | null;
  history: Network[][];
  future: Network[][];
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  error: string | null;
  compilationErrors: Array<Record<string, unknown>>;
  isCompiling: boolean;
}

interface BlockActions {
  loadBlock: (blockId: string) => Promise<void>;
  loadBlockByNode: (nodeId: string) => Promise<void>;
  saveBlock: (
    blockId: string,
    content: { networks: Network[]; st_source?: string; sfc?: SfcProgram },
    version: number
  ) => Promise<void>;
  setStSource: (source: string) => void;
  setSfcProgram: (sfc: SfcProgram) => void;
  compilePlcDownload: (
    tags: Array<{ name: string; address: string; data_type: string }>
  ) => Promise<{ downloadHex?: string; error?: string }>;
  addNetwork: (network: Network) => void;
  setNetworks: (networks: Network[]) => void;
  updateNetwork: (networkId: string, updates: Partial<Network>) => void;
  deleteNetwork: (networkId: string) => void;
  undo: () => void;
  redo: () => void;
  compileBlock: (blockId: string) => Promise<void>;
  compileProject: (projectId: string) => Promise<void>;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setError: (error: string | null) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

const initialState: BlockState = {
  currentBlockId: null,
  currentBlock: null,
  networks: [],
  stSource: '',
  sfcProgram: null,
  history: [],
  future: [],
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,
  error: null,
  compilationErrors: [],
  isCompiling: false,
};

export const useBlockStore = create<BlockState & BlockActions>()(
  immer(set => ({
    ...initialState,

    loadBlock: async (blockId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
        state.currentBlockId = blockId;
      });

      try {
        const response = await fetchWithAuth(`${API_BASE}/blocks/${blockId}`);
        if (!response.ok) {
          throw new Error('获取程序块失败');
        }

        const block = await response.json();
        set(state => {
          state.currentBlock = block;
          state.networks = (block.content?.networks as Network[]) || [];
          state.stSource = (block.content?.st_source as string) || '';
          state.sfcProgram = (block.content?.sfc as SfcProgram) || null;
          state.history = [];
          state.future = [];
          state.isLoading = false;
          state.hasUnsavedChanges = false;
        });
      } catch (error) {
        set(state => {
          state.error = (error as Error).message;
          state.isLoading = false;
        });
        throw error;
      }
    },

    loadBlockByNode: async (nodeId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
        state.currentBlockId = null;
      });

      try {
        const response = await fetchWithAuth(`${API_BASE}/blocks/by-node/${nodeId}`);
        if (!response.ok) {
          throw new Error('获取程序块失败');
        }

        const block = await response.json();
        set(state => {
          state.currentBlockId = block.id as string;
          state.currentBlock = block;
          state.networks = (block.content?.networks as Network[]) || [];
          state.stSource = (block.content?.st_source as string) || '';
          state.sfcProgram = (block.content?.sfc as SfcProgram) || null;
          state.history = [];
          state.future = [];
          state.isLoading = false;
          state.hasUnsavedChanges = false;
        });
      } catch (error) {
        set(state => {
          state.error = (error as Error).message;
          state.isLoading = false;
        });
        throw error;
      }
    },

    saveBlock: async (
      blockId: string,
      content: { networks: Network[]; st_source?: string; sfc?: SfcProgram },
      version: number
    ) => {
      set(state => {
        state.isSaving = true;
        state.error = null;
      });

      try {
        const response = await fetchWithAuth(`${API_BASE}/blocks/${blockId}`, {
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
        set(state => {
          state.currentBlock = savedBlock;
          state.isSaving = false;
          state.hasUnsavedChanges = false;
        });
      } catch (error) {
        set(state => {
          state.error = (error as Error).message;
          state.isSaving = false;
        });
        throw error;
      }
    },

    addNetwork: (network: Network) => {
      set(state => {
        state.history.push(state.networks);
        state.future = [];
        state.networks.push(network);
        state.hasUnsavedChanges = true;
      });
    },

    setNetworks: (networks: Network[]) => {
      set(state => {
        state.history.push(state.networks);
        state.future = [];
        state.networks = networks;
        state.hasUnsavedChanges = true;
      });
    },

    updateNetwork: (networkId: string, updates: Partial<Network>) => {
      set(state => {
        state.history.push(state.networks);
        state.future = [];
        const network = state.networks.find(n => n.id === networkId);
        if (network) {
          Object.assign(network, updates);
        }
        state.hasUnsavedChanges = true;
      });
    },

    deleteNetwork: (networkId: string) => {
      set(state => {
        state.history.push(state.networks);
        state.future = [];
        state.networks = state.networks.filter(n => n.id !== networkId);
        state.hasUnsavedChanges = true;
      });
    },

    undo: () => {
      set(state => {
        if (state.history.length === 0) return;
        const previous = state.history.pop()!;
        state.future.unshift(state.networks);
        state.networks = previous;
        state.hasUnsavedChanges = true;
      });
    },

    redo: () => {
      set(state => {
        if (state.future.length === 0) return;
        const next = state.future.shift()!;
        state.history.push(state.networks);
        state.networks = next;
        state.hasUnsavedChanges = true;
      });
    },

    compileBlock: async (blockId: string) => {
      set(state => {
        state.isCompiling = true;
        state.compilationErrors = [];
        state.error = null;
      });

      try {
        const response = await fetchWithAuth(`${API_BASE}/blocks/${blockId}/compile`, {
          method: 'POST',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || '编译失败');
        }

        const result = await response.json();
        set(state => {
          state.isCompiling = false;
          state.compilationErrors = (result.diagnostics as Array<Record<string, unknown>>) || [];
        });
      } catch (error) {
        set(state => {
          state.error = (error as Error).message;
          state.isCompiling = false;
        });
        throw error;
      }
    },

    compileProject: async (projectId: string) => {
      set(state => {
        state.isCompiling = true;
        state.compilationErrors = [];
        state.error = null;
      });

      try {
        const response = await fetchWithAuth(`${API_BASE}/projects/${projectId}/compile`, {
          method: 'POST',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || '项目编译失败');
        }

        const result = await response.json();
        set(state => {
          state.isCompiling = false;
          state.compilationErrors = (result.diagnostics as Array<Record<string, unknown>>) || [];
        });
      } catch (error) {
        set(state => {
          state.error = (error as Error).message;
          state.isCompiling = false;
        });
        throw error;
      }
    },

    setStSource: (source: string) => {
      set(state => {
        state.stSource = source;
        state.hasUnsavedChanges = true;
      });
    },

    setSfcProgram: (sfc: SfcProgram) => {
      set(state => {
        state.sfcProgram = sfc;
        state.hasUnsavedChanges = true;
      });
    },

    compilePlcDownload: async tags => {
      const state = useBlockStore.getState();
      const response = await fetchWithAuth(`${API_BASE}/plc/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          networks: state.networks,
          st_source: state.stSource || undefined,
          sfc: state.sfcProgram || undefined,
          tags,
          scan_ms: 10,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { error: data.error?.message || 'PLC compile failed' };
      }
      return { downloadHex: data.downloadHex as string };
    },

    setHasUnsavedChanges: (hasChanges: boolean) => {
      set(state => {
        state.hasUnsavedChanges = hasChanges;
      });
    },

    setError: (error: string | null) => {
      set(state => {
        state.error = error;
      });
    },
  }))
);
