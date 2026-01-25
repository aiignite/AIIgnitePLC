import React from 'react';
import { TagDefinition } from '../types';

interface TagEditorProps {
  tags: TagDefinition[];
  onUpdateTag: (id: string, field: keyof TagDefinition, value: string) => void;
  onAddTag: () => void;
  onDeleteTag: (id: string) => void;
}

export const TagEditor: React.FC<TagEditorProps> = ({ tags, onUpdateTag, onAddTag, onDeleteTag }) => {
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 border-b border-slate-300 flex items-center px-2 gap-2 bg-slate-50 shrink-0">
        <button onClick={onAddTag} className="p-1 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 px-2" title="Add new tag">
          <span className="material-symbols-outlined text-[20px] text-green-600">add_circle</span>
          <span className="text-xs font-medium">添加变量</span>
        </button>
        <button className="p-1 hover:bg-slate-200 rounded text-slate-600" title="Delete selected"><span className="material-symbols-outlined text-[20px]">delete</span></button>
        <div className="w-px h-5 bg-slate-300 mx-1"></div>
        <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><span className="material-symbols-outlined text-[20px]">filter_alt</span></button>
        <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><span className="material-symbols-outlined text-[20px]">sort</span></button>
      </div>

      {/* Grid Header */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-slate-100 sticky top-0 z-10 text-xs font-bold text-slate-700 shadow-sm">
            <tr>
              <th className="border-b border-r border-slate-300 px-2 py-1.5 w-10 text-center bg-slate-100">#</th>
              <th className="border-b border-r border-slate-300 px-1 py-1.5 w-64 bg-slate-100">名称 (Name)</th>
              <th className="border-b border-r border-slate-300 px-1 py-1.5 w-32 bg-slate-100">数据类型</th>
              <th className="border-b border-r border-slate-300 px-1 py-1.5 w-32 bg-slate-100">地址 (Address)</th>
              <th className="border-b border-r border-slate-300 px-1 py-1.5 w-24 bg-slate-100 text-center">保持性</th>
              <th className="border-b border-slate-300 px-1 py-1.5 bg-slate-100">注释 (Comment)</th>
              <th className="border-b border-slate-300 px-1 py-1.5 w-10 bg-slate-100"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {tags.map((tag, idx) => (
              <tr key={tag.id} className="hover:bg-selection-blue group h-8">
                {/* Row Number */}
                <td className="border-b border-r border-slate-200 px-2 text-center text-slate-500 bg-slate-50 select-none text-xs">{idx + 1}</td>
                
                {/* Name Input */}
                <td className="border-b border-r border-slate-200 p-0">
                  <div className="flex items-center h-full w-full px-2 relative">
                    <span className="material-symbols-outlined text-[14px] text-pink-500 mr-2 shrink-0">sell</span>
                    <input 
                      type="text" 
                      value={tag.name}
                      onChange={(e) => onUpdateTag(tag.id, 'name', e.target.value)}
                      className="w-full h-full bg-transparent outline-none text-slate-800 font-medium text-xs focus:bg-white"
                    />
                  </div>
                </td>

                {/* DataType Select */}
                <td className="border-b border-r border-slate-200 p-0">
                   <select 
                     value={tag.dataType} 
                     onChange={(e) => onUpdateTag(tag.id, 'dataType', e.target.value)}
                     className="w-full h-full bg-transparent outline-none text-blue-600 px-2 text-xs focus:bg-white appearance-none"
                   >
                     <option value="Bool">Bool</option>
                     <option value="Int">Int</option>
                     <option value="Word">Word</option>
                     <option value="Real">Real</option>
                     <option value="Time">Time</option>
                   </select>
                </td>

                {/* Address Input */}
                <td className="border-b border-r border-slate-200 p-0">
                   <input 
                      type="text" 
                      value={tag.address}
                      onChange={(e) => onUpdateTag(tag.id, 'address', e.target.value)}
                      className="w-full h-full bg-transparent outline-none text-slate-700 font-mono px-2 text-xs focus:bg-white"
                    />
                </td>

                {/* Retain Checkbox */}
                <td className="border-b border-r border-slate-200 text-center p-0 align-middle">
                    <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" />
                </td>

                {/* Comment Input */}
                <td className="border-b border-slate-200 p-0">
                    <input 
                      type="text" 
                      value={tag.comment}
                      onChange={(e) => onUpdateTag(tag.id, 'comment', e.target.value)}
                      className="w-full h-full bg-transparent outline-none text-slate-500 italic px-2 text-xs focus:bg-white"
                    />
                </td>
                
                {/* Delete Action */}
                <td className="border-b border-slate-200 text-center p-0">
                    <button 
                      onClick={() => onDeleteTag(tag.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                </td>
              </tr>
            ))}
            
            {/* "Add New" Placeholder Row */}
            <tr className="hover:bg-slate-50 h-8 cursor-pointer group" onClick={onAddTag}>
                 <td className="border-b border-r border-slate-200 px-2 text-center text-slate-300 bg-slate-50 text-xs">*</td>
                 <td className="border-b border-r border-slate-200 px-2 text-slate-400 italic text-xs" colSpan={6}>
                    <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        添加新变量...
                    </div>
                 </td>
            </tr>

            {/* Empty Space Fillers */}
            {Array.from({ length: 15 }).map((_, i) => (
               <tr key={`empty-${i}`} className="h-8">
                 <td className="border-r border-slate-200 bg-slate-50"></td>
                 <td className="border-r border-slate-200"></td>
                 <td className="border-r border-slate-200"></td>
                 <td className="border-r border-slate-200"></td>
                 <td className="border-r border-slate-200"></td>
                 <td className=""></td>
                 <td className=""></td>
               </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};