export interface ProjectNode {
  id: string;
  name: string;
  type:
    | 'project'
    | 'folder'
    | 'device'
    | 'block'
    | 'block_ob'
    | 'block_fc'
    | 'block_fb'
    | 'tag'
    | 'tag_table'
    | 'root'
    | 'settings'
    | 'config';
  color?: string; // For icon color
  children?: ProjectNode[];
  isOpen?: boolean;
}

export type ElementType = 'contactNO' | 'contactNC' | 'coil' | 'box_timer' | 'empty';

export interface LadderElement {
  id: string;
  type: ElementType;
  tag: string;
  address: string;
  comment?: string;
  // Specific properties for boxes (like Timers)
  parameters?: {
    name: string;
    value: string;
  }[];
}

export interface LadderRung {
  id: string;
  elements: LadderElement[];
  hasBranch?: boolean; // Simplified branching for demo
  branchElement?: LadderElement; // The element on the branch
}

export interface Network {
  id: string;
  title: string;
  description: string;
  rungs: LadderRung[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  content: string;
  actions?: string[];
}

export interface TagDefinition {
  id: string;
  name: string;
  dataType: string;
  address: string;
  comment: string;
}

// Global View State
export type ViewMode = 'LADDER' | 'ST' | 'SFC' | 'TAGS' | 'CONFIG' | 'DIAGNOSTICS';

export interface SfcAction {
  type: 'N' | 'S' | 'R' | 'L';
  st?: string;
  address?: string;
  value?: boolean;
}

export interface SfcStep {
  id: string;
  actions: SfcAction[];
}

export interface SfcTransition {
  from: string;
  to: string;
  condition: string;
}

export interface SfcProgram {
  initialStep: string;
  steps: SfcStep[];
  transitions: SfcTransition[];
}

export interface BlockContent {
  version?: string;
  networks?: Network[];
  st_source?: string;
  sfc?: SfcProgram;
}

export interface Instruction {
  id: string;
  name: string;
  category: 'BitLogic' | 'Timer' | 'Counter' | 'Math';
  type: ElementType;
  description: string;
}

// For Import/Export
export interface ProjectData {
  version: string;
  projectNodes: ProjectNode[];
  networks: Network[];
  tags: TagDefinition[];
}
