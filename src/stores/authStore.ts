/**
 * 认证状态管理 Store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

// 用户信息接口
interface User {
  id: string;
  username: string;
  email: string;
  fullName?: string;
}

// 认证状态接口
interface AuthState {
  // 状态
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // 操作
  register: (username: string, email: string, password: string, fullName?: string) => Promise<void>;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // 初始状态
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // 用户注册
      register: async (username, email, password, fullName) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, fullName }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || '注册失败');
          }

          set({ isLoading: false });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      // 用户登录
      login: async (usernameOrEmail, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernameOrEmail, password }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || '登录失败');
          }

          const data = await response.json();

          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      // 用户登出
      logout: async () => {
        const { refreshToken } = get();

        try {
          if (refreshToken) {
            await fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });
          }
        } catch (error) {
          console.error('登出请求失败:', error);
        } finally {
          // 无论后端请求是否成功，都清除本地状态
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      // 刷新访问令牌
      refreshAccessToken: async () => {
        const { refreshToken } = get();

        if (!refreshToken) {
          throw new Error('无刷新令牌');
        }

        try {
          const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            // 刷新令牌无效，清除认证状态
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
            });
            throw new Error('刷新令牌无效');
          }

          const data = await response.json();

          set({
            accessToken: data.accessToken,
          });
        } catch (error) {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      // 修改密码
      changePassword: async (oldPassword, newPassword) => {
        const { accessToken } = get();

        if (!accessToken) {
          throw new Error('未登录');
        }

        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE}/auth/change-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ oldPassword, newPassword }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || '修改密码失败');
          }

          // 修改密码成功后，需要重新登录
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
          });
          throw error;
        }
      },

      // 清除错误
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: state => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
