import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceConfiguration } from './components/DeviceConfiguration';
import { Inspector } from './components/Inspector';
import { InstructionPanel } from './components/InstructionPanel';
import { LadderEditor } from './components/LadderEditor';
import { OnlineDiagnostics } from './components/OnlineDiagnostics';
import { ProjectManager } from './components/ProjectManager';
import { ProjectTree, TreeAction } from './components/ProjectTree';
import { SFCEditor } from './components/SFCEditor';
import { STEditor } from './components/STEditor';
import { TagEditor } from './components/TagEditor';
import { UserMenu } from './components/UserMenu';
import { INITIAL_CHAT } from './services/mockData';
import { downloadHexToFile } from './services/plcCompileService';
import { callLLM } from './src/services/aiService';
import { fetchWithAuth } from './src/services/authFetch';
import { useAIStore } from './src/stores/aiStore';
import { useBlockStore } from './src/stores/blockStore';
import { useProjectStore } from './src/stores/projectStore';
import { useRuntimeStore } from './src/stores/runtimeStore';
import { useTagStore } from './src/stores/tagStore';
import {
  ChatMessage,
  ElementType,
  LadderElement,
  Network,
  ProjectData,
  ProjectNode,
  TagDefinition,
  ViewMode,
} from './types';

const App: React.FC = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';
  // --- Layout State ---
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(280);
  const [inspectorHeight, setInspectorHeight] = useState(250);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'bottom' | null>(null);

  // --- Data State ---
  const [viewMode, setViewMode] = useState<ViewMode>('LADDER');
  const [selectedElement, setSelectedElement] = useState<LadderElement | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);

  // Project Manager State
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [projectManagerMode, setProjectManagerMode] = useState<'new' | 'open' | 'save'>('new');

  const {
    projectTree,
    currentProject,
    currentProjectId,
    selectedNodeId,
    setSelectedNode,
    createNode,
    updateNode,
    deleteNode,
    loadNodeChildren,
    loadProjects,
    setCurrentProject,
    loadProjectTree,
  } = useProjectStore();

  const {
    networks,
    currentBlockId,
    currentBlock,
    loadBlockByNode,
    compileBlock,
    compileProject,
    setNetworks,
    undo,
    redo,
    history,
    future,
    saveBlock,
    isSaving,
    hasUnsavedChanges,
    compilationErrors,
    stSource,
    sfcProgram,
    setStSource,
    setSfcProgram,
    compilePlcDownload,
  } = useBlockStore();

  const {
    tags,
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    filters,
    setFilters,
    pagination,
    isLoading: isTagsLoading,
  } = useTagStore();

  const {
    connect,
    disconnect,
    subscribeAddresses,
    unsubscribeAddresses,
    runtimeValues,
    projectId: runtimeProjectId,
    isOnline,
    writeValue,
    plcStatus,
    startPLC,
    stopPLC,
    watchAddresses,
    addWatchAddress,
  } = useRuntimeStore();

  // Update window title
  useEffect(() => {
    if (currentProject) {
      document.title = `${currentProject.name} - AI Ignite PLC`;
    }
  }, [currentProject]);

  // Auto-load the first available project on startup
  useEffect(() => {
    if (currentProject) return;

    const bootstrapProject = async () => {
      try {
        const projects = await loadProjects();
        if (projects.length > 0) {
          setCurrentProject(projects[0].id);
          await loadProjectTree(projects[0].id);
        }
      } catch (e) {
        console.error('自动加载项目失败:', e);
      }
    };

    void bootstrapProject();
  }, [currentProject, loadProjects, setCurrentProject, loadProjectTree]);

  // File Input Ref for Importing
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subscribedAddressesRef = useRef<Set<string>>(new Set());
  const autoSaveTimerRef = useRef<number | null>(null);

  // --- Resizing Logic ---
  const startResizing = (direction: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(direction);
  };

  const stopResizing = useCallback(() => {
    setIsResizing(null);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
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
    },
    [isResizing]
  );

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
    setProjectManagerMode('new');
    setShowProjectManager(true);
  };

  const handleOpenProject = () => {
    setProjectManagerMode('open');
    setShowProjectManager(true);
  };

  // 2. Save Project (Export)
  const handleSaveProject = async (format: 'json' | 'xml' = 'json') => {
    try {
      if (format === 'xml') {
        if (!currentProject?.id) {
          throw new Error('请先选择一个项目再导出 PLCopen XML');
        }

        const response = await fetchWithAuth(
          `${API_BASE}/projects/${currentProject.id}/export/plcopen`
        );
        if (!response.ok) {
          throw new Error('导出 PLCopen XML 失败');
        }

        const xml = await response.text();
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Project_${currentProject.name}_${new Date().toISOString().slice(0, 10)}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      if (currentProject?.id) {
        const response = await fetchWithAuth(`${API_BASE}/projects/${currentProject.id}/export`);
        if (!response.ok) {
          throw new Error('导出失败');
        }

        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Project_${currentProject.name}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      const projectData: ProjectData = {
        version: '1.0',
        projectNodes: projectTree,
        networks,
        tags,
      };

      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Project_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`导出失败: ${(error as Error).message}`);
    }
  };

  // 3. Import Project
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const buildImportPayloadFromXml = (xmlText: string, fileName: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parseError) {
      throw new Error('XML 解析失败');
    }

    const makeId = () =>
      crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
    const normalizeName = (value: string | null | undefined) => (value || '').trim();
    const getLocalName = (el: Element) => (el.localName || el.tagName || '').toLowerCase();
    const findElementsByLocalName = (root: ParentNode, name: string) =>
      Array.from(root.getElementsByTagName('*')).filter(
        el => getLocalName(el as Element) === name.toLowerCase()
      ) as Element[];
    const getFirstByLocalName = (root: ParentNode, name: string) =>
      findElementsByLocalName(root, name)[0];

    const projectDataNode = xmlDoc.getElementsByTagName('ProjectData')[0];
    const projectDataText = projectDataNode?.textContent?.trim();

    let projectData: any = null;
    if (projectDataText) {
      try {
        projectData = JSON.parse(projectDataText);
      } catch {
        projectData = null;
      }
    }

    const xmlPous = Array.from(xmlDoc.getElementsByTagName('pou'));

    const readVariableName = (node: Element) => {
      const variableNode = getFirstByLocalName(node, 'variable');
      const fromText = normalizeName(variableNode?.textContent || '');
      if (fromText) return fromText;
      const refNode = variableNode
        ? getFirstByLocalName(variableNode, 'symbol') ||
          getFirstByLocalName(variableNode, 'ref') ||
          getFirstByLocalName(variableNode, 'reference')
        : undefined;
      const fromRefText = normalizeName(refNode?.textContent || '');
      if (fromRefText) return fromRefText;
      const fromRefAttr = normalizeName(refNode?.getAttribute('name') || '');
      if (fromRefAttr) return fromRefAttr;
      const fromAttr = normalizeName(
        variableNode?.getAttribute('name') ||
          node.getAttribute('variable') ||
          node.getAttribute('name')
      );
      return fromAttr || 'Tag';
    };

    const readValueFromNode = (node?: Element) => {
      if (!node) return '';
      const valueNode =
        getFirstByLocalName(node, 'value') ||
        getFirstByLocalName(node, 'simpleValue') ||
        getFirstByLocalName(node, 'constant');
      const valueAttr = normalizeName(valueNode?.getAttribute('value'));
      const valueText = normalizeName(valueNode?.textContent || '');
      return valueText || valueAttr || '';
    };

    const parsePouNetworks = (pou: Element) => {
      const bodyNode = getFirstByLocalName(pou, 'body');
      if (!bodyNode) return [] as Network[];
      const ldNodes = findElementsByLocalName(bodyNode, 'ld');
      const parseTimerBlocks = (node: Element) =>
        findElementsByLocalName(node, 'block')
          .map(block => {
            const typeName = normalizeName(
              block.getAttribute('typeName') || block.getAttribute('type') || ''
            );
            const instanceName =
              normalizeName(block.getAttribute('instanceName') || block.getAttribute('name')) ||
              readVariableName(block);
            const typeNameUpper = typeName.toUpperCase();
            const isTimer = ['TON', 'TOF', 'TP', 'TONR'].some(t => typeNameUpper.startsWith(t));
            if (!isTimer) {
              return null;
            }

            const inputVarsNode = getFirstByLocalName(block, 'inputVariables');
            const inputVarNodes = inputVarsNode
              ? findElementsByLocalName(inputVarsNode, 'variable')
              : [];
            const parameters = inputVarNodes
              .map(variable => {
                const name = normalizeName(variable.getAttribute('formalParameter') || '');
                const value = readValueFromNode(variable);
                if (!name || !value) return null;
                return { name, value };
              })
              .filter(Boolean) as Array<{ name: string; value: string }>;
            const commentNode = getFirstByLocalName(block, 'Comment');
            const comment = normalizeName(commentNode?.textContent || '');

            return {
              order:
                Number(block.getAttribute('localId')) || Number(block.getAttribute('localID')) || 0,
              element: {
                id: makeId(),
                type: 'box_timer',
                tag: instanceName || 'Timer',
                address: typeNameUpper || 'TIMER',
                parameters: parameters.length > 0 ? parameters : undefined,
                ...(comment ? { comment } : {}),
              } as LadderElement,
            };
          })
          .filter((item): item is { order: number; element: LadderElement } => Boolean(item));

      if (ldNodes.length === 0) {
        const fbdNodes = findElementsByLocalName(bodyNode, 'fbd');
        if (fbdNodes.length > 0) {
          const networks: Network[] = [];
          let networkIndex = 1;
          fbdNodes.forEach(fbdNode => {
            const networkNodes = findElementsByLocalName(fbdNode, 'network');
            const nodesToParse = networkNodes.length > 0 ? networkNodes : [fbdNode];
            nodesToParse.forEach(node => {
              const blocks = parseTimerBlocks(node).sort((a, b) => (a.order || 0) - (b.order || 0));
              const elements = blocks.map(item => item.element);
              if (elements.length === 0) return;
              networks.push({
                id: makeId(),
                title: `FBD ${networkIndex++}`,
                description: 'Imported from FBD',
                rungs: [
                  {
                    id: makeId(),
                    elements,
                  },
                ],
              });
            });
          });
          if (networks.length > 0) return networks;
        }
        const stNode = getFirstByLocalName(bodyNode, 'st');
        const stText = normalizeName(stNode?.textContent || '');
        if (!stText) return [] as Network[];
        return [
          {
            id: makeId(),
            title: 'ST',
            description: stText.length > 200 ? `${stText.slice(0, 200)}…` : stText,
            rungs: [],
          },
        ];
      }

      const networks: Network[] = [];
      let networkIndex = 1;

      ldNodes.forEach(ldNode => {
        const networkNodes = findElementsByLocalName(ldNode, 'network');
        networkNodes.forEach(networkNode => {
          const commentNode = getFirstByLocalName(networkNode, 'comment');
          const commentText = normalizeName(commentNode?.textContent || '');
          const defaultTitle = `Network ${networkIndex++}`;
          const title = commentText || defaultTitle;
          const description = commentText ? '' : '';

          const contacts = findElementsByLocalName(networkNode, 'contact').map(contact => {
            const negated = ['true', '1'].includes(
              (contact.getAttribute('negated') || '').toLowerCase()
            );
            const type: ElementType = negated ? 'contactNC' : 'contactNO';
            const commentNode = getFirstByLocalName(contact, 'Comment');
            const addressNode = getFirstByLocalName(contact, 'Address');
            const comment = normalizeName(commentNode?.textContent || '');
            const edge = normalizeName(contact.getAttribute('edge') || '');
            const edgeComment = edge ? `edge:${edge}` : '';
            const mergedComment = [comment, edgeComment].filter(Boolean).join(' | ');
            const address = normalizeName(addressNode?.textContent || '');
            const tagName = readVariableName(contact);
            const resolvedTag = tagName === 'Tag' && address ? address : tagName;
            return {
              order:
                Number(contact.getAttribute('localId')) ||
                Number(contact.getAttribute('localID')) ||
                0,
              element: {
                id: makeId(),
                type,
                tag: resolvedTag,
                address,
                ...(mergedComment ? { comment: mergedComment } : {}),
              } as LadderElement,
            };
          });

          const coils = findElementsByLocalName(networkNode, 'coil').map(coil => {
            const commentNode = getFirstByLocalName(coil, 'Comment');
            const addressNode = getFirstByLocalName(coil, 'Address');
            const comment = normalizeName(commentNode?.textContent || '');
            const address = normalizeName(addressNode?.textContent || '');
            const tagName = readVariableName(coil);
            const resolvedTag = tagName === 'Tag' && address ? address : tagName;
            return {
              order:
                Number(coil.getAttribute('localId')) || Number(coil.getAttribute('localID')) || 0,
              element: {
                id: makeId(),
                type: 'coil',
                tag: resolvedTag,
                address,
                ...(comment ? { comment } : {}),
              } as LadderElement,
            };
          });

          const blocks = parseTimerBlocks(networkNode);

          const ordered = [...contacts, ...blocks, ...coils].sort(
            (a, b) => (a.order || 0) - (b.order || 0)
          );
          const elements = ordered.map(item => item.element);

          if (elements.length === 0) {
            return;
          }

          networks.push({
            id: makeId(),
            title,
            description,
            rungs: [
              {
                id: makeId(),
                elements,
              },
            ],
          });
        });
      });

      return networks;
    };

    const fallbackBlocks = xmlPous.map(pou => {
      const pouType = pou.getAttribute('pouType');
      const blockType = pouType === 'functionBlock' ? 'FB' : pouType === 'function' ? 'FC' : 'OB';
      const networks = parsePouNetworks(pou);
      return {
        block_type: blockType,
        name: pou.getAttribute('name') || 'Block',
        content: { networks: networks.length > 0 ? networks : [] },
      };
    });

    const mapXmlTypeToTagType = (xmlType: string) => {
      const type = xmlType.toLowerCase();
      if (type === 'bool') return 'Bool';
      if (type === 'byte') return 'Byte';
      if (type === 'usint') return 'Byte';
      if (type === 'sint') return 'Byte';
      if (type === 'word') return 'Word';
      if (type === 'uint') return 'Word';
      if (type === 'dword') return 'DWord';
      if (type === 'udint') return 'DWord';
      if (type === 'int') return 'Int';
      if (type === 'dint') return 'DInt';
      if (type === 'lint') return 'DInt';
      if (type === 'real') return 'Real';
      if (type === 'lreal') return 'Real';
      if (type === 'time') return 'Time';
      if (type === 'string') return 'String';
      if (type === 'wstring') return 'String';
      return 'Bool';
    };

    const globalVarsNodes = Array.from(xmlDoc.getElementsByTagName('globalVars'));
    const globalVarNodes = globalVarsNodes.flatMap(gv =>
      Array.from(gv.getElementsByTagName('variable'))
    );
    const globalVarTags = globalVarNodes.map(variable => {
      const typeNode = variable.getElementsByTagName('type')[0];
      const typeElement = typeNode?.children?.[0] as Element | undefined;
      const xmlType = typeElement?.tagName || 'BOOL';
      const addressNode = getFirstByLocalName(variable, 'Address');
      const commentNode = getFirstByLocalName(variable, 'Comment');
      const addressFromAddData = normalizeName(addressNode?.textContent || '');
      const addressFromAttr = normalizeName(
        variable.getAttribute('address') || variable.getAttribute('location') || ''
      );
      const address = addressFromAddData || addressFromAttr;
      const comment = normalizeName(commentNode?.textContent || '');
      return {
        name: variable.getAttribute('name') || 'Tag',
        data_type: mapXmlTypeToTagType(xmlType),
        ...(address ? { address } : {}),
        ...(comment ? { comment } : {}),
      };
    });

    const interfaceSections = ['inputVars', 'outputVars', 'inOutVars', 'localVars', 'tempVars'];
    const pouVarTags = xmlPous.flatMap(pou => {
      const pouName = pou.getAttribute('name') || 'POU';
      return interfaceSections.flatMap(section => {
        const sectionNode = pou.getElementsByTagName(section)[0];
        if (!sectionNode) return [];
        const variables = Array.from(sectionNode.getElementsByTagName('variable'));
        return variables.map(variable => {
          const typeNode = variable.getElementsByTagName('type')[0];
          const typeElement = typeNode?.children?.[0] as Element | undefined;
          const xmlType = typeElement?.tagName || 'BOOL';
          const addressNode = getFirstByLocalName(variable, 'Address');
          const commentNode = getFirstByLocalName(variable, 'Comment');
          const addressFromAddData = normalizeName(addressNode?.textContent || '');
          const addressFromAttr = normalizeName(
            variable.getAttribute('address') || variable.getAttribute('location') || ''
          );
          const address = addressFromAddData || addressFromAttr;
          const comment = normalizeName(commentNode?.textContent || '');
          return {
            name: `${pouName}.${variable.getAttribute('name') || 'Var'}`,
            data_type: mapXmlTypeToTagType(xmlType),
            ...(address ? { address } : {}),
            ...(comment ? { comment } : {}),
          };
        });
      });
    });

    const fallbackTags = [...globalVarTags, ...pouVarTags].filter(
      (tag, index, arr) => arr.findIndex(item => item.name === tag.name) === index
    );

    const blocks = Array.isArray(projectData?.blocks) ? projectData.blocks : fallbackBlocks;
    const fallbackByName = new Map(fallbackBlocks.map((block: any) => [block.name, block]));
    const normalizedBlocks = blocks.map((block: any) => {
      let content = block?.content;
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          content = block?.content;
        }
      }
      const networks = content?.networks;
      if (Array.isArray(networks) && networks.length > 0) {
        return { ...block, content };
      }
      const fallback = fallbackByName.get(block?.name || block?.node_name || '');
      if (fallback?.content?.networks?.length) {
        return {
          ...block,
          content: {
            ...content,
            networks: fallback.content.networks,
          },
        };
      }
      return { ...block, content };
    });
    const baseTags = Array.isArray(projectData?.tags) ? projectData.tags : [];
    const mergedTagMap = new Map<string, any>();
    fallbackTags.forEach((tag: any) => {
      if (!tag?.name) return;
      mergedTagMap.set(tag.name, tag);
    });
    baseTags.forEach((tag: any) => {
      if (!tag?.name) return;
      const existing = mergedTagMap.get(tag.name) || {};
      mergedTagMap.set(tag.name, { ...existing, ...tag });
    });
    const tags = baseTags.length > 0 ? Array.from(mergedTagMap.values()) : fallbackTags;
    const hardware = Array.isArray(projectData?.hardware) ? projectData.hardware : [];

    const knownTagNames = new Set(tags.map((tag: any) => tag?.name).filter(Boolean));
    const inferredTags: any[] = [];

    normalizedBlocks.forEach((block: any) => {
      const networks = block?.content?.networks;
      if (!Array.isArray(networks)) return;
      networks.forEach((network: any) => {
        const rungs = Array.isArray(network?.rungs) ? network.rungs : [];
        rungs.forEach((rung: any) => {
          const elements = Array.isArray(rung?.elements) ? rung.elements : [];
          elements.forEach((element: any) => {
            const tagName = element?.tag;
            if (!tagName || knownTagNames.has(tagName)) return;
            knownTagNames.add(tagName);
            inferredTags.push({
              name: tagName,
              data_type: 'Bool',
            });
          });
        });
      });
    });

    const mergedTags = [...tags, ...inferredTags];

    const addressMap = new Map(
      mergedTags
        .filter((tag: any) => tag?.name && tag?.address)
        .map((tag: any) => [tag.name, tag.address])
    );

    const enrichedBlocks = normalizedBlocks.map((block: any) => {
      if (!addressMap.size) return block;
      const networks = block?.content?.networks;
      if (!Array.isArray(networks)) return block;

      const updatedNetworks = networks.map((network: any) => {
        const rungs = Array.isArray(network?.rungs) ? network.rungs : [];
        return {
          ...network,
          rungs: rungs.map((rung: any) => {
            const elements = Array.isArray(rung?.elements) ? rung.elements : [];
            return {
              ...rung,
              elements: elements.map((element: any) => {
                if (!element || element.address || !element.tag) return element;
                const resolved = addressMap.get(element.tag);
                if (!resolved) return element;
                return {
                  ...element,
                  address: resolved,
                };
              }),
            };
          }),
        };
      });

      return {
        ...block,
        content: {
          ...block.content,
          networks: updatedNetworks,
        },
      };
    });

    const projectNameFromXml =
      xmlDoc.getElementsByTagName('contentHeader')[0]?.getAttribute('name') ||
      xmlDoc.getElementsByTagName('project')[0]?.getAttribute('name') ||
      '';
    const projectNameFromData = projectData?.project?.name || '';
    const projectName =
      projectNameFromData.trim() ||
      projectNameFromXml.trim() ||
      fileName.replace(/\.xml$/i, '') ||
      `Imported Project ${new Date().toISOString()}`;

    const rootId = makeId();
    const deviceId = makeId();
    const blocksFolderId = makeId();
    const tagsFolderId = makeId();
    const tagTableId = makeId();

    const blockNodes = enrichedBlocks.map((block: any, index: number) => {
      const type =
        block.block_type === 'OB'
          ? 'block_ob'
          : block.block_type === 'FB'
            ? 'block_fb'
            : 'block_fc';
      return {
        id: makeId(),
        type,
        name: block.name || block.node_name || 'Block',
        isOpen: false,
        orderIndex: index,
        children: [],
      };
    });

    const generatedProjectNodes = [
      {
        id: rootId,
        type: 'project',
        name: projectName,
        isOpen: true,
        orderIndex: 0,
        children: [
          {
            id: deviceId,
            type: 'device',
            name: 'PLC_1 [CPU 1516-3 PN/DP]',
            isOpen: true,
            orderIndex: 0,
            children: [
              {
                id: makeId(),
                type: 'config',
                name: '设备组态',
                color: 'text-yellow-600',
                isOpen: false,
                orderIndex: 0,
                children: [],
              },
              {
                id: makeId(),
                type: 'settings',
                name: '在线和诊断',
                color: 'text-green-600',
                isOpen: false,
                orderIndex: 1,
                children: [],
              },
              {
                id: blocksFolderId,
                type: 'folder',
                name: 'Program blocks',
                isOpen: true,
                orderIndex: 2,
                children: blockNodes,
              },
              {
                id: tagsFolderId,
                type: 'folder',
                name: 'PLC tags',
                isOpen: false,
                orderIndex: 3,
                children: [
                  {
                    id: tagTableId,
                    type: 'tag_table',
                    name: 'Default tag table',
                    isOpen: false,
                    orderIndex: 0,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const projectNodesFromData =
      Array.isArray(projectData?.projectNodes) && projectData.projectNodes.length > 0
        ? projectData.projectNodes
        : null;

    const blockNodeNameMap = new Map<string, string>();
    if (projectNodesFromData) {
      const walkNodes = (nodes: any[]) => {
        nodes.forEach(node => {
          if (node?.name && ['block_ob', 'block_fc', 'block_fb'].includes(node.type)) {
            blockNodeNameMap.set(node.name, node.id);
          }
          if (Array.isArray(node.children) && node.children.length > 0) {
            walkNodes(node.children);
          }
        });
      };
      walkNodes(projectNodesFromData);
    }

    const allBlocksMapped = projectNodesFromData
      ? enrichedBlocks.every(
          (block: any) =>
            block?.node_id ||
            block?.nodeId ||
            blockNodeNameMap.has(block?.name || block?.node_name || '')
        )
      : false;
    const useProjectNodesFromData = Boolean(projectNodesFromData && allBlocksMapped);

    const resolveBlockNodeId = (block: any, index: number) =>
      block.node_id ||
      block.nodeId ||
      blockNodeNameMap.get(block.name || block.node_name || '') ||
      blockNodes[index]?.id;

    const blocksPayload = enrichedBlocks.map((block: any, index: number) => ({
      node_id: resolveBlockNodeId(block, index),
      block_type: block.block_type || 'FC',
      name: block.name || block.node_name || 'Block',
      description: block.description || null,
      content: block.content || { networks: [] },
    }));

    const projectNodes = useProjectNodesFromData ? projectNodesFromData : generatedProjectNodes;

    return {
      project: {
        name: projectName,
        description: projectData?.project?.description || null,
      },
      projectNodes,
      blocks: blocksPayload,
      tags: mergedTags,
      hardware,
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const text = event.target?.result as string;
        const isXml = file.name.toLowerCase().endsWith('.xml');
        const data = isXml ? buildImportPayloadFromXml(text, file.name) : JSON.parse(text);

        const response = await fetchWithAuth(`${API_BASE}/projects/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            sourceFileName: file.name,
            sourceFormat: isXml ? 'XML' : 'IEC',
          }),
        });

        if (!response.ok) {
          throw new Error('导入失败');
        }

        const project = await response.json();
        setCurrentProject(project.id);
        await loadProjectTree(project.id);
        alert('项目导入成功！');
      } catch (err) {
        console.error(err);
        alert(`导入失败: ${(err as Error).message}`);
      } finally {
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  // --- Logic: Navigation ---
  const findNodeById = (nodes: ProjectNode[], id: string): ProjectNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const child = findNodeById(node.children, id);
        if (child) return child;
      }
    }
    return null;
  };

  const handleToggleNode = async (id: string) => {
    const node = findNodeById(projectTree, id);
    if (!node) return;

    try {
      if (!node.children || node.children.length === 0) {
        await loadNodeChildren(id);
      }
      await updateNode(id, { is_open: !node.isOpen });
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenNode = async (id: string) => {
    const node = findNodeById(projectTree, id);
    if (!node) return;

    if (node.type === 'tag_table') {
      setViewMode('TAGS');
      if (currentProject?.id) {
        await loadTags(currentProject.id);
      }
    } else if (node.type === 'config' || node.type === 'device') {
      setViewMode('CONFIG');
    } else if (node.type === 'settings') {
      setViewMode('DIAGNOSTICS');
    } else if (
      node.type === 'block' ||
      node.type === 'block_ob' ||
      node.type === 'block_fc' ||
      node.type === 'block_fb'
    ) {
      setViewMode('LADDER');
      await loadBlockByNode(node.id);
    }
  };

  const handleSelectNode = (id: string) => {
    setSelectedNode(id);
    // Single click now also navigates for better UX
    void handleOpenNode(id);
  };

  const collectAddressesFromNetworks = (nets: Network[]) => {
    const addresses: string[] = [];
    nets.forEach(net => {
      net.rungs.forEach(rung => {
        rung.elements.forEach(el => {
          if (el.address) addresses.push(el.address);
        });
        if (rung.branchElement?.address) addresses.push(rung.branchElement.address);
      });
    });
    return Array.from(new Set(addresses));
  };

  const updateRuntimeSubscriptions = (nextAddresses: string[]) => {
    const prev = subscribedAddressesRef.current;
    const nextSet = new Set(nextAddresses);

    const toSubscribe = nextAddresses.filter(addr => !prev.has(addr));
    const toUnsubscribe = Array.from(prev).filter(addr => !nextSet.has(addr));

    if (toSubscribe.length > 0) subscribeAddresses(toSubscribe);
    if (toUnsubscribe.length > 0) unsubscribeAddresses(toUnsubscribe);

    subscribedAddressesRef.current = nextSet;
  };

  useEffect(() => {
    if (!currentProject?.id) return;

    const baseAddresses = watchAddresses;

    if (viewMode === 'LADDER') {
      if (runtimeProjectId !== currentProject.id) {
        connect(currentProject.id);
      }
      const ladderAddresses = collectAddressesFromNetworks(networks);
      updateRuntimeSubscriptions([...baseAddresses, ...ladderAddresses]);
    } else if (viewMode === 'TAGS') {
      if (runtimeProjectId !== currentProject.id) {
        connect(currentProject.id);
      }
      const tagAddresses = tags.map(tag => tag.address).filter(Boolean);
      updateRuntimeSubscriptions([...baseAddresses, ...tagAddresses]);
    } else {
      if (runtimeProjectId !== currentProject.id && baseAddresses.length > 0) {
        connect(currentProject.id);
      }
      updateRuntimeSubscriptions(baseAddresses);
    }
  }, [
    currentProject?.id,
    runtimeProjectId,
    viewMode,
    networks,
    tags,
    watchAddresses,
    connect,
    subscribeAddresses,
    unsubscribeAddresses,
  ]);

  useEffect(() => {
    if (!currentProject?.id) {
      disconnect();
      subscribedAddressesRef.current = new Set();
    }
  }, [currentProject?.id, disconnect]);

  useEffect(() => {
    if (networks.length === 0) {
      setSelectedNetworkId(null);
      return;
    }

    if (!selectedNetworkId || !networks.some(n => n.id === selectedNetworkId)) {
      setSelectedNetworkId(networks[0].id);
    }
  }, [networks, selectedNetworkId]);

  useEffect(() => {
    if (!currentBlockId || !currentBlock || !hasUnsavedChanges) return;

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveBlock(
          currentBlockId,
          { networks, st_source: stSource, sfc: sfcProgram || undefined },
          currentBlock.version
        );
      } catch (e) {
        console.error('自动保存失败:', e);
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [currentBlockId, currentBlock, networks, hasUnsavedChanges, saveBlock]);

  // --- Logic: Tag Editor ---
  const handleUpdateTag = (id: string, field: keyof TagDefinition, value: string) => {
    const existing = tags.find(t => t.id === id);
    void updateTag(id, { [field]: value } as Partial<TagDefinition>);

    if (!existing) return;

    if (field === 'name' && existing.name !== value) {
      const newNetworks = networks.map(net => ({
        ...net,
        rungs: net.rungs.map(rung => {
          const newElements = rung.elements.map(el =>
            el.tag === existing.name ? { ...el, tag: value } : el
          );
          const newBranchElement =
            rung.branchElement?.tag === existing.name
              ? { ...rung.branchElement, tag: value }
              : rung.branchElement;
          return { ...rung, elements: newElements, branchElement: newBranchElement };
        }),
      }));
      setNetworks(newNetworks);
    }

    if (field === 'address' && existing.address !== value) {
      const newNetworks = networks.map(net => ({
        ...net,
        rungs: net.rungs.map(rung => {
          const newElements = rung.elements.map(el =>
            el.address === existing.address ? { ...el, address: value } : el
          );
          const newBranchElement =
            rung.branchElement?.address === existing.address
              ? { ...rung.branchElement, address: value }
              : rung.branchElement;
          return { ...rung, elements: newElements, branchElement: newBranchElement };
        }),
      }));
      setNetworks(newNetworks);
    }
  };

  const handleAddTag = () => {
    if (!currentProject?.id) return;
    void createTag(currentProject.id, {
      name: `Tag_${tags.length + 1}`,
      dataType: 'Bool',
      address: `%M${tags.length}.0`,
      comment: '',
    });
  };

  const handleDeleteTag = (id: string) => {
    const existing = tags.find(t => t.id === id);
    if (!existing) return;

    const referenced = networks.some(net =>
      net.rungs.some(
        rung =>
          rung.elements.some(el => el.tag === existing.name || el.address === existing.address) ||
          (rung.branchElement &&
            (rung.branchElement.tag === existing.name ||
              rung.branchElement.address === existing.address))
      )
    );

    if (referenced) {
      const proceed = confirm('该标签在程序块中有引用，删除后将清空相关引用。是否继续？');
      if (!proceed) return;

      const newNetworks = networks.map(net => ({
        ...net,
        rungs: net.rungs.map(rung => {
          const newElements = rung.elements.map(el => {
            if (el.tag === existing.name || el.address === existing.address) {
              return { ...el, tag: '', address: '' };
            }
            return el;
          });
          const newBranchElement =
            rung.branchElement &&
            (rung.branchElement.tag === existing.name ||
              rung.branchElement.address === existing.address)
              ? { ...rung.branchElement, tag: '', address: '' }
              : rung.branchElement;
          return { ...rung, elements: newElements, branchElement: newBranchElement };
        }),
      }));
      setNetworks(newNetworks);
    }

    void deleteTag(id);
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
      parameters:
        type === 'box_timer'
          ? [
              { name: 'IN', value: '' },
              { name: 'Q', value: '' },
              { name: 'PT', value: 'T#5s' },
              { name: 'ET', value: '' },
            ]
          : undefined,
    };

    if (!selectedElement) {
      if (networks.length === 0) {
        // Create new network if none exist
        const newNet: Network = {
          id: `net_${Date.now()}`,
          title: '程序段 1',
          description: '',
          rungs: [{ id: `rung_${Date.now()}`, elements: [newElement] }],
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
      }),
    }));

    setNetworks(newNetworks);
    setSelectedElement(newElement);
  };

  const handleAddNetwork = () => {
    const newNetwork: Network = {
      id: `net_${Date.now()}`,
      title: `程序段 ${networks.length + 1}`,
      description: '',
      rungs: [{ id: `rung_${Date.now()}`, elements: [] }],
    };
    setNetworks([...networks, newNetwork]);
    setSelectedNetworkId(newNetwork.id);
  };

  const handleRenameNetwork = (networkId: string) => {
    const target = networks.find(n => n.id === networkId);
    if (!target) return;
    const newTitle = prompt('输入程序段名称', target.title);
    if (newTitle === null || newTitle.trim() === '') return;
    const newDesc = prompt('输入程序段描述', target.description || '') ?? target.description;

    const newNetworks = networks.map(n =>
      n.id === networkId ? { ...n, title: newTitle, description: newDesc } : n
    );
    setNetworks(newNetworks);
  };

  const handleDeleteNetwork = () => {
    if (networks.length === 0) return;
    const targetId = selectedNetworkId || networks[networks.length - 1]?.id;
    if (!targetId) return;
    const target = networks.find(n => n.id === targetId);
    if (!confirm(`确定删除程序段：${target?.title || targetId}？`)) return;
    const newNetworks = networks.filter(n => n.id !== targetId);
    setNetworks(newNetworks);
    setSelectedNetworkId(newNetworks[0]?.id || null);
  };

  const handleDeleteElement = (id: string) => {
    const newNetworks = networks.map(net => ({
      ...net,
      rungs: net.rungs.map(rung => ({
        ...rung,
        elements: rung.elements.filter(e => e.id !== id),
        branchElement: rung.branchElement?.id === id ? undefined : rung.branchElement,
        hasBranch: rung.branchElement?.id === id ? false : rung.hasBranch,
      })),
    }));

    setNetworks(newNetworks);
    if (selectedElement?.id === id) {
      setSelectedElement(null);
    }
  };

  const getSelectedPosition = () => {
    if (!selectedElement) return null;
    for (const net of networks) {
      for (const rung of net.rungs) {
        const index = rung.elements.findIndex(el => el.id === selectedElement.id);
        if (index !== -1) {
          return { netId: net.id, rungId: rung.id, index };
        }
      }
    }
    return null;
  };

  const moveSelectedElement = (direction: 'left' | 'right') => {
    const pos = getSelectedPosition();
    if (!pos) return;

    const { netId, rungId, index } = pos;
    const newNetworks = networks.map(net => {
      if (net.id !== netId) return net;
      return {
        ...net,
        rungs: net.rungs.map(rung => {
          if (rung.id !== rungId) return rung;
          const newElements = [...rung.elements];
          const targetIndex = direction === 'left' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= newElements.length) return rung;
          [newElements[index], newElements[targetIndex]] = [
            newElements[targetIndex],
            newElements[index],
          ];
          return { ...rung, elements: newElements };
        }),
      };
    });

    setNetworks(newNetworks);
  };

  const duplicateSelectedElement = () => {
    const pos = getSelectedPosition();
    if (!pos || !selectedElement) return;

    const clone: LadderElement = {
      ...selectedElement,
      id: `el_${Date.now()}`,
      parameters: selectedElement.parameters
        ? selectedElement.parameters.map(p => ({ ...p }))
        : undefined,
    };

    const { netId, rungId, index } = pos;
    const newNetworks = networks.map(net => {
      if (net.id !== netId) return net;
      return {
        ...net,
        rungs: net.rungs.map(rung => {
          if (rung.id !== rungId) return rung;
          const newElements = [...rung.elements];
          newElements.splice(index + 1, 0, clone);
          return { ...rung, elements: newElements };
        }),
      };
    });

    setNetworks(newNetworks);
    setSelectedElement(clone);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isMod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (isMod && key === 'y') {
        event.preventDefault();
        redo();
      }

      if (isMod && key === 'd') {
        event.preventDefault();
        duplicateSelectedElement();
      }

      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelectedElement('left');
      }

      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelectedElement('right');
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedElement) {
        event.preventDefault();
        handleDeleteElement(selectedElement.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    undo,
    redo,
    duplicateSelectedElement,
    moveSelectedElement,
    handleDeleteElement,
    selectedElement,
  ]);

  const toggleBranchForSelected = () => {
    const pos = getSelectedPosition();
    if (!pos || !selectedElement) return;

    const { netId, rungId } = pos;
    const newNetworks = networks.map(net => {
      if (net.id !== netId) return net;
      return {
        ...net,
        rungs: net.rungs.map(rung => {
          if (rung.id !== rungId) return rung;
          if (rung.hasBranch && rung.branchElement) {
            return { ...rung, hasBranch: false, branchElement: undefined };
          }

          const branchClone: LadderElement = {
            ...selectedElement,
            id: `branch_${Date.now()}`,
            parameters: selectedElement.parameters
              ? selectedElement.parameters.map(p => ({ ...p }))
              : undefined,
          };

          return { ...rung, hasBranch: true, branchElement: branchClone };
        }),
      };
    });

    setNetworks(newNetworks);
  };

  const handleUpdateElement = (
    id: string,
    field: keyof LadderElement,
    value: string | LadderElement['parameters']
  ) => {
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
      }),
    }));
    setNetworks(newNetworks);
    if (selectedElement && selectedElement.id === id) {
      setSelectedElement({ ...selectedElement, [field]: value } as LadderElement);
    }
  };

  // --- Logic: AI Chat ---
  const handleSendMessage = async (text: string) => {
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);

    // Check if AI is configured
    const { settings } = useAIStore.getState();
    const isConfigured = settings.apiKey || settings.provider === 'ollama';

    if (!isConfigured) {
      setTimeout(() => {
        const newSystemMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: `AI 助手未配置。请点击聊天窗顶部的设置图标配置 API Key 或 Ollama 本地服务。`,
        };
        setChatMessages(prev => [...prev, newSystemMsg]);
      }, 500);
      return;
    }

    try {
      // 创建一个空的 AI 消息用于流式更新
      const aiMsgId = Date.now().toString();
      const newAiMsg: ChatMessage = {
        id: aiMsgId,
        role: 'system',
        content: '',
      };
      setChatMessages(prev => [...prev, newAiMsg]);

      const contextPayload = {
        currentBlockId,
        networks,
        tags,
      };

      const contextMessage: ChatMessage = {
        id: `ctx_${Date.now()}`,
        role: 'system',
        content: `当前工程上下文（JSON）:\n${JSON.stringify(contextPayload)}`,
      };

      // 流式接收
      await callLLM([contextMessage, ...updatedMessages], chunk => {
        setChatMessages(prev =>
          prev.map(msg => (msg.id === aiMsgId ? { ...msg, content: msg.content + chunk } : msg))
        );
      });
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: `AI 调用失败: ${(error as Error).message}`,
      };
      setChatMessages(prev => [...prev, errorMsg]);
    }
  };

  const handleTreeAction = async (nodeId: string, action: TreeAction) => {
    try {
      if (action === 'add_plc') {
        const name = prompt('请输入 PLC 名称', 'PLC_New');
        if (!name) return;

        if (!currentProject?.id) return;

        const plcNode = await createNode(currentProject.id, {
          parent_id: nodeId,
          name: name,
          type: 'device',
          is_open: true,
        } as any);

        await createNode(currentProject.id, {
          parent_id: plcNode.id,
          name: '设备组态',
          type: 'config',
          color: 'text-yellow-600',
          is_open: false,
        } as any);

        await createNode(currentProject.id, {
          parent_id: plcNode.id,
          name: '在线和诊断',
          type: 'settings',
          color: 'text-green-600',
          is_open: false,
        } as any);

        const blocksFolder = await createNode(currentProject.id, {
          parent_id: plcNode.id,
          name: 'Program blocks',
          type: 'folder',
          is_open: true,
        } as any);

        await createNode(currentProject.id, {
          parent_id: blocksFolder.id,
          name: 'Main [OB1]',
          type: 'block_ob',
          is_open: false,
        } as any);

        const tagsFolder = await createNode(currentProject.id, {
          parent_id: plcNode.id,
          name: 'PLC tags',
          type: 'folder',
          is_open: false,
        } as any);

        await createNode(currentProject.id, {
          parent_id: tagsFolder.id,
          name: 'Default tag table',
          type: 'tag_table',
          is_open: false,
        } as any);
      } else if (action === 'add_block') {
        const name = prompt('请输入程序块名称', 'Block_New');
        if (!name) return;

        if (!currentProject?.id) return;
        await createNode(currentProject.id, {
          parent_id: nodeId,
          name,
          type: 'block_fc',
          is_open: false,
        } as any);
      } else if (action === 'rename') {
        const currentNode = findNodeById(projectTree, nodeId);
        const newName = prompt('请输入新名称', currentNode?.name || '');
        if (!newName) return;

        await updateNode(nodeId, { name: newName });
      } else if (action === 'delete') {
        if (!confirm('确定删除此节点吗?')) return;

        await deleteNode(nodeId);
      } else if (action === 'export' || action === 'save') {
        handleSaveProject();
      }
    } catch (e) {
      console.error(e);
      alert('操作失败: ' + (e as Error).message);
    }
  };

  const selectedPos = getSelectedPosition();
  const selectedRungLength = selectedPos
    ? networks.find(n => n.id === selectedPos.netId)?.rungs.find(r => r.id === selectedPos.rungId)
        ?.elements.length || 0
    : 0;
  const canMoveLeft = selectedPos ? selectedPos.index > 0 : false;
  const canMoveRight = selectedPos ? selectedPos.index < selectedRungLength - 1 : false;
  const canDuplicate = !!selectedElement;
  const canToggleBranch = !!selectedElement;
  const canSaveBlock = !!currentBlockId && !!currentBlock && hasUnsavedChanges && !isSaving;
  const selectedRuntimeValue = selectedElement?.address
    ? runtimeValues.get(selectedElement.address)
    : undefined;

  return (
    <div className="flex flex-col h-screen select-none">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,.xml"
        style={{ display: 'none' }}
      />

      {/* --- Global Header --- */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-300 bg-white px-4 py-2 shrink-0 z-20 shadow-sm h-14">
        <div className="flex items-center gap-4">
          <div className="size-8 shrink-0">
            <svg
              width="32"
              height="32"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient
                  id="bg-grad"
                  x1="0"
                  y1="0"
                  x2="200"
                  y2="200"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#137fec" />
                  <stop offset="100%" stopColor="#0b5ed7" />
                </linearGradient>
                <radialGradient
                  id="halo-grad"
                  cx="100"
                  cy="110"
                  r="60"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="20%" stopColor="white" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <mask id="fire-mask">
                  <path
                    d="M100 142 C 78 142, 70 115, 88 92 C 98 80, 115 65, 105 40 C 128 65, 138 100, 122 128 C 115 140, 110 142, 100 142Z"
                    fill="white"
                  />
                  <path
                    d="M101 142 C 94 130, 92 115, 96 100 C 100 85, 108 75, 106 40 H 102 C 104 75, 96 85, 92 100 C 88 115, 90 130, 97 142 Z"
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="200" height="200" rx="40" fill="url(#bg-grad)" />
              <path
                d="M100 148 C 65 148, 55 115, 80 85 C 95 65, 125 55, 105 25 C 135 55, 150 95, 130 125 C 120 142, 115 148, 100 148Z"
                fill="url(#halo-grad)"
              />
              <path
                d="M100 142 C 78 142, 70 115, 88 92 C 98 80, 115 65, 105 40 C 128 65, 138 100, 122 128 C 115 140, 110 142, 100 142Z"
                fill="white"
                mask="url(#fire-mask)"
              />
              <circle cx="100.5" cy="138" r="3" fill="white" />
              <g transform="translate(0, 0)">
                <path d="M 80 156 V 172" stroke="#DBEAFE" strokeWidth="2.2" strokeLinecap="round" />
                <path
                  d="M 120 156 V 172"
                  stroke="#DBEAFE"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 80 164 H 92 M 108 164 H 120"
                  stroke="#DBEAFE"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 92 159 V 169 M 97 159 V 169"
                  stroke="#DBEAFE"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 103 161 C 101 162, 101 166, 103 167 M 107 161 C 109 162, 109 166, 107 167"
                  stroke="#DBEAFE"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </g>
            </svg>
          </div>
          <div className="flex flex-col">
            <h2 className="text-siemens-dark text-base font-bold leading-tight">AI Ignite PLC</h2>
            <div className="flex items-center gap-2">
              <div
                className={`size-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}
              ></div>
              <span className="text-xs text-slate-500 font-medium">
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {currentProject && (
                <span className="text-xs text-slate-500 font-medium">| {currentProject.name}</span>
              )}
              {currentProject && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${currentProject.created_by ? 'border-slate-300 text-slate-500 bg-slate-100' : 'border-blue-400/40 text-blue-400 bg-blue-50'}`}
                >
                  {currentProject.created_by ? '私有' : '公共'}
                </span>
              )}
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200 mx-2"></div>
          <nav className="hidden md:flex items-center gap-4 text-slate-700 text-sm">
            <button
              onClick={handleNewProject}
              className="hover:text-primary transition-colors font-medium flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">add_box</span> 新建
            </button>
            <button
              onClick={handleOpenProject}
              className="hover:text-primary transition-colors font-medium flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">folder_open</span> 打开
            </button>
            <button
              onClick={handleImportClick}
              className="hover:text-primary transition-colors font-medium flex items-center gap-1"
              title="从本地 JSON/XML 文件导入"
            >
              <span className="material-symbols-outlined text-[18px]">file_open</span> 导入
            </button>
            <button
              onClick={() => handleSaveProject('json')}
              className="hover:text-primary transition-colors font-medium flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">download</span> 导出
            </button>
            <button
              onClick={() => handleSaveProject('xml')}
              className="hover:text-primary transition-colors font-medium flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">code</span> 导出XML
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1 border border-slate-200">
            {[
              {
                icon: 'grid_view',
                title: '编译',
                color: 'text-slate-600',
                action: async () => {
                  if (!currentBlockId) return;
                  try {
                    await compileBlock(currentBlockId);
                    setViewMode('DIAGNOSTICS');
                  } catch (e) {
                    alert(`编译失败: ${(e as Error).message}`);
                  }
                },
              },
              {
                icon: 'fact_check',
                title: '项目编译',
                color: 'text-slate-600',
                action: async () => {
                  if (!currentProjectId) return;
                  try {
                    await compileProject(currentProjectId);
                    setViewMode('DIAGNOSTICS');
                  } catch (e) {
                    alert(`项目编译失败: ${(e as Error).message}`);
                  }
                },
              },
              {
                icon: 'play_arrow',
                title: '运行',
                color: plcStatus === 'running' ? 'text-green-600' : 'text-slate-600',
                action: () => startPLC(),
              },
              {
                icon: 'stop',
                title: '停止',
                color: plcStatus === 'stopped' ? 'text-red-600' : 'text-slate-600',
                action: () => stopPLC(),
              },
            ].map(btn => (
              <button
                key={btn.title}
                className={`p-1.5 hover:bg-white hover:shadow-sm rounded transition-all ${btn.color}`}
                title={btn.title}
                onClick={btn.action}
              >
                <span className="material-symbols-outlined text-[20px]">{btn.icon}</span>
              </button>
            ))}
          </div>
          <UserMenu />
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
            <button
              className="text-xs text-slate-600 hover:text-primary"
              onClick={() => currentProjectId && loadProjectTree(currentProjectId)}
              title="刷新项目树"
            >
              刷新
            </button>
          </div>
          <ProjectTree
            nodes={projectTree}
            onToggle={handleToggleNode}
            selectedId={selectedNodeId || ''}
            onSelect={handleSelectNode}
            onOpen={handleOpenNode}
            onAction={handleTreeAction}
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
                  <span className="material-symbols-outlined text-[20px] text-blue-600">
                    deployed_code
                  </span>
                  <span className="font-bold text-slate-800 text-sm">
                    {currentBlock?.title || currentBlock?.name || '程序块'}
                  </span>
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
                  <span className="material-symbols-outlined text-[20px] text-yellow-600">
                    developer_board
                  </span>
                  <span className="font-bold text-slate-800 text-sm">设备组态 (Device config)</span>
                </>
              )}
              {viewMode === 'DIAGNOSTICS' && (
                <>
                  <span className="material-symbols-outlined text-[20px] text-green-600">
                    monitor_heart
                  </span>
                  <span className="font-bold text-slate-800 text-sm">
                    在线和诊断 (Online & Diagnostics)
                  </span>
                </>
              )}
              {viewMode === 'ST' && (
                <>
                  <span className="material-symbols-outlined text-[20px] text-purple-600">
                    code
                  </span>
                  <span className="font-bold text-slate-800 text-sm">结构化文本 (ST)</span>
                </>
              )}
              {viewMode === 'SFC' && (
                <>
                  <span className="material-symbols-outlined text-[20px] text-orange-600">
                    account_tree
                  </span>
                  <span className="font-bold text-slate-800 text-sm">顺序功能图 (SFC)</span>
                </>
              )}
              <div className="flex gap-1 ml-2">
                {(['LADDER', 'ST', 'SFC'] as ViewMode[]).map(m => (
                  <button
                    key={m}
                    className={`text-xs px-2 py-0.5 rounded ${viewMode === m ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setViewMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === 'LADDER' && (
              <div className="flex items-center gap-1">
                {[
                  {
                    icon: 'undo',
                    title: '撤销',
                    action: () => undo(),
                    disabled: history.length === 0,
                  },
                  {
                    icon: 'redo',
                    title: '重做',
                    action: () => redo(),
                    disabled: future.length === 0,
                  },
                  {
                    icon: 'save',
                    title: isSaving ? '保存中...' : '保存',
                    action: async () => {
                      if (!currentBlockId || !currentBlock) return;
                      try {
                        await saveBlock(
                          currentBlockId,
                          { networks, st_source: stSource, sfc: sfcProgram || undefined },
                          currentBlock.version
                        );
                      } catch (e) {
                        const message = (e as Error).message;
                        if (message.includes('别处') && currentBlock.node_id) {
                          if (confirm('检测到版本冲突，是否重新加载最新内容？')) {
                            await loadBlockByNode(currentBlock.node_id);
                          }
                          return;
                        }
                        alert(`保存失败: ${message}`);
                      }
                    },
                    disabled: !canSaveBlock,
                  },
                  {
                    icon: 'arrow_left_alt',
                    title: '左移',
                    action: () => moveSelectedElement('left'),
                    disabled: !canMoveLeft,
                  },
                  {
                    icon: 'arrow_right_alt',
                    title: '右移',
                    action: () => moveSelectedElement('right'),
                    disabled: !canMoveRight,
                  },
                  {
                    icon: 'content_copy',
                    title: '复制',
                    action: () => duplicateSelectedElement(),
                    disabled: !canDuplicate,
                  },
                  {
                    icon: 'call_split',
                    title: '并联支路',
                    action: () => toggleBranchForSelected(),
                    disabled: !canToggleBranch,
                  },
                  { icon: 'add_box', title: '插入程序段', action: () => handleAddNetwork() },
                  {
                    icon: 'delete',
                    title: '删除程序段',
                    action: () => handleDeleteNetwork(),
                    disabled: networks.length === 0,
                  },
                  {
                    icon: 'check_box_outline_blank',
                    title: '常开触点',
                    action: () => handleAddInstruction('contactNO'),
                  },
                  {
                    icon: 'disabled_by_default',
                    title: '常闭触点',
                    action: () => handleAddInstruction('contactNC'),
                  },
                  { icon: 'code', title: '赋值线圈', action: () => handleAddInstruction('coil') },
                  {
                    icon: 'crop_square',
                    title: '空指令框',
                    action: () => handleAddInstruction('box_timer'),
                  },
                  {
                    icon: 'download',
                    title: '编译并导出下载帧',
                    action: async () => {
                      try {
                        const result = await compilePlcDownload(
                          tags.map(t => ({
                            name: t.name,
                            address: t.address,
                            data_type: t.dataType,
                          }))
                        );
                        if (result.error) {
                          alert(result.error);
                          return;
                        }
                        if (result.downloadHex) downloadHexToFile(result.downloadHex);
                        alert('PLC 程序已编译，下载帧已导出为 .hex 文件');
                      } catch (e) {
                        alert((e as Error).message);
                      }
                    },
                  },
                ].map((tool, idx) => (
                  <React.Fragment key={tool.title}>
                    {idx === 7 && <div className="w-px h-5 bg-slate-300 mx-1"></div>}
                    <button
                      className={`p-1 rounded text-slate-600 transition-colors ${tool.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 hover:text-primary'}`}
                      title={tool.title}
                      onClick={(tool as any).action}
                      disabled={(tool as any).disabled}
                    >
                      <span className="material-symbols-outlined text-[20px]">{tool.icon}</span>
                    </button>
                  </React.Fragment>
                ))}
                <div className="ml-2 text-xs">
                  {hasUnsavedChanges ? (
                    <span className="text-orange-600 font-medium">未保存</span>
                  ) : (
                    <span className="text-slate-400">已保存</span>
                  )}
                </div>
              </div>
            )}

            {viewMode === 'TAGS' && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">编辑模式: 自动保存</span>
              </div>
            )}
          </div>

          {/* Upper: Editor Area */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {viewMode === 'LADDER' && (
              <LadderEditor
                networks={networks}
                selectedNetworkId={selectedNetworkId}
                onNetworkSelect={setSelectedNetworkId}
                onNetworkRename={handleRenameNetwork}
                selectedElementId={selectedElement?.id || null}
                onElementSelect={setSelectedElement}
                onDeleteElement={handleDeleteElement}
                runtimeValues={runtimeValues}
                diagnostics={compilationErrors}
              />
            )}
            {viewMode === 'ST' && <STEditor value={stSource} onChange={setStSource} />}
            {viewMode === 'SFC' && (
              <SFCEditor
                value={sfcProgram || { initialStep: 'S0', steps: [], transitions: [] }}
                onChange={setSfcProgram}
              />
            )}
            {viewMode === 'TAGS' && (
              <TagEditor
                tags={tags}
                onUpdateTag={handleUpdateTag}
                onAddTag={handleAddTag}
                onDeleteTag={handleDeleteTag}
                runtimeValues={runtimeValues}
                onWriteValue={writeValue}
                onAddWatchAddress={addWatchAddress}
                searchValue={filters.search}
                onSearchChange={value => setFilters({ search: value })}
                dataTypeValue={filters.dataType}
                onDataTypeChange={value => setFilters({ dataType: value })}
                pagination={{ page: pagination.page, totalPages: pagination.totalPages }}
                onPageChange={page =>
                  currentProjectId && loadTags(currentProjectId, page, pagination.pageSize)
                }
                isLoading={isTagsLoading}
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
                runtimeValue={selectedRuntimeValue}
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

      <ProjectManager
        isOpen={showProjectManager}
        onClose={() => setShowProjectManager(false)}
        mode={projectManagerMode}
      />
    </div>
  );
};

export default App;
