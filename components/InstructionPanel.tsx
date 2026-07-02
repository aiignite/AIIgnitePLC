import React, { useState } from 'react';
import { ChatMessage, Instruction } from '../types';
import { AICopilot } from './AICopilot';

interface InstructionPanelProps {
  onAddInstruction: (
    type: string,
    meta?: { comment?: string; coilMode?: 'assign' | 'set' | 'reset' }
  ) => void;
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

const INSTRUCTIONS: Instruction[] = [
  {
    id: 'i1',
    name: '常开触点',
    category: 'BitLogic',
    type: 'contactNO',
    description: 'Normally Open',
  },
  {
    id: 'i2',
    name: '常闭触点',
    category: 'BitLogic',
    type: 'contactNC',
    description: 'Normally Closed',
  },
  { id: 'i3', name: '线圈', category: 'BitLogic', type: 'coil', description: 'Assignment' },
  { id: 'i4', name: '置位线圈', category: 'BitLogic', type: 'coil', description: 'Set Output' },
  { id: 'i5', name: '复位线圈', category: 'BitLogic', type: 'coil', description: 'Reset Output' },

  { id: 't1', name: '接通延时', category: 'Timer', type: 'box_timer', description: 'TON' },
  { id: 't2', name: '关断延时', category: 'Timer', type: 'box_timer', description: 'TOF' },
  { id: 't3', name: '脉冲定时', category: 'Timer', type: 'box_timer', description: 'TP' },

  { id: 'c1', name: '加计数', category: 'Counter', type: 'box_timer', description: 'CTU' },
  { id: 'c2', name: '减计数', category: 'Counter', type: 'box_timer', description: 'CTD' },

  { id: 'm1', name: '加法', category: 'Math', type: 'empty', description: 'ADD' },
  { id: 'm2', name: '减法', category: 'Math', type: 'empty', description: 'SUB' },
];

export const InstructionPanel: React.FC<InstructionPanelProps> = ({
  onAddInstruction,
  chatMessages,
  onSendMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'instructions' | 'ai'>('instructions');
  // Changed to Set for multiple expansions
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['BitLogic', 'Timer'])
  );

  const toggleCategory = (cat: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(cat)) {
      newSet.delete(cat);
    } else {
      newSet.add(cat);
    }
    setExpandedCategories(newSet);
  };

  return (
    <aside className="h-full bg-white border-l border-slate-300 flex flex-col shrink-0 z-10 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-300 bg-slate-100 shrink-0">
        <button
          className={`flex-1 py-2 text-sm font-medium border-r border-slate-200 ${activeTab === 'instructions' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
          onClick={() => setActiveTab('instructions')}
        >
          指令
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${activeTab === 'ai' ? 'bg-white text-primary border-t-2 border-t-primary' : 'text-slate-600 hover:bg-slate-50'}`}
          onClick={() => setActiveTab('ai')}
        >
          AI 助手
        </button>
      </div>

      {activeTab === 'instructions' ? (
        <div className="flex-1 overflow-y-auto bg-white min-w-0">
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-2 p-1.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-600 mb-2">
              <span className="material-symbols-outlined text-[16px]">search</span>
              <input placeholder="搜索指令..." className="bg-transparent outline-none w-full" />
            </div>

            {/* Categories */}
            {['BitLogic', 'Timer', 'Counter', 'Comparator', 'Math', 'Move'].map(cat => {
              const catLabel =
                cat === 'BitLogic'
                  ? '位逻辑运算 (Bit Logic)'
                  : cat === 'Timer'
                    ? '定时器操作 (Timers)'
                    : cat === 'Counter'
                      ? '计数器操作 (Counters)'
                      : cat === 'Math'
                        ? '数学函数 (Math)'
                        : cat;
              const isOpen = expandedCategories.has(cat);

              return (
                <div key={cat} className="border border-slate-200 rounded overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center gap-1 p-1.5 bg-slate-50 hover:bg-blue-50 text-left border-b border-transparent hover:border-slate-200"
                  >
                    <span
                      className="material-symbols-outlined text-[16px] text-slate-500 transition-transform duration-200"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      chevron_right
                    </span>
                    <span className="text-xs font-bold text-slate-700">{catLabel}</span>
                  </button>

                  {isOpen && (
                    <div className="bg-white p-1">
                      {/* Grid Layout for Responsiveness: Items flow and wrap based on panel width */}
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1">
                        {INSTRUCTIONS.filter(i => i.category === cat).map(inst => (
                          <div
                            key={inst.id}
                            className="flex flex-col items-center justify-center p-2 hover:bg-blue-100 cursor-pointer group rounded border border-slate-100 hover:border-blue-300 transition-all text-center h-20"
                            onClick={() =>
                              onAddInstruction(inst.type, {
                                comment: inst.description,
                                coilMode:
                                  inst.description === 'Set Output'
                                    ? 'set'
                                    : inst.description === 'Reset Output'
                                      ? 'reset'
                                      : inst.type === 'coil'
                                        ? 'assign'
                                        : undefined,
                              })
                            }
                            title={inst.name}
                            draggable
                          >
                            <span className="material-symbols-outlined text-[24px] text-primary mb-1">
                              {inst.type === 'contactNO'
                                ? 'check_box_outline_blank'
                                : inst.type === 'contactNC'
                                  ? 'disabled_by_default'
                                  : inst.type === 'coil'
                                    ? 'code'
                                    : 'crop_square'}
                            </span>
                            <span className="text-xs font-medium text-slate-800 leading-tight w-full truncate">
                              {inst.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {inst.description}
                            </span>
                          </div>
                        ))}
                      </div>

                      {INSTRUCTIONS.filter(i => i.category === cat).length === 0 && (
                        <div className="p-2 text-[10px] text-slate-400 italic text-center">
                          暂无指令
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <AICopilot
          messages={chatMessages}
          onSendMessage={onSendMessage}
          isOpen={true}
          onClose={() => {}}
        />
      )}
    </aside>
  );
};
