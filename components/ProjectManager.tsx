import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../src/services/authFetch';
import { useAuthStore } from '../src/stores/authStore';
import { useProjectStore } from '../src/stores/projectStore';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'new' | 'open' | 'save';
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  isOpen,
  onClose,
  mode: initialMode,
}) => {
  const [mode, setMode] = useState<'new' | 'open' | 'save'>(initialMode);
  const [projects, setProjects] = useState<any[]>([]);
  const {
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    loadProjectTree,
    currentProject,
  } = useProjectStore();
  const { user, isAuthenticated } = useAuthStore();
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

  // Form state for new project
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [sortOrder, setSortOrder] = useState<'updated_desc' | 'updated_asc' | 'name_asc'>(
    'updated_desc'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'new') {
      setNewProjectName('');
      setNewProjectDesc('');
      setIsPublic(false);
    }
    if (mode === 'open') {
      setSearchQuery('');
      setVisibilityFilter('all');
      setSortOrder('updated_desc');
      fetchProjects();
    }
  }, [isOpen, mode]);

  const fetchProjects = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const list = await loadProjects();
      setProjects(list);
    } catch (_e) {
      setError('无法获取项目列表');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setLoading(true);
    try {
      const project = await createProject(newProjectName, newProjectDesc, isPublic);
      // Automatically load the tree after creation
      await loadProjectTree(project.id);
      onClose();
    } catch (_e) {
      setError('创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (projectId: string) => {
    setLoading(true);
    try {
      setCurrentProject(projectId);
      await loadProjectTree(projectId);
      onClose();
    } catch (_e) {
      setError('加载项目失败');
      setLoading(false);
    }
  };

  const filteredProjects = [...projects]
    .filter(p => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(p.name || '')
          .toLowerCase()
          .includes(q) ||
        String(p.description || '')
          .toLowerCase()
          .includes(q)
      );
    })
    .filter(p => {
      if (visibilityFilter === 'public') return !p.created_by;
      if (visibilityFilter === 'private') return !!p.created_by;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'name_asc') {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return sortOrder === 'updated_asc' ? aTime - bTime : bTime - aTime;
    });

  const publicCount = projects.filter(p => !p.created_by).length;
  const privateCount = projects.length - publicCount;

  const handleMakePublic = async (projectId: string) => {
    if (loading) return;
    if (!confirm('确定将该项目设为公共吗？')) return;
    setLoading(true);
    try {
      await updateProject(projectId, { is_public: true });
      const list = await loadProjects();
      setProjects(list);
    } catch (_e) {
      setError('更新项目可见性失败');
    } finally {
      setLoading(false);
    }
  };

  const handleMakePrivate = async (projectId: string) => {
    if (loading) return;
    if (!confirm('确定将该项目设为私有吗？')) return;
    setLoading(true);
    try {
      await updateProject(projectId, { is_public: false });
      const list = await loadProjects();
      setProjects(list);
    } catch (_e) {
      setError('更新项目可见性失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (loading) return;
    if (!confirm('确定删除该项目吗？此操作不可撤销。')) return;
    setLoading(true);
    try {
      await deleteProject(projectId);
      const list = await loadProjects();
      setProjects(list);
    } catch (_e) {
      setError('删除项目失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[600px] h-[500px] flex flex-col bg-[#1e1e1e] border border-[#333] shadow-xl rounded-lg overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#252526]">
          <h2 className="text-lg font-medium flex items-center gap-2">
            {mode === 'new' && <span>➕ 新建项目</span>}
            {mode === 'open' && <span>📂 打开项目</span>}
            {mode === 'save' && <span>💾 导出项目</span>}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#333] rounded">
            ✖
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {mode === 'new' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">项目名称</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#333] rounded p-2 focus:border-blue-500 outline-none transition-colors"
                  placeholder="请输入项目名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述 (可选)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#333] rounded p-2 h-24 focus:border-blue-500 outline-none transition-colors resize-none"
                  placeholder="项目描述..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  className="accent-blue-500"
                />
                设为公共项目（所有登录用户可见）
              </label>
              <p className="text-xs text-gray-500">提示：公共项目对所有登录用户可见。</p>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded bg-[#333] hover:bg-[#444] transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || !newProjectName.trim()}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '创建中...' : '创建项目'}
                </button>
              </div>
            </form>
          )}

          {mode === 'open' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-400">选择要打开的项目</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void fetchProjects()}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => setMode('new')}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    新建项目
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#333] rounded p-2 text-sm focus:border-blue-500 outline-none transition-colors"
                placeholder="搜索项目名称/描述"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">显示：</span>
                <select
                  className="text-xs bg-[#1e1e1e] border border-[#333] rounded p-1"
                  value={visibilityFilter}
                  onChange={e =>
                    setVisibilityFilter(e.target.value as 'all' | 'public' | 'private')
                  }
                >
                  <option value="all">全部</option>
                  <option value="public">公共</option>
                  <option value="private">私有</option>
                </select>
                <span className="text-xs text-gray-500">排序：</span>
                <select
                  className="text-xs bg-[#1e1e1e] border border-[#333] rounded p-1"
                  value={sortOrder}
                  onChange={e =>
                    setSortOrder(e.target.value as 'updated_desc' | 'updated_asc' | 'name_asc')
                  }
                >
                  <option value="updated_desc">最近更新</option>
                  <option value="updated_asc">最早更新</option>
                  <option value="name_asc">名称</option>
                </select>
              </div>

              <div className="text-xs text-gray-500">
                显示 {filteredProjects.length} / {projects.length} ｜ 公共 {publicCount} / 私有{' '}
                {privateCount}
              </div>
              {loading && projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              ) : projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无项目</div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">没有匹配的项目</div>
              ) : (
                <div className="grid gap-2">
                  {filteredProjects.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleOpen(p.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpen(p.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-between p-3 rounded bg-[#252526] hover:bg-[#2d2d2d] border border-transparent hover:border-blue-500/30 transition-all text-left group"
                    >
                      <div>
                        <div className="font-medium text-blue-100 group-hover:text-blue-400 flex items-center gap-2">
                          <span>{p.name}</span>
                          {!p.created_by && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-400/40 text-blue-300 bg-blue-500/10">
                              公共
                            </span>
                          )}
                          {isAuthenticated && user?.id === p.created_by && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-400/40 text-slate-300 bg-slate-500/10">
                              私有
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{p.description || '无描述'}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-gray-600">
                          {new Date(p.updated_at).toLocaleDateString()}
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="复制项目ID"
                          className="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-300 bg-slate-500/10 hover:bg-slate-500/20"
                          onClick={e => {
                            e.stopPropagation();
                            void navigator.clipboard?.writeText(p.id);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              void navigator.clipboard?.writeText(p.id);
                            }
                          }}
                        >
                          复制ID
                        </span>
                        {isAuthenticated && user?.id === p.created_by && (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="设为公共"
                            className="text-[10px] px-2 py-1 rounded border border-blue-500/40 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20"
                            onClick={e => {
                              e.stopPropagation();
                              void handleMakePublic(p.id);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleMakePublic(p.id);
                              }
                            }}
                          >
                            设为公共
                          </span>
                        )}
                        {isAuthenticated && user?.id === p.created_by && (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="删除项目"
                            className="text-[10px] px-2 py-1 rounded border border-red-500/40 text-red-300 bg-red-500/10 hover:bg-red-500/20"
                            onClick={e => {
                              e.stopPropagation();
                              void handleDeleteProject(p.id);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleDeleteProject(p.id);
                              }
                            }}
                          >
                            删除
                          </span>
                        )}
                        {isAuthenticated && !p.created_by && (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="设为私有"
                            className="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-300 bg-slate-500/10 hover:bg-slate-500/20"
                            onClick={e => {
                              e.stopPropagation();
                              void handleMakePrivate(p.id);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleMakePrivate(p.id);
                              }
                            }}
                          >
                            设为私有
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'save' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#252526] rounded border border-[#333]">
                <h3 className="font-medium text-gray-200 mb-2">导出项目</h3>
                <p className="text-sm text-gray-400 mb-4">
                  根据 PR.md 设计文档，当前支持导出为 JSON 格式。未来将支持 Siemens .ap17 和 XML
                  交换格式。
                </p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
                    onClick={() => {
                      // Trigger existing simple save logic via specific call or closing this
                      // For now we just close and let parent handle, or we can move handleSaveProject here logic
                      // But parent has the state. Ideally parent passes 'onSave' callback.
                      onClose();
                    }}
                  >
                    确认导出 (.json)
                  </button>
                  <button
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-50"
                    disabled={!currentProject}
                    onClick={async () => {
                      if (!currentProject) return;
                      try {
                        const res = await fetchWithAuth(
                          `${API_BASE}/projects/${currentProject.id}/export/plcopen`
                        );
                        if (!res.ok) throw new Error('PLCopen XML 导出失败');
                        const xml = await res.text();
                        const blob = new Blob([xml], { type: 'application/xml' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `${currentProject.name}_plcopen.xml`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                      } catch (_e) {
                        alert((_e as Error).message);
                      }
                    }}
                  >
                    导出 PLCopen XML
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#252526] rounded border border-[#333] opacity-60">
                <h3 className="font-medium text-gray-200 mb-2">Siemens TIA Portal 格式</h3>
                <p className="text-sm text-gray-400">即将支持 .ap17 / .scl / .xml 导出。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
