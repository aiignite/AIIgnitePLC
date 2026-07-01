/**
 * 认证模态框组件 - 登录/注册
 */

import React, { useState } from 'react';
import { useAuthStore } from '../src/stores/authStore';

type AuthMode = 'login' | 'register';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, register, isLoading, error, clearError } = useAuthStore();

  // 清除错误提示
  const handleInputChange = () => {
    if (error) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      if (mode === 'login') {
        await login(username || email, password);
      } else {
        await register(username, email, password, fullName);
      }
      onClose();
    } catch (_err) {
      // 错误已在 store 中设置
    }
  };

  const switchMode = () => {
    setMode(prev => (prev === 'login' ? 'register' : 'login'));
    clearError();
    // 清空表单
    setUsername('');
    setEmail('');
    setPassword('');
    setFullName('');
  };

  const handleClose = () => {
    setMode(initialMode);
    setUsername('');
    setEmail('');
    setPassword('');
    setFullName('');
    clearError();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] bg-white rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xl font-bold text-siemens-dark flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">login</span>
            {mode === 'login' ? '用户登录' : '用户注册'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-200 rounded transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-start gap-2">
              <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">用户名 *</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      handleInputChange();
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="3-50个字符，仅字母、数字、下划线"
                    pattern="^[a-zA-Z0-9_]{3,50}$"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">邮箱 *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value);
                      handleInputChange();
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    姓名（可选）
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => {
                      setFullName(e.target.value);
                      handleInputChange();
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="您的姓名"
                  />
                </div>
              </>
            )}

            {mode === 'login' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  用户名或邮箱 *
                </label>
                <input
                  type="text"
                  value={username || email}
                  onChange={e => {
                    setUsername(e.target.value);
                    setEmail(e.target.value);
                    handleInputChange();
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder="输入用户名或邮箱"
                  required
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">密码 *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    handleInputChange();
                  }}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder={mode === 'register' ? '至少8位，包含大小写字母和数字' : '输入密码'}
                  pattern={
                    mode === 'register' ? '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$' : undefined
                  }
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
                >
                  <span className="material-symbols-outlined text-slate-400">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {mode === 'register' && (
                <p className="mt-1 text-xs text-slate-500">
                  密码要求：至少8位，包含大写字母、小写字母和数字
                </p>
              )}
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isLoading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
              </button>
            </div>
          </form>

          {/* 切换模式 */}
          <div className="mt-4 text-center text-sm text-slate-600">
            {mode === 'login' ? (
              <>
                还没有账户？{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-primary hover:underline font-medium"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账户？{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-primary hover:underline font-medium"
                >
                  立即登录
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
