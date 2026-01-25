import React from 'react';
import { ProjectNode } from '../types';

interface ProjectTreeProps {
  nodes: ProjectNode[];
  onToggle: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

const ProjectTreeNode: React.FC<{ 
  node: ProjectNode; 
  level: number;
  onToggle: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}> = ({ node, level, onToggle, selectedId, onSelect, onOpen }) => {
  
  const getIcon = (type: string, isOpen?: boolean) => {
    switch(type) {
      case 'root': return 'folder_open';
      case 'folder': return isOpen ? 'folder_open' : 'folder';
      case 'device': return 'developer_board';
      case 'config': return 'settings_input_component';
      case 'settings': return 'memory';
      case 'block': return 'deployed_code';
      case 'tag': return 'sell';
      default: return 'folder';
    }
  };

  const isSelected = node.id === selectedId;

  return (
    <div>
      <div 
        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors text-sm select-none
          ${isSelected ? 'bg-blue-100 text-primary font-medium' : 'hover:bg-slate-100 text-slate-700'}
        `}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
          if (node.children) {
            onToggle(node.id);
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpen(node.id);
          if (node.children) {
            onToggle(node.id);
          }
        }}
      >
        {node.children && (
          <span className="material-symbols-outlined text-[16px] text-slate-400">
            {node.isOpen ? 'expand_more' : 'chevron_right'}
          </span>
        )}
        {!node.children && <span className="w-4" />} {/* Spacer for leaf nodes */}
        
        <span className={`material-symbols-outlined text-[18px] ${node.color || 'text-slate-400'}`}>
          {getIcon(node.type, node.isOpen)}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      
      {node.isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <ProjectTreeNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ProjectTree: React.FC<ProjectTreeProps> = ({ nodes, onToggle, selectedId, onSelect, onOpen }) => {
  return (
    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
      <div className="space-y-0.5">
        {nodes.map(node => (
          <ProjectTreeNode 
            key={node.id} 
            node={node} 
            level={0} 
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
};