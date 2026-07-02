import React, { useCallback, useEffect, useRef, useState } from 'react';

// --- Types for Graphic Editor ---
interface Point {
  x: number;
  y: number;
}

interface Port {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType: string;
}

interface GraphicBlock {
  id: string;
  name: string;
  type: 'logic' | 'function' | 'data';
  label: string;
  pos: Point;
  inputs: Port[];
  outputs: Port[];
  instanceName?: string;
  meta?: string;
}

interface Connection {
  id: string;
  fromBlockId: string;
  fromPortId: string;
  toBlockId: string;
  toPortId: string;
}

// --- Initial Mock Data for the Graphic Editor ---
const INITIAL_BLOCKS: GraphicBlock[] = [
  {
    id: 'block_start',
    name: 'Start_Btn',
    type: 'data',
    label: 'Start_Btn',
    meta: '%I0.0',
    pos: { x: 80, y: 120 },
    inputs: [],
    outputs: [{ id: 'out1', name: 'OUT', type: 'output', dataType: 'BOOL' }],
  },
  {
    id: 'block_stop',
    name: 'E_Stop_OK',
    type: 'data',
    label: 'E_Stop_OK',
    meta: '%I0.1',
    pos: { x: 80, y: 220 },
    inputs: [],
    outputs: [{ id: 'out1', name: 'OUT', type: 'output', dataType: 'BOOL' }],
  },
  {
    id: 'block_and',
    name: 'AND',
    type: 'logic',
    label: '&',
    pos: { x: 300, y: 150 },
    inputs: [
      { id: 'in1', name: 'IN1', type: 'input', dataType: 'BOOL' },
      { id: 'in2', name: 'IN2', type: 'input', dataType: 'BOOL' },
    ],
    outputs: [{ id: 'out1', name: 'OUT', type: 'output', dataType: 'BOOL' }],
  },
  {
    id: 'block_pid',
    name: 'PID_Compact',
    type: 'function',
    label: 'PID_Compact',
    instanceName: 'Instance DB1',
    meta: 'FB11',
    pos: { x: 550, y: 100 },
    inputs: [
      { id: 'in_en', name: 'Enable', type: 'input', dataType: 'BOOL' },
      { id: 'in_sp', name: 'Setpoint', type: 'input', dataType: 'REAL' },
      { id: 'in_per', name: 'Input_PER', type: 'input', dataType: 'INT' },
    ],
    outputs: [
      { id: 'out_val', name: 'Output', type: 'output', dataType: 'REAL' },
      { id: 'out_state', name: 'State', type: 'output', dataType: 'INT' },
    ],
  },
];

const INITIAL_CONNECTIONS: Connection[] = [
  {
    id: 'c1',
    fromBlockId: 'block_start',
    fromPortId: 'out1',
    toBlockId: 'block_and',
    toPortId: 'in1',
  },
  {
    id: 'c2',
    fromBlockId: 'block_stop',
    fromPortId: 'out1',
    toBlockId: 'block_and',
    toPortId: 'in2',
  },
  {
    id: 'c3',
    fromBlockId: 'block_and',
    fromPortId: 'out1',
    toBlockId: 'block_pid',
    toPortId: 'in_en',
  },
];

