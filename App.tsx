import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProjectTree } from './components/ProjectTree';
import { LadderEditor } from './components/LadderEditor';
import { Inspector } from './components/Inspector';
import { InstructionPanel } from './components/InstructionPanel';
import { TagEditor } from './components/TagEditor';
import { DeviceConfiguration } from './components/DeviceConfiguration';
import { OnlineDiagnostics } from './components/OnlineDiagnostics';
import { INITIAL_PROJECT_TREE, INITIAL_NETWORKS, INITIAL_CHAT, MOCK_TAGS } from './services/mockData';
import { ProjectNode, LadderElement, ChatMessage, ViewMode, TagDefinition, Network, ElementType, ProjectData } from './types';

const App: React.FC = () => {
  // --- Layout State ---
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(280);
  const [inspectorHeight, setInspectorHeight] = useState(250);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'bottom' | null>(null);

  // --- Data State ---
  const [projectNodes, setProjectNodes] = useState<ProjectNode[]>(INITIAL_PROJECT_TREE);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ob1');
  const [viewMode, setViewMode] = useState<ViewMode>('LADDER');
  
  const [networks, setNetworks] = useState<Network[]>(INITIAL_NETWORKS);
  const [tags, setTags] = useState<TagDefinition[]>(MOCK_TAGS);
  
  const [selectedElement, setSelectedElement] = useState<LadderElement | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);

  // File Input Ref for Importing
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Resizing Logic ---
  const startResizing = (direction: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(direction);
  };

  const stopResizing = useCallback(() => {
    setIsResizing(null);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    if (isResizing === 'left') {
      const newWidth = e.clientX;
      if (newWidth > 150 && newWidth < 600) setLeftWidth(newWidth);
    } else if (isResizing === 'right') {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 500) setRightWidth(newWidth);
    } else if (isResizing === 'bottom') {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < 600) setInspectorHeight(newHeight);
    }
  }, [isResizing]);

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


  // --- Project I/O Logic ---

  // 1. New Project
  const handleNewProject = () => {
    if (confirm("确定要新建项目吗？未保存的更改将会丢失。")) {
      const newProjectId = `proj_${Date.now()}`;
      const newTree: ProjectNode[] = [{
        id: newProjectId,
        name: 'New_Project',
        type: 'root',
        isOpen: true,
        children: [
          {
            id: 'plc_new',
            name: 'PLC_1 [Unspecified]',
            type: 'device',
            isOpen: true,
            children: [
               { id: 'dev_conf', name: '设备组态', type: 'config', color: 'text-yellow-600' },
               { id: 'online_diag', name: '在线和诊断', type: 'settings', color: 'text-green-600' },
              {
                id: 'blocks',
                name: '程序块',
                type: 'folder',
                isOpen: true,
                children: [
                  { id: 'ob1', name: 'Main [OB1]', type: 'block', color: 'text-primary' }
                ]
              },
              {
                id: 'tags',
                name: 'PLC 变量',
                type: 'folder',
                isOpen: true,
                children: [
                  { id: 'tag_table', name: '默认变量表', type: 'tag', color: 'text-pink-500' }
                ]
              }
            ]
          }
        ]
      }];
      
      setProjectNodes(newTree);
      setNetworks([]); // Empty networks
      setTags([]); // Empty tags
      setSelectedProjectId('ob1');
      setViewMode('LADDER');
      setChatMessages([]);
      alert("新项目已创建");
    }
  };

  // 2. Save Project (Export)
  const handleSaveProject = () => {
    const projectData: ProjectData = {
      version: "1.0",
      projectNodes,
      networks,
      tags
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Project_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. Import Project
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json) as ProjectData;
        
        if (data.projectNodes && data.networks && data.tags) {
          setProjectNodes(data.projectNodes);
          setNetworks(data.networks);
          setTags(data.tags);
          // Reset view
          setSelectedProjectId('ob1');
          setViewMode('LADDER');
          alert("项目导入成功！");
        } else {
          alert("无效的项目文件格式。");
        }
      } catch (err) {
        console.error(err);
        alert("导入失败：文件损坏或格式错误。");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    e.target.value = ''; 
  };


  // --- Logic: Navigation ---
  const handleToggleNode = (id: string) => {
    const toggleNode = (nodes: ProjectNode[]): ProjectNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isOpen: !node.isOpen };
        }
        if (node.children) {
          return { ...node, children: toggleNode(node.children) };
        }
        return node;
      });
    };
    setProjectNodes(toggleNode(projectNodes));
  };

  const handleOpenNode = (id: string) => {
    if (id === 'tag_table') {
      setViewMode('TAGS');
    } else if (id === 'dev_conf') {
      setViewMode('CONFIG');
    } else if (id === 'online_diag') {
      setViewMode('DIAGNOSTICS');
    } else if (id === 'ob1' || id.startsWith('fc')) {
      setViewMode('LADDER');
    }
  };

  const handleSelectNode = (id: string) => {
    setSelectedProjectId(id);
    // Single click now also navigates for better UX
    handleOpenNode(id);
  };


  // --- Logic: Tag Editor ---
  const handleUpdateTag = (id: string, field: keyof TagDefinition, value: string) => {
    setTags(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleAddTag = () => {
    const newId = Date.now().toString();
    const newTag: TagDefinition = {
      id: newId,
      name: `Tag_${tags.length + 1}`,
      dataType: 'Bool',
      address: `%M${tags.length}.0`,
      comment: ''
    };
    setTags(prev => [...prev, newTag]);
  };

  const handleDeleteTag = (id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
  };

  // --- Logic: Ladder Editing ---
  const handleAddInstruction = (type: string) => {
    const newId = Date.now().toString();
    const newElement: LadderElement = {
      id: newId,
      type: type as ElementType,
      tag: 'Tag_' + newId.slice(-4),
      address: '???',
      comment: '',
      parameters: type === 'box_timer' ? [
        { name: 'IN', value: '' },
        { name: 'Q', value: '' },
        { name: 'PT', value: 'T#5s' },
        { name: 'ET', value: '' }
      ] : undefined
    };

    if (!selectedElement) {
      if (networks.length === 0) {
        // Create new network if none exist
        const newNet: Network = {
           id: `net_${Date.now()}`,
           title: '程序段 1',
           description: '',
           rungs: [{ id: `rung_${Date.now()}`, elements: [newElement] }]
        };
        setNetworks([newNet]);
        setSelectedElement(newElement);
      } else if (networks[0]?.rungs[0]) {
        networks[0].rungs[0].elements.push(newElement);
        setNetworks([...networks]);
        setSelectedElement(newElement);
      }
      return;
    }

    const newNetworks = networks.map(net => ({
      ...net,
      rungs: net.rungs.map(rung => {
        const idx = rung.elements.findIndex(e => e.id === selectedElement.id);
        if (idx !== -1) {
          const newElements = [...rung.elements];
          newElements.splice(idx + 1, 0, newElement);
          return { ...rung, elements: newElements };
        }
        if (rung.branchElement?.id === selectedElement.id) {
           // Branch logic omitted
        }
        return rung;
      })
    }));

    setNetworks(newNetworks);
    setSelectedElement(newElement);
  };

  const handleDeleteElement = (id: string) => {
    const newNetworks = networks.map(net => ({
      ...net,
      rungs: net.rungs.map(rung => ({
        ...rung,
        elements: rung.elements.filter(e => e.id !== id),
        branchElement: rung.branchElement?.id === id ? undefined : rung.branchElement,
        hasBranch: rung.branchElement?.id === id ? false : rung.hasBranch
      }))
    }));
    
    setNetworks(newNetworks);
    if (selectedElement?.id === id) {
      setSelectedElement(null);
    }
  };

  const handleUpdateElement = (id: string, field: keyof LadderElement, value: string) => {
    const newNetworks = networks.map(net => ({
      ...net,
      rungs: net.rungs.map(rung => {
        const newElements = rung.elements.map(el => 
          el.id === id ? { ...el, [field]: value } : el
        );
        let newBranchElement = rung.branchElement;
        if (newBranchElement && newBranchElement.id === id) {
           newBranchElement = { ...newBranchElement, [field]: value };
        }
        return { ...rung, elements: newElements, branchElement: newBranchElement };
      })
    }));
    setNetworks(newNetworks);
    if (selectedElement && selectedElement.id === id) {
        setSelectedElement({ ...selectedElement, [field]: value });
    }
  };

  // --- Logic: AI Chat ---
  const handleSendMessage = (text: string) => {
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };
    setChatMessages(prev => [...prev, newUserMsg]);
    setTimeout(() => {
      const newSystemMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `模拟分析: "${text}"。`
      };
      setChatMessages(prev => [...prev, newSystemMsg]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-screen select-none">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".json" 
        style={{ display: 'none' }} 
      />

      {/* --- Global Header --- */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-300 bg-white px-4 py-2 shrink-0 z-20 shadow-sm h-14">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center size-8 bg-primary rounded text-white shadow-sm">
            <span className="material-symbols-outlined">dataset</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-siemens-dark text-base font-bold leading-tight">AI Ignite PLC</h2>
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs text-slate-500 font-medium">Online</span>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200 mx-2"></div>
          <nav className="hidden md:flex items-center gap-4 text-slate-700 text-sm">
             <button onClick={handleNewProject} className="hover:text-primary transition-colors font-medium flex items-center gap-1">
               <span className="material-symbols-outlined text-[18px]">add_box</span> 新建
             </button>
             <button onClick={handleImportClick} className="hover:text-primary transition-colors font-medium flex items-center gap-1">
               <span className="material-symbols-outlined text-[18px]">file_open</span> 导入
             </button>
             <button onClick={handleSaveProject} className="hover:text-primary transition-colors font-medium flex items-center gap-1">
               <span className="material-symbols-outlined text-[18px]">save</span> 保存
             </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1 border border-slate-200">
             {[
               { icon: 'grid_view', title: '编译', color: 'text-slate-600' },
               { icon: 'download', title: '下载到设备', color: 'text-primary' },
               { icon: 'visibility', title: '转至在线', color: 'text-slate-600' }
             ].map(btn => (
               <button key={btn.title} className={`p-1.5 hover:bg-white hover:shadow-sm rounded transition-all ${btn.color}`} title={btn.title}>
                 <span className="material-symbols-outlined text-[20px]">{btn.icon}</span>
               </button>
             ))}
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20">
             JS
          </div>
        </div>
      </header>

      {/* --- Main Workspace (Horizontal Flex) --- */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* 1. Left Sidebar */}
        <aside 
          className="bg-white border-r border-slate-300 flex flex-col shrink-0 z-10"
          style={{ width: leftWidth }}
        >
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm">项目树 (Project Tree)</h3>
          </div>
          <ProjectTree 
            nodes={projectNodes} 
            onToggle={handleToggleNode} 
            selectedId={selectedProjectId}
            onSelect={handleSelectNode}
            onOpen={handleOpenNode}
          />
        </aside>

        {/* Resizer Handle (Left) */}
        <div 
            className="w-1 bg-slate-200 hover:bg-primary cursor-col-resize z-20 hover:w-1.5 transition-all"
            onMouseDown={startResizing('left')}
        ></div>

        {/* 2. Center Content (Vertical Flex) */}
        <div className="flex flex-col flex-1 min-w-0 bg-bg-light relative h-full">
           
           {/* Center Toolbar */}
           <div className="h-10 bg-white border-b border-slate-300 flex items-center px-4 gap-4 overflow-x-auto shrink-0 shadow-sm z-10">
             <div className="flex items-center gap-2 text-slate-500 border-r border-slate-200 pr-4">
               {viewMode === 'LADDER' && (
                   <>
                     <span className="material-symbols-outlined text-[20px] text-blue-600">deployed_code</span>
                     <span className="font-bold text-slate-800 text-sm">Main [OB1]</span>
                   </>
               )}
               {viewMode === 'TAGS' && (
                   <>
                     <span className="material-symbols-outlined text-[20px] text-pink-500">sell</span>
                     <span className="font-bold text-slate-800 text-sm">默认变量表</span>
                   </>
               )}
               {viewMode === 'CONFIG' && (
                   <>
                     <span className="material-symbols-outlined text-[20px] text-yellow-600">developer_board</span>
                     <span className="font-bold text-slate-800 text-sm">设备组态 (Device config)</span>
                   </>
               )}
               {viewMode === 'DIAGNOSTICS' && (
                   <>
                     <span className="material-symbols-outlined text-[20px] text-green-600">monitor_heart</span>
                     <span className="font-bold text-slate-800 text-sm">在线和诊断 (Online & Diagnostics)</span>
                   </>
               )}
             </div>
             
             {viewMode === 'LADDER' && (
                <div className="flex items-center gap-1">
                  {[
                    {icon: 'add_box', title: '插入程序段'},
                    {icon: 'delete', title: '删除程序段'},
                    {icon: 'check_box_outline_blank', title: '常开触点', action: () => handleAddInstruction('contactNO')},
                    {icon: 'disabled_by_default', title: '常闭触点', action: () => handleAddInstruction('contactNC')},
                    {icon: 'code', title: '赋值线圈', action: () => handleAddInstruction('coil')},
                    {icon: 'crop_square', title: '空指令框', action: () => handleAddInstruction('box_timer')},
                  ].map((tool, idx) => (
                    <React.Fragment key={tool.title}>
                      {idx === 2 && <div className="w-px h-5 bg-slate-300 mx-1"></div>}
                      <button 
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-primary transition-colors" 
                        title={tool.title}
                        onClick={(tool as any).action}
                      >
                        <span className="material-symbols-outlined text-[20px]">{tool.icon}</span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
             )}
             
             {viewMode === 'TAGS' && (
                <div className="flex items-center gap-1">
                   <span className="text-xs text-slate-400">编辑模式: 自动保存</span>
                </div>
             )}
           </div>

           {/* Upper: Editor Area */}
           <div className="flex-1 overflow-hidden flex flex-col relative">
              {viewMode === 'LADDER' && (
                <LadderEditor 
                    networks={networks} 
                    selectedElementId={selectedElement?.id || null}
                    onElementSelect={setSelectedElement}
                    onDeleteElement={handleDeleteElement}
                />
              )}
              {viewMode === 'TAGS' && (
                <TagEditor 
                    tags={tags} 
                    onUpdateTag={handleUpdateTag}
                    onAddTag={handleAddTag}
                    onDeleteTag={handleDeleteTag}
                />
              )}
              {viewMode === 'CONFIG' && <DeviceConfiguration />}
              {viewMode === 'DIAGNOSTICS' && <OnlineDiagnostics />}
           </div>

           {/* Resizer Handle (Bottom) - Only show in Ladder Mode or if Inspector is needed */}
           {viewMode === 'LADDER' && (
               <div 
                 className="h-1 bg-slate-200 hover:bg-primary cursor-row-resize z-20 hover:h-1.5 transition-all"
                 onMouseDown={startResizing('bottom')}
               ></div>
           )}

           {/* Lower: Inspector Area */}
           {viewMode === 'LADDER' && (
              <div style={{ height: inspectorHeight }} className="shrink-0 flex flex-col">
                  <Inspector 
                    selectedElement={selectedElement} 
                    onUpdateElement={handleUpdateElement}
                  />
              </div>
           )}
        </div>

        {/* Resizer Handle (Right) */}
        {viewMode === 'LADDER' && (
            <div 
                className="w-1 bg-slate-200 hover:bg-primary cursor-col-resize z-20 hover:w-1.5 transition-all"
                onMouseDown={startResizing('right')}
            ></div>
        )}

        {/* 3. Right Sidebar (Instruction Panel) */}
        {viewMode === 'LADDER' && (
            <div style={{ width: rightWidth }} className="flex flex-col shrink-0">
                <InstructionPanel 
                    onAddInstruction={handleAddInstruction}
                    chatMessages={chatMessages}
                    onSendMessage={handleSendMessage}
                />
            </div>
        )}
      </div>
    </div>
  );
};

export default App;