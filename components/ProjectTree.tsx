import React, { useEffect, useRef, useState } from 'react';
import { ProjectNode } from '../types';

export type TreeAction = 'add_plc' | 'add_block' | 'rename' | 'delete' | 'export' | 'save';

interface ProjectTreeProps {
  nodes: ProjectNode[];
  onToggle: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onAction?: (nodeId: string, action: TreeAction) => void;
}

const ProjectTreeNode: React.FC<{
  node: ProjectNode;
  level: number;
  onToggle: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onAction?: (nodeId: string, action: TreeAction) => void;
}> = ({ node, level, onToggle, selectedId, onSelect, onOpen, onAction }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const getIcon = (type: string, isOpen?: boolean) => {
    switch (type) {
      case 'root':
        return 'folder_open';
      case 'project':
        return 'folder_open';
      case 'folder':
        return isOpen ? 'folder_open' : 'folder';
      case 'device':
        return 'developer_board';
      case 'config':
        return 'settings_input_component';
      case 'settings':
        return 'memory';
      case 'block':
        return 'deployed_code';
      case 'block_ob':
        return 'deployed_code';
      case 'block_fc':
        return 'functions';
      case 'block_fb':
        return 'account_tree';
      case 'tag':
        return 'sell';
      case 'tag_table':
        return 'sell';
      case 'graph_block':
        return 'schema';
      default:
        return 'folder';
    }
  };

  const getActions = (
    node: ProjectNode
  ): { label: string; action: TreeAction; icon: string; color?: string }[] => {
    const actions: { label: string; action: TreeAction; icon: string; color?: string }[] = [];

    if (node.type === 'project' || node.type === 'root') {
      actions.push({ label: '新增 PLC', action: 'add_plc', icon: 'add_circle' });
      actions.push({ label: '重命名', action: 'rename', icon: 'edit' });
      actions.push({ label: '导出', action: 'export', icon: 'file_upload' });
      actions.push({ label: '保存', action: 'save', icon: 'save' });
    } else if (node.type === 'device') {
      actions.push({ label: '重命名', action: 'rename', icon: 'edit' });
      actions.push({ label: '删除', action: 'delete', icon: 'delete', color: 'text-red-600' });
    } else if (
      node.type === 'folder' &&
      (node.name === 'Program blocks' || node.name === '程序块')
    ) {
      actions.push({ label: '新增程序', action: 'add_block', icon: 'post_add' });
    } else if (node.type.startsWith('block')) {
      actions.push({ label: '重命名', action: 'rename', icon: 'edit' });
      actions.push({ label: '删除', action: 'delete', icon: 'delete', color: 'text-red-600' });
    }

    return actions;
  };

  const isSelected = node.id === selectedId;
  const availableActions = getActions(node);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors text-sm select-none pr-8 group
          ${isSelected ? 'bg-blue-100 text-primary font-medium' : 'hover:bg-slate-100 text-slate-700'}
        `}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={e => {
          e.stopPropagation();
          onSelect(node.id);
          if (node.children) {
            onToggle(node.id);
          }
        }}
        onDoubleClick={e => {
          e.stopPropagation();
          onOpen(node.id);
          if (node.children) {
            onToggle(node.id);
          }
        }}
      >
        {node.children && node.children.length > 0 ? (
          <span className="material-symbols-outlined text-[16px] text-slate-400">
            {node.isOpen ? 'expand_more' : 'chevron_right'}
          </span>
        ) : (
          <span className="w-4" />
        )}

        <span className={`material-symbols-outlined text-[18px] ${node.color || 'text-slate-400'}`}>
          {getIcon(node.type, node.isOpen)}
        </span>
        <span className="truncate flex-1">{node.name}</span>

        {/* Action Button */}
        {availableActions.length > 0 && onAction && (
          <button
            className={`absolute right-1 p-0.5 rounded hover:bg-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ${showMenu ? 'opacity-100' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <span className="material-symbols-outlined text-[16px]">more_vert</span>
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-8 z-50 bg-white shadow-xl border border-slate-200 rounded-md py-1 w-32 flex flex-col"
          style={{ marginRight: '10px' }}
        >
          {availableActions.map(action => (
            <button
              key={action.action}
              className={`flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left w-full ${action.color || 'text-slate-700'}`}
              onClick={e => {
                e.stopPropagation();
                if (onAction) onAction(node.id, action.action);
                setShowMenu(false);
              }}
            >
              <span className="material-symbols-outlined text-[14px]">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

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
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  nodes,
  onToggle,
  selectedId,
  onSelect,
  onOpen,
  onAction,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
      <div className="space-y-0.5 pb-20">
        {nodes.map(node => (
          <ProjectTreeNode
            key={node.id}
            node={node}
            level={0}
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
};
