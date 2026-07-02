import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../src/services/authFetch';
import { useBlockStore } from '../src/stores/blockStore';
import { useDeployStore } from '../src/stores/deployStore';
import { useProjectStore } from '../src/stores/projectStore';
import { useRuntimeStore } from '../src/stores/runtimeStore';
import { DeployPanel } from './DeployPanel';

type DiagnosticsView =
  | 'compile'
  | 'watch'
  | 'import'
  | 'audit'
  | 'status'
  | 'buffer'
  | 'cycle'
  | 'memory'
  | 'comm'
  | 'time'
  | 'firmware'
  | 'reset'
  | 'plc';

export const OnlineDiagnostics: React.FC = () => {
  const [activeView, setActiveView] = useState<DiagnosticsView>('status');
  const { compilationErrors, isCompiling, compilePlcDownload } = useBlockStore();
  const {
    hwStatus,
    minScanUs,
    maxScanUs,
    scanMs,
    setCompileResult,
    connected: hwConnected,
    forceAddress,
  } = useDeployStore();
  const {
    watchAddresses,
    addWatchAddress,
    removeWatchAddress,
    clearWatchAddresses,
    runtimeValues,
    eventLog,
    clearEventLog,
    plcStatus,
    updateRuntimeValues,
  } = useRuntimeStore();
  const { currentProjectId } = useProjectStore();
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [importStatusFilter, setImportStatusFilter] = useState<
    'all' | 'success' | 'partial' | 'failed'
  >('all');
  const [importSearch, setImportSearch] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  const fetchAuditLogs = async () => {
    setIsAuditLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';
      const url = currentProjectId
        ? `${baseUrl}/projects/${currentProjectId}/audit-logs?limit=200`
        : `${baseUrl}/audit-logs?limit=200`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } finally {
      setIsAuditLoading(false);
    }
  };

  const fetchImportHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';
      const url = currentProjectId
        ? `${baseUrl}/projects/${currentProjectId}/import-history?limit=200`
        : `${baseUrl}/projects/import-history?limit=200`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setImportHistory(data);
      }
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeView !== 'import') return;
    void fetchImportHistory();
  }, [activeView, currentProjectId]);

  useEffect(() => {
    if (activeView !== 'audit') return;
    void fetchAuditLogs();
  }, [activeView, currentProjectId]);

  useEffect(() => {
    if (!hwConnected || watchAddresses.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      const { monitorAddress: mon } = useDeployStore.getState();
      const updates: Array<{ address: string; value: boolean; quality: 'good' | 'bad' }> = [];
      for (const addr of watchAddresses) {
        const val = await mon(addr);
        if (val !== null) {
          updates.push({ address: addr, value: val, quality: 'good' });
        }
      }
      if (!cancelled && updates.length > 0) {
        updateRuntimeValues(updates);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hwConnected, watchAddresses, updateRuntimeValues]);

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
              <div
                className={`flex items-center gap-2 ${plcStatus === 'running' ? '' : 'opacity-30'}`}
              >
                <div className="size-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <span className="text-xs font-bold text-slate-800">RUN</span>
              </div>
              <div
                className={`flex items-center gap-2 ${plcStatus === 'stopped' ? '' : 'opacity-30'}`}
              >
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

  const renderCompileView = () => (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">编译诊断 (Compilation)</h3>
        {isCompiling && <span className="text-xs text-slate-500">编译中...</span>}
      </div>

      {compilationErrors.length === 0 ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          未发现编译错误。
        </div>
      ) : (
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 w-20">级别</th>
                <th className="p-2">消息</th>
                <th className="p-2 w-32">代码</th>
                <th className="p-2 w-40">元素ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compilationErrors.map((diag, idx) => (
                <tr key={`${diag.code}-${idx}`} className="hover:bg-blue-50">
                  <td
                    className={`p-2 font-medium ${diag.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}`}
                  >
                    {diag.severity || 'error'}
                  </td>
                  <td className="p-2 text-slate-700">{diag.message}</td>
                  <td className="p-2 font-mono text-slate-500">{diag.code}</td>
                  <td className="p-2 font-mono text-slate-500">{diag.elementId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderBufferView = () => (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-800">诊断缓冲区 (Diagnostics Buffer)</h3>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => clearEventLog()}
          >
            清空
          </button>
        </div>
      </div>
      {eventLog.length === 0 ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          暂无事件记录。
        </div>
      ) : (
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 w-12 text-center">No.</th>
                <th className="p-2 w-32">时间</th>
                <th className="p-2">事件描述</th>
                <th className="p-2 w-24">级别</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventLog.map((event, idx) => (
                <tr key={event.id} className="hover:bg-blue-50">
                  <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                  <td className="p-2 font-mono">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="p-2 text-slate-700">{event.message}</td>
                  <td
                    className={`p-2 font-medium ${event.severity === 'error' ? 'text-red-600' : event.severity === 'warning' ? 'text-yellow-600' : 'text-green-600'}`}
                  >
                    {event.severity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderWatchView = () => (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">监控表 (Watch Table)</h3>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => {
              const address = prompt('输入要监控的地址（如 %M0.0）');
              if (address) addWatchAddress(address);
            }}
          >
            添加
          </button>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => clearWatchAddresses()}
          >
            清空
          </button>
        </div>
      </div>

      {watchAddresses.length === 0 ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          暂无监控地址。
        </div>
      ) : (
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 w-40">地址</th>
                <th className="p-2 w-24">值</th>
                <th className="p-2 w-24">质量</th>
                <th className="p-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {watchAddresses.map(address => {
                const runtime = runtimeValues.get(address);
                const displayValue = runtime?.value !== undefined ? String(runtime.value) : '-';
                const quality = runtime?.quality || 'good';
                return (
                  <tr key={address} className="hover:bg-blue-50">
                    <td className="p-2 font-mono text-slate-700">{address}</td>
                    <td className="p-2 font-mono text-slate-700">{displayValue}</td>
                    <td
                      className={`p-2 font-mono ${quality === 'good' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {quality}
                    </td>
                    <td className="p-2 text-right space-x-1">
                      {hwConnected && (
                        <button
                          className="text-xs px-2 py-0.5 rounded bg-orange-100 hover:bg-orange-200 text-orange-800"
                          onClick={() => void forceAddress(address, true, true)}
                          title="硬件强制 (0x6B)"
                        >
                          强制
                        </button>
                      )}
                      <button
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                        onClick={() => removeWatchAddress(address)}
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderPlcHwView = () => (
    <div className="animate-fade-in max-w-3xl space-y-4">
      <DeployPanel
        scanMs={scanMs}
        onCompile={async () => {
          const result = await compilePlcDownload([], scanMs);
          if (result.error) throw new Error(result.error);
          if (result.downloadHex) {
            setCompileResult(result.downloadHex, result.deployHex);
          }
        }}
      />
      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
        从站 I/O 映射 (0x6F) 请在「设备组态」→ CPU 模块 →「从站 I/O 映射」Tab 中配置。
      </p>
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">
        RH850 PLC 硬件协议
      </h3>
      <table className="w-full text-xs border border-slate-200">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2">FuncCode</th>
            <th className="p-2">功能</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 font-mono">0x68</td>
            <td className="p-2">程序下载 (BEGIN/CHUNK/END)</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x69</td>
            <td className="p-2">START / STOP / RESET</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x6A</td>
            <td className="p-2">状态查询 (scan_ms, last_scan_us)</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x6B</td>
            <td className="p-2">强制 I/O / 释放</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x6D</td>
            <td className="p-2">在线监控位值</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x6E</td>
            <td className="p-2">JSON 调试直载</td>
          </tr>
          <tr>
            <td className="p-2 font-mono">0x6F</td>
            <td className="p-2">从站 I/O 映射</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const currentScanUs = hwStatus?.lastScanUs ?? 0;
  const configuredScanMs = hwStatus?.scanMs ?? scanMs;
  const minUs = minScanUs || currentScanUs;
  const maxUs = maxScanUs || currentScanUs;

  const renderCycleTimeView = () => (
    <div className="animate-fade-in max-w-2xl">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        循环时间 (Cycle Time)
      </h3>
      {!hwConnected && (
        <div className="mb-4 p-2 bg-amber-50 text-amber-800 text-xs rounded">
          连接 RH850 串口后显示真实扫描周期（0x6A）。当前为 WebSocket 仿真数据。
        </div>
      )}
      {hwStatus?.errorCode === 0x0705 && (
        <div className="mb-4 p-2 bg-red-50 text-red-700 text-xs rounded">
          扫描周期超限 (0x0705 Scan overrun)
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
          <div className="text-xs text-slate-500 mb-1">最短</div>
          <div className="text-xl font-mono font-bold text-slate-700">
            {(minUs / 1000).toFixed(2)} <span className="text-xs font-normal">ms</span>
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
          <div className="text-xs text-slate-500 mb-1">当前</div>
          <div className="text-xl font-mono font-bold text-green-600">
            {(currentScanUs / 1000).toFixed(2)} <span className="text-xs font-normal">ms</span>
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center">
          <div className="text-xs text-slate-500 mb-1">最长</div>
          <div className="text-xl font-mono font-bold text-slate-700">
            {(maxUs / 1000).toFixed(2)} <span className="text-xs font-normal">ms</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        配置扫描周期: {configuredScanMs} ms
        {hwStatus ? ` · 模式=${hwStatus.mode} · ${hwStatus.errorMessage}` : ''}
      </p>
    </div>
  );

  const filteredHistory = importHistory
    .filter(item =>
      importStatusFilter === 'all' ? true : item.import_status === importStatusFilter
    )
    .filter(item => {
      const q = importSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        String(item.source_file_name || '')
          .toLowerCase()
          .includes(q) ||
        String(item.project_name || '')
          .toLowerCase()
          .includes(q)
      );
    });

  const filteredAuditLogs = auditLogs.filter(log => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(log.action || '')
        .toLowerCase()
        .includes(q) ||
      String(log.project_name || '')
        .toLowerCase()
        .includes(q) ||
      String(log.user_name || log.user_id || '')
        .toLowerCase()
        .includes(q)
    );
  });

  const renderImportHistoryView = () => (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">导入历史 (Import History)</h3>
        <div className="flex items-center gap-2">
          <input
            className="text-xs border border-slate-300 rounded px-2 py-1"
            placeholder="搜索文件/项目"
            value={importSearch}
            onChange={e => setImportSearch(e.target.value)}
          />
          <select
            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
            value={importStatusFilter}
            onChange={e =>
              setImportStatusFilter(e.target.value as 'all' | 'success' | 'partial' | 'failed')
            }
          >
            <option value="all">全部</option>
            <option value="success">成功</option>
            <option value="partial">部分成功</option>
            <option value="failed">失败</option>
          </select>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => {
              setImportSearch('');
              setImportStatusFilter('all');
            }}
          >
            清除过滤
          </button>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => {
              const blob = new Blob([JSON.stringify(filteredHistory, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `ImportHistory_${currentProjectId || 'global'}_${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
          >
            导出
          </button>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => void fetchImportHistory()}
          >
            刷新
          </button>
        </div>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        显示 {filteredHistory.length} / {importHistory.length}
      </div>

      {isHistoryLoading ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          加载中...
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          {importHistory.length === 0 ? '暂无导入记录。' : '没有匹配的导入记录。'}
        </div>
      ) : (
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 w-32">时间</th>
                <th className="p-2 w-32">项目</th>
                <th className="p-2 w-20">格式</th>
                <th className="p-2 w-20">状态</th>
                <th className="p-2">文件</th>
                <th className="p-2">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.map(item => (
                <tr key={item.id} className="hover:bg-blue-50">
                  <td className="p-2 font-mono">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="p-2 text-slate-700">{item.project_name || '-'}</td>
                  <td className="p-2 font-mono">{item.source_format}</td>
                  <td
                    className={`p-2 font-mono ${item.import_status === 'success' ? 'text-green-600' : item.import_status === 'partial' ? 'text-yellow-600' : 'text-red-600'}`}
                  >
                    {item.import_status}
                  </td>
                  <td className="p-2 text-slate-700">{item.source_file_name || '-'}</td>
                  <td className="p-2 text-slate-700">
                    {(() => {
                      const detailText =
                        item.diagnostics?.message ||
                        item.diagnostics?.error ||
                        (item.diagnostics?.warning
                          ? `${item.diagnostics.warning}${(() => {
                              const parts = [];
                              if (item.diagnostics.autoAssigned) {
                                parts.push(`autoAssigned:${item.diagnostics.autoAssigned}`);
                              }
                              if (item.diagnostics.renamedTags) {
                                parts.push(`renamedTags:${item.diagnostics.renamedTags}`);
                              }
                              return parts.length > 0 ? ` (${parts.join(', ')})` : '';
                            })()}`
                          : '-');
                      return (
                        <span title={detailText} className="block max-w-[240px] truncate">
                          {detailText}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderAuditLogsView = () => (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">审计日志 (Audit Logs)</h3>
        <div className="flex items-center gap-2">
          <input
            className="text-xs border border-slate-300 rounded px-2 py-1"
            placeholder="搜索动作/项目/用户"
            value={auditSearch}
            onChange={e => setAuditSearch(e.target.value)}
          />
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => setAuditSearch('')}
          >
            清除过滤
          </button>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => {
              const blob = new Blob([JSON.stringify(filteredAuditLogs, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `AuditLogs_${currentProjectId || 'global'}_${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
          >
            导出
          </button>
          <button
            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            onClick={() => void fetchAuditLogs()}
          >
            刷新
          </button>
        </div>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        显示 {filteredHistory.length} / {importHistory.length}
      </div>
      <div className="text-xs text-slate-500 mb-2">
        显示 {filteredAuditLogs.length} / {auditLogs.length}
      </div>

      {isAuditLoading ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          加载中...
        </div>
      ) : filteredAuditLogs.length === 0 ? (
        <div className="p-4 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
          {auditLogs.length === 0 ? '暂无审计记录。' : '没有匹配的审计记录。'}
        </div>
      ) : (
        <div className="border border-slate-300 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 w-32">时间</th>
                <th className="p-2 w-32">项目</th>
                <th className="p-2 w-40">动作</th>
                <th className="p-2 w-32">用户</th>
                <th className="p-2">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAuditLogs.map(log => (
                <tr key={log.id} className="hover:bg-blue-50">
                  <td className="p-2 font-mono">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-2 text-slate-700">{log.project_name || '-'}</td>
                  <td className="p-2 font-mono">{log.action}</td>
                  <td className="p-2 font-mono">{log.user_name || log.user_id || '-'}</td>
                  <td className="p-2 text-slate-700">
                    {(() => {
                      const detailText = log.details ? JSON.stringify(log.details) : '-';
                      return (
                        <span title={detailText} className="block max-w-[320px] truncate">
                          {detailText}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderMemoryView = () => (
    <div className="animate-fade-in max-w-2xl space-y-8">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        存储器 (Memory)
      </h3>

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
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        通信统计 (Communication)
      </h3>
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
        <div className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded border border-green-200">
          Port 1: Link UP
        </div>
        <div className="px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded border border-slate-200">
          Port 2: Link DOWN
        </div>
      </div>
    </div>
  );

  const renderTimeView = () => (
    <div className="animate-fade-in max-w-lg">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        设置时间 (Set Time)
      </h3>
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
          <label htmlFor="sync" className="text-xs text-slate-700">
            从 PG/PC 获取时间
          </label>
        </div>
        <button className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded text-xs font-bold shadow-sm transition-colors w-fit self-end">
          应用 (Apply)
        </button>
      </div>
    </div>
  );

  const renderFirmwareView = () => (
    <div className="animate-fade-in max-w-lg">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        固件更新 (Firmware Update)
      </h3>
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
            <input
              type="text"
              className="border border-slate-300 rounded p-1 flex-1 bg-white"
              placeholder="Select firmware file..."
              readOnly
            />
            <button className="px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded border border-slate-300 text-slate-700">
              浏览...
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 flex justify-end">
          <button className="bg-slate-300 text-slate-500 cursor-not-allowed px-4 py-2 rounded text-xs font-bold">
            开始更新
          </button>
        </div>
      </div>
    </div>
  );

  const renderResetView = () => (
    <div className="animate-fade-in max-w-lg">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
        复位 (Reset)
      </h3>

      <div className="space-y-6">
        <div className="border border-slate-200 rounded p-4 bg-white hover:border-primary transition-colors cursor-pointer group">
          <h4 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-orange-500">
              restart_alt
            </span>
            暖启动 (Warm Restart)
          </h4>
          <p className="text-[10px] text-slate-500 pl-7">
            重启 CPU，保持保持性数据 (Retentive Data)。
          </p>
          <div className="mt-2 pl-7">
            <button className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-xs rounded shadow-sm">
              执行
            </button>
          </div>
        </div>

        <div className="border border-slate-200 rounded p-4 bg-white hover:border-red-500 transition-colors cursor-pointer group">
          <h4 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-red-500">
              delete_forever
            </span>
            恢复出厂设置 (Reset to Factory)
          </h4>
          <p className="text-[10px] text-slate-500 pl-7">清除所有程序、数据和 IP 地址设置。</p>
          <div className="mt-2 pl-7">
            <button className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs rounded shadow-sm">
              重置设备
            </button>
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
            <img
              src="https://img.icons8.com/ios/100/137fec/microchip.png"
              alt="CPU"
              className="w-10 h-10 opacity-80"
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">PLC_1 [CPU 1511-1 PN]</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold border border-green-200 rounded">
                RUN
              </span>
              <span className="text-xs text-slate-500">IP: 192.168.0.1</span>
              <span className="text-xs text-slate-500">|</span>
              <span className="text-xs text-slate-500">FW: V2.9</span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
              Cycle Time
            </div>
            <div className="text-xl font-mono text-slate-700 font-bold">
              4.2 <span className="text-xs font-normal">ms</span>
            </div>
          </div>
          <div className="w-px h-10 bg-slate-200"></div>
          <div className="text-center">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
              Memory
            </div>
            <div className="text-xl font-mono text-slate-700 font-bold">
              24 <span className="text-xs font-normal">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav */}
        <div className="w-56 border-r border-slate-300 bg-slate-50 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
            诊断 (Diagnostics)
          </div>
          <nav className="space-y-0.5 px-2">
            <button
              onClick={() => setActiveView('compile')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'compile' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              编译诊断 (Compile)
            </button>
            <button
              onClick={() => setActiveView('watch')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'watch' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              监控表 (Watch)
            </button>
            <button
              onClick={() => setActiveView('plc')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'plc' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              PLC 硬件 (0x6B/0x6D)
            </button>
            <button
              onClick={() => setActiveView('import')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'import' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              导入历史 (Import)
            </button>
            <button
              onClick={() => setActiveView('audit')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'audit' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              审计日志 (Audit)
            </button>
            <button
              onClick={() => setActiveView('status')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'status' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              设备状态 (Device status)
            </button>
            <button
              onClick={() => setActiveView('buffer')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'buffer' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              诊断缓冲区 (Buffer)
            </button>
            <button
              onClick={() => setActiveView('cycle')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'cycle' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              循环时间 (Cycle time)
            </button>
            <button
              onClick={() => setActiveView('memory')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'memory' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              存储器 (Memory)
            </button>
            <button
              onClick={() => setActiveView('comm')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'comm' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              通信 (Communication)
            </button>
          </nav>

          <div className="p-3 mt-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            功能 (Functions)
          </div>
          <nav className="space-y-0.5 px-2">
            <button
              onClick={() => setActiveView('time')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'time' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              设置时间 (Set Time)
            </button>
            <button
              onClick={() => setActiveView('firmware')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'firmware' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              固件更新 (Firmware)
            </button>
            <button
              onClick={() => setActiveView('reset')}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded border ${activeView === 'reset' ? 'bg-white text-primary border-slate-200 shadow-sm' : 'text-slate-600 border-transparent hover:bg-slate-200'}`}
            >
              复位 (Reset)
            </button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white p-6">
          {activeView === 'compile' && renderCompileView()}
          {activeView === 'watch' && renderWatchView()}
          {activeView === 'plc' && renderPlcHwView()}
          {activeView === 'import' && renderImportHistoryView()}
          {activeView === 'audit' && renderAuditLogsView()}
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
