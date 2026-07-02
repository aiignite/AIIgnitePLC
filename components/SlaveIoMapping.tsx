import React, { useMemo, useState } from 'react';
import { sendFrame } from '../services/rh850Protocol';
import { buildSlaveMapFramesFromChain, framesToHex } from '../services/slaveProtocol';
import { useDeployStore } from '../src/stores/deployStore';
import { useHardwareStore, type SlaveBoardConfig } from '../src/stores/hardwareStore';
import { useProjectStore } from '../src/stores/projectStore';
import {
  formatBoardId,
  getSlaveDefinition,
  UART_SLAVE_PROTOCOL,
  validateSlaveChain,
} from '../src/types/rh850Slaves';

interface SlaveIoMappingProps {
  compact?: boolean;
}

export const SlaveIoMapping: React.FC<SlaveIoMappingProps> = ({ compact = false }) => {
  const { currentProjectId } = useProjectStore();
  const modules = useHardwareStore(s => s.modules);
  const updateSlaveChain = useHardwareStore(s => s.updateSlaveChain);
  const syncSlaveChainFromModules = useHardwareStore(s => s.syncSlaveChainFromModules);
  const getEffectiveSlaveChain = useHardwareStore(s => s.getEffectiveSlaveChain);
  const transport = useDeployStore(s => s.transport);

  const chain = useMemo(() => getEffectiveSlaveChain(), [modules, getEffectiveSlaveChain]);
  const [localChain, setLocalChain] = useState<SlaveBoardConfig[]>(chain);
  const [exportHex, setExportHex] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  React.useEffect(() => {
    setLocalChain(getEffectiveSlaveChain());
    setDirty(false);
  }, [modules, getEffectiveSlaveChain]);

  const chainErrors = validateSlaveChain(localChain);

  const updateEntry = (chainPos: number, patch: Partial<SlaveBoardConfig>) => {
    setLocalChain(prev => prev.map(e => (e.chainPos === chainPos ? { ...e, ...patch } : e)));
    setDirty(true);
  };

  const handleSyncFromModules = async () => {
    if (!currentProjectId) return;
    await syncSlaveChainFromModules(currentProjectId);
    setLocalChain(getEffectiveSlaveChain());
    setDirty(false);
    setStatus('已从机架 IO 模块同步 slaveChain');
  };

  const handleSave = async () => {
    if (!currentProjectId || chainErrors.length > 0) return;
    await updateSlaveChain(currentProjectId, localChain);
    setDirty(false);
    setStatus('映射已保存到 CPU 配置');
  };

  const handleExport = async () => {
    if (dirty && currentProjectId && chainErrors.length === 0) {
      await updateSlaveChain(currentProjectId, localChain);
      setDirty(false);
    }
    setExportHex(framesToHex(buildSlaveMapFramesFromChain(localChain)));
    setStatus('已生成 0x6F 映射帧');
  };

  const handleDeployMap = async () => {
    if (!transport?.isConnected()) {
      setStatus('请先在部署面板连接设备');
      return;
    }
    if (chainErrors.length > 0) {
      setStatus(`配置错误: ${chainErrors[0]}`);
      return;
    }
    if (dirty && currentProjectId) {
      await updateSlaveChain(currentProjectId, localChain);
      setDirty(false);
    }
    setBusy(true);
    try {
      const frames = buildSlaveMapFramesFromChain(localChain);
      for (let i = 0; i < frames.length; i++) {
        await sendFrame(transport, frames[i], 30);
        setStatus(`下发 0x6F 映射 ${i + 1}/${frames.length}`);
      }
      setStatus(`从站映射下发完成 (${frames.length} 帧)`);
    } catch (e) {
      setStatus(`下发失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? '' : 'border border-slate-200 rounded-lg p-4 bg-white'}>
      {!compact && (
        <>
          <h3 className="text-sm font-bold text-slate-800 mb-2">从站 I/O 映射 (0x6F)</h3>
          <p className="text-xs text-slate-500 mb-2">
            UART2 菊花链 → PLC %I/%Q 扩展区。chainPos = 协议 slavenum（链深度）；BoardID
            标识从板类型。
          </p>
          <p className="text-[10px] text-slate-400 mb-4 font-mono">
            协议: 0x{UART_SLAVE_PROTOCOL.funcCodes.plcSlaveMap.toString(16)} | 最大{' '}
            {UART_SLAVE_PROTOCOL.maxSlaves} 从站 | 帧头 55AA55AA
          </p>
        </>
      )}

      {chainErrors.length > 0 && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {chainErrors.map(e => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      <table className="w-full text-xs border border-slate-200 mb-4">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2">启用</th>
            <th className="p-2">链位置</th>
            <th className="p-2">BoardID</th>
            <th className="p-2">类型</th>
            <th className="p-2">通道</th>
            <th className="p-2">DI 寄存器</th>
            <th className="p-2">DO 寄存器</th>
            <th className="p-2">ioBytes</th>
          </tr>
        </thead>
        <tbody>
          {localChain.map(e => {
            const def = getSlaveDefinition(e.boardType);
            return (
              <tr key={e.chainPos} className="border-t border-slate-100">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={e.enabled}
                    onChange={ev => updateEntry(e.chainPos, { enabled: ev.target.checked })}
                  />
                </td>
                <td className="p-2 text-center font-mono">{e.chainPos}</td>
                <td className="p-2 font-mono text-[10px]">{formatBoardId(e.boardId)}</td>
                <td className="p-2 uppercase text-[10px]">{def?.shortLabel ?? e.boardType}</td>
                <td className="p-2 text-[10px] text-slate-600">{def?.ioLength ?? '—'}</td>
                <td className="p-2">
                  <input
                    className="w-20 font-mono border border-slate-300 rounded px-1"
                    value={e.diRegAddr ? `0x${e.diRegAddr.toString(16).toUpperCase()}` : '—'}
                    disabled={!e.diRegAddr}
                    onChange={ev => {
                      const v = parseInt(ev.target.value.replace(/^0x|—/i, ''), 16);
                      if (!Number.isNaN(v)) updateEntry(e.chainPos, { diRegAddr: v });
                    }}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-20 font-mono border border-slate-300 rounded px-1"
                    value={e.doRegAddr ? `0x${e.doRegAddr.toString(16).toUpperCase()}` : '—'}
                    disabled={!e.doRegAddr}
                    onChange={ev => {
                      const v = parseInt(ev.target.value.replace(/^0x|—/i, ''), 16);
                      if (!Number.isNaN(v)) updateEntry(e.chainPos, { doRegAddr: v });
                    }}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min={1}
                    max={4}
                    className="w-12 border border-slate-300 rounded px-1"
                    value={e.ioBytes ?? 2}
                    onChange={ev =>
                      updateEntry(e.chainPos, { ioBytes: parseInt(ev.target.value, 10) || 2 })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-1.5 bg-slate-500 text-white rounded text-xs hover:bg-slate-600"
          onClick={handleSyncFromModules}
          disabled={!currentProjectId}
        >
          从机架同步
        </button>
        <button
          className="px-3 py-1.5 bg-slate-600 text-white rounded text-xs hover:bg-slate-700 disabled:opacity-50"
          onClick={handleSave}
          disabled={!dirty || !currentProjectId || chainErrors.length > 0}
        >
          保存映射
        </button>
        <button
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
          onClick={handleExport}
        >
          生成 0x6F 帧
        </button>
        <button
          className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
          onClick={handleDeployMap}
          disabled={busy || chainErrors.length > 0}
        >
          下发到设备
        </button>
      </div>

      {status && <p className="mt-2 text-xs text-slate-600">{status}</p>}

      {exportHex && (
        <textarea
          className="mt-3 w-full h-24 font-mono text-[10px] border border-slate-200 rounded p-2"
          readOnly
          value={exportHex}
        />
      )}
    </div>
  );
};

/** @deprecated Use SlaveBoardConfig from hardwareStore */
export interface SlaveIoEntry {
  id: string;
  enabled: boolean;
  slaveId: number;
  diRegAddr: number;
  doRegAddr: number;
}