export const GraphicEditor: React.FC = () => {
  const [blocks, setBlocks] = useState<GraphicBlock[]>(INITIAL_BLOCKS);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const [consoleHeight, setConsoleHeight] = useState(160);
  const [isResizingConsole, setIsResizingConsole] = useState(false);

  const [pendingConnection, setPendingConnection] = useState<{
    blockId: string;
    portId: string;
    type: 'input' | 'output';
    mousePos: Point;
  } | null>(null);

  // Use ref for the scrollable canvas area
  const canvasRef = useRef<HTMLDivElement>(null);

  // --- Helper: Get Mouse Position Relative to Canvas Content ---
  const getMousePos = (e: { clientX: number; clientY: number }): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + canvasRef.current.scrollLeft,
      y: e.clientY - rect.top + canvasRef.current.scrollTop,
    };
  };

  // --- Helper: Get Precise Port Position ---
  const getPortPos = (blockId: string, portId: string): Point => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return { x: 0, y: 0 };

    const isInput = block.inputs.some(p => p.id === portId);
    const portIndex = isInput
      ? block.inputs.findIndex(p => p.id === portId)
      : block.outputs.findIndex(p => p.id === portId);

    // Layout constants matching CSS
    const headerHeight = block.type === 'function' ? 24 : 20; // h-6 approx
    const topPadding = 4; // p-1
    const rowHeight = 24; // h-6
    const blockWidth = block.type === 'function' ? 192 : 128; // w-48 vs w-32

    // Offset for port circle center (circle is -left-3 (-12px), size 2.5 (10px)) -> Center is -7px from edge
    const portOffset = 7;

    const x = isInput ? block.pos.x - portOffset : block.pos.x + blockWidth + portOffset;
    const y = block.pos.y + headerHeight + topPadding + portIndex * rowHeight + rowHeight / 2;

    return { x, y };
  };

  // --- Selection Logic ---
  const handleSelectConnection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedConnectionId(id);
    setSelectedBlockId(null);
  };

  const handleCanvasClick = () => {
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
  };

  // --- Deletion Logic ---
  const handleDelete = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (selectedBlockId) {
        setBlocks(prev => prev.filter(b => b.id !== selectedBlockId));
        setConnections(prev =>
          prev.filter(c => c.fromBlockId !== selectedBlockId && c.toBlockId !== selectedBlockId)
        );
        setSelectedBlockId(null);
      } else if (selectedConnectionId) {
        setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
        setSelectedConnectionId(null);
      }
    },
    [selectedBlockId, selectedConnectionId]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        handleDelete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDelete]);

  // --- Dragging Logic ---
  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    if (e.button !== 0) return;
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    e.stopPropagation(); // Important: prevent canvas drag or other events
    setSelectedBlockId(blockId);
    setSelectedConnectionId(null);
    setDraggingBlockId(blockId);

    const mouse = getMousePos(e);
    setDragOffset({
      x: mouse.x - block.pos.x,
      y: mouse.y - block.pos.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const mouse = getMousePos(e);

    if (draggingBlockId) {
      const newPos = {
        x: mouse.x - dragOffset.x,
        y: mouse.y - dragOffset.y,
      };
      setBlocks(prev => prev.map(b => (b.id === draggingBlockId ? { ...b, pos: newPos } : b)));
    }

    if (pendingConnection) {
      setPendingConnection(prev =>
        prev
          ? {
              ...prev,
              mousePos: mouse,
            }
          : null
      );
    }

    if (isResizingConsole) {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 40 && newHeight < 600) {
        setConsoleHeight(newHeight);
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingBlockId(null);
    setPendingConnection(null);
    setIsResizingConsole(false);
  };

  // --- Connection Creation ---
  const handlePortMouseDown = (
    e: React.MouseEvent,
    blockId: string,
    portId: string,
    type: 'input' | 'output'
  ) => {
    e.stopPropagation();
    const mouse = getMousePos(e);
    setPendingConnection({
      blockId,
      portId,
      type,
      mousePos: mouse,
    });
  };

  const handlePortMouseUp = (
    e: React.MouseEvent,
    targetBlockId: string,
    targetPortId: string,
    targetType: 'input' | 'output'
  ) => {
    e.stopPropagation();
    if (pendingConnection) {
      const { blockId: sourceBlockId, portId: sourcePortId, type: sourceType } = pendingConnection;
      if (sourceType !== targetType && sourceBlockId !== targetBlockId) {
        const fromBlockId = sourceType === 'output' ? sourceBlockId : targetBlockId;
        const fromPortId = sourceType === 'output' ? sourcePortId : targetPortId;
        const toBlockId = sourceType === 'input' ? sourceBlockId : targetBlockId;
        const toPortId = sourceType === 'input' ? sourcePortId : targetPortId;

        const isOccupied = connections.some(
          c => c.toBlockId === toBlockId && c.toPortId === toPortId
        );
        if (!isOccupied) {
          setConnections(prev => [
            ...prev,
            { id: `c_${Date.now()}`, fromBlockId, fromPortId, toBlockId, toPortId },
          ]);
        }
      }
    }
    setPendingConnection(null);
  };

  return (
    <div
      className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Upper Toolbar */}
      <div className="h-10 bg-white border-b border-slate-300 flex items-center px-4 gap-4 shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
          <button className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
          <button className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <span className="material-symbols-outlined text-[18px]">redo</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white rounded text-xs font-bold shadow-sm hover:bg-primary-dark transition-colors">
            <span className="material-symbols-outlined text-[16px]">play_arrow</span> 编译
          </button>
          <button
            onClick={() => {
              const newBlock: GraphicBlock = {
                id: `block_${Date.now()}`,
                name: 'NEW_BLOCK',
                type: 'logic',
                label: 'AND',
                pos: {
                  x: 100 + (canvasRef.current?.scrollLeft || 0),
                  y: 100 + (canvasRef.current?.scrollTop || 0),
                },
                inputs: [{ id: 'in1', name: 'IN1', type: 'input', dataType: 'BOOL' }],
                outputs: [{ id: 'out1', name: 'OUT', type: 'output', dataType: 'BOOL' }],
              };
              setBlocks([...blocks, newBlock]);
              setSelectedBlockId(newBlock.id);
            }}
            className="flex items-center gap-1 px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span> 添加功能块
          </button>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center gap-2">
          {(selectedBlockId || selectedConnectionId) && (
            <button
              onClick={e => handleDelete(e)}
              className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-bold hover:bg-red-100"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span> 删除选中
            </button>
          )}
          <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200">
            <button className="size-5 flex items-center justify-center hover:bg-white rounded">
              <span className="material-symbols-outlined text-[14px]">remove</span>
            </button>
            <span className="text-[10px] font-bold text-slate-600 px-1">100%</span>
            <button className="size-5 flex items-center justify-center hover:bg-white rounded">
              <span className="material-symbols-outlined text-[14px]">add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div
        className="flex-1 relative overflow-auto cursor-default"
        onClick={handleCanvasClick}
        ref={canvasRef}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] z-0"
          style={{
            backgroundImage:
              'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        ></div>

        {/* SVG Layer (Z-10) */}
        <svg className="absolute inset-0 w-[2000px] h-[2000px] z-10 overflow-visible pointer-events-none">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orientation="auto"
            >
              <polygon points="0 0, 6 2, 0 4" fill="#137fec" />
            </marker>
            <marker
              id="arrowhead-sel"
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orientation="auto"
            >
              <polygon points="0 0, 6 2, 0 4" fill="#ef4444" />
            </marker>
          </defs>

          {connections.map(conn => {
            const start = getPortPos(conn.fromBlockId, conn.fromPortId);
            const end = getPortPos(conn.toBlockId, conn.toPortId);
            const isSelected = selectedConnectionId === conn.id;
            const controlOffset = Math.abs(end.x - start.x) / 2;
            const d = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;

            return (
              <g
                key={conn.id}
                className="pointer-events-auto cursor-pointer group"
                onClick={e => handleSelectConnection(e, conn.id)}
              >
                <path d={d} stroke="transparent" strokeWidth="16" fill="none" />
                <path
                  d={d}
                  stroke={isSelected ? '#ef4444' : '#137fec'}
                  strokeWidth={isSelected ? '4' : '2.5'}
                  fill="none"
                  markerEnd={isSelected ? 'url(#arrowhead-sel)' : 'url(#arrowhead)'}
                  className="transition-all"
                />
              </g>
            );
          })}

          {pendingConnection &&
            (() => {
              const start = getPortPos(pendingConnection.blockId, pendingConnection.portId);
              const end = pendingConnection.mousePos;
              const isOutput = pendingConnection.type === 'output';
              const sX = isOutput ? start.x : end.x;
              const sY = isOutput ? start.y : end.y;
              const eX = isOutput ? end.x : start.x;
              const eY = isOutput ? end.y : start.y;
              const cO = Math.abs(eX - sX) / 2;
              return (
                <path
                  d={`M ${sX} ${sY} C ${sX + cO} ${sY}, ${eX - cO} ${eY}, ${eX} ${eY}`}
                  stroke="#137fec"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  fill="none"
                  opacity="0.6"
                />
              );
            })()}
        </svg>

        {/* Blocks Layer (Z-20) */}
        <div className="relative z-20 w-[2000px] h-[2000px] pointer-events-none">
          {blocks.map(block => {
            const isSelected = selectedBlockId === block.id;
            return (
              <div
                key={block.id}
                onMouseDown={e => handleMouseDown(e, block.id)}
                onClick={e => e.stopPropagation()} // Prevent canvas click (deselect) from firing
                style={{ left: block.pos.x, top: block.pos.y }}
                className={`absolute pointer-events-auto bg-white border-2 rounded shadow-md flex flex-col transition-shadow ${isSelected ? 'border-primary ring-2 ring-primary/20 z-30 shadow-xl' : 'border-slate-800 shadow-sm'} ${block.type === 'function' ? 'w-48' : 'w-32'}`}
              >
                {/* Header */}
                <div
                  className={`flex items-center justify-between px-2 py-0.5 border-b-2 ${block.type === 'function' ? 'bg-primary text-white border-primary' : 'bg-slate-100 border-slate-800'} ${block.type === 'function' ? 'h-[24px]' : 'h-[20px]'}`}
                >
                  <span className="text-[10px] font-bold uppercase truncate">{block.label}</span>
                  <div className="flex gap-1 items-center">
                    {isSelected && (
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => handleDelete(e)}
                        className="hover:text-red-300 transition-colors flex items-center justify-center"
                        title="删除"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                    <span className="material-symbols-outlined text-[14px] cursor-pointer hover:opacity-80">
                      settings
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex relative p-1 pb-2">
                  <div className="flex flex-col gap-2 min-h-[40px] flex-1">
                    {block.inputs.map(port => (
                      <div key={port.id} className="flex items-center relative h-6">
                        <div
                          onMouseDown={e => handlePortMouseDown(e, block.id, port.id, 'input')}
                          onMouseUp={e => handlePortMouseUp(e, block.id, port.id, 'input')}
                          className={`absolute -left-3 size-2.5 rounded-full border-2 border-white cursor-crosshair z-30 transition-transform ${connections.some(c => c.toBlockId === block.id && c.toPortId === port.id) ? 'bg-primary' : 'bg-slate-300 hover:scale-125'}`}
                        ></div>
                        <span className="text-[10px] font-bold text-slate-600 pl-1.5">
                          {port.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 min-h-[40px] flex-1 items-end">
                    {block.outputs.map(port => (
                      <div key={port.id} className="flex items-center relative h-6">
                        <span className="text-[10px] font-bold text-slate-600 pr-1.5">
                          {port.name}
                        </span>
                        <div
                          onMouseDown={e => handlePortMouseDown(e, block.id, port.id, 'output')}
                          onMouseUp={e => handlePortMouseUp(e, block.id, port.id, 'output')}
                          className={`absolute -right-3 size-2.5 rounded-full border-2 border-white cursor-crosshair z-30 transition-transform ${connections.some(c => c.fromBlockId === block.id && c.fromPortId === port.id) ? 'bg-primary' : 'bg-slate-300 hover:scale-125'}`}
                        ></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                {(block.instanceName || block.meta) && (
                  <div className="px-2 py-0.5 border-t border-slate-200 bg-slate-50 flex justify-between text-[8px] font-mono">
                    <span className="text-primary/70">{block.instanceName}</span>
                    <span className="text-slate-400">{block.meta}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resizable Console */}
      <div
        style={{ height: consoleHeight }}
        className="bg-slate-900 border-t border-slate-800 flex flex-col shrink-0 z-40 relative"
      >
        <div
          className="absolute top-0 left-0 right-0 h-1.5 -mt-1 cursor-ns-resize bg-transparent hover:bg-primary/50 transition-colors z-50"
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingConsole(true);
          }}
        ></div>
        <div className="flex bg-slate-800/50 border-b border-white/10 shrink-0">
          <button className="px-4 py-1.5 text-[10px] font-bold text-blue-400 border-b-2 border-blue-400 bg-white/5">
            Compiler Output
          </button>
          <button className="px-4 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300">
            Errors (0)
          </button>
          <button className="px-4 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300">
            Warnings (1)
          </button>
        </div>
        <div className="flex-1 p-2 font-mono text-[10px] overflow-y-auto text-slate-300">
          <p className="opacity-50 tracking-tighter">[System] Logic engine ready...</p>
          <p className="text-blue-400">
            Blocks: {blocks.length}, Nets: {connections.length}.
          </p>
          {connections.length < blocks.length && (
            <p className="text-yellow-400">Warning: Open inputs detected.</p>
          )}
          <p className="text-green-400 font-bold mt-1">Status: OK</p>
        </div>
      </div>
    </div>
  );
};
