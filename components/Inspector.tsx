import React, { useState } from 'react';
import { LadderElement } from '../types';

interface InspectorProps {
  selectedElement: LadderElement | null;
  onUpdateElement: (id: string, field: keyof LadderElement, value: string) => void;
}

type MainTab = 'general' | 'diagnostics' | 'constants' | 'texts';
type GeneralSubTab = 'info' | 'time' | 'io';

export const Inspector: React.FC<InspectorProps> = ({ selectedElement, onUpdateElement }) => {
  const [mainTab, setMainTab] = useState<MainTab>('general');
  const [subTab, setSubTab] = useState<GeneralSubTab>('info');

  const renderContent = () => {
    if (!selectedElement) {
      return (
         <div className="flex items-center justify-center h-full text-slate-400">
             <div className="flex flex-col items-center gap-2">
                 <span className="material-symbols-outlined text-4xl opacity-20">settings_applications</span>
                 <p className="text-xs">请在上方梯形图编辑器中选择一个指令以查看属性</p>
             </div>
          </div>
      );
    }

    if (mainTab === 'diagnostics') {
        return (
            <div className="p-4">
                <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">诊断信息 (Diagnostics)</h5>
                <table className="w-full text-xs text-left border-collapse border border-slate-300">
                    <thead className="bg-slate-100 font-bold text-slate-700">
                        <tr>
                            <th className="p-2 border border-slate-300">严重性</th>
                            <th className="p-2 border border-slate-300">时间戳</th>
                            <th className="p-2 border border-slate-300">消息</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="p-2 border border-slate-300 text-green-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span> OK</td>
                            <td className="p-2 border border-slate-300 font-mono">10:24:55:00 ms</td>
                            <td className="p-2 border border-slate-300">硬件配置加载成功</td>
                        </tr>
                        <tr>
                            <td className="p-2 border border-slate-300 text-slate-500">Info</td>
                            <td className="p-2 border border-slate-300 font-mono">10:25:01:15 ms</td>
                            <td className="p-2 border border-slate-300">在线连接已建立</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    if (mainTab === 'constants') {
        return (
            <div className="p-4">
                <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">系统常量 (System constants)</h5>
                 <table className="w-full text-xs text-left border-collapse border border-slate-300">
                    <thead className="bg-slate-100 font-bold text-slate-700">
                        <tr>
                            <th className="p-2 border border-slate-300 w-8">#</th>
                            <th className="p-2 border border-slate-300">常量名称</th>
                            <th className="p-2 border border-slate-300">数据类型</th>
                            <th className="p-2 border border-slate-300">值</th>
                            <th className="p-2 border border-slate-300">注释</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="p-1 text-center border border-slate-300 bg-slate-50">1</td>
                            <td className="p-1 border border-slate-300">Local~Common</td>
                            <td className="p-1 border border-slate-300">Hw_IoSystem</td>
                            <td className="p-1 border border-slate-300 font-mono">261</td>
                            <td className="p-1 border border-slate-300 italic text-slate-400">系统生成</td>
                        </tr>
                        <tr>
                            <td className="p-1 text-center border border-slate-300 bg-slate-50">2</td>
                            <td className="p-1 border border-slate-300">User_Const_1</td>
                            <td className="p-1 border border-slate-300">Int</td>
                            <td className="p-1 border border-slate-300 font-mono">100</td>
                            <td className="p-1 border border-slate-300">--</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    if (mainTab === 'texts') {
        return (
             <div className="p-4">
                <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">多语言文本 (Texts)</h5>
                 <div className="grid grid-cols-[150px_1fr] gap-4 text-xs">
                     <label className="font-bold text-right pt-1">名称 (中文):</label>
                     <input type="text" className="border border-slate-300 p-1 w-full max-w-md" value={selectedElement.tag} readOnly />
                     
                     <label className="font-bold text-right pt-1">Name (English):</label>
                     <input type="text" className="border border-slate-300 p-1 w-full max-w-md" placeholder="Enter English translation..." />
                     
                     <label className="font-bold text-right pt-1">注释 (中文):</label>
                     <textarea className="border border-slate-300 p-1 w-full max-w-md h-20" value={selectedElement.comment || ''} readOnly />
                     
                     <label className="font-bold text-right pt-1">Comment (English):</label>
                     <textarea className="border border-slate-300 p-1 w-full max-w-md h-20" placeholder="Enter English comment..." />
                 </div>
             </div>
        );
    }

    // Default: General Tab Logic
    if (subTab === 'time') {
        return (
            <div className="p-4 max-w-lg">
                <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">时间设置 (Time settings)</h5>
                 <div className="space-y-4">
                     {selectedElement.type === 'box_timer' ? (
                         <>
                            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                                <label className="block text-xs font-bold mb-1">预设时间 (PT):</label>
                                <input 
                                    className="w-full border border-yellow-300 rounded p-1 text-sm font-mono" 
                                    value={selectedElement.parameters?.find(p => p.name === 'PT')?.value || 'T#0s'} 
                                    readOnly 
                                />
                                <p className="text-[10px] text-slate-500 mt-1">格式: T#Day_Hour_Min_Sec_MS</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="ret" className="rounded border-slate-300" />
                                <label htmlFor="ret" className="text-xs">启用保持性 (Retentive)</label>
                            </div>
                         </>
                     ) : (
                         <p className="text-xs text-slate-500 italic">当前选中的元件不支持时间配置。</p>
                     )}
                 </div>
            </div>
        );
    }

    if (subTab === 'io') {
         return (
            <div className="p-4 max-w-lg">
                <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">输入/输出参数 (Input/Output)</h5>
                <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-4 text-xs items-center">
                    <label className="text-right text-slate-500">操作数:</label>
                    <div className="font-mono font-bold bg-slate-100 px-2 py-1 border border-slate-200">{selectedElement.tag}</div>
                    
                    <label className="text-right text-slate-500">绝对地址:</label>
                    <div className="font-mono text-purple-700 font-bold">{selectedElement.address}</div>
                    
                    <label className="text-right text-slate-500">数据类型:</label>
                    <select className="border border-slate-300 rounded p-1 bg-white">
                        <option>Bool</option>
                        <option>Byte</option>
                        <option>Word</option>
                    </select>

                    <label className="text-right text-slate-500">连接状态:</label>
                    <div className="flex items-center gap-1 text-green-600">
                        <span className="material-symbols-outlined text-[14px]">link</span> 已连接
                    </div>
                </div>
            </div>
         );
    }

    // General -> Info (Default)
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl p-4">
            {/* Column 1 */}
            <div>
              <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200 flex items-center gap-2">
                 <span className="material-symbols-outlined text-primary text-[18px]">tune</span>
                 常规属性: {selectedElement.tag}
              </h5>
              
              <div className="space-y-3">
                <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                  <label className="text-xs text-slate-500 text-right">名称 (Name):</label>
                  <input 
                    type="text" 
                    value={selectedElement.tag}
                    onChange={(e) => onUpdateElement(selectedElement.id, 'tag', e.target.value)}
                    className="text-xs font-bold border border-slate-300 rounded px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                  <label className="text-xs text-slate-500 text-right">地址 (Address):</label>
                  <div className="relative">
                      <input 
                        type="text" 
                        value={selectedElement.address}
                        onChange={(e) => onUpdateElement(selectedElement.id, 'address', e.target.value)}
                        className="w-full text-xs font-mono text-slate-700 border border-slate-300 rounded px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-orange-500 font-bold">%</span>
                  </div>
                </div>
                 <div className="grid grid-cols-[100px_1fr] items-start gap-2">
                  <label className="text-xs text-slate-500 text-right mt-1">注释:</label>
                  <textarea 
                    value={selectedElement.comment || ''}
                    onChange={(e) => onUpdateElement(selectedElement.id, 'comment', e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2 py-1 focus:border-primary outline-none h-16 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Column 2 */}
            <div>
              <h5 className="font-bold text-slate-800 text-sm mb-4 pb-1 border-b border-slate-200">属性配置</h5>
              <div className="space-y-3">
                 <div className="flex items-center gap-2">
                    <input type="checkbox" id="chk1" className="rounded border-slate-300 text-primary" defaultChecked />
                    <label htmlFor="chk1" className="text-xs text-slate-700">在 HMI / OPC UA 中可见</label>
                 </div>
                 <div className="flex items-center gap-2">
                    <input type="checkbox" id="chk2" className="rounded border-slate-300 text-primary" disabled />
                    <label htmlFor="chk2" className="text-xs text-slate-400">保持性 (需要全局设置)</label>
                 </div>
              </div>
            </div>
        </div>
    );
  };

  return (
    <div className="h-full bg-white border-t border-slate-300 flex flex-col shrink-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Inspector Top Tabs */}
      <div className="flex bg-slate-100 border-b border-slate-300 shrink-0">
        <button 
            onClick={() => setMainTab('general')}
            className={`px-4 py-1 text-xs font-bold border-r border-slate-300 pt-2 ${mainTab === 'general' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            常规 (General)
        </button>
        <button 
            onClick={() => setMainTab('diagnostics')}
            className={`px-4 py-1 text-xs font-bold border-r border-slate-300 pt-2 ${mainTab === 'diagnostics' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            诊断 (Diagnostics)
        </button>
        <button 
            onClick={() => setMainTab('constants')}
            className={`px-4 py-1 text-xs font-bold border-r border-slate-300 pt-2 ${mainTab === 'constants' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            属性 (System constants)
        </button>
        <button 
            onClick={() => setMainTab('texts')}
            className={`px-4 py-1 text-xs font-bold border-r border-slate-300 pt-2 ${mainTab === 'texts' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            文本 (Texts)
        </button>
      </div>

      <div className="flex-1 p-0 overflow-hidden flex min-h-0">
         {/* Left Navigation Tree in Inspector (Only for General Tab) */}
         {mainTab === 'general' && (
            <div className="w-48 border-r border-slate-200 bg-slate-50 p-2 overflow-y-auto hidden md:block shrink-0">
                <div className="text-xs font-bold text-slate-700 mb-2 pl-1">常规设置</div>
                <ul className="space-y-0.5">
                    <li 
                        onClick={() => setSubTab('info')}
                        className={`px-2 py-1.5 rounded text-xs cursor-pointer ${subTab === 'info' ? 'bg-blue-100 text-primary font-medium' : 'hover:bg-slate-200 text-slate-600'}`}
                    >
                        常规信息
                    </li>
                    <li 
                        onClick={() => setSubTab('time')}
                        className={`px-2 py-1.5 rounded text-xs cursor-pointer ${subTab === 'time' ? 'bg-blue-100 text-primary font-medium' : 'hover:bg-slate-200 text-slate-600'}`}
                    >
                        时间设置
                    </li>
                    <li 
                        onClick={() => setSubTab('io')}
                        className={`px-2 py-1.5 rounded text-xs cursor-pointer ${subTab === 'io' ? 'bg-blue-100 text-primary font-medium' : 'hover:bg-slate-200 text-slate-600'}`}
                    >
                        输入/输出
                    </li>
                </ul>
            </div>
         )}

         {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};