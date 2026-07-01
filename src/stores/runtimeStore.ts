import { create } from 'zustand';
import { useAuthStore } from './authStore';

export interface RuntimeValue {
  address: string;
  value: boolean | number | string;
  quality: 'good' | 'bad';
  timestamp: number;
}

interface WebSocketMessage {
  type: 'connection_status' | 'batch_update' | 'tag_update' | 'plc_status';
  payload: {
    status?: 'connected' | 'disconnected';
    projectId?: string;
    plcStatus?: 'running' | 'stopped';
    updates?: Array<{
      address: string;
      value: boolean | number | string;
      quality: 'good' | 'bad';
    }>;
    update?: {
      address: string;
      value: boolean | number | string;
      quality: 'good' | 'bad';
    };
  };
}

interface RuntimeState {
  isOnline: boolean;
  plcStatus: 'running' | 'stopped' | 'unknown';
  runtimeValues: Map<string, RuntimeValue>;
  watchAddresses: string[];
  eventLog: Array<{
    id: string;
    timestamp: number;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>;
  projectId: string | null;
  wsConnection: WebSocket | null;
  connectionError: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  reconnectTimeout: number | null;
}

interface RuntimeActions {
  connect: (projectId: string) => void;
  disconnect: () => void;
  reconnect: (projectId: string) => void;
  subscribeAddresses: (addresses: string[]) => void;
  unsubscribeAddresses: (addresses: string[]) => void;
  writeValue: (address: string, value: unknown) => void;
  startPLC: () => void;
  stopPLC: () => void;
  addWatchAddress: (address: string) => void;
  removeWatchAddress: (address: string) => void;
  clearWatchAddresses: () => void;
  addEvent: (event: Omit<RuntimeState['eventLog'][0], 'id' | 'timestamp'>) => void;
  clearEventLog: () => void;
  updateRuntimeValues: (
    updates: Array<{ address: string; value: unknown; quality: 'good' | 'bad' }>
  ) => void;
  getRuntimeValue: (address: string) => RuntimeValue | undefined;
  clearValues: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

export const useRuntimeStore = create<RuntimeState & RuntimeActions>((set, get) => ({
  isOnline: false,
  plcStatus: 'unknown',
  runtimeValues: new Map(),
  watchAddresses: [],
  eventLog: [],
  projectId: null,
  wsConnection: null,
  connectionError: null,
  reconnectAttempt: 0,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectTimeout: null,

  connect: (projectId: string) => {
    const existingConnection = get().wsConnection;
    const existingTimeout = get().reconnectTimeout;

    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
      existingConnection.close();
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const token = useAuthStore.getState().accessToken;
    const wsUrl = token
      ? `${wsBase}/ws?project=${projectId}&token=${encodeURIComponent(token)}`
      : `${wsBase}/ws?project=${projectId}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('📡 Runtime WebSocket 连接成功:', projectId);
      set({
        isOnline: true,
        connectionError: null,
        projectId,
        plcStatus: 'unknown',
        reconnectAttempt: 0,
        reconnectTimeout: null,
      });
      get().addEvent({ severity: 'info', message: `WebSocket 已连接：${projectId}` });
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'connection_status') {
          console.log('📡 连接状态:', message.payload.status);
          set({ isOnline: message.payload.status === 'connected' });
          get().addEvent({
            severity: 'info',
            message: `连接状态：${message.payload.status}`,
          });
        } else if (message.type === 'batch_update') {
          get().updateRuntimeValues(message.payload.updates || []);
        } else if (message.type === 'tag_update') {
          const update = message.payload.update;
          if (update) {
            get().updateRuntimeValues([update]);
          }
        } else if (message.type === 'plc_status') {
          set({ plcStatus: message.payload.plcStatus || 'unknown' });
          get().addEvent({
            severity: 'info',
            message: `PLC 状态：${message.payload.plcStatus || 'unknown'}`,
          });
        }
      } catch (error) {
        console.error('❌ 解析 WebSocket 消息失败:', error);
      }
    };

    ws.onerror = (event: Event) => {
      console.error('❌ WebSocket 错误:', event);
      set({
        connectionError: 'WebSocket 连接错误',
        isOnline: false,
      });
      get().addEvent({ severity: 'error', message: 'WebSocket 连接错误' });
    };

    ws.onclose = () => {
      console.log('📡 WebSocket 连接关闭');
      set({
        isOnline: false,
        wsConnection: null,
        plcStatus: 'unknown',
      });
      get().addEvent({ severity: 'warning', message: 'WebSocket 连接关闭' });

      // Auto-reconnect logic
      const { reconnectAttempt, maxReconnectAttempts } = get();
      if (reconnectAttempt < maxReconnectAttempts) {
        const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempt), 30000);
        console.log(
          `🔄 将在 ${delay}ms 后尝试重连 (${reconnectAttempt + 1}/${maxReconnectAttempts})`
        );

        const timeout = window.setTimeout(() => {
          get().reconnect(projectId);
        }, delay);

        set({ reconnectTimeout: timeout, reconnectAttempt: reconnectAttempt + 1 });
      } else {
        console.log('❌ 达到最大重连次数，停止重连');
        get().addEvent({ severity: 'error', message: 'WebSocket 重连失败，请手动刷新页面' });
      }
    };

    set({ wsConnection: ws });
  },

  reconnect: (projectId: string) => {
    console.log(`🔄 正在尝试重连到项目: ${projectId}`);
    get().addEvent({ severity: 'info', message: `正在尝试重连...` });
    get().connect(projectId);
  },

  disconnect: () => {
    const ws = get().wsConnection;
    const timeout = get().reconnectTimeout;

    if (timeout) {
      window.clearTimeout(timeout);
    }

    if (ws) {
      ws.close();
    }

    set({
      wsConnection: null,
      isOnline: false,
      projectId: null,
      connectionError: null,
      plcStatus: 'unknown',
      reconnectAttempt: 0,
      reconnectTimeout: null,
    });
  },

  subscribeAddresses: (addresses: string[]) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { addresses },
        })
      );
      console.log('📧 订阅地址:', addresses);
      if (addresses.length > 0) {
        get().addEvent({ severity: 'info', message: `订阅地址：${addresses.join(', ')}` });
      }
    } else {
      console.warn('⚠️ WebSocket 未连接，无法订阅');
    }
  },

  unsubscribeAddresses: (addresses: string[]) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          payload: { addresses },
        })
      );
      if (addresses.length > 0) {
        get().addEvent({ severity: 'info', message: `取消订阅：${addresses.join(', ')}` });
      }
    }
  },

  writeValue: (address: string, value: unknown) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'write_value',
          payload: { address, value },
        })
      );
      console.log('✏️ 写入:', address, '=', value);
      get().addEvent({ severity: 'info', message: `写入 ${address} = ${String(value)}` });
    } else {
      console.warn('⚠️ WebSocket 未连接，无法写入值');
    }
  },

  startPLC: () => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'plc_control',
          payload: { action: 'start' },
        })
      );
      get().addEvent({ severity: 'info', message: 'PLC 运行请求已发送' });
    }
  },

  stopPLC: () => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'plc_control',
          payload: { action: 'stop' },
        })
      );
      get().addEvent({ severity: 'info', message: 'PLC 停止请求已发送' });
    }
  },

  addWatchAddress: (address: string) => {
    set(state => {
      const setAddr = new Set(state.watchAddresses);
      setAddr.add(address);
      return { watchAddresses: Array.from(setAddr) };
    });
  },

  removeWatchAddress: (address: string) => {
    set(state => ({
      watchAddresses: state.watchAddresses.filter(addr => addr !== address),
    }));
  },

  clearWatchAddresses: () => {
    set({ watchAddresses: [] });
  },

  addEvent: event => {
    const id = Math.random().toString(36).slice(2, 9);
    set(state => ({
      eventLog: [
        {
          id,
          timestamp: Date.now(),
          ...event,
        },
        ...state.eventLog,
      ].slice(0, 200),
    }));
  },

  clearEventLog: () => {
    set({ eventLog: [] });
  },

  updateRuntimeValues: updates => {
    const runtimeValues = new Map(get().runtimeValues);
    const now = Date.now();

    updates.forEach(({ address, value, quality }) => {
      runtimeValues.set(address, {
        address,
        value,
        quality,
        timestamp: now,
      });
    });

    set({ runtimeValues });
  },

  getRuntimeValue: (address: string) => {
    return get().runtimeValues.get(address);
  },

  clearValues: () => {
    set({ runtimeValues: new Map() });
  },
}));
