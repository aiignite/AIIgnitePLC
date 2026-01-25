import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- Types ---
interface Module {
  slot: number;
  name: string;
  articleNumber: string;
  firmware: string;
  type: 'ps' | 'cpu' | 'io' | 'comm' | 'empty';
  image?: string;
  // Extended Properties
  ip?: string;
  subnet?: string;
  ioStart?: number;
  ioLength?: number;
  hwId?: number;
  comment?: string;
}

// --- Initial Data ---
const INITIAL_MODULES: Module[] = [
  { slot: 1, name: 'PM 190W', articleNumber: '6EP1333-4BA00', firmware: '-', type: 'ps', hwId: 257 },
  { slot: 2, name: 'CPU 1511-1 PN', articleNumber: '6ES7 511-1AK02-0AB0', firmware: 'V2.9', type: 'cpu', ip: '192.168.0.1', subnet: '255.255.255.0', hwId: 64 },
  { slot: 3, name: 'DI 16x24VDC HF', articleNumber: '6ES7 521-1BH00-0AB0', firmware: 'V1.1', type: 'io', ioStart: 0, ioLength: 2, hwId: 263 },
  { slot: 4, name: 'DQ 16x24VDC/0.5A', articleNumber: '6ES7 522-1BH01-0AB0', firmware: 'V1.1', type: 'io', ioStart: 0, ioLength: 2, hwId: 264 },
  { slot: 5, name: 'AI 8xU/I/RTD/TC', articleNumber: '6ES7 531-7KF00-0AB0', firmware: 'V1.0', type: 'io', ioStart: 64, ioLength: 16, hwId: 265 },
];

// --- Hardware Catalog Mock Data ---
const CATALOG = [
    { name: 'DI 32x24VDC HF', article: '6ES7 521-1BL00-0AB0', type: 'io' as const, ioLength: 4 },
    { name: 'DQ 32x24VDC/0.5A', article: '6ES7 522-1BL01-0AB0', type: 'io' as const, ioLength: 4 },
    { name: 'AI 4xU/I/RTD/TC', article: '6ES7 531-7QD00-0AB0', type: 'io' as const, ioLength: 8 },
    { name: 'CP 1543-1', article: '6GK7 543-1AX00-0XE0', type: 'comm' as const },
];

type ConfigViewMode = 'device' | 'network' | 'topology';
type InspectorTab = 'general' | 'profinet' | 'io' | 'hw_id';

