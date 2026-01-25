import React from 'react';
import { Network, LadderRung, LadderElement } from '../types';

interface LadderEditorProps {
  networks: Network[];
  selectedElementId: string | null;
  onElementSelect: (element: LadderElement) => void;
  onDeleteElement: (elementId: string) => void;
}

const ElementRenderer: React.FC<{ 
  element: LadderElement; 
  isSelected: boolean; 
  onClick: () => void;
  onDelete: () => void;
}> = ({ element, isSelected, onClick, onDelete }) => {
  
  // TIA Portal Style: Address (top, often purple/grey), Tag (middle, bold), Symbol (bottom)
  return (
    <div 
      className={`flex flex-col items-center relative group/element cursor-pointer select-none mx-1 min-w-[60px]`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Labels Area */}
      <div className="flex flex-col items-center mb-1">
         {/* Address: usually mono, small */}
         <span className={`text-[10px] font-mono leading-tight ${isSelected ? 'text-primary' : 'text-purple-700'}`}>
           {element.address}
         </span>
         {/* Tag Name: bold, black */}
         <span className={`text-[11px] font-bold leading-tight px-1 rounded ${isSelected ? 'bg-primary text-white' : 'text-black'}`}>
           {`"${element.tag}"`}
         </span>
      </div>

      {/* Delete Button (Visible on Hover/Select) */}
      {isSelected && (
        <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-0 -right-4 bg-slate-100 text-slate-500 hover:text-red-600 rounded shadow border border-slate-300 z-50 flex items-center justify-center size-5"
            title="删除"
        >
            <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}

      {/* Visual Symbol Layer */}
      <div className="relative">
        
        {/* Contact NO */}
        {element.type === 'contactNO' && (
          <div className="w-10 h-8 flex items-center justify-center relative">
             <div className="absolute left-0 top-1/2 w-3 h-0.5 bg-black -translate-y-1/2"></div>
             <div className="absolute right-0 top-1/2 w-3 h-0.5 bg-black -translate-y-1/2"></div>
             <div className="w-0.5 h-6 bg-black mx-1"></div>
             <div className="w-0.5 h-6 bg-black mx-1"></div>
          </div>
        )}

        {/* Contact NC */}
        {element.type === 'contactNC' && (
          <div className="w-10 h-8 flex items-center justify-center relative">
             <div className="absolute left-0 top-1/2 w-3 h-0.5 bg-black -translate-y-1/2"></div>
             <div className="absolute right-0 top-1/2 w-3 h-0.5 bg-black -translate-y-1/2"></div>
             <div className="w-0.5 h-6 bg-black mx-1"></div>
             <div className="w-0.5 h-6 bg-black mx-1"></div>
             <div className="absolute w-6 h-0.5 bg-black rotate-45"></div>
          </div>
        )}

        {/* Coil */}
        {element.type === 'coil' && (
          <div className="w-12 h-8 flex items-center justify-center relative">
            <div className="absolute left-0 top-1/2 w-2 h-0.5 bg-black -translate-y-1/2"></div>
            <div className="absolute right-0 top-1/2 w-2 h-0.5 bg-black -translate-y-1/2"></div>
            {/* Parentheses shape */}
            <svg width="32" height="24" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 2C4 6 4 18 8 22" stroke="black" strokeWidth="2" fill="none"/>
              <path d="M24 2C28 6 28 18 24 22" stroke="black" strokeWidth="2" fill="none"/>
            </svg>
          </div>
        )}

        {/* Box / Timer */}
        {element.type === 'box_timer' && (
           <div className={`border-2 border-slate-800 bg-white w-32 min-h-[100px] relative flex flex-col z-10 ${isSelected ? 'shadow-[0_0_0_2px_rgba(19,127,236,0.5)]' : ''}`}>
              {/* Header */}
              <div className="bg-slate-100 border-b-2 border-slate-800 px-1 py-0.5 text-center">
                 <div className="text-[10px] font-bold text-slate-700">{element.address}</div>
                 <div className="text-[10px] text-slate-500">IEC_Timer</div>
              </div>
              
              {/* Body */}
              <div className="flex-1 flex flex-col justify-between py-1 relative">
                 {/* Top Parameters */}
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-bold pl-1">IN</span>
                   <span className="text-[10px] font-bold pr-1">Q</span>
                 </div>
                 
                 {/* Bottom Parameters */}
                 <div className="flex justify-between items-center px-1 mt-4">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold pl-1">PT</span>
                      <span className="text-[10px] font-mono text-green-700 pl-1 -mt-0.5">
                        {element.parameters?.find(p => p.name === 'PT')?.value || 'T#0s'}
                      </span>
                   </div>
                   <div className="flex flex-col text-right">
                      <span className="text-[10px] font-bold pr-1">ET</span>
                      <span className="text-[10px] font-mono text-slate-400 pr-1 -mt-0.5">...</span>
                   </div>
                 </div>
              </div>
           </div>
        )}
      </div>
      
      {/* Selection Glow (Subtle) */}
      {isSelected && element.type !== 'box_timer' && (
         <div className="absolute inset-0 bg-primary/10 rounded pointer-events-none -m-1"></div>
      )}
    </div>
  );
};

const RungRenderer: React.FC<{ 
  rung: LadderRung; 
  selectedElementId: string | null;
  onElementSelect: (el: LadderElement) => void;
  onDeleteElement: (id: string) => void;
}> = ({ rung, selectedElementId, onElementSelect, onDeleteElement }) => {
  return (
    <div className="relative min-h-[140px] flex items-center group/rung py-4">
      {/* Power Rail (Left) */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-black"></div>

      <div className="ml-4 flex items-center">
        {/* Initial Wire */}
        <div className="w-8 h-0.5 bg-black"></div>

        {rung.elements.map((el, index) => (
          <React.Fragment key={el.id}>
             <ElementRenderer 
               element={el} 
               isSelected={selectedElementId === el.id} 
               onClick={() => onElementSelect(el)}
               onDelete={() => onDeleteElement(el.id)}
             />
             {/* Wire between elements */}
             <div className={`h-0.5 bg-black ${el.type === 'box_timer' ? 'w-6' : 'w-8'}`}></div>

             {/* Special wire handling for Box Output Q (Visual adjustment) */}
             {el.type === 'box_timer' && (
                 <div className="absolute w-8 h-0.5 bg-black -translate-y-9 translate-x-[128px]" style={{zIndex: -1}}></div>
             )}
          </React.Fragment>
        ))}
        
        {/* End Wire to Right Rail (Conceptual) */}
        <div className="flex-1 min-w-[40px] h-0.5 bg-black"></div>
        {/* Right Rail */}
        <div className="w-0.5 bg-black h-full absolute right-0 top-0 bottom-0 opacity-20"></div>
      </div>

      {/* Parallel Branch Visual */}
      {rung.hasBranch && rung.branchElement && (
        <>
            {/* Vertical drop line */}
            <div className="absolute top-[82px] left-[36px] w-[2px] h-[50px] bg-black"></div>
            {/* Bottom horizontal line */}
            <div className="absolute top-[132px] left-[36px] w-[26px] h-[2px] bg-black"></div>
            
            {/* The element on the branch */}
            <div className="absolute top-[108px] left-[60px]">
                <ElementRenderer 
                    element={rung.branchElement} 
                    isSelected={selectedElementId === rung.branchElement.id} 
                    onClick={() => onElementSelect(rung.branchElement!)}
                    onDelete={() => onDeleteElement(rung.branchElement!.id)}
                />
            </div>

            {/* Return line */}
            <div className="absolute top-[132px] left-[120px] w-[24px] h-[2px] bg-black"></div>
            <div className="absolute top-[82px] left-[144px] w-[2px] h-[52px] bg-black"></div>
        </>
      )}
    </div>
  );
};

export const LadderEditor: React.FC<LadderEditorProps> = ({ networks, selectedElementId, onElementSelect, onDeleteElement }) => {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-100">
      {networks.map(net => (
        <div key={net.id} className="bg-white border border-slate-300 shadow-sm overflow-hidden group/network">
          {/* Network Header */}
          <div className="bg-slate-100 border-b border-slate-300 px-3 py-1 flex justify-between items-start cursor-default select-none h-8">
            <div className="flex items-center gap-2 h-full">
               <span className="font-bold text-slate-800 text-xs">{net.title}</span>
               <span className="text-slate-500 text-xs">// {net.description}</span>
            </div>
          </div>
          
          {/* Network Canvas */}
          <div className="p-4 overflow-x-auto min-h-[160px] flex items-center relative">
             {/* Grid Background (Subtle) */}
             <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                  style={{backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
             </div>
             
            {net.rungs.map(rung => (
              <RungRenderer 
                key={rung.id} 
                rung={rung} 
                selectedElementId={selectedElementId} 
                onElementSelect={onElementSelect}
                onDeleteElement={onDeleteElement}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="h-20"></div>
    </div>
  );
};