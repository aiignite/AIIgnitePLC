import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HardwareModule, useHardwareStore } from '../src/stores/hardwareStore';
import { useProjectStore } from '../src/stores/projectStore';
import {
  channelRegAddr,
  DEFAULT_SLAVE_CHAIN,
  formatBoardId,
  formatRegAddr,
  getSlaveDefinition,
  MASTER_BUILTIN_IO,
  MASTER_CONTROLLER,
  resolveSlaveChain,
  SLAVE_BOARD_DEFINITIONS,
  suggestPlcTagAddress,
  validateBoardIdForType,
  type SlaveBoardType,
} from '../src/types/rh850Slaves';
import { SlaveIoMapping } from './SlaveIoMapping';

type CatalogItem = {
  name: string;
  article: string;
  type: 'cpu' | 'io' | 'comm';
  ioLength?: number;
  boardType?: SlaveBoardType;
  firmware?: string;
};

const RH850_CATALOG: CatalogItem[] = [
  {
    name: 'RH850 R7F701581 Master',
    article: 'SEEYAO-PLC-MASTER',
    type: 'cpu',
    firmware: 'V2025042901',
  },
  { name: 'CAN-FD x4 Bridge', article: 'SEEYAO-CAN4', type: 'comm' },
  { name: 'LIN Master x2', article: 'SEEYAO-LIN2', type: 'comm' },
  {
    name: SLAVE_BOARD_DEFINITIONS.ad.name,
    article: SLAVE_BOARD_DEFINITIONS.ad.article,
    type: 'io',
    ioLength: SLAVE_BOARD_DEFINITIONS.ad.ioLength,
    boardType: 'ad',
    firmware: SLAVE_BOARD_DEFINITIONS.ad.firmware,
  },
  {
    name: SLAVE_BOARD_DEFINITIONS.relay.name,
    article: SLAVE_BOARD_DEFINITIONS.relay.article,
    type: 'io',
    ioLength: SLAVE_BOARD_DEFINITIONS.relay.ioLength,
    boardType: 'relay',
    firmware: SLAVE_BOARD_DEFINITIONS.relay.firmware,
  },
  {
    name: SLAVE_BOARD_DEFINITIONS.light.name,
    article: SLAVE_BOARD_DEFINITIONS.light.article,
    type: 'io',
    ioLength: SLAVE_BOARD_DEFINITIONS.light.ioLength,
    boardType: 'light',
    firmware: SLAVE_BOARD_DEFINITIONS.light.firmware,
  },
  {
    name: SLAVE_BOARD_DEFINITIONS.resistor.name,
    article: SLAVE_BOARD_DEFINITIONS.resistor.article,
    type: 'io',
    ioLength: SLAVE_BOARD_DEFINITIONS.resistor.ioLength,
    boardType: 'resistor',
    firmware: SLAVE_BOARD_DEFINITIONS.resistor.firmware,
  },
  { name: 'PWM HSD x4', article: 'SEEYAO-PWM4', type: 'io', ioLength: 4 },
];

const CATALOG: CatalogItem[] = [
  { name: 'DI 32x24VDC HF', article: '6ES7 521-1BL00-0AB0', type: 'io', ioLength: 4 },
  { name: 'DQ 32x24VDC/0.5A', article: '6ES7 522-1BL01-0AB0', type: 'io', ioLength: 4 },
  { name: 'AI 4xU/I/RTD/TC', article: '6ES7 531-7QD00-0AB0', type: 'io', ioLength: 8 },
  { name: 'CP 1543-1', article: '6GK7 543-1AX00-0XE0', type: 'comm' },
];

type ConfigViewMode = 'device' | 'network' | 'topology';
type InspectorTab =
  | 'general'
  | 'ethernet'
  | 'io'
  | 'slave_bus'
  | 'slave_map'
  | 'master_io'
  | 'hw_id';

function getModuleHeaderLabel(mod: HardwareModule): string {
  if (mod.type === 'cpu') return 'CPU';
  if (mod.type === 'ps') return 'PS';
  if (mod.type === 'comm') return 'CP';
  if (mod.boardType) {
    const def = getSlaveDefinition(mod.boardType);
    return def?.shortLabel ?? 'IO';
  }
  return 'IO';
}

function getModuleDisplayName(mod: HardwareModule): string {
  if (mod.boardType) {
    const def = getSlaveDefinition(mod.boardType);
    if (def) return def.shortLabel;
  }
  return mod.name.split(' ')[0];
}