export const DeviceConfiguration: React.FC = () => {
  const [modules, setModules] = useState<Module[]>(INITIAL_MODULES);
  const [selectedSlot, setSelectedSlot] = useState<number>(2);
  const [viewMode, setViewMode] = useState<ConfigViewMode>('device');
  const [showCatalog, setShowCatalog] = useState<{slot: number, visible: boolean}>({ slot: -1, visible: false });
  
  // Inspector State
  const [inspectorHeight, setInspectorHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>('general');

  // --- Handlers ---

  const handleUpdateModule = (slot: number, field: keyof Module, value: string | number) => {
      setModules(prev => prev.map(m => m.slot === slot ? { ...m, [field]: value } : m));
  };

  const handleDeleteModule = (slot: number) => {
      if (confirm(`确定要删除槽位 ${slot} 的模块吗?`)) {
          setModules(prev => prev.filter(m => m.slot !== slot));
          setSelectedSlot(-1); // Deselect
      }
  };

  const handleInsertModule = (template: typeof CATALOG[0]) => {
      const newModule: Module = {
          slot: showCatalog.slot,
          name: template.name,
          articleNumber: template.article,
          firmware: 'V1.0',
          type: template.type,
          hwId: 270 + modules.length, // Mock logic
          ioStart: template.type === 'io' ? 100 : undefined,
          ioLength: (template as any).ioLength,
          ip: template.type === 'comm' ? '192.168.0.20' : undefined
      };
      setModules(prev => [...prev, newModule]);
      setShowCatalog({ slot: -1, visible: false });
      setSelectedSlot(newModule.slot);
  };

  const getModuleAtSlot = (slot: number) => modules.find(m => m.slot === slot);

  // --- Resizing Logic ---
  const startResizing = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
  };

  const stopResizing = useCallback(() => {
      setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
      if (isResizing) {
          const newHeight = window.innerHeight - e.clientY;
          if (newHeight > 100 && newHeight < 600) {
              setInspectorHeight(newHeight);
          }
      }
  }, [isResizing]);

  useEffect(() => {
      if (isResizing) {
          window.addEventListener('mousemove', resize);
          window.addEventListener('mouseup', stopResizing);
      }
      return () => {
          window.removeEventListener('mousemove', resize);
          window.removeEventListener('mouseup', stopResizing);
      };
  }, [isResizing, resize, stopResizing]);


  // --- Renderers ---

  const renderDeviceView = () => (
    <div className="flex-1 overflow-auto p-8 flex items-start justify-center bg-slate-100 relative h-full min-h-0">
        {/* DIN Rail */}
        <div className="relative flex flex-col items-center select-none scale-90 md:scale-100 transition-transform origin-top">
            {/* The Rail Bar */}
            <div className="h-4 w-[600px] bg-slate-400 border border-slate-500 shadow-inner mb-0.5 rounded-sm"></div>
            
            {/* Rack Container */}
            <div className="flex bg-slate-200 border border-slate-400 p-1 shadow-xl min-h-[220px]">
                {/* Render Slots 1 to 10 */}
                {Array.from({ length: 10 }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const mod = getModuleAtSlot(slotNum);
                    const isSelected = selectedSlot === slotNum;

                    if (mod) {
                        return (
                            <div 
                                key={slotNum}
                                onClick={() => setSelectedSlot(slotNum)}
                                className={`
                                    relative flex flex-col items-center border border-slate-400 bg-white transition-all cursor-pointer group
                                    ${mod.type === 'ps' ? 'w-16' : mod.type === 'cpu' ? 'w-24' : 'w-12'}
                                    ${isSelected ? 'ring-2 ring-primary z-10 shadow-lg' : 'hover:brightness-95'}
                                `}
                                style={{ height: '200px' }}
                            >
                                <div className="w-full h-5 bg-slate-700 text-white text-[9px] flex items-center justify-center font-bold">
                                    {mod.type === 'cpu' ? 'CPU' : mod.type === 'ps' ? 'PS' : mod.type === 'comm' ? 'CP' : 'IO'}
                                </div>
                                <div className="flex-1 w-full p-1 flex flex-col items-center justify-between">
                                     <div className="text-[9px] text-center font-bold leading-tight break-all w-full px-0.5 mt-1">
                                        {mod.name.split(' ')[0]}
                                     </div>
                                     <div className="flex flex-col gap-0.5 my-2 w-full px-2">
                                        <div className="flex justify-between items-center text-[7px] text-slate-500">
                                           <span>RUN</span>
                                           <div className={`size-1.5 rounded-full ${mod.type === 'cpu' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                                        </div>
                                        <div className="flex justify-between items-center text-[7px] text-slate-500">
                                           <span>ERR</span>
                                           <div className="size-1.5 rounded-full bg-slate-300"></div>
                                        </div>
                                     </div>
                                     <div className="w-full bg-slate-100 border border-slate-300 h-8 mt-auto mb-2 flex items-center justify-center gap-1">
                                        {mod.type === 'cpu' && (
                                            <>
                                                <div className="size-3 bg-slate-300 border border-slate-400 rounded-sm"></div>
                                                <div className="size-3 bg-slate-300 border border-slate-400 rounded-sm"></div>
                                            </>
                                        )}
                                        {mod.type === 'io' && (
                                            <div className="w-8 h-3 bg-slate-800 rounded-[1px]"></div>
                                        )}
                                     </div>
                                </div>
                                <div className="absolute -bottom-6 text-xs text-slate-500 font-bold">{mod.slot}</div>
                            </div>
                        );
                    } else {
                        // Empty Slot
                        return (
                            <div 
                                key={slotNum} 
                                onClick={() => setSelectedSlot(slotNum)}
                                className={`w-12 h-[200px] border-r border-slate-300 bg-slate-100/50 flex flex-col items-center justify-center text-slate-300 text-xs transition-colors hover:bg-slate-200 cursor-pointer
                                  ${isSelected ? 'bg-blue-50/50 ring-2 ring-primary/50 inset-0 z-0' : ''}
                                `}
                            >
                                {isSelected && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setShowCatalog({ slot: slotNum, visible: true }); }}
                                        className="size-6 bg-white border border-slate-300 rounded-full flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary shadow-sm"
                                        title="添加模块"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                    </button>
                                )}
                            </div>
                        );
                    }
                })}
            </div>
        </div>

        {/* Hardware Catalog Modal */}
        {showCatalog.visible && (
            <div className="absolute right-0 top-0 bottom-0 w-64 bg-white border-l border-slate-300 shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
                <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                    <h4 className="font-bold text-slate-700 text-xs">硬件目录 (Hardware Catalog)</h4>
                    <button onClick={() => setShowCatalog({ slot: -1, visible: false })} className="text-slate-500 hover:text-red-500">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2 pl-1">可用的模块 (Slot {showCatalog.slot})</div>
                    <div className="space-y-1">
                        {CATALOG.map((item) => (
                            <div 
                                key={item.article}
                                onClick={() => handleInsertModule(item)}
                                className="p-2 border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300 cursor-pointer flex flex-col gap-1 group"
                            >
                                <div className="text-xs font-bold text-slate-700 group-hover:text-primary">{item.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{item.article}</div>
                                <div className="text-[10px] text-slate-400 uppercase">{item.type.toUpperCase()}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
    </div>
  );

  const renderNetworkView = () => (
    <div className="flex-1 p-8 bg-white relative overflow-auto h-full">
        <h3 className="absolute top-4 left-4 font-bold text-slate-700 text-sm">PROFINET IO_System (100)</h3>
        
        {/* Note to user about editability */}
        <div className="absolute top-4 right-4 bg-yellow-50 text-yellow-800 text-xs px-2 py-1 border border-yellow-200 rounded">
            提示: 网络视图目前仅供查看，请在设备视图中编辑模块。
        </div>

        <div className="flex items-center gap-20 mt-10 ml-10">
            {/* PLC Node */}
            <div className="relative w-32 h-40 border-2 border-primary bg-slate-50 shadow-md flex flex-col group hover:shadow-lg transition-shadow">
                <div className="h-6 bg-primary text-white text-xs font-bold flex items-center justify-center">PLC_1</div>
                <div className="flex-1 p-2 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-slate-600">memory</span>
                    <span className="text-xs font-bold mt-2">CPU 1511-1 PN</span>
                    <span className="text-[10px] text-slate-500 mt-1">192.168.0.1</span>
                </div>
                {/* Port */}
                <div className="absolute -right-3 bottom-4 size-6 bg-green-500 border-2 border-white rounded-sm flex items-center justify-center text-[8px] text-white font-bold z-10 cursor-pointer hover:scale-110 transition-transform">P1</div>
            </div>

            {/* Connection Line */}
            <div className="h-1 bg-green-500 w-20 relative -ml-3 -mr-3 mt-24"></div>

            {/* Distributed IO */}
            <div className="relative w-32 h-40 border border-slate-300 bg-slate-50 shadow-sm flex flex-col group hover:shadow-lg transition-shadow">
                <div className="h-6 bg-slate-600 text-white text-xs font-bold flex items-center justify-center">IO_Device_1</div>
                <div className="flex-1 p-2 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-slate-600">dns</span>
                    <span className="text-xs font-bold mt-2">ET 200SP</span>
                    <span className="text-[10px] text-slate-500 mt-1">192.168.0.2</span>
                </div>
                <div className="absolute -left-3 bottom-4 size-6 bg-green-500 border-2 border-white rounded-sm flex items-center justify-center text-[8px] text-white font-bold z-10">P1</div>
                <div className="absolute -right-3 bottom-4 size-6 bg-green-500 border-2 border-white rounded-sm flex items-center justify-center text-[8px] text-white font-bold z-10">P2</div>
            </div>

             <div className="h-1 bg-green-500 w-20 relative -ml-3 -mr-3 mt-24"></div>

             {/* HMI */}
             <div className="relative w-40 h-32 border border-slate-300 bg-slate-50 shadow-sm flex flex-col group hover:shadow-lg transition-shadow">
                <div className="h-6 bg-slate-600 text-white text-xs font-bold flex items-center justify-center">HMI_1</div>
                <div className="flex-1 p-2 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-slate-600">desktop_windows</span>
                    <span className="text-xs font-bold mt-2">KTP700 Basic</span>
                    <span className="text-[10px] text-slate-500 mt-1">192.168.0.3</span>
                </div>
                <div className="absolute -left-3 bottom-4 size-6 bg-green-500 border-2 border-white rounded-sm flex items-center justify-center text-[8px] text-white font-bold z-10">P1</div>
            </div>
        </div>
        
        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs bg-white p-2 border border-slate-200 shadow-sm">
             <div className="w-8 h-1 bg-green-500"></div>
             <span>PROFINET</span>
        </div>
    </div>
  );

  const renderTopologyView = () => (
    <div className="flex-1 p-8 bg-slate-50 relative overflow-auto h-full">
         <div className="border border-dashed border-slate-300 rounded p-10 flex flex-col gap-10">
             <div className="flex gap-20">
                 <div className="flex flex-col items-center">
                      <div className="w-24 h-24 border border-slate-400 bg-white shadow-sm flex items-center justify-center relative hover:border-primary cursor-move">
                          <span className="font-bold text-slate-700">PLC_1</span>
                          <div className="absolute bottom-0 right-4 w-4 h-6 bg-green-100 border border-green-500 border-b-0 cursor-pointer hover:bg-green-200"></div>
                      </div>
                      <div className="h-10 w-0.5 bg-green-600"></div>
                 </div>
                 
                 <div className="w-20"></div>
                 
                 <div className="flex flex-col items-center">
                      <div className="w-24 h-24 border border-slate-400 bg-white shadow-sm flex items-center justify-center relative hover:border-primary cursor-move">
                          <span className="font-bold text-slate-700">HMI_1</span>
                          <div className="absolute bottom-0 left-4 w-4 h-6 bg-green-100 border border-green-500 border-b-0 cursor-pointer hover:bg-green-200"></div>
                      </div>
                      <div className="h-10 w-0.5 bg-green-600"></div>
                 </div>
             </div>

             <div className="h-2 w-[400px] bg-slate-300 border border-slate-400 rounded-full mx-auto relative">
                 <div className="absolute left-[54px] -top-1 size-4 bg-green-600 rounded-full hover:scale-125 transition-transform cursor-pointer"></div>
                 <div className="absolute right-[54px] -top-1 size-4 bg-green-600 rounded-full hover:scale-125 transition-transform cursor-pointer"></div>
             </div>
         </div>
         <div className="mt-4 text-center text-xs text-slate-500">此视图显示物理端口互连 (Physical Port Interconnection)</div>
    </div>
  );

  // --- Inspector Logic (Property Pages) ---

  const renderInspectorContent = (module: Module) => {
      switch (activeTab) {
        case 'profinet':
            if (module.type !== 'cpu' && module.type !== 'comm') {
                return <div className="p-4 text-xs text-slate-400 italic">此模块没有 PROFINET 接口。</div>;
            }
            return (
                <div className="p-4 space-y-6 max-w-2xl">
                    <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">以太网地址 (Ethernet addresses)</h5>
                    
                    <div className="bg-white p-3 border border-slate-200 rounded-sm space-y-3">
                         <div className="flex items-center gap-2 mb-2">
                             <input type="radio" name="ip_proto" checked readOnly className="text-primary"/>
                             <span className="text-xs font-bold text-slate-700">在项目中设置 IP 地址</span>
                         </div>
                         
                         <div className="grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
                             <label className="text-right text-slate-500">IP 地址:</label>
                             <div className="flex gap-1">
                                 <input 
                                    type="text" 
                                    value={module.ip || ''} 
                                    onChange={(e) => handleUpdateModule(module.slot, 'ip', e.target.value)}
                                    className="border border-slate-300 w-32 px-2 py-1 font-mono rounded-sm focus:border-primary outline-none" 
                                />
                             </div>

                             <label className="text-right text-slate-500">子网掩码:</label>
                             <div className="flex gap-1">
                                 <input 
                                    type="text" 
                                    value={module.subnet || '255.255.255.0'} 
                                    onChange={(e) => handleUpdateModule(module.slot, 'subnet', e.target.value)}
                                    className="border border-slate-300 w-32 px-2 py-1 font-mono rounded-sm focus:border-primary outline-none" 
                                />
                             </div>
                         </div>
                    </div>

                    <div className="space-y-2">
                        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1">PROFINET 参数</h5>
                        <div className="grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
                             <label className="text-right text-slate-500">设备名称:</label>
                             <div className="flex gap-2 items-center">
                                 <input 
                                    type="text" 
                                    value={`${module.name.toLowerCase().replace(/\s+/g, '_')}.profinet.x1`} 
                                    readOnly
                                    className="border border-slate-300 w-48 px-2 py-1 bg-slate-50 text-slate-500 rounded-sm" 
                                />
                                <button className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200">自动生成</button>
                             </div>
                        </div>
                    </div>
                </div>
            );

        case 'io':
             if (module.ioStart === undefined) {
                return <div className="p-4 text-xs text-slate-400 italic">此模块没有 I/O 地址配置。</div>;
             }
             return (
                 <div className="p-4 space-y-6 max-w-2xl">
                    <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">输入 (Inputs)</h5>
                    <div className="bg-white p-3 border border-slate-200 rounded-sm grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
                         <label className="text-right text-slate-500">起始地址:</label>
                         <input 
                            type="number" 
                            value={module.ioStart} 
                            onChange={(e) => handleUpdateModule(module.slot, 'ioStart', parseInt(e.target.value))}
                            className="border border-slate-300 w-20 px-2 py-1 rounded-sm focus:border-primary outline-none" 
                        />
                         
                         <label className="text-right text-slate-500">结束地址:</label>
                         <div className="text-slate-700 font-mono bg-slate-50 px-2 py-1 w-20 border border-slate-200">
                             {module.ioStart + (module.ioLength || 0) - 1}
                         </div>
                    </div>

                    <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">输出 (Outputs)</h5>
                    <div className="bg-white p-3 border border-slate-200 rounded-sm grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
                         <label className="text-right text-slate-500">起始地址:</label>
                         <input 
                            type="number" 
                            value={module.ioStart} 
                            onChange={(e) => handleUpdateModule(module.slot, 'ioStart', parseInt(e.target.value))}
                            className="border border-slate-300 w-20 px-2 py-1 rounded-sm focus:border-primary outline-none" 
                        />
                         
                         <label className="text-right text-slate-500">结束地址:</label>
                         <div className="text-slate-700 font-mono bg-slate-50 px-2 py-1 w-20 border border-slate-200">
                             {module.ioStart + (module.ioLength || 0) - 1}
                         </div>
                    </div>

                    <div className="bg-yellow-50 p-2 text-xs text-yellow-800 border border-yellow-200 rounded">
                        过程映像 (Process Image): <span className="font-bold">自动更新 (Automatic update)</span>
                    </div>
                 </div>
             );

        case 'hw_id':
             return (
                 <div className="p-4 space-y-4 max-w-2xl">
                     <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">硬件标识符 (Hardware identifier)</h5>
                     <div className="bg-white border border-slate-300 rounded overflow-hidden">
                         <table className="w-full text-xs text-left">
                             <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                                 <tr>
                                     <th className="p-2 border-r border-slate-300">名称</th>
                                     <th className="p-2 border-r border-slate-300">数据类型</th>
                                     <th className="p-2">值</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 <tr>
                                     <td className="p-2 border-r border-slate-200 font-mono">Local~{module.name.replace(/\s+/g, '_')}_Head</td>
                                     <td className="p-2 border-r border-slate-200">Hw_Device</td>
                                     <td className="p-2 font-bold">{module.hwId}</td>
                                 </tr>
                                 {module.type === 'io' && (
                                     <tr>
                                         <td className="p-2 border-r border-slate-200 font-mono">Local~{module.name.replace(/\s+/g, '_')}_Port</td>
                                         <td className="p-2 border-r border-slate-200">Hw_Interface</td>
                                         <td className="p-2 font-bold">{module.hwId! + 1}</td>
                                     </tr>
                                 )}
                             </tbody>
                         </table>
                     </div>
                 </div>
             );

        case 'general':
        default:
            return (
                 <div className="p-4 space-y-4 max-w-2xl">
                     <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-xs items-center">
                        <label className="text-right text-slate-500 font-bold">名称 (Name):</label>
                        <input 
                            type="text" 
                            className="border border-slate-300 px-2 py-1 w-full rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none" 
                            value={module.name}
                            onChange={(e) => handleUpdateModule(module.slot, 'name', e.target.value)} 
                        />
                        
                        <label className="text-right text-slate-500 font-bold">订货号 (Article):</label>
                        <div className="flex items-center gap-2">
                             <input 
                                type="text" 
                                className="border border-slate-300 px-2 py-1 w-64 rounded bg-slate-50 text-slate-600" 
                                value={module.articleNumber}
                                readOnly 
                            />
                        </div>
                        
                        <label className="text-right text-slate-500 font-bold">固件版本:</label>
                        <select 
                            className="border border-slate-300 rounded px-2 py-1 bg-white w-32"
                            value={module.firmware}
                            onChange={(e) => handleUpdateModule(module.slot, 'firmware', e.target.value)}
                        >
                            <option value="V1.0">V1.0</option>
                            <option value="V1.1">V1.1</option>
                            <option value="V2.0">V2.0</option>
                            <option value="V2.5">V2.5</option>
                            <option value="V2.9">V2.9</option>
                        </select>

                        <label className="text-right text-slate-500 font-bold self-start mt-1">注释:</label>
                        <textarea 
                            className="border border-slate-300 px-2 py-1 w-full h-16 rounded resize-none focus:border-primary outline-none" 
                            placeholder="输入模块注释..."
                            value={module.comment || ''}
                            onChange={(e) => handleUpdateModule(module.slot, 'comment', e.target.value)}
                        />
                     </div>
                 </div>
            );
      }
  };

  const renderInspector = () => {
    const activeModule = getModuleAtSlot(selectedSlot);

    if (!activeModule) {
        return (
            <div style={{ height: inspectorHeight }} className="bg-white border-t border-slate-300 flex items-center justify-center text-slate-400 text-xs shrink-0 z-20">
                <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-3xl opacity-20">settings</span>
                    请在上方选择一个模块以配置属性，或点击空槽位添加模块。
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: inspectorHeight }} className="bg-white border-t border-slate-300 flex flex-col shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-all relative">
             {/* Resizer Handle */}
             <div 
                className="absolute top-0 left-0 right-0 h-1 bg-transparent hover:bg-primary/50 cursor-row-resize z-50 transition-colors"
                onMouseDown={startResizing}
             ></div>

             {/* Inspector Header */}
             <div className="bg-slate-100 px-2 py-1 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between items-center shrink-0 h-8">
                <span>模块属性: {activeModule.name} [Slot {activeModule.slot}]</span>
                <button 
                    onClick={() => handleDeleteModule(activeModule.slot)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 rounded transition-colors"
                    title="删除模块"
                >
                    <span className="material-symbols-outlined text-[16px] align-middle">delete</span>
                </button>
             </div>
             
             <div className="flex-1 flex overflow-hidden">
                 {/* Left Menu (Tabs) */}
                 <div className="w-48 border-r border-slate-200 bg-slate-50 p-2 overflow-y-auto shrink-0">
                     <div className="text-[10px] font-bold text-slate-400 mb-2 pl-1 uppercase tracking-wider">General</div>
                     <ul className="space-y-0.5 mb-4">
                        <li 
                            onClick={() => setActiveTab('general')}
                            className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 ${activeTab === 'general' ? 'bg-blue-100 text-primary font-bold' : 'hover:bg-slate-200 text-slate-600'}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">tune</span> 常规
                        </li>
                        <li 
                            onClick={() => setActiveTab('profinet')}
                            className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 ${activeTab === 'profinet' ? 'bg-blue-100 text-primary font-bold' : 'hover:bg-slate-200 text-slate-600'}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">lan</span> PROFINET 接口
                        </li>
                        <li 
                            onClick={() => setActiveTab('io')}
                            className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 ${activeTab === 'io' ? 'bg-blue-100 text-primary font-bold' : 'hover:bg-slate-200 text-slate-600'}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">input</span> I/O 地址
                        </li>
                        <li 
                            onClick={() => setActiveTab('hw_id')}
                            className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 ${activeTab === 'hw_id' ? 'bg-blue-100 text-primary font-bold' : 'hover:bg-slate-200 text-slate-600'}`}
                        >
                             <span className="material-symbols-outlined text-[16px]">tag</span> 硬件标识符
                        </li>
                     </ul>
                 </div>
                 
                 {/* Content Area */}
                 <div className="flex-1 overflow-y-auto">
                     {renderInspectorContent(activeModule)}
                 </div>
             </div>
        </div>
    );
  };

  // --- Main Render ---

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden relative">
      {/* View Tabs */}
      <div className="flex bg-white border-b border-slate-300 px-2 pt-2 gap-1 shrink-0 z-20">
         <button 
           onClick={() => setViewMode('device')}
           className={`px-4 py-1 text-xs font-bold border-t-2 border-x border-slate-300 border-b-0 ${viewMode === 'device' ? 'bg-white border-t-primary text-primary' : 'bg-slate-50 text-slate-500 border-t-transparent border-x-transparent hover:bg-slate-100'}`}
         >
            设备视图 (Device view)
         </button>
         <button 
           onClick={() => setViewMode('network')}
           className={`px-4 py-1 text-xs font-bold border-t-2 border-x border-slate-300 border-b-0 ${viewMode === 'network' ? 'bg-white border-t-primary text-primary' : 'bg-slate-50 text-slate-500 border-t-transparent border-x-transparent hover:bg-slate-100'}`}
         >
            网络视图 (Network view)
         </button>
         <button 
           onClick={() => setViewMode('topology')}
           className={`px-4 py-1 text-xs font-bold border-t-2 border-x border-slate-300 border-b-0 ${viewMode === 'topology' ? 'bg-white border-t-primary text-primary' : 'bg-slate-50 text-slate-500 border-t-transparent border-x-transparent hover:bg-slate-100'}`}
         >
            拓扑视图 (Topology view)
         </button>
      </div>

      {/* Main View Area (Resizable Upper Part) */}
      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
         {/* Grid Background */}
         <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-0" 
              style={{backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px'}}>
         </div>
         
         <div className="relative z-10 flex-1 overflow-hidden">
            {viewMode === 'device' && renderDeviceView()}
            {viewMode === 'network' && renderNetworkView()}
            {viewMode === 'topology' && renderTopologyView()}
         </div>
      </div>

      {/* Synchronized Resizable Inspector */}
      {viewMode === 'device' && renderInspector()}
    </div>
  );
};