import React, { useState } from 'react';
import type { SfcProgram } from '../types';

interface SFCEditorProps {
  value: SfcProgram;
  onChange: (value: SfcProgram) => void;
}

const DEFAULT_SFC: SfcProgram = {
  initialStep: 'S0',
  steps: [
    {
      id: 'S0',
      actions: [{ type: 'N', address: '%Q0.0', value: false }],
    },
    {
      id: 'S1',
      actions: [{ type: 'N', address: '%Q0.0', value: true }],
    },
  ],
  transitions: [
    { from: 'S0', to: 'S1', condition: 'Start_Btn' },
    { from: 'S1', to: 'S0', condition: 'Stop_Btn' },
  ],
};

export const SFCEditor: React.FC<SFCEditorProps> = ({ value, onChange }) => {
  const [sfc, setSfc] = useState<SfcProgram>(value?.steps?.length ? value : DEFAULT_SFC);

  const update = (next: SfcProgram) => {
    setSfc(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4 bg-white">
      <h3 className="font-bold text-slate-800">顺序功能图 (SFC)</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded p-3">
          <h4 className="text-sm font-semibold mb-2 text-slate-600">步骤 (Steps)</h4>
          {sfc.steps.map((step, idx) => (
            <div key={step.id} className="mb-2 p-2 bg-blue-50 rounded text-sm">
              <div className="font-mono font-bold">{step.id}</div>
              {step.actions.map((a, ai) => (
                <div key={ai} className="text-xs text-slate-600">
                  [{a.type}] {a.address || a.st} = {String(a.value)}
                </div>
              ))}
              <button
                className="text-xs text-red-500 mt-1"
                onClick={() => update({ ...sfc, steps: sfc.steps.filter((_, i) => i !== idx) })}
              >
                删除
              </button>
            </div>
          ))}
          <button
            className="text-xs bg-primary text-white px-2 py-1 rounded"
            onClick={() =>
              update({
                ...sfc,
                steps: [
                  ...sfc.steps,
                  {
                    id: `S${sfc.steps.length}`,
                    actions: [{ type: 'N', address: '%M0.0', value: true }],
                  },
                ],
              })
            }
          >
            + 添加步骤
          </button>
        </div>
        <div className="border border-slate-200 rounded p-3">
          <h4 className="text-sm font-semibold mb-2 text-slate-600">转移 (Transitions)</h4>
          {sfc.transitions.map((tr, idx) => (
            <div key={idx} className="mb-2 p-2 bg-amber-50 rounded text-sm flex justify-between">
              <span>
                {tr.from} → {tr.to} : {tr.condition}
              </span>
              <button
                className="text-xs text-red-500"
                onClick={() =>
                  update({ ...sfc, transitions: sfc.transitions.filter((_, i) => i !== idx) })
                }
              >
                删
              </button>
            </div>
          ))}
          <button
            className="text-xs bg-amber-600 text-white px-2 py-1 rounded"
            onClick={() =>
              update({
                ...sfc,
                transitions: [
                  ...sfc.transitions,
                  {
                    from: sfc.steps[0]?.id || 'S0',
                    to: sfc.steps[1]?.id || 'S1',
                    condition: 'TRUE',
                  },
                ],
              })
            }
          >
            + 添加转移
          </button>
        </div>
      </div>
      <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">
        {JSON.stringify(sfc, null, 2)}
      </pre>
    </div>
  );
};