export const DeviceConfiguration: React.FC = () => {
  const { currentProjectId } = useProjectStore();
  const { modules, loadHardware, updateModule, deleteModule } = useHardwareStore();

  const [selectedSlot, setSelectedSlot] = useState<number>(2);
  const [viewMode, setViewMode] = useState<ConfigViewMode>('device');
  const [showCatalog, setShowCatalog] = useState<{ slot: number; visible: boolean }>({
    slot: -1,
    visible: false,
  });

  const [inspectorHeight, setInspectorHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [catalogMode, setCatalogMode] = useState<'rh850' | 'siemens'>('rh850');
  const activeCatalog = catalogMode === 'rh850' ? RH850_CATALOG : CATALOG;
  const [activeTab, setActiveTab] = useState<InspectorTab>('general');

  const cpuModule = useMemo(() => modules.find(m => m.type === 'cpu'), [modules]);
  const slaveChain = useMemo(() => resolveSlaveChain(cpuModule?.slaveChain), [cpuModule]);
  const slaveIoModules = useMemo(
    () => modules.filter(m => m.type === 'io' && m.boardType).sort((a, b) => a.slot - b.slot),
    [modules]
  );

  useEffect(() => {
    if (!currentProjectId) return;
    loadHardware(currentProjectId);
  }, [currentProjectId, loadHardware]);

  const patchModule = (slot: number, patch: Partial<HardwareModule>) => {
    if (!currentProjectId) return;
    const module = modules.find(m => m.slot === slot);
    if (module) {
      updateModule(currentProjectId, slot, { ...module, ...patch });
    }
  };

  const handleUpdateModule = (
    slot: number,
    field: keyof HardwareModule,
    value: string | number | boolean
  ) => {
    patchModule(slot, { [field]: value });
  };

  const handleDeleteModule = (slot: number) => {
    if (!currentProjectId) return;
    if (confirm(`确定要删除槽位 ${slot} 的模块吗?`)) {
      deleteModule(currentProjectId, slot);
      setSelectedSlot(-1);
    }
  };

  const handleInsertModule = (template: CatalogItem) => {
    if (!currentProjectId) return;

    const slaveIoCount = modules.filter(m => m.type === 'io' && m.boardType).length;
    const chainPos = template.boardType ? slaveIoCount + 1 : undefined;
    const def = template.boardType ? SLAVE_BOARD_DEFINITIONS[template.boardType] : undefined;

    const newModule: HardwareModule = {
      slot: showCatalog.slot,
      name: template.name,
      articleNumber: template.article,
      firmware: template.firmware ?? 'V1.0',
      type: template.type,
      hwId: 270 + modules.length,
      ioStart:
        template.type === 'io'
          ? 100 + (chainPos ? (chainPos - 1) * (template.ioLength ?? 1) : 0)
          : undefined,
      ioLength: template.ioLength,
      ip: template.type === 'comm' ? '192.168.0.20' : undefined,
      moduleType: template.type === 'cpu' ? 'K2' : undefined,
      moduleIp: template.type === 'cpu' ? '192.168.0.10' : undefined,
      tcpPort: template.type === 'cpu' ? 8234 : undefined,
      baudRate: template.type === 'cpu' ? 115200 : undefined,
      slaveChain: template.type === 'cpu' ? DEFAULT_SLAVE_CHAIN.map(s => ({ ...s })) : undefined,
      boardType: template.boardType,
      boardId: def?.boardId,
      chainPos,
      diRegAddr: def?.diRegAddr,
      doRegAddr: def?.doRegAddr,
      enabled: template.boardType ? true : undefined,
    };

    updateModule(currentProjectId, showCatalog.slot, newModule);
    setShowCatalog({ slot: -1, visible: false });
    setSelectedSlot(newModule.slot);
  };

  const getModuleAtSlot = (slot: number) => modules.find(m => m.slot === slot);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < 600) setInspectorHeight(newHeight);
      }
    },
    [isResizing]
  );

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

  const renderDeviceView = () => (
    <div className="flex-1 overflow-auto p-8 flex items-start justify-center bg-slate-100 relative h-full min-h-0">
      <div className="relative flex flex-col items-center select-none scale-90 md:scale-100 transition-transform origin-top">
        <div className="h-4 w-[720px] max-w-full bg-slate-400 border border-slate-500 shadow-inner mb-0.5 rounded-sm" />

        <div className="flex bg-slate-200 border border-slate-400 p-1 shadow-xl min-h-[220px] overflow-x-auto">
          {Array.from({ length: 10 }).map((_, idx) => {
            const slotNum = idx + 1;
            const mod = getModuleAtSlot(slotNum);
            const isSelected = selectedSlot === slotNum;

            if (mod) {
              return (
                <div
                  key={slotNum}
                  onClick={() => setSelectedSlot(slotNum)}
                  className={`relative flex flex-col items-center border border-slate-400 bg-white transition-all cursor-pointer group
                    ${mod.type === 'ps' ? 'w-16' : mod.type === 'cpu' ? 'w-28' : 'w-14'}
                    ${isSelected ? 'ring-2 ring-primary z-10 shadow-lg' : 'hover:brightness-95'}`}
                  style={{ height: '200px' }}
                >
                  <div className="w-full h-5 bg-slate-700 text-white text-[9px] flex items-center justify-center font-bold">
                    {getModuleHeaderLabel(mod)}
                  </div>
                  <div className="flex-1 w-full p-1 flex flex-col items-center justify-between">
                    <div className="text-[9px] text-center font-bold leading-tight w-full px-0.5 mt-1">
                      {getModuleDisplayName(mod)}
                    </div>
                    {mod.boardId != null && (
                      <div className="text-[7px] font-mono text-blue-700 bg-blue-50 px-1 rounded">
                        {formatBoardId(mod.boardId)}
                      </div>
                    )}
                    {mod.chainPos != null && (
                      <div className="text-[7px] text-slate-500">链 #{mod.chainPos}</div>
                    )}
                    {mod.type === 'cpu' && mod.moduleIp && (
                      <div className="text-[7px] font-mono text-slate-600 truncate w-full text-center px-0.5">
                        {mod.moduleIp}:{mod.tcpPort ?? 8234}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5 my-1 w-full px-2">
                      <div className="flex justify-between items-center text-[7px] text-slate-500">
                        <span>RUN</span>
                        <div
                          className={`size-1.5 rounded-full ${mod.type === 'cpu' ? 'bg-green-500' : 'bg-slate-300'}`}
                        />
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 border border-slate-300 h-8 mt-auto mb-2 flex items-center justify-center gap-1">
                      {mod.type === 'cpu' && (
                        <>
                          <div className="size-3 bg-slate-300 border border-slate-400 rounded-sm" />
                          <div className="size-3 bg-slate-300 border border-slate-400 rounded-sm" />
                        </>
                      )}
                      {mod.type === 'io' && <div className="w-8 h-3 bg-slate-800 rounded-[1px]" />}
                    </div>
                  </div>
                  <div className="absolute -bottom-6 text-xs text-slate-500 font-bold">
                    {mod.slot}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={slotNum}
                onClick={() => setSelectedSlot(slotNum)}
                className={`w-14 h-[200px] border-r border-slate-300 bg-slate-100/50 flex flex-col items-center justify-center text-slate-300 text-xs transition-colors hover:bg-slate-200 cursor-pointer
                  ${isSelected ? 'bg-blue-50/50 ring-2 ring-primary/50 inset-0 z-0' : ''}`}
              >
                {isSelected && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setShowCatalog({ slot: slotNum, visible: true });
                    }}
                    className="size-6 bg-white border border-slate-300 rounded-full flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary shadow-sm"
                    title="添加模块"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCatalog.visible && (
        <div className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-300 shadow-xl z-50 flex flex-col">
          <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
            <h4 className="font-bold text-slate-700 text-xs">硬件目录</h4>
            <button
              onClick={() => setShowCatalog({ slot: -1, visible: false })}
              className="text-slate-500 hover:text-red-500"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-2 pl-1">
              Slot {showCatalog.slot}
            </div>
            <div className="flex gap-2 mb-2">
              <button
                className={`text-[10px] px-2 py-0.5 rounded ${catalogMode === 'rh850' ? 'bg-primary text-white' : 'bg-slate-100'}`}
                onClick={() => setCatalogMode('rh850')}
              >
                RH850 主站
              </button>
              <button
                className={`text-[10px] px-2 py-0.5 rounded ${catalogMode === 'siemens' ? 'bg-primary text-white' : 'bg-slate-100'}`}
                onClick={() => setCatalogMode('siemens')}
              >
                Siemens 参考
              </button>
            </div>
            {activeCatalog.map(item => (
              <div
                key={item.article}
                onClick={() => handleInsertModule(item)}
                className="p-2 border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300 cursor-pointer flex flex-col gap-1 mb-1"
              >
                <div className="text-xs font-bold text-slate-700">{item.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">{item.article}</div>
                {item.boardType && (
                  <div className="text-[10px] text-blue-600 font-mono">
                    {formatBoardId(SLAVE_BOARD_DEFINITIONS[item.boardType].boardId)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderNetworkView = () => {
    const moduleIp = cpuModule?.moduleIp || cpuModule?.ip || '192.168.0.10';
    const tcpPort = cpuModule?.tcpPort ?? 8234;

    return (
      <div className="flex-1 p-8 bg-white relative overflow-auto h-full">
        <h3 className="absolute top-4 left-4 font-bold text-slate-700 text-sm">
          RH850 远程通讯拓扑
        </h3>
        <div className="absolute top-4 right-4 bg-blue-50 text-blue-800 text-xs px-2 py-1 border border-blue-200 rounded">
          在设备视图 CPU 模块中编辑 USR-K IP
        </div>

        <div className="flex items-center gap-8 mt-16 ml-8 flex-wrap">
          <div className="relative w-36 h-44 border-2 border-slate-400 bg-slate-50 shadow-md flex flex-col">
            <div className="h-6 bg-slate-600 text-white text-xs font-bold flex items-center justify-center">
              AIIgnitePLC
            </div>
            <div className="flex-1 p-2 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-slate-600">computer</span>
              <span className="text-xs font-bold mt-2">浏览器 / 后端</span>
              <span className="text-[10px] text-slate-500 mt-1">ws/device → TCP Client</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 mt-16">
            <div className="h-1 bg-orange-500 w-16" />
            <span className="text-[9px] text-slate-500">LAN TCP</span>
          </div>

          <div className="relative w-36 h-44 border-2 border-orange-400 bg-orange-50 shadow-md flex flex-col">
            <div className="h-6 bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
              USR-K {cpuModule?.moduleType ?? 'K2'}
            </div>
            <div className="flex-1 p-2 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-orange-600">router</span>
              <span className="text-xs font-bold mt-2">TCP Server 透传</span>
              <span className="text-[10px] font-mono text-slate-700 mt-1">
                {moduleIp}:{tcpPort}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 mt-16">
            <div className="h-1 bg-green-600 w-16" />
            <span className="text-[9px] text-slate-500">UART3 115200</span>
          </div>

          <div className="relative w-36 h-44 border-2 border-primary bg-slate-50 shadow-md flex flex-col">
            <div className="h-6 bg-primary text-white text-xs font-bold flex items-center justify-center">
              RH850 Master
            </div>
            <div className="flex-1 p-2 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-slate-600">memory</span>
              <span className="text-xs font-bold mt-2">R7F701581</span>
              <span className="text-[10px] text-slate-500 mt-1">ControlID 0x01 本地</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs bg-white p-2 border border-slate-200 shadow-sm">
          <div className="w-8 h-1 bg-orange-500" />
          <span>TCP 透传 + UART3 RH850 协议 (0x55AA55AA)</span>
        </div>
      </div>
    );
  };

  const renderTopologyView = () => {
    const chainNodes =
      slaveIoModules.length > 0
        ? slaveIoModules.map(mod => ({
            label: getModuleDisplayName(mod),
            boardId: mod.boardId,
            chainPos: mod.chainPos,
            diReg: mod.diRegAddr,
            doReg: mod.doRegAddr,
            channelDesc: mod.boardType ? getSlaveDefinition(mod.boardType)?.channelDesc : undefined,
          }))
        : slaveChain.map(s => ({
            label: getSlaveDefinition(s.boardType)?.shortLabel ?? s.boardType.toUpperCase(),
            boardId: s.boardId,
            chainPos: s.chainPos,
            diReg: s.diRegAddr,
            doReg: s.doRegAddr,
            channelDesc: getSlaveDefinition(s.boardType)?.channelDesc,
          }));

    return (
      <div className="flex-1 p-8 bg-slate-50 relative overflow-auto h-full">
        <h3 className="font-bold text-slate-700 text-sm mb-6">UART2 从站菊花链拓扑</h3>

        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-32 border-2 border-primary bg-white shadow-sm rounded p-3 text-center">
              <div className="text-xs font-bold text-primary">RH850 Master</div>
              <div className="text-[10px] text-slate-500 mt-2">UART2 PCAN</div>
              <div className="text-[9px] font-mono text-slate-600 mt-1">
                {MASTER_BUILTIN_IO.diDesc}
              </div>
              <div className="text-[9px] font-mono text-slate-600 mt-0.5">
                {MASTER_BUILTIN_IO.doDesc}
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">内置 IO</div>
          </div>

          {chainNodes.map((node, idx) => (
            <React.Fragment key={`${node.boardId}-${idx}`}>
              <div className="flex items-center mt-10 shrink-0">
                <div className="h-0.5 w-10 bg-slate-400" />
                <span className="text-[9px] text-slate-400 mx-1">→</span>
                <div className="h-0.5 w-10 bg-slate-400" />
              </div>
              <div className="flex flex-col items-center shrink-0">
                <div className="w-32 border border-slate-400 bg-white shadow-sm rounded p-3 text-center">
                  <div className="text-xs font-bold text-slate-700">{node.label}</div>
                  <div className="text-[10px] font-mono text-blue-700 mt-1">
                    {node.boardId != null ? formatBoardId(node.boardId) : '—'}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1">
                    链 #{node.chainPos ?? idx + 1}
                  </div>
                  <div className="text-[9px] font-mono text-slate-600 mt-2">
                    DI {formatRegAddr(node.diReg)} / DO {formatRegAddr(node.doReg)}
                  </div>
                  {node.channelDesc && (
                    <div className="text-[8px] text-slate-400 mt-1 leading-tight">
                      {node.channelDesc}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          物理链接：主站 UART2 → 从板 1 → 从板 2 → …（最多 16 块）。BoardID 标识从板类型，链位置对应
          0x6F slavenum。
        </div>
      </div>
    );
  };

  const renderSlaveBusTab = (module: HardwareModule) => {
    if (!module.boardType) {
      return <div className="p-4 text-xs text-slate-400 italic">此模块不是 UART2 从站板。</div>;
    }

    const def = getSlaveDefinition(module.boardType);
    const boardIdValid =
      module.boardId != null && module.boardType
        ? validateBoardIdForType(module.boardType, module.boardId)
        : true;

    return (
      <div className="p-4 space-y-4 max-w-3xl">
        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1">
          从站总线 — {def?.name} ({def?.commInterface})
        </h5>

        <div className="grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
          <label className="text-right text-slate-500">BoardID:</label>
          <input
            type="text"
            className={`border px-2 py-1 w-24 font-mono rounded focus:border-primary outline-none ${boardIdValid ? 'border-slate-300' : 'border-red-400 bg-red-50'}`}
            value={module.boardId != null ? formatBoardId(module.boardId) : ''}
            onChange={e => {
              const v = parseInt(e.target.value.replace(/^0x/i, ''), 16);
              if (!Number.isNaN(v)) handleUpdateModule(module.slot, 'boardId', v);
            }}
          />
          <label className="text-right text-slate-500">固件:</label>
          <span className="font-mono text-slate-600">{def?.firmware}</span>
          <label className="text-right text-slate-500">菊花链位置:</label>
          <input
            type="number"
            min={1}
            max={16}
            className="border border-slate-300 w-16 px-2 py-1 rounded focus:border-primary outline-none"
            value={module.chainPos ?? 1}
            onChange={e =>
              handleUpdateModule(module.slot, 'chainPos', parseInt(e.target.value, 10) || 1)
            }
          />
          <label className="text-right text-slate-500">DI 寄存器:</label>
          <span className="font-mono">{formatRegAddr(module.diRegAddr)}</span>
          <label className="text-right text-slate-500">DO 寄存器:</label>
          <span className="font-mono">{formatRegAddr(module.doRegAddr)}</span>
        </div>

        {!boardIdValid && (
          <p className="text-xs text-red-600">
            BoardID 高字节与从板类型不匹配（期望基址 0x
            {def ? (def.baseId >> 8).toString(16).padStart(2, '0').toUpperCase() : '??'}xx）
          </p>
        )}

        <div>
          <h6 className="text-xs font-bold text-slate-700 mb-2">通讯协议</h6>
          <div className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 font-mono space-y-1">
            <div>帧头: 55 AA 55 AA | ControlID=0x00 转发 | FuncCode 0x44读/0x46写</div>
            <div>段格式: slavenum + [BoardID(2) + RegAddr(2) + RegCount(2)]×N</div>
            <div>0x6F PLC映射: chainPos={module.chainPos} → slavenum</div>
          </div>
        </div>

        {def?.registerRegions && (
          <div>
            <h6 className="text-xs font-bold text-slate-700 mb-2">寄存器区域</h6>
            <table className="w-full text-[10px] border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-1.5 text-left">地址</th>
                  <th className="p-1.5 text-left">名称</th>
                  <th className="p-1.5">访问</th>
                  <th className="p-1.5 text-left">说明</th>
                </tr>
              </thead>
              <tbody>
                {def.registerRegions.map(r => (
                  <tr key={r.base} className="border-t border-slate-100">
                    <td className="p-1.5 font-mono">{formatRegAddr(r.base)}</td>
                    <td className="p-1.5">{r.name}</td>
                    <td className="p-1.5 text-center">{r.access}</td>
                    <td className="p-1.5 text-slate-600">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {def?.channels && def.channels.length > 0 && (
          <div>
            <h6 className="text-xs font-bold text-slate-700 mb-2">通道 ({def.channels.length})</h6>
            <table className="w-full text-[10px] border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-1.5">#</th>
                  <th className="p-1.5 text-left">名称</th>
                  <th className="p-1.5">类型</th>
                  <th className="p-1.5">引脚</th>
                  <th className="p-1.5 font-mono">寄存器</th>
                  {module.ioStart != null && <th className="p-1.5 font-mono">建议 Tag</th>}
                </tr>
              </thead>
              <tbody>
                {def.channels.map(ch => (
                  <tr key={ch.index} className="border-t border-slate-100">
                    <td className="p-1.5 text-center">{ch.index}</td>
                    <td className="p-1.5">{ch.name}</td>
                    <td className="p-1.5">
                      {ch.kind}
                      {ch.unit ? ` (${ch.unit})` : ''}
                    </td>
                    <td className="p-1.5 font-mono">{ch.adcPin ?? ch.gpioPin ?? '—'}</td>
                    <td className="p-1.5 font-mono">
                      {formatRegAddr(channelRegAddr(module.boardType!, ch.index))}
                    </td>
                    {module.ioStart != null && (
                      <td className="p-1.5 font-mono text-blue-700">
                        {module.boardType === 'relay'
                          ? suggestPlcTagAddress(module.ioStart, ch.index, 'output')
                          : suggestPlcTagAddress(module.ioStart, ch.index, 'word')}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {def?.specialFunctions && def.specialFunctions.length > 0 && (
          <div>
            <h6 className="text-xs font-bold text-slate-700 mb-1">特殊功能</h6>
            <ul className="text-[10px] text-slate-600 list-disc pl-4">
              {def.specialFunctions.map(f => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderMasterIoTab = (module: HardwareModule) => {
    if (module.type !== 'cpu') {
      return <div className="p-4 text-xs text-slate-400 italic">仅 CPU 模块有此视图。</div>;
    }

    return (
      <div className="p-4 space-y-4 max-w-3xl">
        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1">
          主站内置 IO 与通讯接口
        </h5>
        <p className="text-[10px] text-slate-500">{MASTER_CONTROLLER.firmware}</p>

        <div className="grid grid-cols-2 gap-3 text-[10px]">
          <div className="border border-slate-200 rounded p-2">
            <div className="font-bold text-slate-700 mb-1">通讯接口</div>
            <div>
              上位机: {MASTER_CONTROLLER.interfaces.host.port} @{' '}
              {MASTER_CONTROLLER.interfaces.host.baud}
            </div>
            <div>从站链: {MASTER_CONTROLLER.interfaces.slaveChain.port} (菊花链)</div>
            <div>
              CAN-FD: {MASTER_CONTROLLER.interfaces.can.count} 路 @{' '}
              {formatRegAddr(MASTER_CONTROLLER.interfaces.can.regBase)}
            </div>
            <div>
              LIN: {MASTER_CONTROLLER.interfaces.lin.count} 路 @{' '}
              {formatRegAddr(MASTER_CONTROLLER.interfaces.lin.regBase)}
            </div>
          </div>
          <div className="border border-slate-200 rounded p-2">
            <div className="font-bold text-slate-700 mb-1">协议 FuncCode</div>
            <div className="font-mono space-y-0.5">
              <div>0x64/0x65 主站寄存器读写</div>
              <div>0x44/0x46 UART2 从站转发读写</div>
              <div>0x6F 从站 I/O PLC 映射</div>
              <div>0x68/0x69 PLC 下载/启停</div>
            </div>
          </div>
        </div>

        <div>
          <h6 className="text-xs font-bold mb-2">
            DI ({MASTER_BUILTIN_IO.diCount} 路) @ {formatRegAddr(MASTER_BUILTIN_IO.diRegAddr)}
          </h6>
          <table className="w-full text-[10px] border border-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-1">#</th>
                <th className="p-1">名称</th>
                <th className="p-1">GPIO</th>
              </tr>
            </thead>
            <tbody>
              {MASTER_CONTROLLER.diChannels.map(ch => (
                <tr key={ch.index} className="border-t">
                  <td className="p-1 text-center">{ch.index}</td>
                  <td className="p-1">{ch.name}</td>
                  <td className="p-1 font-mono">{ch.gpioPin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h6 className="text-xs font-bold mb-2">
            DO/HSD ({MASTER_BUILTIN_IO.doCount} 路) @ {formatRegAddr(MASTER_BUILTIN_IO.doRegAddr)}
          </h6>
          <table className="w-full text-[10px] border border-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-1">#</th>
                <th className="p-1">名称</th>
                <th className="p-1">GPIO</th>
                <th className="p-1">电流采样</th>
              </tr>
            </thead>
            <tbody>
              {MASTER_CONTROLLER.doChannels.map(ch => (
                <tr key={ch.index} className="border-t">
                  <td className="p-1 text-center">{ch.index}</td>
                  <td className="p-1">{ch.name}</td>
                  <td className="p-1 font-mono">{ch.gpioPin}</td>
                  <td className="p-1 font-mono">DOcurrent[{ch.index}]</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h6 className="text-xs font-bold mb-2">主站寄存器区域</h6>
          <table className="w-full text-[10px] border border-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-1">地址</th>
                <th className="p-1">名称</th>
                <th className="p-1">说明</th>
              </tr>
            </thead>
            <tbody>
              {MASTER_CONTROLLER.registerRegions.map(r => (
                <tr key={r.base} className="border-t">
                  <td className="p-1 font-mono">{formatRegAddr(r.base)}</td>
                  <td className="p-1">{r.name}</td>
                  <td className="p-1 text-slate-600">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderInspectorContent = (module: HardwareModule) => {
    switch (activeTab) {
      case 'ethernet':
        if (module.type !== 'cpu' && module.type !== 'comm') {
          return <div className="p-4 text-xs text-slate-400 italic">此模块无以太网接口。</div>;
        }
        return (
          <div className="p-4 space-y-6 max-w-2xl">
            <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">
              以太网 / USR-K 地址
            </h5>
            <div className="bg-white p-3 border border-slate-200 rounded-sm grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
              <label className="text-right text-slate-500">IP 地址:</label>
              <input
                type="text"
                value={module.ip || ''}
                onChange={e => handleUpdateModule(module.slot, 'ip', e.target.value)}
                className="border border-slate-300 w-32 px-2 py-1 font-mono rounded-sm focus:border-primary outline-none"
              />
              <label className="text-right text-slate-500">子网掩码:</label>
              <input
                type="text"
                value={module.subnet || '255.255.255.0'}
                onChange={e => handleUpdateModule(module.slot, 'subnet', e.target.value)}
                className="border border-slate-300 w-32 px-2 py-1 font-mono rounded-sm focus:border-primary outline-none"
              />
            </div>
            {module.type === 'cpu' && (
              <p className="text-[10px] text-slate-400">
                USR-K 模块 IP 在「常规」Tab 中配置，DeployPanel 远程 TCP 使用该地址。
              </p>
            )}
          </div>
        );

      case 'slave_bus':
        return renderSlaveBusTab(module);

      case 'master_io':
        return renderMasterIoTab(module);

      case 'slave_map':
        return (
          <div className="p-4">
            <SlaveIoMapping compact />
          </div>
        );

      case 'io':
        if (module.ioStart === undefined) {
          return <div className="p-4 text-xs text-slate-400 italic">此模块没有 I/O 地址配置。</div>;
        }
        return (
          <div className="p-4 space-y-6 max-w-2xl">
            <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">
              PLC 过程映像地址
            </h5>
            <div className="bg-white p-3 border border-slate-200 rounded-sm grid grid-cols-[120px_1fr] gap-2 text-xs items-center">
              <label className="text-right text-slate-500">起始地址:</label>
              <input
                type="number"
                value={module.ioStart}
                onChange={e =>
                  handleUpdateModule(module.slot, 'ioStart', parseInt(e.target.value, 10))
                }
                className="border border-slate-300 w-20 px-2 py-1 rounded-sm focus:border-primary outline-none"
              />
              <label className="text-right text-slate-500">长度 (字):</label>
              <div className="text-slate-700 font-mono">{module.ioLength ?? 0}</div>
              <label className="text-right text-slate-500">结束地址:</label>
              <div className="text-slate-700 font-mono bg-slate-50 px-2 py-1 w-20 border border-slate-200">
                {module.ioStart + (module.ioLength || 0) - 1}
              </div>
            </div>
            {module.boardType && (
              <div className="bg-blue-50 p-2 text-xs text-blue-800 border border-blue-200 rounded">
                从站寄存器映射见「从站总线」Tab；0x6F 协议将 DI/DO 字映射到 %I/%Q 扩展区。
              </div>
            )}
          </div>
        );

      case 'hw_id':
        return (
          <div className="p-4 space-y-4 max-w-2xl">
            <h5 className="font-bold text-slate-800 text-xs mb-2 border-b border-slate-200 pb-1">
              硬件标识符
            </h5>
            <div className="bg-white border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-r border-slate-300">名称</th>
                    <th className="p-2 border-r border-slate-300">类型</th>
                    <th className="p-2">值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border-r border-slate-200 font-mono">
                      Local~{module.name.replace(/\s+/g, '_')}_Head
                    </td>
                    <td className="p-2 border-r border-slate-200">Hw_Device</td>
                    <td className="p-2 font-bold">{module.hwId}</td>
                  </tr>
                  {module.boardId != null && (
                    <tr>
                      <td className="p-2 border-r border-slate-200 font-mono">BoardID</td>
                      <td className="p-2 border-r border-slate-200">uint16</td>
                      <td className="p-2 font-mono font-bold">{formatBoardId(module.boardId)}</td>
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
              <label className="text-right text-slate-500 font-bold">名称:</label>
              <input
                type="text"
                className="border border-slate-300 px-2 py-1 w-full rounded focus:border-primary outline-none"
                value={module.name}
                onChange={e => handleUpdateModule(module.slot, 'name', e.target.value)}
              />
              <label className="text-right text-slate-500 font-bold">订货号:</label>
              <input
                type="text"
                className="border border-slate-300 px-2 py-1 w-64 rounded bg-slate-50 text-slate-600"
                value={module.articleNumber}
                readOnly
              />
              <label className="text-right text-slate-500 font-bold">固件版本:</label>
              <input
                type="text"
                className="border border-slate-300 px-2 py-1 w-32 rounded bg-slate-50"
                value={module.firmware}
                readOnly
              />
              <label className="text-right text-slate-500 font-bold self-start mt-1">注释:</label>
              <textarea
                className="border border-slate-300 px-2 py-1 w-full h-16 rounded resize-none focus:border-primary outline-none"
                placeholder="输入模块注释..."
                value={module.comment || ''}
                onChange={e => handleUpdateModule(module.slot, 'comment', e.target.value)}
              />
            </div>

            {module.type === 'cpu' && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h5 className="font-bold text-slate-800 text-xs mb-3">
                  USR-K 通讯（PCBA 网口转串口）
                </h5>
                <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-xs items-center">
                  <label className="text-right text-slate-500 font-bold">模块型号:</label>
                  <select
                    className="border border-slate-300 rounded px-2 py-1 bg-white w-32"
                    value={module.moduleType || 'K2'}
                    onChange={e =>
                      handleUpdateModule(module.slot, 'moduleType', e.target.value as 'K2' | 'K3')
                    }
                  >
                    <option value="K2">USR-K2</option>
                    <option value="K3">USR-K3</option>
                  </select>
                  <label className="text-right text-slate-500 font-bold">模块 IP:</label>
                  <input
                    type="text"
                    className="border border-slate-300 px-2 py-1 w-40 font-mono rounded focus:border-primary outline-none"
                    placeholder="192.168.0.10"
                    value={module.moduleIp || module.ip || ''}
                    onChange={e => handleUpdateModule(module.slot, 'moduleIp', e.target.value)}
                  />
                  <label className="text-right text-slate-500 font-bold">TCP 端口:</label>
                  <input
                    type="number"
                    className="border border-slate-300 px-2 py-1 w-24 font-mono rounded focus:border-primary outline-none"
                    value={module.tcpPort ?? 8234}
                    onChange={e =>
                      handleUpdateModule(
                        module.slot,
                        'tcpPort',
                        parseInt(e.target.value, 10) || 8234
                      )
                    }
                  />
                  <label className="text-right text-slate-500 font-bold">串口波特率:</label>
                  <input
                    type="text"
                    className="border border-slate-300 px-2 py-1 w-24 font-mono rounded bg-slate-50 text-slate-500"
                    value={module.baudRate ?? 115200}
                    readOnly
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  参见 docs/usr-k-pcba-config.md — TCP Server 透传，115200 8N1
                </p>
              </div>
            )}
          </div>
        );
    }
  };

  const renderInspectorTabs = (module: HardwareModule) => {
    const tabs: { id: InspectorTab; icon: string; label: string; show: boolean }[] = [
      { id: 'general', icon: 'tune', label: '常规', show: true },
      {
        id: 'ethernet',
        icon: 'lan',
        label: '以太网 / USR-K',
        show: module.type === 'cpu' || module.type === 'comm',
      },
      {
        id: 'master_io',
        icon: 'developer_board',
        label: '主站 IO/通讯',
        show: module.type === 'cpu',
      },
      { id: 'slave_bus', icon: 'cable', label: '从站总线', show: !!module.boardType },
      { id: 'io', icon: 'input', label: 'I/O 地址', show: module.ioStart !== undefined },
      {
        id: 'slave_map',
        icon: 'hub',
        label: '从站 I/O 映射',
        show: module.type === 'cpu' || !!module.boardType,
      },
      { id: 'hw_id', icon: 'tag', label: '硬件标识符', show: true },
    ];

    return tabs
      .filter(t => t.show)
      .map(t => (
        <li
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center gap-2 ${activeTab === t.id ? 'bg-blue-100 text-primary font-bold' : 'hover:bg-slate-200 text-slate-600'}`}
        >
          <span className="material-symbols-outlined text-[16px]">{t.icon}</span> {t.label}
        </li>
      ));
  };

  const renderInspector = () => {
    const activeModule = getModuleAtSlot(selectedSlot);

    if (!activeModule) {
      return (
        <div
          style={{ height: inspectorHeight }}
          className="bg-white border-t border-slate-300 flex items-center justify-center text-slate-400 text-xs shrink-0 z-20"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-3xl opacity-20">settings</span>
            请在上方选择一个模块以配置属性，或点击空槽位添加模块。
          </div>
        </div>
      );
    }

    return (
      <div
        style={{ height: inspectorHeight }}
        className="bg-white border-t border-slate-300 flex flex-col shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] relative"
      >
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-transparent hover:bg-primary/50 cursor-row-resize z-50"
          onMouseDown={startResizing}
        />
        <div className="bg-slate-100 px-2 py-1 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between items-center shrink-0 h-8">
          <span>
            模块属性: {activeModule.name} [Slot {activeModule.slot}]
          </span>
          <button
            onClick={() => handleDeleteModule(activeModule.slot)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 rounded"
            title="删除模块"
          >
            <span className="material-symbols-outlined text-[16px] align-middle">delete</span>
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-48 border-r border-slate-200 bg-slate-50 p-2 overflow-y-auto shrink-0">
            <ul className="space-y-0.5">{renderInspectorTabs(activeModule)}</ul>
          </div>
          <div className="flex-1 overflow-y-auto">{renderInspectorContent(activeModule)}</div>
        </div>
      </div>
    );
  };

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-4xl opacity-20">developer_board</span>
          <p className="text-xs">请先打开项目以查看硬件组态</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden relative">
      <div className="flex bg-white border-b border-slate-300 px-2 pt-2 gap-1 shrink-0 z-20">
        {(['device', 'network', 'topology'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-1 text-xs font-bold border-t-2 border-x border-slate-300 border-b-0 ${viewMode === mode ? 'bg-white border-t-primary text-primary' : 'bg-slate-50 text-slate-500 border-t-transparent border-x-transparent hover:bg-slate-100'}`}
          >
            {mode === 'device' && '设备视图'}
            {mode === 'network' && '网络视图'}
            {mode === 'topology' && '拓扑视图'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.05] z-0"
          style={{
            backgroundImage:
              'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-10 flex-1 overflow-hidden">
          {viewMode === 'device' && renderDeviceView()}
          {viewMode === 'network' && renderNetworkView()}
          {viewMode === 'topology' && renderTopologyView()}
        </div>
      </div>

      {viewMode === 'device' && renderInspector()}
    </div>
  );
};
