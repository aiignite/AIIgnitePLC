/**
 * UI 状态管理 Store
 */

import { create } from 'zustand';

type ViewMode = 'editor' | 'monitor' | 'diagnostics';
type Panel = 'inspector' | 'ai-copilot' | 'tag-list';

interface UIState {
  // 布局状态
  sidebarCollapsed: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // 视图模式
  viewMode: ViewMode;

  // 面板状态
  openPanels: Set<Panel>;
  activePanel: Panel | null;

  // 对话框状态
  dialogs: {
    newProject: boolean;
    newFolder: boolean;
    newBlock: boolean;
    settings: boolean;
  };

  // 通知状态
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: number;
  }>;

  // 操作
  toggleSidebar: () => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setViewMode: (mode: ViewMode) => void;
  togglePanel: (panel: Panel) => void;
  setActivePanel: (panel: Panel | null) => void;
  openDialog: (dialog: keyof UIState['dialogs']) => void;
  closeDialog: (dialog: keyof UIState['dialogs']) => void;
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useUIStore = create<UIState>(set => ({
  // 初始状态
  sidebarCollapsed: false,
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  viewMode: 'editor',
  openPanels: new Set<Panel>(['inspector']),
  activePanel: 'inspector',
  dialogs: {
    newProject: false,
    newFolder: false,
    newBlock: false,
    settings: false,
  },
  notifications: [],

  // 切换侧边栏
  toggleSidebar: () => {
    set(state => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  // 设置左侧面板宽度
  setLeftPanelWidth: width => {
    set({ leftPanelWidth: Math.max(200, Math.min(600, width)) });
  },

  // 设置右侧面板宽度
  setRightPanelWidth: width => {
    set({ rightPanelWidth: Math.max(250, Math.min(800, width)) });
  },

  // 设置视图模式
  setViewMode: mode => {
    set({ viewMode: mode });
  },

  // 切换面板显示
  togglePanel: panel => {
    set(state => {
      const newOpenPanels = new Set(state.openPanels);
      if (newOpenPanels.has(panel)) {
        newOpenPanels.delete(panel);
        return {
          openPanels: newOpenPanels,
          activePanel: state.activePanel === panel ? null : state.activePanel,
        };
      } else {
        newOpenPanels.add(panel);
        return {
          openPanels: newOpenPanels,
          activePanel: panel,
        };
      }
    });
  },

  // 设置活动面板
  setActivePanel: panel => {
    set({ activePanel: panel });
  },

  // 打开对话框
  openDialog: dialog => {
    set(state => ({
      dialogs: { ...state.dialogs, [dialog]: true },
    }));
  },

  // 关闭对话框
  closeDialog: dialog => {
    set(state => ({
      dialogs: { ...state.dialogs, [dialog]: false },
    }));
  },

  // 添加通知
  addNotification: notification => {
    const id = Math.random().toString(36).substring(7);
    set(state => ({
      notifications: [...state.notifications, { ...notification, id, timestamp: Date.now() }],
    }));

    // 自动移除成功通知
    if (notification.type === 'success') {
      setTimeout(() => {
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        }));
      }, 3000);
    }
  },

  // 移除通知
  removeNotification: id => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }));
  },

  // 清除所有通知
  clearNotifications: () => {
    set({ notifications: [] });
  },
}));
