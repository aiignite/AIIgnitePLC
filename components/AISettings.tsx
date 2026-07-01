import React from 'react';
import { AIProvider, useAIStore } from '../src/stores/aiStore';

interface AISettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetSettings } = useAIStore();

  if (!isOpen) return null;

  const providers: { id: AIProvider; name: string; icon: string }[] = [
    { id: 'openai', name: 'OpenAI (兼容)', icon: 'cloud' },
    { id: 'anthropic', name: 'Anthropic', icon: 'auto_awesome' },
    { id: 'ollama', name: 'Ollama', icon: 'terminal' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[500px] flex flex-col bg-white border border-slate-200 shadow-2xl rounded-xl overflow-hidden text-slate-700 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">settings_suggest</span>
            <h2 className="text-lg font-bold">AI 助手设置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 block px-0.5">模型供应商</label>
            <div className="grid grid-cols-3 gap-2">
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => updateSettings({ provider: p.id })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                    ${
                      settings.provider === p.id
                        ? 'border-primary bg-blue-50/50 text-primary ring-1 ring-primary/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{p.icon}</span>
                  <span className="text-xs font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                模型名称 (Model)
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={e => updateSettings({ model: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                placeholder={settings.provider === 'ollama' ? 'e.g. deepseek-coder' : 'e.g. gpt-4o'}
              />
            </div>
            {settings.provider !== 'ollama' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  API Key
                </label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={e => updateSettings({ apiKey: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="sk-..."
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              API 代理/基址 (Base URL)
              {settings.provider === 'ollama' && (
                <span className="text-primary ml-2 font-normal">
                  默认: http://localhost:11434/api
                </span>
              )}
            </label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={e => updateSettings({ baseUrl: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              助手提示词 (System Prompt)
            </label>
            <textarea
              value={settings.systemPrompt}
              onChange={e => updateSettings({ systemPrompt: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 h-32 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
              placeholder="告诉 AI 它扮演的角色..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-3">
          <button
            onClick={resetSettings}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            恢复默认
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-blue-600 transition-all shadow-md shadow-primary/20 active:scale-95"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
