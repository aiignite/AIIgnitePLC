import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface AICopilotProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AICopilot: React.FC<AICopilotProps> = ({ messages, onSendMessage, isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white w-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">smart_toy</span>
          <h3 className="font-bold text-slate-800">AI Co-pilot</h3>
        </div>
        {/* Close button hidden or optional when embedded in panel */}
        {/* <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button> */}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`size-8 rounded-full flex items-center justify-center shrink-0 
              ${msg.role === 'user' ? 'bg-slate-200' : 'bg-primary/10'}`}>
              {msg.role === 'user' ? (
                <span className="text-xs font-bold text-slate-600">JS</span>
              ) : (
                <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
              )}
            </div>

            {/* Bubble */}
            <div className={`max-w-[85%] space-y-2`}>
               <div className={`p-3 rounded-lg shadow-sm border text-sm
                ${msg.role === 'user' 
                  ? 'bg-primary text-white border-primary rounded-tr-none' 
                  : 'bg-white text-slate-700 border-slate-200 rounded-tl-none'}`}>
                 <p className="whitespace-pre-line">{msg.content}</p>
               </div>
               
               {/* Suggested Actions */}
               {msg.actions && (
                 <div className="flex flex-wrap gap-2">
                   {msg.actions.map(action => (
                     <button 
                       key={action}
                       className="px-3 py-1.5 bg-white hover:bg-blue-50 text-primary text-xs font-medium rounded-full transition-colors border border-blue-100 shadow-sm"
                       onClick={() => onSendMessage(action)}
                     >
                       {action}
                     </button>
                   ))}
                 </div>
               )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white shrink-0">
        <div className="relative">
          <input 
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-inner" 
            placeholder="Ask AI about your PLC code..." 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            className="absolute right-2 top-2 p-1.5 bg-primary text-white rounded hover:bg-blue-600 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
        <div className="mt-2 flex justify-between items-center px-1">
          <span className="text-[10px] text-slate-400">AI can make mistakes. Verify code before downloading.</span>
        </div>
      </div>
    </div>
  );
};