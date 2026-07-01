/**
 * 用户菜单组件 - 显示当前用户信息和操作
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../src/stores/authStore';
import { AuthModal } from './AuthModal';
import { ChangePasswordDialog } from './ChangePasswordDialog';

export const UserMenu: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleLogout = async () => {
    await logout();
    setShowMenu(false);
  };

  if (!isAuthenticated || !user) {
    // 未登录状态：显示登录按钮
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">login</span>
          <span className="font-medium">登录</span>
        </button>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          initialMode="login"
        />
      </>
    );
  }

  // 已登录状态：显示用户信息和菜单
  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
            {user.fullName?.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}
          </div>
          <div className="text-left hidden md:block">
            <div className="text-sm font-medium text-slate-800">
              {user.fullName || user.username}
            </div>
            <div className="text-xs text-slate-500">{user.email}</div>
          </div>
          <span className="material-symbols-outlined text-slate-400">
            {showMenu ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
            <div className="px-4 py-2 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-800">
                {user.fullName || user.username}
              </div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>

            <button
              onClick={() => {
                setShowChangePassword(true);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">lock_reset</span>
              修改密码
            </button>

            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              登出
            </button>
          </div>
        )}
      </div>

      <ChangePasswordDialog
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </>
  );
};
