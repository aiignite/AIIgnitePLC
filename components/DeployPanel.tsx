import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPlcControlFrame,
  buildPlcStatusFrame,
  deployViaTransport,
  parsePlcStatusResponse,
  PLC_CTRL_STOP,
  readFrame,
  sendFrame,
} from '../services/rh850Protocol';
import {
  createSerialTransport,
  createTcpTransport,
  type Rh850Transport,
} from '../services/rh850Transport';
import { buildSlaveMapFramesFromChain } from '../services/slaveProtocol';
import { useAuthStore } from '../src/stores/authStore';
import { useDeployStore, type ConnectionMode } from '../src/stores/deployStore';
import { useHardwareStore } from '../src/stores/hardwareStore';
import { useProjectStore } from '../src/stores/projectStore';

interface DeployPanelProps {
  downloadHex?: string;
  deployHex?: string;
  scanMs?: number;
  onCompile?: () => Promise<void>;
}

export const DeployPanel: React.FC<DeployPanelProps> = ({
  downloadHex: propDownloadHex,
  deployHex: propDeployHex,
  scanMs: propScanMs = 10,
  onCompile,
}) => {
  const storeDownloadHex = useDeployStore(s => s.downloadHex);
  const storeDeployHex = useDeployStore(s => s.deployHex);
  const storeScanMs = useDeployStore(s => s.scanMs);
  const connectionMode = useDeployStore(s => s.connectionMode);
  const deviceHost = useDeployStore(s => s.deviceHost);
  const devicePort = useDeployStore(s => s.devicePort);
  const setTransport = useDeployStore(s => s.setTransport);
  const setConnectionMode = useDeployStore(s => s.setConnectionMode);
  const setDeviceEndpoint = useDeployStore(s => s.setDeviceEndpoint);
  const setHwStatus = useDeployStore(s => s.setHwStatus);
  const { modules, getEffectiveSlaveChain } = useHardwareStore();
  const { currentProjectId } = useProjectStore();
  const accessToken = useAuthStore(s => s.accessToken);

  const downloadHex = propDownloadHex || storeDownloadHex;
  const deployHex = propDeployHex || storeDeployHex;
  const scanMs = propScanMs || storeScanMs;

  const [transport, setTransportLocal] = useState<Rh850Transport | null>(null);
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeInitRef = useRef(true);

  const webSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Load USR-K endpoint from hardware config (RH850 CPU module)
  useEffect(() => {
    const cpu = modules.find(m => m.type === 'cpu');
    if (cpu?.moduleIp) setDeviceEndpoint(cpu.moduleIp, cpu.tcpPort ?? 8234);
    else if (cpu?.ip) setDeviceEndpoint(cpu.ip, cpu.tcpPort ?? 8234);
  }, [modules, setDeviceEndpoint]);

  const disconnect = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (transport) {
      try {
        await transport.disconnect();
      } catch {
        /* ignore */
      }
    }
    setTransportLocal(null);
    setTransport(null);
    setConnected(false);
    setStatusMsg('已断开');
  }, [transport, setTransport]);

  const connect = async () => {
    try {
      let t: Rh850Transport;
      if (connectionMode === 'serial') {
        if (!webSerialSupported) {
          setStatusMsg('当前浏览器不支持 Web Serial API（请使用 Chrome/Edge）');
          return;
        }
        t = createSerialTransport();
        await t.connect({ baudRate });
        setStatusMsg(`已连接 USB 串口 @ ${baudRate} baud`);
      } else {
        if (!accessToken) {
          setStatusMsg('远程 TCP 需要登录后使用');
          return;
        }
        t = createTcpTransport();
        await t.connect({ host: deviceHost, port: devicePort, token: accessToken });
        setStatusMsg(`已连接远程 TCP ${deviceHost}:${devicePort}`);
      }
      setTransportLocal(t);
      setTransport(t);
      setConnected(true);
    } catch (e) {
      setStatusMsg((e as Error).message || '连接失败');
    }
  };

  const pollStatus = useCallback(async () => {
    if (!transport?.isConnected()) return;
    try {
      await sendFrame(transport, buildPlcStatusFrame(), 0);
      const resp = await readFrame(transport, 300);
      if (resp) {
        const parsed = parsePlcStatusResponse(resp);
        if (parsed) {
          setStatusMsg(
            `模式=${parsed.mode} scan=${parsed.scanMs}ms 周期=${parsed.lastScanUs}µs ${parsed.errorMessage}`
          );
          setHwStatus({
            mode: parsed.mode,
            scanMs: parsed.scanMs,
            lastScanUs: parsed.lastScanUs,
            errorCode: parsed.errorCode,
            errorMessage: parsed.errorMessage,
          });
        }
      }
    } catch {
      /* ignore poll errors */
    }
  }, [transport, setHwStatus]);

  const handleTestConnection = async () => {
    if (!transport?.isConnected()) {
      setStatusMsg('请先连接设备');
      return;
    }
    setBusy(true);
    try {
      const status = await useDeployStore.getState().pollHwStatus();
      if (status) {
        setStatusMsg(
          `测试成功 — 模式=${status.mode} scan=${status.scanMs}ms 周期=${status.lastScanUs}µs`
        );
      } else {
        setStatusMsg('测试连接超时，请检查 USR-K 模块 IP/端口与 PCBA 配置');
      }
    } catch (e) {
      setStatusMsg(`测试失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (modeInitRef.current) {
      modeInitRef.current = false;
      return;
    }
    void disconnect();
  }, [connectionMode, disconnect]);

  const handleDeploy = async () => {
    if (onCompile) {
      await onCompile();
    }
    const hex = useDeployStore.getState().deployHex || deployHex || downloadHex;
    if (!transport?.isConnected() || !hex) {
      setStatusMsg('请先连接设备并编译程序');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await deployViaTransport(transport, hex, deployHex, (pct, msg) => {
        setProgress(pct);
        setStatusMsg(msg);
      });
      setStatusMsg('下载完成，PLC 已启动');
      if (!pollRef.current) {
        pollRef.current = setInterval(pollStatus, 2000);
      }
      await pollStatus();
    } catch (e) {
      setStatusMsg(`下载失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!transport?.isConnected()) return;
    setBusy(true);
    try {
      await sendFrame(transport, buildPlcControlFrame(PLC_CTRL_STOP));
      setStatusMsg('PLC 已停止');
      await pollStatus();
    } catch (e) {
      setStatusMsg(`停止失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeploySlaveMap = async () => {
    if (!transport?.isConnected()) {
      setStatusMsg('请先连接设备');
      return;
    }
    const chain = getEffectiveSlaveChain().filter(e => e.enabled);
    if (chain.length === 0) {
      setStatusMsg('无启用的从站映射，请在设备组态中配置');
      return;
    }
    setBusy(true);
    try {
      const frames = buildSlaveMapFramesFromChain(chain);
      for (let i = 0; i < frames.length; i++) {
        await sendFrame(transport, frames[i], 30);
        setStatusMsg(`下发从站映射 0x6F ${i + 1}/${frames.length}`);
      }
      setStatusMsg(`从站 I/O 映射下发完成 (${frames.length} 帧, ${chain.length} 从站)`);
    } catch (e) {
      setStatusMsg(`从站映射下发失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportOnly = () => {
    if (!downloadHex) return;
    const blob = new Blob([downloadHex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plc_download.hex';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white text-xs">
      <h3 className="text-sm font-bold text-slate-800 mb-3">RH850 部署 (UART3)</h3>

      <div className="flex flex-wrap gap-3 mb-3 items-center">
        <label className="flex items-center gap-1 text-slate-600">
          <input
            type="radio"
            name="connMode"
            checked={connectionMode === 'serial'}
            onChange={() => setConnectionMode('serial' as ConnectionMode)}
            disabled={connected}
          />
          本地 USB
        </label>
        <label className="flex items-center gap-1 text-slate-600">
          <input
            type="radio"
            name="connMode"
            checked={connectionMode === 'tcp'}
            onChange={() => setConnectionMode('tcp' as ConnectionMode)}
            disabled={connected}
          />
          远程 TCP (LAN)
        </label>
      </div>

      {connectionMode === 'serial' && !webSerialSupported && (
        <div className="mb-3 p-2 bg-amber-50 text-amber-800 rounded">
          Web Serial 不可用。可切换「远程 TCP」或使用「导出 .hex」。
        </div>
      )}

      {connectionMode === 'serial' ? (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <label className="text-slate-600">
            波特率
            <select
              className="ml-1 border border-slate-300 rounded px-1 py-0.5"
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              disabled={connected}
            >
              <option value={9600}>9600</option>
              <option value={115200}>115200</option>
              <option value={921600}>921600</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <label className="text-slate-600">
            模块 IP
            <input
              type="text"
              className="ml-1 border border-slate-300 rounded px-2 py-0.5 font-mono w-36"
              value={deviceHost}
              onChange={e => setDeviceEndpoint(e.target.value, devicePort)}
              disabled={connected}
            />
          </label>
          <label className="text-slate-600">
            端口
            <input
              type="number"
              className="ml-1 border border-slate-300 rounded px-2 py-0.5 font-mono w-20"
              value={devicePort}
              onChange={e => setDeviceEndpoint(deviceHost, Number(e.target.value))}
              disabled={connected}
            />
          </label>
          {!currentProjectId && (
            <span className="text-amber-600">在设备配置中保存 USR-K IP 可自动填充</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <span className="text-slate-500">scan_ms={scanMs}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {!connected ? (
          <button
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={connect}
            disabled={connectionMode === 'serial' && !webSerialSupported}
          >
            {connectionMode === 'serial' ? '连接串口' : '连接 TCP'}
          </button>
        ) : (
          <button
            className="px-3 py-1.5 bg-slate-500 text-white rounded hover:bg-slate-600"
            onClick={disconnect}
          >
            断开
          </button>
        )}
        <button
          className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          onClick={handleDeploy}
          disabled={!connected || !downloadHex || busy}
        >
          编译并下载
        </button>
        <button
          className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          onClick={handleStop}
          disabled={!connected || busy}
        >
          停止 PLC
        </button>
        <button
          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
          onClick={handleExportOnly}
          disabled={!downloadHex}
        >
          导出 .hex
        </button>
        <button
          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
          onClick={pollStatus}
          disabled={!connected || busy}
        >
          查询状态
        </button>
        {connectionMode === 'tcp' && (
          <button
            className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200 disabled:opacity-50"
            onClick={handleTestConnection}
            disabled={!connected || busy}
          >
            测试连接
          </button>
        )}
        <button
          className="px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
          onClick={handleDeploySlaveMap}
          disabled={!connected || busy}
        >
          下发从站映射 (0x6F)
        </button>
      </div>

      {busy && (
        <div className="mb-2">
          <div className="h-2 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-slate-500 mt-1">{progress}%</div>
        </div>
      )}

      <div className="p-2 bg-slate-50 rounded text-slate-700 font-mono text-[11px] min-h-[2rem]">
        {statusMsg || '等待操作…'}
      </div>
    </div>
  );
};
