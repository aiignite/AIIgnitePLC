import React, { useState } from 'react';

type DiagnosticsView = 'status' | 'buffer' | 'cycle' | 'memory' | 'comm' | 'time' | 'firmware' | 'reset';

export const OnlineDiagnostics: React.FC = () => {
  const [activeView, setActiveView] = useState<DiagnosticsView>('status');

  // --- Sub-View Components ---

  const renderStatusView = () => (
    <div className="animate-fade-in">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            模块处于正常运行状态
        </h3>
        <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="border border-slate-200 rounded p-4 shadow-sm">
                <h4 className="text-xs font-bold text-slate-700 mb-3">操作模式 (Operating Mode)</h4>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                            <span className="text-xs font-bold text-slate-800">RUN</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-30">
                            <div className="size-3 rounded-full bg-yellow-500"></div>
                            <span className="text-xs font-bold text-slate-800">STOP</span>
                        </div>
                    </div>
                    <div className="h-10 w-px bg-slate-200"></div>
                    <div className="text-xs text-slate-600">
                        PLC 自 2023-10-27 08:30:00 以来一直在运行。
                    </div>
                </div>
            </div>
            <div className="border border-slate-200 rounded p-4 shadow-sm">
                <h4 className="text-xs font-bold text-slate-700 mb-3">错误统计 (Error Statistics)</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <div className="text-slate-500">IO 错误</div>
                        <div className="font-bold text-slate-800">0</div>
                    </div>
                    <div>
                        <div className="text-slate-500">通信错误</div>
                        <div className="font-bold text-slate-800">0</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );

  const renderBufferView = () => (
    <div className="animate-fade-in">
        <div className="flex justify-between items-center mb-4">
             <h3 className="text-sm font-bold text-slate-800">诊断缓冲区 (Diagnostics Buffer)</h3>
             <div className="flex gap-2">
                 <button className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300">保存为...</button>
                 <button className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300">设置</button>
             </div>
        </div>
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                    <tr>
                        <th className="p-2 w-12 text-center">No.</th>
                        <th className="p-2 w-32">时间</th>
                        <th className="p-2 w-24">事件ID</th>
                        <th className="p-2">事件描述</th>
                        <th className="p-2 w-24">状态</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 text-center text-slate-500">1</td>
                        <td className="p-2 font-mono">10:42:15.123</td>
                        <td className="p-2 font-mono">16# 02:4000</td>
                        <td className="p-2 text-slate-700">模式转换: STOP -> RUN</td>
                        <td className="p-2 text-green-600 font-medium">Info</td>
                    </tr>
                    <tr className="hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 text-center text-slate-500">2</td>
                        <td className="p-2 font-mono">10:42:12.800</td>
                        <td className="p-2 font-mono">16# 02:3500</td>
                        <td className="p-2 text-slate-700">新启动信息: 上电</td>
                        <td className="p-2 text-green-600 font-medium">Info</td>
                    </tr>
                    <tr className="hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 text-center text-slate-500">3</td>
                        <td className="p-2 font-mono">10:42:05.000</td>
                        <td className="p-2 font-mono">16# 02:4400</td>
                        <td className="p-2 text-slate-700">电源电压恢复</td>
                        <td className="p-2 text-green-600 font-medium">Info</td>
                    </tr>
                    <tr className="hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 text-center text-slate-500">4</td>
                        <td className="p-2 font-mono">08:15:00.000</td>
                        <td className="p-2 font-mono">16# 02:3955</td>
                        <td className="p-2 text-slate-700">硬件配置变更</td>
                        <td className="p-2 text-slate-500 font-medium">Warning</td>
                    </tr>
                     <tr className="hover:bg-blue-50 cursor-pointer">
                        <td className="p-2 text-center text-slate-500">5</td>
                        <td className="p-2 font-mono">08:14:55.120</td>
                        <td className="p-2 font-mono">16# 02:4000</td>
                        <td className="p-2 text-slate-700">模式转换: RUN -> STOP</td>
                        <td className="p-2 text-green-600 font-medium">Info</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded">
            <h4 className="text-xs font-bold mb-2">事件详细信息:</h4>
            <p className="text-xs text-slate-600">CPU 从 STOP 模式切换到 RUN 模式。启动方式：热启动。</p>
        </div>
    </div>
  );

  const renderCycleTimeView = () => (
     <div className="animate-fade-in max-w-2xl">
         <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">循环时间 (Cycle Time)</h3>
         
         <div className="grid grid-cols-3 gap-4 mb-8">
             <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
                 <div className="text-xs text-slate-500 mb-1">最短</div>
                 <div className="text-xl font-mono font-bold text-slate-700">1.0 <span className="text-xs font-normal">ms</span></div>
             </div>
             <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
                 <div className="text-xs text-slate-500 mb-1">当前</div>
                 <div className="text-xl font-mono font-bold text-green-600">4.2 <span className="text-xs font-normal">ms</span></div>
             </div>
             <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
                 <div className="text-xs text-slate-500 mb-1">最长</div>
                 <div className="text-xl font-mono font-bold text-slate-700">12.5 <span className="text-xs font-normal">ms</span></div>
             </div>
         </div>

         <div className="mb-2 flex justify-between text-xs text-slate-500">
             <span>0 ms</span>
             <span>150 ms (Max Limit)</span>
         </div>
         <div className="h-6 bg-slate-200 rounded-full overflow-hidden relative border border-slate-300">
             {/* Max marker */}
             <div className="absolute top-0 bottom-0 bg-slate-300 w-1" style={{left: '8%'}}></div> 
             {/* Current */}
             <div className="h-full bg-green-500 w-[4%] relative transition-all duration-500"></div>
         </div>
         <p className="text-xs text-slate-500 mt-2 italic">配置的最大循环时间监控: 150ms</p>
     </div>
  );

  const renderMemoryView = () => (
      <div className="animate-fade-in max-w-2xl space-y-8">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">存储器 (Memory)</h3>
          
          {/* Load Memory */}
          <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>装载存储器 (Load Memory)</span>
                  <span>14% 已使用</span>
              </div>
              <div className="h-4 bg-slate-200 rounded overflow-hidden border border-slate-300">
                  <div className="h-full bg-orange-400 w-[14%]"></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>RAM</span>
                  <span>524 KB / 4 MB</span>
              </div>
          </div>

          {/* Work Memory Code */}
          <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>工作存储器 - 代码 (Code Work Memory)</span>
                  <span>24% 已使用</span>
              </div>
              <div className="h-4 bg-slate-200 rounded overflow-hidden border border-slate-300">
                  <div className="h-full bg-blue-500 w-[24%]"></div>
              </div>
               <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Retentive</span>
                  <span>36 KB / 150 KB</span>
              </div>
          </div>

          {/* Work Memory Data */}
          <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>工作存储器 - 数据 (Data Work Memory)</span>
                  <span>5% 已使用</span>
              </div>
              <div className="h-4 bg-slate-200 rounded overflow-hidden border border-slate-300">
                  <div className="h-full bg-green-500 w-[5%]"></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Non-Retentive</span>
                  <span>50 KB / 1 MB</span>
              </div>
          </div>
      </div>
  );

  const renderCommView = () => (
      <div className="animate-fade-in">
           <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">通信统计 (Communication)</h3>
           <table className="w-full max-w-lg text-left text-xs border border-slate-300">
               <thead className="bg-slate-100 font-bold">
                   <tr>
                       <th className="p-2 border-b">接口 X1 (PROFINET)</th>
                       <th className="p-2 border-b text-right">发送</th>
                       <th className="p-2 border-b text-right">接收</th>
                   </tr>
               </thead>
               <tbody>
                   <tr className="border-b border-slate-100">
                       <td className="p-2">总字节数 (Bytes)</td>
                       <td className="p-2 text-right font-mono">1,024,552</td>
                       <td className="p-2 text-right font-mono">4,551,200</td>
                   </tr>
                   <tr className="border-b border-slate-100">
                       <td className="p-2">数据包 (Packets)</td>
                       <td className="p-2 text-right font-mono">15,200</td>
                       <td className="p-2 text-right font-mono">45,100</td>
                   </tr>
                   <tr className="border-b border-slate-100">
                       <td className="p-2">错误 (Errors)</td>
                       <td className="p-2 text-right font-mono text-red-500">0</td>
                       <td className="p-2 text-right font-mono text-red-500">0</td>
                   </tr>
               </tbody>
           </table>
           <div className="mt-4 flex gap-2">
               <div className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded border border-green-200">Port 1: Link UP</div>
               <div className="px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded border border-slate-200">Port 2: Link DOWN</div>
           </div>
      </div>
  );

  const renderTimeView = () => (
      <div className="animate-fade-in max-w-lg">
           <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">设置时间 (Set Time)</h3>
           <div className="bg-slate-50 p-6 rounded border border-slate-200 flex flex-col gap-4">
               <div className="flex flex-col gap-1">
                   <label className="text-xs font-bold text-slate-700">PG/PC 时间 (Local)</label>
                   <div className="text-sm font-mono bg-white border border-slate-300 p-2 rounded text-slate-500">
                       {new Date().toLocaleString()}
                   </div>
               </div>
               <div className="flex items-center justify-center">
                   <span className="material-symbols-outlined text-slate-400">arrow_downward</span>
               </div>
               <div className="flex flex-col gap-1">
                   <label className="text-xs font-bold text-slate-700">模块时间 (Module)</label>
                   <div className="text-sm font-mono bg-white border border-slate-300 p-2 rounded text-primary">
                       {new Date(Date.now() - 500000).toLocaleString()}
                   </div>
               </div>
               <div className="flex items-center gap-2 mt-2">
                   <input type="checkbox" id="sync" className="rounded border-slate-300" />
                   <label htmlFor="sync" className="text-xs text-slate-700">从 PG/PC 获取时间</label>
               </div>
               <button className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded text-xs font-bold shadow-sm transition-colors w-fit self-end">应用 (Apply)</button>
           </div>
      </div>
  );

  const renderFirmwareView = () => (
      <div className="animate-fade-in max-w-lg">
           <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">固件更新 (Firmware Update)</h3>
           <div className="space-y-4">
               <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800 flex gap-2">
                   <span className="material-symbols-outlined text-[18px]">info</span>
                   <span>执行固件更新将导致 CPU 进入 STOP 模式。请确保生产安全。</span>
               </div>

               <div className="grid grid-cols-[100px_1fr] gap-4 items-center text-xs">
                   <label className="text-right font-bold text-slate-700">当前版本:</label>
                   <div>V2.9.2</div>

                   <label className="text-right font-bold text-slate-700">固件文件:</label>
                   <div className="flex gap-2">
                       <input type="text" className="border border-slate-300 rounded p-1 flex-1 bg-white" placeholder="Select firmware file..." readOnly />
                       <button className="px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded border border-slate-300 text-slate-700">浏览...</button>
                   </div>
               </div>
               
               <div className="border-t border-slate-200 pt-4 flex justify-end">
                   <button className="bg-slate-300 text-slate-500 cursor-not-allowed px-4 py-2 rounded text-xs font-bold">开始更新</button>
               </div>
           </div>
      </div>
  );

  const renderResetView = () => (
      <div className="animate-fade-in max-w-lg">
           <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">复位 (Reset)</h3>
           
           <div className="space-y-6">
               <div className="border border-slate-200 rounded p-4 bg-white hover:border-primary transition-colors cursor-pointer group">
                   <h4 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2">
                       <span className="material-symbols-outlined text-[18px] text-orange-500">restart_alt</span>
                       暖启动 (Warm Restart)
                   </h4>
                   <p className="text-[10px] text-slate-500 pl-7">重启 CPU，保持保持性数据 (Retentive Data)。</p>
                   <div className="mt-2 pl-7">
                       <button className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-xs rounded shadow-sm">执行</button>
                   </div>
               </div>

               <div className="border border-slate-200 rounded p-4 bg-white hover:border-red-500 transition-colors cursor-pointer group">
                   <h4 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2">
                       <span className="material-symbols-outlined text-[18px] text-red-500">delete_forever</span>
                       恢复出厂设置 (Reset to Factory)
                   </h4>
                   <p className="text-[10px] text-slate-500 pl-7">清除所有程序、数据和 IP 地址设置。</p>
                   <div className="mt-2 pl-7">
                       <button className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs rounded shadow-sm">重置设备</button>
                   </div>
               </div>
           </div>
      </div>
  );

  // --- Main Render ---

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header Panel */}
      <div className="p-4 border-b border-slate-300 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
              <div className="size-16 bg-white border border-slate-300 shadow-sm rounded flex items-center justify-center p-1">
                 <img src="https://img.icons8.com/ios/100/137fec/microchip.png" alt="CPU" className="w-10 h-10 opacity-80"/>
              </div>
              <div>
                  <h2 className="text-lg font-bold text-slate-800">PLC_1 [CPU 1511-1 PN]</h2>
                  <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold border border-green-200 rounded">RUN</span>
                      <span className="text-xs text-slate-500">IP: 192.168.0.1</span>
                      <span className="text-xs text-slate-500">|</span>
                      <span className="text-xs text-slate-500">FW: V2.9</span>
                  </div>
              </div>
          </div>
          
          <div className="flex gap-4">
               <div className="text-center">
                   <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Cycle Time</div>
                   <div className="text-xl font-mono text-slate-700 font-bold">4.2 <span className="text-xs font-normal">ms</span></div>
               </div>
               <div className="w-px h-10 bg-slate-200"></div>
               <div className="text-center">
                   <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Memory</div>
                   <div className="text-xl font-mono text-slate-700 font-bold">24 <span className="text-xs font-normal">%</span></div>
               </div>
          </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
          {/* Left Nav */}
          <div className="w-56 border-r border-slate-300 bg-slate-50 flex flex-col overflow-y-auto shrink-0">
             <div className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">诊断 (Diagnostics)</div>
             <nav className="space-y-0.5 px-2">
                 <button onClick={() => setActiveView('status')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'status' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>设备状态 (Device status)</button>
                 <button onClick={() => setActiveView('buffer')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'buffer' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>诊断缓冲区 (Buffer)</button>
                 <button onClick={() => setActiveView('cycle')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'cycle' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>循环时间 (Cycle time)</button>
                 <button onClick={() => setActiveView('memory')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'memory' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>存储器 (Memory)</button>
                 <button onClick={() => setActiveView('comm')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'comm' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>通信 (Communication)</button>
             </nav>
             
             <div className="p-3 mt-4 text-xs font-bold text-slate-500 uppercase tracking-wider">功能 (Functions)</div>
             <nav className="space-y-0.5 px-2">
                 <button onClick={() => setActiveView('time')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'time' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>设置时间 (Set Time)</button>
                 <button onClick={() => setActiveView('firmware')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'firmware' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>固件更新 (Firmware)</button>
                 <button onClick={() => setActiveView('reset')} className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'reset' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}>复位 (Reset)</button>
             </nav>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-white p-6">
              {activeView === 'status' && renderStatusView()}
              {activeView === 'buffer' && renderBufferView()}
              {activeView === 'cycle' && renderCycleTimeView()}
              {activeView === 'memory' && renderMemoryView()}
              {activeView === 'comm' && renderCommView()}
              {activeView === 'time' && renderTimeView()}
              {activeView === 'firmware' && renderFirmwareView()}
              {activeView === 'reset' && renderResetView()}
          </div>
      </div>
    </div>
  );
};