import React, { useState } from 'react';

interface STEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const DEFAULT_ST = `// IEC 61131-3 ST 子集示例
IF Start_Btn AND NOT Stop_Btn THEN
    Motor_Coil := TRUE;
END_IF;
`;

export const STEditor: React.FC<STEditorProps> = ({ value, onChange }) => {
  const [source, setSource] = useState(value || DEFAULT_ST);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-green-100 font-mono text-sm">
      <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 text-slate-300 text-xs">
        结构化文本 (ST) — IEC 61131-3 子集
      </div>
      <textarea
        className="flex-1 p-4 bg-slate-900 text-green-100 resize-none outline-none leading-relaxed"
        value={source}
        spellCheck={false}
        onChange={e => {
          setSource(e.target.value);
          onChange(e.target.value);
        }}
      />
    </div>
  );
};
